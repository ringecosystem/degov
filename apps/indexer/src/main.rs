use std::env;

use anyhow::Context;
use clap::{Parser, Subcommand};
use degov_datalens_indexer::{DatalensConfig, DatalensNativeClient, verify_datalens_service};
use sqlx::{Executor, postgres::PgPoolOptions};

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
        Command::Worker => run_worker(),
        Command::Migrate => migrate().await,
        Command::Graphql => graphql(),
        Command::SmokeDatalens => smoke_datalens(),
    }
}

fn init_logging() -> anyhow::Result<()> {
    tracing_log::LogTracer::init().context("initialize log tracer")?;
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .try_init()
        .map_err(|error| anyhow::anyhow!("initialize tracing subscriber: {error}"))
}

fn smoke_datalens() -> anyhow::Result<()> {
    let config = DatalensConfig::from_env().context("load Datalens configuration")?;
    verify_datalens(&config)
}

async fn run_indexer() -> anyhow::Result<()> {
    let config = DatalensConfig::from_env().context("load Datalens configuration")?;
    let database_url = required_env("DEGOV_INDEXER_DATABASE_URL")?;
    let contracts = config
        .dao_contracts
        .as_ref()
        .context("Datalens indexer run requires DATALENS_GOVERNOR_* contract envs")?;

    verify_datalens(&config)?;
    log::info!(
        "Datalens indexer runtime boundary is ready dao_chain={} dataset={} governor={} token={} timelock={} database_url_configured={}",
        config.chain.configured_name,
        config.dataset.key(),
        contracts.governor,
        contracts.governor_token,
        contracts.timelock,
        !database_url.is_empty()
    );
    log::info!("Datalens server is an external dependency; DeGov runs as an application consumer");

    Ok(())
}

fn run_worker() -> anyhow::Result<()> {
    let database_url = required_env("DEGOV_INDEXER_DATABASE_URL")?;
    let enabled =
        env::var("DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED").unwrap_or_else(|_| "true".to_owned());

    log::info!(
        "onchain refresh worker packaging is ready enabled={} database_url_configured={}",
        enabled,
        !database_url.is_empty()
    );

    Ok(())
}

async fn migrate() -> anyhow::Result<()> {
    let database_url = required_env("DEGOV_INDEXER_DATABASE_URL")?;
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(&database_url)
        .await
        .context("connect to DeGov indexer Postgres")?;

    pool.execute(POSTGRES_SCHEMA_SQL)
        .await
        .context("apply Datalens-native DeGov indexer schema")?;

    log::info!("Datalens-native DeGov indexer schema applied");

    Ok(())
}

fn graphql() -> anyhow::Result<()> {
    let endpoint = required_env("DEGOV_INDEXER_GRAPHQL_ENDPOINT")?;

    log::info!(
        "GraphQL/API packaging is configured endpoint={}; Datalens server remains external",
        endpoint
    );

    Ok(())
}

fn verify_datalens(config: &DatalensConfig) -> anyhow::Result<()> {
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

fn required_env(name: &'static str) -> anyhow::Result<String> {
    let value = env::var(name).with_context(|| format!("{name} is required"))?;
    let value = value.trim().to_owned();

    if value.is_empty() {
        anyhow::bail!("{name} must not be empty");
    }

    Ok(value)
}
