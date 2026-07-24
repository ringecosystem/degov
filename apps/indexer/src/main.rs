use anyhow::Context;
use clap::{Parser, Subcommand};
use degov_datalens_indexer::runtime::{
    DelegateProfileBackfillOptions, DelegateProfileBackfillSelection, DelegateProfileScope,
    TimelockProposalLinkBackfillOptions, migrate, refresh_proposal_reference_fields,
    refresh_proposal_titles, repair_delegate_profiles, repair_invalid_runtime_indexes,
    repair_timelock_proposal_links, run_graphql, run_indexer, run_worker, smoke_datalens,
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
    #[command(group(
        clap::ArgGroup::new("delegate_profile_selection")
            .required(true)
            .args(["all_scopes", "chain_id"])
    ))]
    RepairDelegateProfiles {
        #[arg(long, conflicts_with_all = ["chain_id", "dao_code", "governor_address"])]
        all_scopes: bool,
        #[arg(long, requires_all = ["dao_code", "governor_address"])]
        chain_id: Option<i32>,
        #[arg(long, requires_all = ["chain_id", "governor_address"])]
        dao_code: Option<String>,
        #[arg(long, requires_all = ["chain_id", "dao_code"])]
        governor_address: Option<String>,
        #[arg(long)]
        dry_run: bool,
        #[arg(long)]
        max_scopes: Option<usize>,
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
        Command::RepairDelegateProfiles {
            all_scopes,
            chain_id,
            dao_code,
            governor_address,
            dry_run,
            max_scopes,
        } => {
            let selection = if all_scopes {
                DelegateProfileBackfillSelection::AllScopes
            } else {
                let (Some(chain_id), Some(dao_code), Some(governor_address)) =
                    (chain_id, dao_code, governor_address)
                else {
                    anyhow::bail!(
                        "delegate profile repair requires --all-scopes or a complete logical scope"
                    );
                };
                DelegateProfileBackfillSelection::Scope(DelegateProfileScope::new(
                    chain_id,
                    dao_code,
                    governor_address,
                )?)
            };
            let report = repair_delegate_profiles(DelegateProfileBackfillOptions {
                selection,
                dry_run,
                max_scopes,
            })
            .await?;
            log::info!(
                "delegate profile repair completed dry_run={} scopes_processed={} profiles_inserted={} metric_rows_updated={} profiles_would_insert={} metric_rows_would_update={}",
                report.dry_run,
                report.scopes_processed,
                report.profiles_inserted,
                report.metric_rows_updated,
                report.profiles_would_insert,
                report.metric_rows_would_update
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

#[cfg(test)]
mod tests {
    use super::{Cli, Command};
    use clap::Parser;

    #[test]
    fn test_repair_delegate_profiles_parses_scoped_canary() {
        let cli = Cli::try_parse_from([
            "degov-datalens-indexer",
            "repair-delegate-profiles",
            "--chain-id",
            "1",
            "--dao-code",
            "dao-a",
            "--governor-address",
            "0xGovernorA",
            "--dry-run",
        ])
        .expect("scoped delegate profile repair parses");

        assert!(matches!(
            cli.command,
            Command::RepairDelegateProfiles {
                all_scopes: false,
                chain_id: Some(1),
                dao_code: Some(ref dao_code),
                governor_address: Some(ref governor_address),
                dry_run: true,
                max_scopes: None,
            } if dao_code == "dao-a" && governor_address == "0xGovernorA"
        ));
    }

    #[test]
    fn test_repair_delegate_profiles_requires_explicit_scope_selection() {
        assert!(
            Cli::try_parse_from(["degov-datalens-indexer", "repair-delegate-profiles"]).is_err()
        );
        assert!(
            Cli::try_parse_from([
                "degov-datalens-indexer",
                "repair-delegate-profiles",
                "--all-scopes",
                "--chain-id",
                "1",
                "--dao-code",
                "dao-a",
                "--governor-address",
                "0xgovernora",
            ])
            .is_err()
        );
    }

    #[test]
    fn test_repair_delegate_profiles_parses_all_scopes_limit() {
        let cli = Cli::try_parse_from([
            "degov-datalens-indexer",
            "repair-delegate-profiles",
            "--all-scopes",
            "--max-scopes",
            "25",
        ])
        .expect("all-scope delegate profile repair parses");

        assert!(matches!(
            cli.command,
            Command::RepairDelegateProfiles {
                all_scopes: true,
                chain_id: None,
                dao_code: None,
                governor_address: None,
                dry_run: false,
                max_scopes: Some(25),
            }
        ));
    }
}
