use std::future;

use anyhow as runtime_anyhow;
use runtime_anyhow::{Context, Result};
use sqlx::postgres::PgPoolOptions;
use tokio::time::sleep;

use crate::{
    ChainToolOnchainRefreshReader, EvmRpcChainTool, OnchainRefreshRuntimeConfig,
    OnchainRefreshWorker, required_env,
};

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
    let chain_tool = EvmRpcChainTool::new(runtime.rpc_url.clone(), runtime.request_timeout)
        .context("create onchain refresh RPC ChainTool")?;
    let reader = ChainToolOnchainRefreshReader::new(
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

async fn wait_for_service_shutdown(service_name: &str) -> Result<()> {
    log::info!("{service_name} service is running; stop the process to shut it down");
    future::pending::<()>().await;
    Ok(())
}
