use anyhow::Context;
use clap::{Parser, Subcommand};
use degov_datalens_indexer::runtime::{
    migrate, run_graphql, run_indexer, run_worker, smoke_datalens,
};

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
