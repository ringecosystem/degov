use std::{collections::BTreeMap, future};

use anyhow as runtime_anyhow;
use runtime_anyhow::{Context, Result};
use sqlx::postgres::PgPoolOptions;
use tokio::time::sleep;

use crate::{
    DatalensConfig, EvmRpcChainTool, IndexerRuntimeConfig, MultiChainToolOnchainRefreshReader,
    OnchainRefreshRunReport, OnchainRefreshRuntimeConfig, OnchainRefreshScopeMode,
    OnchainRefreshTaskScope, OnchainRefreshWorker, required_env,
};

use super::migrate::apply_migrations;

pub async fn run_worker() -> Result<()> {
    let database_url = required_env("DEGOV_INDEXER_DATABASE_URL")?;
    let runtime = OnchainRefreshRuntimeConfig::from_env()?;

    if !runtime.enabled {
        log::info!(
            "onchain refresh worker is disabled by DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED; keeping service alive"
        );
        return wait_for_service_shutdown("disabled onchain refresh worker").await;
    }

    log::info!(
        "onchain refresh worker runtime is ready enabled={} database_url_configured={} batch_size={} apply_batch_size={} max_batches_per_poll={} run_once={}",
        runtime.enabled,
        !database_url.is_empty(),
        runtime.batch_size,
        runtime.apply_batch_size,
        runtime.max_batches_per_poll,
        runtime.run_once
    );

    let pool = PgPoolOptions::new()
        .max_connections(runtime.database_max_connections)
        .connect(&database_url)
        .await
        .context("connect to DeGov indexer Postgres")?;
    apply_migrations(&pool).await?;

    let chain_tools = runtime
        .rpc_chains
        .iter()
        .map(|(chain_id, rpc)| {
            let chain_tool =
                EvmRpcChainTool::new(rpc.url.expose_secret().to_owned(), runtime.request_timeout)
                    .with_context(|| {
                    format!("create onchain refresh RPC ChainTool for chain_id {chain_id}")
                })?;

            Ok((*chain_id, chain_tool))
        })
        .collect::<Result<BTreeMap<_, _>>>()?;
    let reader = MultiChainToolOnchainRefreshReader::new(
        chain_tools,
        runtime.read_plan_config(),
        runtime.current_power_method,
    );
    let worker = OnchainRefreshWorker::new(pool, runtime.worker_config(), reader)
        .with_current_power_method(runtime.current_power_method);
    let scopes = load_onchain_refresh_worker_scopes(&runtime)?;
    let mut scope_schedule = OnchainRefreshWorkerScopeSchedule::new(scopes);

    loop {
        let mut poll_claimed = 0;
        let mut poll_completed = 0;
        let mut poll_failed = 0;
        let mut poll_skipped_tasks = 0;
        let mut poll_rpc_error_failures = 0;
        let mut poll_validation_failures = 0;
        let mut poll_db_update_failures = 0;
        let mut poll_cache_hits = 0;
        let mut poll_debounced_tasks = 0;

        let mut claimed_batches = 0usize;
        while claimed_batches < runtime.max_batches_per_poll {
            let batch_scope = scope_schedule.next_batch_scope();
            let report =
                run_onchain_refresh_worker_batch(&worker, &batch_scope, runtime.batch_size)
                    .await
                    .context("run onchain refresh batch")?;
            poll_claimed += report.claimed;
            poll_completed += report.completed;
            poll_failed += report.failed;
            poll_skipped_tasks += report.skipped_tasks;
            poll_rpc_error_failures += report.rpc_error_failures;
            poll_validation_failures += report.validation_failures;
            poll_db_update_failures += report.db_update_failures;
            poll_cache_hits += report.cache_hits;
            poll_debounced_tasks += report.debounced_tasks;

            if onchain_refresh_report_consumes_poll_batch(&report) {
                claimed_batches += 1;
            }

            if !scope_schedule.observe_batch_report(&report) {
                break;
            }
        }

        log::info!(
            "onchain refresh worker pass completed claimed={} completed={} failed={} skipped_tasks={} rpc_error_failures={} validation_failures={} db_update_failures={} cache_hits={} debounced_tasks={}",
            poll_claimed,
            poll_completed,
            poll_failed,
            poll_skipped_tasks,
            poll_rpc_error_failures,
            poll_validation_failures,
            poll_db_update_failures,
            poll_cache_hits,
            poll_debounced_tasks
        );

        if runtime.run_once {
            return Ok(());
        }

        sleep(runtime.poll_interval).await;
    }
}

fn onchain_refresh_report_consumes_poll_batch(report: &OnchainRefreshRunReport) -> bool {
    report.claimed > 0 || report.data_metric_refreshes > 0
}

async fn run_onchain_refresh_worker_batch<R>(
    worker: &OnchainRefreshWorker<R>,
    batch_scope: &OnchainRefreshWorkerBatchScope,
    batch_size: usize,
) -> Result<OnchainRefreshRunReport, crate::OnchainRefreshWorkerError>
where
    R: crate::OnchainRefreshReader,
{
    match batch_scope {
        OnchainRefreshWorkerBatchScope::Global => worker.run_once().await,
        OnchainRefreshWorkerBatchScope::Scoped(scope) => {
            worker
                .run_once_with_batch_size_for_scope_without_backlog(batch_size, scope)
                .await
        }
    }
}

