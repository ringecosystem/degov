use std::{collections::BTreeMap, future};

use anyhow as runtime_anyhow;
use runtime_anyhow::{Context, Result};
use sqlx::postgres::PgPoolOptions;
use tokio::time::sleep;

use crate::{
    EvmRpcChainTool, MultiChainToolOnchainRefreshReader, OnchainRefreshRuntimeConfig,
    OnchainRefreshWorker, required_env,
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

        for _ in 0..runtime.max_batches_per_poll {
            let report = worker
                .run_once()
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

            if report.claimed == 0 {
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

async fn wait_for_service_shutdown(service_name: &str) -> Result<()> {
    log::info!("{service_name} service is running; stop the process to shut it down");
    future::pending::<()>().await;
    Ok(())
}
