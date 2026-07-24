use anyhow as runtime_anyhow;
use runtime_anyhow::{Context, Result, bail};
use sqlx::postgres::PgPoolOptions;

use crate::{
    BatchReadPlanConfig, ChainContracts, DatalensConfig, TimelockProjectionContext,
    project_timelock_proposal_links, read_timelock_proposal_link_backfill_page, required_env,
    write_timelock_proposal_link_backfill_batch,
};

use super::migrate::apply_migrations;

const DEFAULT_TIMELOCK_PROPOSAL_LINK_BACKFILL_BATCH_SIZE: usize = 500;
const DEFAULT_TIMELOCK_PROPOSAL_LINK_BACKFILL_MAX_BATCHES: usize = 20;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TimelockProposalLinkBackfillOptions {
    pub batch_size: usize,
    pub max_batches: usize,
}

impl Default for TimelockProposalLinkBackfillOptions {
    fn default() -> Self {
        Self {
            batch_size: DEFAULT_TIMELOCK_PROPOSAL_LINK_BACKFILL_BATCH_SIZE,
            max_batches: DEFAULT_TIMELOCK_PROPOSAL_LINK_BACKFILL_MAX_BATCHES,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimelockProposalLinkBackfillReport {
    pub dao_code: String,
    pub contract_set_id: String,
    pub batches_processed: usize,
    pub proposals_scanned: usize,
    pub proposal_links_projected: usize,
    pub timelock_operations_projected: usize,
    pub timelock_calls_projected: usize,
}

pub async fn repair_timelock_proposal_links(
    dao_code: String,
    contract_set_id: Option<String>,
    options: TimelockProposalLinkBackfillOptions,
) -> Result<TimelockProposalLinkBackfillReport> {
    let database_url = required_env("DEGOV_INDEXER_DATABASE_URL")?;
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(&database_url)
        .await
        .context("connect to DeGov indexer Postgres")?;
    apply_migrations(&pool).await?;

    let config = DatalensConfig::from_env().context("load Datalens configuration")?;
    let context =
        resolve_timelock_backfill_context(&config, &dao_code, contract_set_id.as_deref())?;

    repair_timelock_proposal_links_with_pool(&pool, context, options).await
}

pub async fn repair_timelock_proposal_links_with_pool(
    pool: &sqlx::PgPool,
    context: TimelockProjectionContext,
    options: TimelockProposalLinkBackfillOptions,
) -> Result<TimelockProposalLinkBackfillReport> {
    if options.batch_size == 0 {
        bail!("timelock proposal link backfill batch_size must be greater than zero");
    }
    if options.max_batches == 0 {
        bail!("timelock proposal link backfill max_batches must be greater than zero");
    }

    let mut report = TimelockProposalLinkBackfillReport {
        dao_code: context.dao_code.clone(),
        contract_set_id: context.contract_set_id.clone(),
        batches_processed: 0,
        proposals_scanned: 0,
        proposal_links_projected: 0,
        timelock_operations_projected: 0,
        timelock_calls_projected: 0,
    };

    for _ in 0..options.max_batches {
        let page = read_timelock_proposal_link_backfill_page(pool, &context, options.batch_size)
            .await
            .context("read timelock proposal link backfill page")?;
        if page.proposals_scanned == 0 {
            break;
        }

        let batch =
            project_timelock_proposal_links(&context, &page.proposal_links).map_err(|error| {
                runtime_anyhow::anyhow!("project timelock proposal links: {error:?}")
            })?;
        write_timelock_proposal_link_backfill_batch(pool, &batch)
            .await
            .context("write timelock proposal link backfill batch")?;

        report.batches_processed += 1;
        report.proposals_scanned += page.proposals_scanned;
        report.proposal_links_projected += page.proposal_links.proposal_actions.len();
        report.timelock_operations_projected += batch.timelock_operations.len();
        report.timelock_calls_projected += batch.timelock_calls.len();
    }

    Ok(report)
}

fn resolve_timelock_backfill_context(
    config: &DatalensConfig,
    dao_code: &str,
    contract_set_id: Option<&str>,
) -> Result<TimelockProjectionContext> {
    let mut contract_sets = config
        .configured_contract_sets(Some(dao_code))
        .context("select configured Datalens indexer contract sets")?;
    if let Some(contract_set_id) = contract_set_id {
        contract_sets.retain(|contract_set| contract_set.contract_set_id == contract_set_id);
    }

    let selected = match contract_sets.as_slice() {
        [selected] => selected,
        [] => bail!("no configured contract set matched dao_code={dao_code}"),
        _ => bail!("multiple contract sets matched dao_code={dao_code}; pass --contract-set-id"),
    };
    let Some(timelock_address) = selected.addresses.timelock.clone() else {
        bail!(
            "configured contract set has no timelock address dao_code={} contract_set_id={}",
            selected.dao_code,
            selected.contract_set_id
        );
    };
    let contracts = ChainContracts {
        governor: selected.addresses.governor.clone(),
        governor_token: selected.addresses.governor_token.clone(),
        timelock: Some(timelock_address.clone()),
    };

    Ok(TimelockProjectionContext {
        contract_set_id: selected.contract_set_id.clone(),
        dao_code: selected.dao_code.clone(),
        governor_address: selected.addresses.governor.clone(),
        timelock_address,
        contracts,
        read_plan_config: BatchReadPlanConfig::default().validated(),
    })
}
