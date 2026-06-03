use std::future;

use anyhow::Context;
use clap::{Parser, Subcommand};
use degov_datalens_indexer::{
    DaoEventDecoder, DatalensConfig, DatalensNativeClient, EvmRpcChainTool, GraphqlRuntimeConfig,
    IndexerContractSetRuntimeConfig, IndexerRunner, IndexerRuntimeConfig,
    OnchainRefreshRuntimeConfig, OnchainRefreshWorker, PostgresIndexerRunnerStore, graphql,
    postgres_schema_statements, required_env, verify_datalens_service,
};
use sqlx::{Executor, postgres::PgPoolOptions};
use tokio::task;
use tokio::time::sleep;

const POSTGRES_SCHEMA_SQL: &str = include_str!("../schema/postgres.sql");

#[derive(Debug, Parser)]
#[command(name = "degov-datalens-indexer")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    Run,
    Worker,
    Migrate,
    Graphql,
    SmokeDatalens,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    init_logging()?;
    let cli = Cli::parse();

    match cli.command {
        Command::Run => run_indexer().await,
        Command::Worker => run_worker().await,
        Command::Migrate => migrate().await,
        Command::Graphql => run_graphql().await,
        Command::SmokeDatalens => smoke_datalens().await,
    }
}

fn init_logging() -> anyhow::Result<()> {
    tracing_log::LogTracer::init().context("initialize log tracer")?;
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .try_init()
        .map_err(|error| anyhow::anyhow!("initialize tracing subscriber: {error}"))
}

async fn smoke_datalens() -> anyhow::Result<()> {
    let config = DatalensConfig::from_env_for_readiness().context("load Datalens configuration")?;
    verify_datalens(&config).await
}

async fn run_indexer() -> anyhow::Result<()> {
    let config = DatalensConfig::from_env().context("load Datalens configuration")?;
    let database_url = required_env("DEGOV_INDEXER_DATABASE_URL")?;
    let runtime = IndexerRuntimeConfig::from_env()?;

    verify_datalens(&config).await?;
    log::info!(
        "Datalens indexer runtime boundary is ready contract_set_mode={} dao_filter={:?} dataset={} target_height={} database_url_configured={}",
        runtime.contract_set_mode.as_str(),
        runtime.dao_filter,
        config.dataset.key(),
        runtime.target_height,
        !database_url.is_empty()
    );

    let pool = PgPoolOptions::new()
        .max_connections(runtime.database_max_connections)
        .connect(&database_url)
        .await
        .context("connect to DeGov indexer Postgres")?;
    loop {
        let contract_sets = runtime
            .configured_contract_sets(&config)
            .context("select Datalens indexer contract sets")?;

        for contract_set in contract_sets {
            let contract_runtime = match runtime.for_configured_contract_set(&contract_set) {
                Ok(contract_runtime) => contract_runtime,
                Err(error)
                    if runtime.should_skip_contract_set_start_after_target(
                        contract_set.contract.start_block,
                    ) =>
                {
                    log::warn!(
                        "skipping Datalens indexer contract set because configured startBlock is above target dao_code={} chain_id={} contract_set_id={} start_block={} target_height={} error={}",
                        contract_set.dao_code,
                        contract_set.contract.chain_id,
                        contract_set.contract_set_id,
                        contract_set.contract.start_block,
                        runtime.target_height,
                        error
                    );
                    continue;
                }
                Err(error) => return Err(error),
            };
            let report = run_contract_set_pass(
                contract_runtime.clone(),
                contract_set.config.clone(),
                contract_set.addresses.clone(),
                pool.clone(),
            )
            .await?;

            log::info!(
                "Datalens indexer run pass completed dao_code={} chain_id={} contract_set_id={} chunks_processed={} processed_height={:?} target_height={} synced_percentage={} onchain_refresh_allowed={}",
                contract_runtime.dao_code,
                contract_set.contract.chain_id,
                contract_runtime.checkpoint_contract_set_id,
                report.chunks_processed,
                report.last_progress.processed_height,
                report.last_progress.target_height,
                report.last_progress.synced_percentage,
                report.last_progress.onchain_refresh_allowed
            );
        }

        if runtime.run_once {
            return Ok(());
        }

        sleep(runtime.poll_interval).await;
    }
}

async fn run_contract_set_pass(
    runtime: IndexerContractSetRuntimeConfig,
    config: DatalensConfig,
    contracts: degov_datalens_indexer::DaoContractAddresses,
    pool: sqlx::PgPool,
) -> anyhow::Result<degov_datalens_indexer::IndexerRunnerReport> {
    log::info!(
        "Datalens indexer contract set pass is ready dao_code={} dao_chain={} chain_id={:?} contract_set_id={} governor={} token={} timelock={} start_block={} target_height={}",
        runtime.dao_code,
        config.chain.configured_name,
        config.chain.network_id,
        runtime.checkpoint_contract_set_id,
        contracts.governor,
        contracts.governor_token,
        contracts.timelock,
        runtime.start_block,
        runtime.target_height
    );

    task::spawn_blocking(move || -> anyhow::Result<_> {
        let client =
            DatalensNativeClient::from_config(&config).context("create Datalens client")?;
        let store = PostgresIndexerRunnerStore::new(pool);
        let mut runner = IndexerRunner::new(
            runtime.options(&config, &contracts)?,
            runtime.contexts(&contracts),
            client,
            store,
            DaoEventDecoder,
        );
        if let Some(chunks) = runtime.max_chunks_per_run {
            runner.request_shutdown_after_chunks(chunks);
        }

        runner
            .run_to_target(runtime.target_height)
            .context("run Datalens indexer to target height")
    })
    .await
    .context("join Datalens indexer runner task")?
}

