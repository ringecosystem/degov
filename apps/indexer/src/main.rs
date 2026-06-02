use std::{env, future, net::SocketAddr, time::Duration};

use anyhow::Context;
use clap::{Parser, Subcommand};
use degov_datalens_indexer::{
    BatchReadPlanConfig, ChainContracts, ChainReadMethod, DaoEventDecoder, DatalensConfig,
    DatalensNativeClient, DatalensRuntimeContractSet, EvmRpcChainTool, IndexerCheckpointIdentity,
    IndexerRunner, IndexerRunnerContexts, IndexerRunnerOptions, OnchainRefreshWorker,
    OnchainRefreshWorkerConfig, PostgresIndexerRunnerStore, ProposalProjectionContext,
    TimelockProjectionContext, TokenProjectionContext, VoteProjectionContext,
    graphql, verify_datalens_service,
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
    let worker = OnchainRefreshWorker::new(pool, runtime.worker_config(), reader);

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
    let endpoint = required_env("DEGOV_INDEXER_GRAPHQL_ENDPOINT")?;
    let bind_address = parse_bind_address(&endpoint)?;
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .context("connect to DeGov indexer Postgres")?;
    let app = graphql::build_router(graphql::build_schema(pool));
    let listener = tokio::net::TcpListener::bind(bind_address)
        .await
        .with_context(|| format!("bind DeGov indexer GraphQL endpoint {bind_address}"))?;

    log::info!(
        "DeGov indexer GraphQL service listening endpoint={} bind_address={} path=/graphql",
        endpoint,
        bind_address
    );

    axum::serve(listener, app)
        .await
        .context("serve DeGov indexer GraphQL endpoint")
}