fn load_onchain_refresh_worker_scopes(
    runtime: &OnchainRefreshRuntimeConfig,
) -> Result<Vec<OnchainRefreshTaskScope>> {
    match runtime.scope_mode {
        OnchainRefreshScopeMode::Global => Ok(Vec::new()),
        OnchainRefreshScopeMode::ConfiguredContractSets => {
            let indexer_runtime =
                IndexerRuntimeConfig::from_env().context("load DeGov indexer runtime config")?;
            let datalens_config = DatalensConfig::from_env().context("load Datalens config")?;
            let scopes = runtime
                .configured_task_scopes(&indexer_runtime, &datalens_config)
                .context("select onchain refresh worker configured contract set scopes")?;
            log_onchain_refresh_worker_scopes(&scopes);
            Ok(scopes)
        }
        OnchainRefreshScopeMode::AllModeConfiguredContractSets => {
            let scopes = load_all_mode_onchain_refresh_worker_scopes(runtime)?;
            log_onchain_refresh_worker_scopes(&scopes);
            Ok(scopes)
        }
    }
}

fn load_all_mode_onchain_refresh_worker_scopes(
    runtime: &OnchainRefreshRuntimeConfig,
) -> Result<Vec<OnchainRefreshTaskScope>> {
    let indexer_runtime = match IndexerRuntimeConfig::from_env() {
        Ok(runtime) => runtime,
        Err(error) => {
            log::warn!(
                "onchain refresh worker could not load all-mode indexer runtime config for scoped scheduling; using global scheduling error={error}"
            );
            return Ok(Vec::new());
        }
    };
    let datalens_config = match DatalensConfig::from_env() {
        Ok(config) => config,
        Err(error) => {
            log::warn!(
                "onchain refresh worker could not load Datalens config for scoped scheduling; using global scheduling error={error}"
            );
            return Ok(Vec::new());
        }
    };

    runtime
        .configured_task_scopes(&indexer_runtime, &datalens_config)
        .context("select all-mode onchain refresh worker configured contract set scopes")
}

fn log_onchain_refresh_worker_scopes(scopes: &[OnchainRefreshTaskScope]) {
    if scopes.is_empty() {
        log::info!("onchain refresh worker is using global task scheduling");
        return;
    }

    log::info!(
        "onchain refresh worker is using scoped task scheduling scope_count={}",
        scopes.len()
    );
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OnchainRefreshWorkerBatchScope {
    Global,
    Scoped(OnchainRefreshTaskScope),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OnchainRefreshWorkerScopeSchedule {
    scopes: Vec<OnchainRefreshTaskScope>,
    next_scope_index: usize,
    consecutive_empty_scoped_batches: usize,
}

impl OnchainRefreshWorkerScopeSchedule {
    pub fn new(scopes: Vec<OnchainRefreshTaskScope>) -> Self {
        Self {
            scopes,
            next_scope_index: 0,
            consecutive_empty_scoped_batches: 0,
        }
    }

    pub fn next_batch_scope(&mut self) -> OnchainRefreshWorkerBatchScope {
        if self.scopes.is_empty() {
            return OnchainRefreshWorkerBatchScope::Global;
        }

        let scope = self.scopes[self.next_scope_index].clone();
        self.next_scope_index = (self.next_scope_index + 1) % self.scopes.len();
        OnchainRefreshWorkerBatchScope::Scoped(scope)
    }

    pub fn observe_batch_report(&mut self, report: &OnchainRefreshRunReport) -> bool {
        self.observe_batch_claimed(report.claimed)
    }

    pub fn observe_batch_claimed(&mut self, claimed: usize) -> bool {
        if self.scopes.is_empty() {
            return claimed > 0;
        }

        if claimed > 0 {
            self.consecutive_empty_scoped_batches = 0;
            return true;
        }

        self.consecutive_empty_scoped_batches += 1;
        if self.consecutive_empty_scoped_batches >= self.scopes.len() {
            self.consecutive_empty_scoped_batches = 0;
            return false;
        }

        true
    }
}

async fn wait_for_service_shutdown(service_name: &str) -> Result<()> {
    log::info!("{service_name} service is running; stop the process to shut it down");
    future::pending::<()>().await;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_onchain_refresh_report_consumes_poll_batch_for_data_metric_only_work() {
        assert!(onchain_refresh_report_consumes_poll_batch(
            &OnchainRefreshRunReport {
                data_metric_refreshes: 1,
                ..OnchainRefreshRunReport::default()
            }
        ));
    }

    #[test]
    fn test_onchain_refresh_report_consumes_poll_batch_for_claimed_tasks() {
        assert!(onchain_refresh_report_consumes_poll_batch(
            &OnchainRefreshRunReport {
                claimed: 1,
                ..OnchainRefreshRunReport::default()
            }
        ));
    }

    #[test]
    fn test_onchain_refresh_report_does_not_consume_poll_batch_when_empty() {
        assert!(!onchain_refresh_report_consumes_poll_batch(
            &OnchainRefreshRunReport::default()
        ));
    }
}
