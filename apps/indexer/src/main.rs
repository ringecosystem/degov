use anyhow::Context;
use clap::{Parser, Subcommand};
use degov_datalens_indexer::runtime::{
    TimelockProposalLinkBackfillOptions, migrate, refresh_proposal_reference_fields,
    refresh_proposal_titles, repair_invalid_runtime_indexes, repair_timelock_proposal_links,
    run_graphql, run_indexer, run_worker, smoke_datalens,
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
    RepairInvalidIndexes,
    Graphql,
    SmokeDatalens,
    RefreshProposalTitles {
        #[arg(long)]
        dao_code: String,
    },
    RefreshProposalReferenceFields {
        #[arg(long)]
        dao_code: String,
        #[arg(long)]
        reference_graphql_endpoint: String,
    },
    RepairTimelockProposalLinks {
        #[arg(long)]
        dao_code: String,
        #[arg(long)]
        contract_set_id: Option<String>,
        #[arg(long, default_value_t = 500)]
        batch_size: usize,
        #[arg(long, default_value_t = 20)]
        max_batches: usize,
    },
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    init_logging()?;
    let cli = Cli::parse();

    match cli.command {
        Command::Run => run_indexer().await,
        Command::Worker => run_worker().await,
        Command::Migrate => migrate().await,
        Command::RepairInvalidIndexes => repair_invalid_runtime_indexes().await,
        Command::Graphql => run_graphql().await,
        Command::SmokeDatalens => smoke_datalens().await,
        Command::RefreshProposalTitles { dao_code } => {
            let report = refresh_proposal_titles(dao_code).await?;
            log::info!(
                "proposal title refresh completed dao_code={} scanned={} updated={}",
                report.dao_code,
                report.scanned,
                report.updated
            );
            Ok(())
        }
        Command::RefreshProposalReferenceFields {
            dao_code,
            reference_graphql_endpoint,
        } => {
            let report =
                refresh_proposal_reference_fields(dao_code, reference_graphql_endpoint).await?;
            log::info!(
                "proposal reference field refresh completed dao_code={} reference_endpoint={} local_scanned={} reference_scanned={} planned={} updated={}",
                report.dao_code,
                report.reference_endpoint,
                report.local_scanned,
                report.reference_scanned,
                report.planned,
                report.updated
            );
            Ok(())
        }
        Command::RepairTimelockProposalLinks {
            dao_code,
            contract_set_id,
            batch_size,
            max_batches,
        } => {
            let report = repair_timelock_proposal_links(
                dao_code,
                contract_set_id,
                TimelockProposalLinkBackfillOptions {
                    batch_size,
                    max_batches,
                },
            )
            .await?;
            log::info!(
                "timelock proposal link repair completed dao_code={} contract_set_id={} batches_processed={} proposals_scanned={} proposal_links_projected={} timelock_operations_projected={} timelock_calls_projected={}",
                report.dao_code,
                report.contract_set_id,
                report.batches_processed,
                report.proposals_scanned,
                report.proposal_links_projected,
                report.timelock_operations_projected,
                report.timelock_calls_projected
            );
            Ok(())
        }
    }
}

fn init_logging() -> anyhow::Result<()> {
    tracing_log::LogTracer::init().context("initialize log tracer")?;
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .try_init()
        .map_err(|error| anyhow::anyhow!("initialize tracing subscriber: {error}"))
}