fn parse_bind_address(endpoint: &str) -> anyhow::Result<SocketAddr> {
    let address = endpoint
        .strip_prefix("http://")
        .or_else(|| endpoint.strip_prefix("https://"))
        .unwrap_or(endpoint);
    let address = address.split('/').next().unwrap_or(address);

    address.parse().with_context(|| {
        format!("parse DEGOV_INDEXER_GRAPHQL_ENDPOINT as bind address: {endpoint}")
    })
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

#[derive(Clone, Debug, Eq, PartialEq)]
struct IndexerRuntimeConfig {
    dao_filter: Option<String>,
    contract_set_mode: IndexerContractSetMode,
    target_height: i64,
    poll_interval: Duration,
    run_once: bool,
    max_chunks_per_run: Option<u64>,
    database_max_connections: u32,
    checkpoint_stream_id: String,
    data_source_version: String,
    query_max_attempts: u32,
    progress_refresh_lag_blocks: i64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum IndexerContractSetMode {
    Single,
    All,
}

impl IndexerContractSetMode {
    fn from_env() -> anyhow::Result<Self> {
        match optional_env("DEGOV_INDEXER_CONTRACT_SET_MODE")?
            .as_deref()
            .unwrap_or("single")
        {
            "single" => Ok(Self::Single),
            "all" => Ok(Self::All),
            _ => anyhow::bail!("DEGOV_INDEXER_CONTRACT_SET_MODE must be single or all"),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Single => "single",
            Self::All => "all",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct IndexerContractSetRuntimeConfig {
    dao_code: String,
    start_block: i64,
    target_height: i64,
    checkpoint_contract_set_id: String,
    checkpoint_stream_id: String,
    data_source_version: String,
    query_max_attempts: u32,
    progress_refresh_lag_blocks: i64,
    max_chunks_per_run: Option<u64>,
}

impl IndexerRuntimeConfig {
    fn from_env() -> anyhow::Result<Self> {
        let contract_set_mode = IndexerContractSetMode::from_env()?;
        let dao_filter = match contract_set_mode {
            IndexerContractSetMode::Single => Some(required_env("DEGOV_INDEXER_DAO_CODE")?),
            IndexerContractSetMode::All => optional_env("DEGOV_INDEXER_DAO_CODE")?,
        };
        let target_height = required_env_i64("DEGOV_INDEXER_TARGET_HEIGHT")?;

        let query_max_attempts = optional_env_u32("DEGOV_INDEXER_QUERY_MAX_ATTEMPTS")?.unwrap_or(3);
        if query_max_attempts == 0 {
            anyhow::bail!("DEGOV_INDEXER_QUERY_MAX_ATTEMPTS must be greater than zero");
        }

        let database_max_connections =
            optional_env_u32("DEGOV_INDEXER_DATABASE_MAX_CONNECTIONS")?.unwrap_or(5);
        if database_max_connections == 0 {
            anyhow::bail!("DEGOV_INDEXER_DATABASE_MAX_CONNECTIONS must be greater than zero");
        }

        let poll_interval = Duration::from_millis(
            optional_env_u64("DEGOV_INDEXER_POLL_INTERVAL_MS")?.unwrap_or(10_000),
        );
        let run_once = optional_env_bool("DEGOV_INDEXER_RUN_ONCE")?.unwrap_or(false);

        Ok(Self {
            dao_filter,
            contract_set_mode,
            target_height,
            checkpoint_stream_id: optional_env("DEGOV_INDEXER_STREAM_ID")?
                .unwrap_or_else(|| "datalens-native".to_owned()),
            data_source_version: optional_env("DEGOV_INDEXER_DATA_SOURCE_VERSION")?
                .unwrap_or_else(|| "datalens-v1".to_owned()),
            query_max_attempts,
            progress_refresh_lag_blocks: optional_env_i64(
                "DEGOV_INDEXER_PROGRESS_REFRESH_LAG_BLOCKS",
            )?
            .unwrap_or(100),
            poll_interval,
            run_once,
            max_chunks_per_run: optional_env_u64("DEGOV_INDEXER_MAX_CHUNKS_PER_RUN")?,
            database_max_connections,
        })
    }

    fn configured_contract_sets(
        &self,
        config: &DatalensConfig,
    ) -> anyhow::Result<Vec<DatalensRuntimeContractSet>> {
        match self.contract_set_mode {
            IndexerContractSetMode::Single => {
                let dao_code = self
                    .dao_filter
                    .as_deref()
                    .context("DEGOV_INDEXER_DAO_CODE is required")?;
                let selected = config
                    .select_contract_set(dao_code)
                    .context("select Datalens indexer contract set")?;
                let configured = config
                    .configured_contract_sets(Some(dao_code))
                    .context("select configured Datalens indexer contract set")?;
                configured
                    .into_iter()
                    .find(|contract_set| contract_set.contract == selected)
                    .map(|contract_set| vec![contract_set])
                    .context("selected Datalens indexer contract set was not configured")
            }
            IndexerContractSetMode::All => config
                .configured_contract_sets(self.dao_filter.as_deref())
                .context("select configured Datalens indexer contract sets"),
        }
    }

    fn for_configured_contract_set(
        &self,
        contract_set: &DatalensRuntimeContractSet,
    ) -> anyhow::Result<IndexerContractSetRuntimeConfig> {
        let runtime = IndexerContractSetRuntimeConfig {
            dao_code: contract_set.dao_code.clone(),
            start_block: 0,
            target_height: self.target_height,
            checkpoint_contract_set_id: String::new(),
            checkpoint_stream_id: self.checkpoint_stream_id.clone(),
            data_source_version: self.data_source_version.clone(),
            query_max_attempts: self.query_max_attempts,
            progress_refresh_lag_blocks: self.progress_refresh_lag_blocks,
            max_chunks_per_run: self.max_chunks_per_run,
        };

        Ok(runtime
            .with_start_block(contract_set.contract.start_block)?
            .with_contract_set_scope(contract_set.contract_set_id.clone()))
    }

    fn should_skip_contract_set_start_after_target(&self, start_block: i64) -> bool {
        matches!(self.contract_set_mode, IndexerContractSetMode::All)
            && self.target_height < start_block
    }
}

impl IndexerContractSetRuntimeConfig {
    fn with_start_block(mut self, start_block: i64) -> anyhow::Result<Self> {
        if self.target_height < start_block {
            anyhow::bail!(
                "DEGOV_INDEXER_TARGET_HEIGHT must be greater than or equal to configured startBlock"
            );
        }
        self.start_block = start_block;

        Ok(self)
    }

    fn with_contract_set_scope(mut self, contract_set_id: String) -> Self {
        self.checkpoint_contract_set_id = contract_set_id;
        self
    }

    fn options(
        &self,
        config: &DatalensConfig,
        contracts: &degov_datalens_indexer::DaoContractAddresses,
    ) -> anyhow::Result<IndexerRunnerOptions> {
        let chain_id = config
            .chain
            .network_id
            .context("DATALENS_CHAIN_ID is required for EVM log normalization")?;

        Ok(IndexerRunnerOptions {
            datalens_config: config.clone(),
            addresses: contracts.clone(),
            checkpoint_identity: IndexerCheckpointIdentity {
                dao_code: self.dao_code.clone(),
                chain_id,
                contract_set_id: self.checkpoint_contract_set_id.clone(),
                stream_id: self.checkpoint_stream_id.clone(),
                data_source_version: self.data_source_version.clone(),
            },
            start_block: self.start_block,
            query_max_attempts: self.query_max_attempts,
            safe_height: None,
            progress_refresh_lag_blocks: self.progress_refresh_lag_blocks,
        })
    }

    fn contexts(
        &self,
        contracts: &degov_datalens_indexer::DaoContractAddresses,
    ) -> IndexerRunnerContexts {
        let chain_contracts = ChainContracts {
            governor: contracts.governor.clone(),
            governor_token: contracts.governor_token.clone(),
            timelock: contracts.timelock.clone(),
        };
        let read_plan_config = BatchReadPlanConfig::default().validated();

        IndexerRunnerContexts {
            vote: VoteProjectionContext {
                contract_set_id: self.checkpoint_contract_set_id.clone(),
                dao_code: self.dao_code.clone(),
                governor_address: contracts.governor.clone(),
                contracts: chain_contracts.clone(),
                read_plan_config,
            },
            token: TokenProjectionContext {
                contract_set_id: self.checkpoint_contract_set_id.clone(),
                dao_code: self.dao_code.clone(),
                governor_address: contracts.governor.clone(),
                token_address: contracts.governor_token.clone(),
                contracts: chain_contracts.clone(),
                token_standard: contracts.governor_token_standard,
                from_block: u64::try_from(self.start_block).unwrap_or_default(),
                to_block: u64::try_from(self.start_block).unwrap_or_default(),
                target_height: u64::try_from(self.target_height).ok(),
                read_plan_config,
                current_power_method: ChainReadMethod::GetVotes,
            },
            proposal: Some(ProposalProjectionContext {
                dao_code: self.dao_code.clone(),
                governor_address: contracts.governor.clone(),
                contracts: chain_contracts.clone(),
                read_plan_config,
            }),
            timelock: Some(TimelockProjectionContext {
                dao_code: self.dao_code.clone(),
                governor_address: contracts.governor.clone(),
                timelock_address: contracts.timelock.clone(),
                contracts: chain_contracts,
                read_plan_config,
            }),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct OnchainRefreshRuntimeConfig {
    enabled: bool,
    rpc_url: String,
    batch_size: usize,
    max_attempts: i32,
    max_batches_per_poll: usize,
    poll_interval: Duration,
    run_once: bool,
    lock_ttl: Duration,
    retry_delay: Duration,
    request_timeout: Duration,
    database_max_connections: u32,
    max_concurrency: usize,
    multicall_batch_size: usize,
    current_power_method: ChainReadMethod,
}

impl OnchainRefreshRuntimeConfig {
    fn from_env() -> anyhow::Result<Self> {
        let enabled = optional_env_bool("DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED")?.unwrap_or(true);
        let rpc_url = if enabled {
            required_env("DEGOV_ONCHAIN_REFRESH_RPC_URL")?
        } else {
            optional_env("DEGOV_ONCHAIN_REFRESH_RPC_URL")?.unwrap_or_default()
        };
        let batch_size = optional_env_usize("DEGOV_ONCHAIN_REFRESH_BATCH_SIZE")?.unwrap_or(100);
        if batch_size == 0 {
            anyhow::bail!("DEGOV_ONCHAIN_REFRESH_BATCH_SIZE must be greater than zero");
        }

        let max_attempts = optional_env_i32("DEGOV_ONCHAIN_REFRESH_MAX_ATTEMPTS")?.unwrap_or(3);
        if max_attempts <= 0 {
            anyhow::bail!("DEGOV_ONCHAIN_REFRESH_MAX_ATTEMPTS must be greater than zero");
        }

        let max_batches_per_poll =
            optional_env_usize("DEGOV_ONCHAIN_REFRESH_MAX_BATCHES_PER_POLL")?.unwrap_or(1);
        if max_batches_per_poll == 0 {
            anyhow::bail!("DEGOV_ONCHAIN_REFRESH_MAX_BATCHES_PER_POLL must be greater than zero");
        }

        let poll_interval = Duration::from_millis(
            optional_env_u64("DEGOV_ONCHAIN_REFRESH_POLL_INTERVAL_MS")?.unwrap_or(10_000),
        );
        let run_once = optional_env_bool("DEGOV_ONCHAIN_REFRESH_RUN_ONCE")?
            .or(optional_env_bool("DEGOV_INDEXER_RUN_ONCE")?)
            .unwrap_or(false);
        let lock_ttl = Duration::from_millis(
            optional_env_u64("DEGOV_ONCHAIN_REFRESH_LOCK_TTL_MS")?.unwrap_or(300_000),
        );
        let retry_delay = Duration::from_millis(
            optional_env_u64("DEGOV_ONCHAIN_REFRESH_RETRY_DELAY_MS")?.unwrap_or(30_000),
        );
        let request_timeout = Duration::from_millis(
            optional_env_u64("DEGOV_ONCHAIN_REFRESH_REQUEST_TIMEOUT_MS")?.unwrap_or(15_000),
        );
        let database_max_connections =
            optional_env_u32("DEGOV_INDEXER_DATABASE_MAX_CONNECTIONS")?.unwrap_or(5);
        if database_max_connections == 0 {
            anyhow::bail!("DEGOV_INDEXER_DATABASE_MAX_CONNECTIONS must be greater than zero");
        }
        let max_concurrency = optional_env_usize("DEGOV_ONCHAIN_REFRESH_CONCURRENCY")?.unwrap_or(1);
        if max_concurrency == 0 {
            anyhow::bail!("DEGOV_ONCHAIN_REFRESH_CONCURRENCY must be greater than zero");
        }
        let multicall_batch_size =
            optional_env_usize("DEGOV_ONCHAIN_REFRESH_MULTICALL_CHUNK_SIZE")?.unwrap_or(100);
        if multicall_batch_size == 0 {
            anyhow::bail!("DEGOV_ONCHAIN_REFRESH_MULTICALL_CHUNK_SIZE must be greater than zero");
        }
        let current_power_method = optional_env("DEGOV_ONCHAIN_REFRESH_CURRENT_POWER_METHOD")?
            .as_deref()
            .map(parse_current_power_method)
            .transpose()?
            .unwrap_or(ChainReadMethod::GetVotes);

        Ok(Self {
            enabled,
            rpc_url,
            batch_size,
            max_attempts,
            max_batches_per_poll,
            poll_interval,
            run_once,
            lock_ttl,
            retry_delay,
            request_timeout,
            database_max_connections,
            max_concurrency,
            multicall_batch_size,
            current_power_method,
        })
    }

    fn read_plan_config(&self) -> BatchReadPlanConfig {
        BatchReadPlanConfig {
            max_concurrency: self.max_concurrency,
            multicall_batch_size: self.multicall_batch_size,
        }
        .validated()
    }

    fn worker_config(&self) -> OnchainRefreshWorkerConfig {
        OnchainRefreshWorkerConfig {
            batch_size: self.batch_size,
            max_attempts: self.max_attempts,
            lock_ttl: self.lock_ttl,
            retry_delay: self.retry_delay,
            lock_owner: format!("degov-onchain-refresh-worker:{}", std::process::id()),
        }
    }
}

fn required_env(name: &'static str) -> anyhow::Result<String> {
    let value = env::var(name).with_context(|| format!("{name} is required"))?;
    let value = value.trim().to_owned();

    if value.is_empty() {
        anyhow::bail!("{name} must not be empty");
    }

    Ok(value)
}

fn optional_env(name: &'static str) -> anyhow::Result<Option<String>> {
    match env::var(name) {
        Ok(value) => {
            let value = value.trim().to_owned();

            if value.is_empty() {
                Ok(None)
            } else {
                Ok(Some(value))
            }
        }
        Err(env::VarError::NotPresent) => Ok(None),
        Err(error) => Err(error).with_context(|| format!("read {name}")),
    }
}

fn required_env_i64(name: &'static str) -> anyhow::Result<i64> {
    parse_i64_env_value(name, &required_env(name)?)
}

fn optional_env_i64(name: &'static str) -> anyhow::Result<Option<i64>> {
    optional_env(name)?
        .map(|value| parse_i64_env_value(name, &value))
        .transpose()
}

fn optional_env_i32(name: &'static str) -> anyhow::Result<Option<i32>> {
    optional_env(name)?
        .map(|value| parse_i32_env_value(name, &value))
        .transpose()
}

fn optional_env_u32(name: &'static str) -> anyhow::Result<Option<u32>> {
    optional_env(name)?
        .map(|value| parse_u32_env_value(name, &value))
        .transpose()
}

fn optional_env_u64(name: &'static str) -> anyhow::Result<Option<u64>> {
    optional_env(name)?
        .map(|value| parse_u64_env_value(name, &value))
        .transpose()
}

fn optional_env_usize(name: &'static str) -> anyhow::Result<Option<usize>> {
    optional_env(name)?
        .map(|value| parse_usize_env_value(name, &value))
        .transpose()
}

fn optional_env_bool(name: &'static str) -> anyhow::Result<Option<bool>> {
    optional_env(name)?
        .map(|value| parse_bool_env_value(name, &value))
        .transpose()
}

fn parse_i64_env_value(name: &'static str, value: &str) -> anyhow::Result<i64> {
    value
        .trim()
        .parse::<i64>()
        .with_context(|| format!("{name} must be a signed integer"))
}

fn parse_i32_env_value(name: &'static str, value: &str) -> anyhow::Result<i32> {
    value
        .trim()
        .parse::<i32>()
        .with_context(|| format!("{name} must be a signed integer"))
}

fn parse_u32_env_value(name: &'static str, value: &str) -> anyhow::Result<u32> {
    value
        .trim()
        .parse::<u32>()
        .with_context(|| format!("{name} must be an unsigned integer"))
}

fn parse_usize_env_value(name: &'static str, value: &str) -> anyhow::Result<usize> {
    value
        .trim()
        .parse::<usize>()
        .with_context(|| format!("{name} must be an unsigned integer"))
}

fn parse_u64_env_value(name: &'static str, value: &str) -> anyhow::Result<u64> {
    value
        .trim()
        .parse::<u64>()
        .with_context(|| format!("{name} must be an unsigned integer"))
}

fn parse_bool_env_value(name: &'static str, value: &str) -> anyhow::Result<bool> {
    match value.trim().to_ascii_lowercase().as_str() {
        "true" | "1" | "yes" => Ok(true),
        "false" | "0" | "no" => Ok(false),
        _ => anyhow::bail!("{name} must be one of true, false, 1, 0, yes, or no"),
    }
}

#[cfg(test)]
fn onchain_refresh_worker_enabled(value: &str) -> anyhow::Result<bool> {
    parse_bool_env_value("DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED", value)
}

fn parse_current_power_method(value: &str) -> anyhow::Result<ChainReadMethod> {
    match value.trim() {
        "getVotes" | "get_votes" => Ok(ChainReadMethod::GetVotes),
        "getCurrentVotes" | "get_current_votes" | "currentVotes" | "current_votes" => {
            Ok(ChainReadMethod::CurrentVotes)
        }
        _ => anyhow::bail!(
            "DEGOV_ONCHAIN_REFRESH_CURRENT_POWER_METHOD must be getVotes or getCurrentVotes"
        ),
    }
}

fn postgres_schema_statements(sql: &str) -> Vec<&str> {
    let mut statements = Vec::new();
    let mut statement_start = 0;
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut in_line_comment = false;
    let mut in_block_comment = false;
    let mut dollar_quote_tag: Option<&str> = None;
    let mut chars = sql.char_indices().peekable();

    while let Some((index, character)) = chars.next() {
        let rest = &sql[index..];

        if let Some(tag) = dollar_quote_tag {
            if rest.starts_with(tag) {
                dollar_quote_tag = None;
                for _ in 1..tag.chars().count() {
                    chars.next();
                }
            }
            continue;
        }

        if in_line_comment {
            if character == '\n' {
                in_line_comment = false;
            }
            continue;
        }

        if in_block_comment {
            if rest.starts_with("*/") {
                in_block_comment = false;
                chars.next();
            }
            continue;
        }

        if in_single_quote {
            if character == '\'' {
                if matches!(chars.peek(), Some((_, '\''))) {
                    chars.next();
                } else {
                    in_single_quote = false;
                }
            }
            continue;
        }

        if in_double_quote {
            if character == '"' {
                in_double_quote = false;
            }
            continue;
        }

        if rest.starts_with("--") {
            in_line_comment = true;
            chars.next();
            continue;
        }

        if rest.starts_with("/*") {
            in_block_comment = true;
            chars.next();
            continue;
        }

        if character == '\'' {
            in_single_quote = true;
            continue;
        }

        if character == '"' {
            in_double_quote = true;
            continue;
        }

        if character == '$' {
            if let Some(tag_end) = rest[1..].find('$') {
                let tag = &rest[..=tag_end + 1];

                if tag[1..tag.len() - 1]
                    .chars()
                    .all(|tag_char| tag_char == '_' || tag_char.is_ascii_alphanumeric())
                {
                    dollar_quote_tag = Some(tag);
                    for _ in 1..tag.chars().count() {
                        chars.next();
                    }
                }
            }
            continue;
        }

        if character == ';' {
            let statement = sql[statement_start..index].trim();

            if !statement.is_empty() {
                statements.push(statement);
            }

            statement_start = index + character.len_utf8();
        }
    }

    let statement = sql[statement_start..].trim();

    if !statement.is_empty() {
        statements.push(statement);
    }

    statements
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_postgres_schema_statements_splits_schema_into_individual_statements() {
        let statements = postgres_schema_statements(
            "CREATE TABLE one (id INTEGER);\n\n-- comment with ;\nCREATE INDEX one_id_idx ON one (id);\n",
        );

        assert_eq!(
            statements,
            vec![
                "CREATE TABLE one (id INTEGER)",
                "-- comment with ;\nCREATE INDEX one_id_idx ON one (id)"
            ]
        );
    }

    #[test]
    fn test_onchain_refresh_worker_enabled_accepts_disabled_values() {
        assert!(!onchain_refresh_worker_enabled("false").expect("false parses"));
        assert!(!onchain_refresh_worker_enabled("0").expect("0 parses"));
        assert!(!onchain_refresh_worker_enabled("no").expect("no parses"));
    }

    #[test]
    fn test_onchain_refresh_worker_enabled_rejects_ambiguous_values() {
        let error = onchain_refresh_worker_enabled("disabled").expect_err("disabled is invalid");

        assert!(
            error
                .to_string()
                .contains("DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED")
        );
    }

    #[test]
    fn test_parse_bool_env_value_accepts_runtime_flag_values() {
        assert!(parse_bool_env_value("DEGOV_INDEXER_RUN_ONCE", "yes").expect("yes parses"));
        assert!(!parse_bool_env_value("DEGOV_INDEXER_RUN_ONCE", "0").expect("0 parses"));
    }

    #[test]
    fn test_parse_i64_env_value_reports_field_name() {
        let error = parse_i64_env_value("DEGOV_INDEXER_START_BLOCK", "latest")
            .expect_err("latest is invalid");

        assert!(error.to_string().contains("DEGOV_INDEXER_START_BLOCK"));
    }

    #[test]
    fn test_indexer_runtime_config_requires_explicit_target_height() {
        temp_env::with_vars(
            [
                ("DEGOV_INDEXER_DAO_CODE", Some("demo-dao")),
                ("DEGOV_INDEXER_START_BLOCK", Some("10")),
                ("DEGOV_INDEXER_TARGET_HEIGHT", None),
            ],
            || {
                let error =
                    IndexerRuntimeConfig::from_env().expect_err("missing target height is invalid");

                assert!(error.to_string().contains("DEGOV_INDEXER_TARGET_HEIGHT"));
            },
        );
    }

    #[test]
    fn test_indexer_runtime_contract_set_plan_uses_configured_scope() {
        let config = DatalensConfig {
            endpoint: "https://datalens.ringdao.com".to_owned(),
            application: "degov-live".to_owned(),
            bearer_token: degov_datalens_indexer::SecretString::new("unit-test-redacted-value"),
            timeout: Duration::from_secs(60),
            finality: degov_datalens_indexer::DatalensFinality::DurableOnly,
            chain: degov_datalens_indexer::ChainIdentityConfig {
                family: degov_datalens_indexer::ChainFamily::Evm,
                configured_name: "ethereum".to_owned(),
                network_id: Some(1),
            },
            dataset: degov_datalens_indexer::DatasetKeyConfig {
                family: "evm".to_owned(),
                name: "logs".to_owned(),
            },
            query_limits: degov_datalens_indexer::QueryLimitConfig {
                block_range_limit: 1_000,
            },
            dao_contracts: None,
            chains: vec![degov_datalens_indexer::DatalensChainConfig {
                family: degov_datalens_indexer::ChainFamily::Evm,
                configured_name: "lisk".to_owned(),
                network_id: 1135,
                contracts: vec![degov_datalens_indexer::DatalensContractSetConfig {
                    dao_code: Some("lisk-dao".to_owned()),
                    chain_id: 1135,
                    network_name: "lisk".to_owned(),
                    governor: "0x1111111111111111111111111111111111111111".to_owned(),
                    governor_token: "0x2222222222222222222222222222222222222222".to_owned(),
                    governor_token_standard: degov_datalens_indexer::GovernanceTokenStandard::Erc20,
                    timelock: "0x3333333333333333333333333333333333333333".to_owned(),
                    start_block: 568752,
                }],
            }],
        };
        let runtime = IndexerRuntimeConfig {
            dao_filter: Some("lisk-dao".to_owned()),
            contract_set_mode: IndexerContractSetMode::Single,
            target_height: 568800,
            checkpoint_stream_id: "datalens-native".to_owned(),
            data_source_version: "datalens-v1".to_owned(),
            query_max_attempts: 3,
            progress_refresh_lag_blocks: 100,
            poll_interval: Duration::from_secs(10),
            run_once: true,
            max_chunks_per_run: None,
            database_max_connections: 1,
        };
        let selected = config
            .configured_contract_sets(Some("lisk-dao"))
            .expect("configured contract sets");

        let planned = runtime
            .for_configured_contract_set(&selected[0])
            .expect("planned contract set runtime");
        let options = planned
            .options(&selected[0].config, &selected[0].addresses)
            .expect("runner options");

        assert_eq!(planned.dao_code, "lisk-dao");
        assert_eq!(planned.start_block, 568752);
        assert_eq!(options.checkpoint_identity.chain_id, 1135);
        assert_eq!(
            options.checkpoint_identity.contract_set_id,
            selected[0].contract_set_id
        );
    }

    #[test]
    fn test_indexer_runtime_single_mode_does_not_skip_target_below_start_block() {
        let config = DatalensConfig {
            endpoint: "https://datalens.ringdao.com".to_owned(),
            application: "degov-live".to_owned(),
            bearer_token: degov_datalens_indexer::SecretString::new("unit-test-redacted-value"),
            timeout: Duration::from_secs(60),
            finality: degov_datalens_indexer::DatalensFinality::DurableOnly,
            chain: degov_datalens_indexer::ChainIdentityConfig {
                family: degov_datalens_indexer::ChainFamily::Evm,
                configured_name: "ethereum".to_owned(),
                network_id: Some(1),
            },
            dataset: degov_datalens_indexer::DatasetKeyConfig {
                family: "evm".to_owned(),
                name: "logs".to_owned(),
            },
            query_limits: degov_datalens_indexer::QueryLimitConfig {
                block_range_limit: 1_000,
            },
            dao_contracts: None,
            chains: vec![degov_datalens_indexer::DatalensChainConfig {
                family: degov_datalens_indexer::ChainFamily::Evm,
                configured_name: "lisk".to_owned(),
                network_id: 1135,
                contracts: vec![degov_datalens_indexer::DatalensContractSetConfig {
                    dao_code: Some("lisk-dao".to_owned()),
                    chain_id: 1135,
                    network_name: "lisk".to_owned(),
                    governor: "0x1111111111111111111111111111111111111111".to_owned(),
                    governor_token: "0x2222222222222222222222222222222222222222".to_owned(),
                    governor_token_standard: degov_datalens_indexer::GovernanceTokenStandard::Erc20,
                    timelock: "0x3333333333333333333333333333333333333333".to_owned(),
                    start_block: 568752,
                }],
            }],
        };
        let runtime = IndexerRuntimeConfig {
            dao_filter: Some("lisk-dao".to_owned()),
            contract_set_mode: IndexerContractSetMode::Single,
            target_height: 568751,
            checkpoint_stream_id: "datalens-native".to_owned(),
            data_source_version: "datalens-v1".to_owned(),
            query_max_attempts: 3,
            progress_refresh_lag_blocks: 100,
            poll_interval: Duration::from_secs(10),
            run_once: true,
            max_chunks_per_run: None,
            database_max_connections: 1,
        };
        let selected = config
            .configured_contract_sets(Some("lisk-dao"))
            .expect("configured contract sets");
        let error = runtime
            .for_configured_contract_set(&selected[0])
            .expect_err("single mode target below startBlock is invalid");
        let all_mode_runtime = IndexerRuntimeConfig {
            contract_set_mode: IndexerContractSetMode::All,
            ..runtime.clone()
        };

        assert!(!runtime.should_skip_contract_set_start_after_target(568752));
        assert!(all_mode_runtime.should_skip_contract_set_start_after_target(568752));
        assert!(error.to_string().contains("DEGOV_INDEXER_TARGET_HEIGHT"));
    }
}