async fn run_worker() -> anyhow::Result<()> {
    let database_url = required_env("DEGOV_INDEXER_DATABASE_URL")?;
    let runtime = OnchainRefreshRuntimeConfig::from_env()?;

    if !runtime.enabled {
        log::info!(
            "onchain refresh worker is disabled by DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED; keeping service alive"
        );
        return wait_for_service_shutdown("disabled onchain refresh worker").await;
    }

    log::info!(
        "onchain refresh worker runtime is ready enabled={} database_url_configured={} batch_size={} max_batches_per_poll={} run_once={}",
        runtime.enabled,
        !database_url.is_empty(),
        runtime.batch_size,
        runtime.max_batches_per_poll,
        runtime.run_once
    );

    let pool = PgPoolOptions::new()
        .max_connections(runtime.database_max_connections)
        .connect(&database_url)
        .await
        .context("connect to DeGov indexer Postgres")?;
    let chain_tool = EvmRpcChainTool::new(runtime.rpc_url.clone(), runtime.request_timeout)
        .context("create onchain refresh RPC ChainTool")?;
    let reader = degov_datalens_indexer::ChainToolOnchainRefreshReader::new(
        chain_tool,
        runtime.read_plan_config(),
        runtime.current_power_method,
    );
    let worker = OnchainRefreshWorker::new(pool, runtime.worker_config(), reader)
        .with_current_power_method(runtime.current_power_method);

    loop {
        let mut poll_claimed = 0;
        let mut poll_completed = 0;
        let mut poll_failed = 0;

        for _ in 0..runtime.max_batches_per_poll {
            let report = worker
                .run_once()
                .await
                .context("run onchain refresh batch")?;
            poll_claimed += report.claimed;
            poll_completed += report.completed;
            poll_failed += report.failed;

            if report.claimed == 0 {
                break;
            }
        }

        log::info!(
            "onchain refresh worker pass completed claimed={} completed={} failed={}",
            poll_claimed,
            poll_completed,
            poll_failed
        );

        if runtime.run_once {
            return Ok(());
        }

        sleep(runtime.poll_interval).await;
    }
}

async fn wait_for_service_shutdown(service_name: &str) -> anyhow::Result<()> {
    log::info!("{service_name} service is running; stop the process to shut it down");
    future::pending::<()>().await;
    Ok(())
}

async fn migrate() -> anyhow::Result<()> {
    let database_url = required_env("DEGOV_INDEXER_DATABASE_URL")?;
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(&database_url)
        .await
        .context("connect to DeGov indexer Postgres")?;

    for statement in postgres_schema_statements(POSTGRES_SCHEMA_SQL) {
        pool.execute(statement).await.with_context(|| {
            format!("apply Datalens-native DeGov indexer schema statement: {statement}")
        })?;
    }

    log::info!("Datalens-native DeGov indexer schema applied");

    Ok(())
}

async fn run_graphql() -> anyhow::Result<()> {
    let database_url = required_env("DEGOV_INDEXER_DATABASE_URL")?;
    let config = GraphqlRuntimeConfig::from_env()?;
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .context("connect to DeGov indexer Postgres")?;
    let app = graphql::build_router_with_paths(graphql::build_schema(pool), config.paths.clone());
    let listener = tokio::net::TcpListener::bind(config.bind_address)
        .await
        .with_context(|| {
            format!(
                "bind DeGov indexer GraphQL endpoint {}",
                config.bind_address
            )
        })?;

    log::info!(
        "DeGov indexer GraphQL service listening public_endpoint={:?} bind_address={} paths={}",
        config.public_endpoint,
        config.bind_address,
        config.paths.join(",")
    );

    axum::serve(listener, app)
        .await
        .context("serve DeGov indexer GraphQL endpoint")
}

async fn verify_datalens(config: &DatalensConfig) -> anyhow::Result<()> {
    let config = config.clone();
    task::spawn_blocking(move || verify_datalens_blocking(&config))
        .await
        .context("join Datalens readiness task")?
}

fn verify_datalens_blocking(config: &DatalensConfig) -> anyhow::Result<()> {
    log::info!(
        "checking Datalens readiness for application {} at {}",
        config.application,
        config.endpoint
    );
    let client = DatalensNativeClient::from_config(config).context("create Datalens client")?;
    verify_datalens_service(&client).context("verify Datalens service")?;
    log::info!("Datalens native GraphQL readiness confirmed");

    Ok(())
}
