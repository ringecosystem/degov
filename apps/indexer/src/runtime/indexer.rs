use anyhow as runtime_anyhow;
use runtime_anyhow::{Context, Result};
use sqlx::postgres::PgPoolOptions;
use tokio::{task, time::sleep};

use crate::{
    DaoContractAddresses, DaoEventDecoder, DatalensConfig, DatalensDurableHeadReader,
    DatalensNativeClient, IndexerContractSetRuntimeConfig, IndexerRunner, IndexerRunnerReport,
    IndexerRuntimeConfig, IndexerTargetHeight, PostgresIndexerRunnerStore, datalens_retry_config,
    required_env,
};

use super::{datalens::verify_datalens, migrate::apply_migrations};

pub async fn run_indexer() -> Result<()> {
    let config = DatalensConfig::from_env().context("load Datalens configuration")?;
    let database_url = required_env("DEGOV_INDEXER_DATABASE_URL")?;
    let runtime = IndexerRuntimeConfig::from_env()?;

    verify_datalens(&config).await?;
    log::info!(
        "Datalens indexer runtime boundary is ready contract_set_mode={} dao_filter={:?} dataset={} target_height={} database_url_configured={}",
        runtime.contract_set_mode.as_str(),
        runtime.dao_filter,
        config.dataset.key(),
        runtime.target_height.as_log_value(),
        !database_url.is_empty()
    );

    let pool = PgPoolOptions::new()
        .max_connections(runtime.database_max_connections)
        .connect(&database_url)
        .await
        .context("connect to DeGov indexer Postgres")?;
    apply_migrations(&pool).await?;

    loop {
        let contract_sets = runtime
            .configured_contract_sets(&config)
            .context("select Datalens indexer contract sets")?;

        for contract_set in contract_sets {
            let target_height =
                resolve_contract_set_target_height(&runtime, &contract_set.config).await?;
            let contract_runtime = match runtime
                .for_configured_contract_set_at_target(&contract_set, target_height)
            {
                Ok(contract_runtime) => contract_runtime,
                Err(error)
                    if runtime.should_skip_contract_set_start_after_resolved_target(
                        contract_set.contract.start_block,
                        target_height,
                    ) =>
                {
                    log::warn!(
                        "skipping Datalens indexer contract set because configured startBlock is above target dao_code={} chain_id={} contract_set_id={} start_block={} target_height={} error={}",
                        contract_set.dao_code,
                        contract_set.contract.chain_id,
                        contract_set.contract_set_id,
                        contract_set.contract.start_block,
                        target_height,
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
    contracts: DaoContractAddresses,
    pool: sqlx::PgPool,
) -> Result<IndexerRunnerReport> {
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

    task::spawn_blocking(move || -> Result<_> {
        let client = DatalensNativeClient::from_config_with_retry_config(
            &config,
            datalens_retry_config(runtime.query_max_attempts),
        )
        .context("create Datalens client")?;
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

async fn resolve_contract_set_target_height(
    runtime: &IndexerRuntimeConfig,
    config: &DatalensConfig,
) -> Result<i64> {
    match runtime.target_height {
        IndexerTargetHeight::Fixed(height) => Ok(height),
        IndexerTargetHeight::Latest => {
            let config = config.clone();
            let retry_config = datalens_retry_config(runtime.query_max_attempts);
            task::spawn_blocking(move || -> Result<_> {
                let mut client =
                    DatalensNativeClient::from_config_with_retry_config(&config, retry_config)
                        .context("create Datalens client")?;
                client
                    .durable_head_height(&config)
                    .context("resolve latest Datalens durable head height")
            })
            .await
            .context("join Datalens target height resolver task")?
        }
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use crate::{
        ChainFamily, ChainIdentityConfig, DatalensFinality, DatasetKeyConfig, QueryLimitConfig,
        SecretString,
    };

    use super::*;

    #[tokio::test]
    async fn test_resolve_contract_set_target_height_keeps_fixed_numeric_target_without_datalens() {
        let runtime = IndexerRuntimeConfig {
            dao_filter: Some("demo-dao".to_owned()),
            contract_set_mode: crate::IndexerContractSetMode::Single,
            target_height: IndexerTargetHeight::Fixed(568800),
            poll_interval: Duration::from_millis(10),
            run_once: true,
            max_chunks_per_run: None,
            database_max_connections: 1,
            checkpoint_stream_id: "datalens-native".to_owned(),
            data_source_version: "datalens-v1".to_owned(),
            query_max_attempts: 1,
            progress_refresh_lag_blocks: 100,
        };
        let config = DatalensConfig {
            endpoint: "http://127.0.0.1:1".to_owned(),
            application: "degov-test".to_owned(),
            bearer_token: SecretString::new("unit-test-redacted-value"),
            timeout: Duration::from_secs(1),
            finality: DatalensFinality::DurableOnly,
            chain: ChainIdentityConfig {
                family: ChainFamily::Evm,
                configured_name: "ethereum".to_owned(),
                network_id: Some(1),
            },
            dataset: DatasetKeyConfig {
                family: "evm".to_owned(),
                name: "logs".to_owned(),
            },
            query_limits: QueryLimitConfig {
                block_range_limit: 1_000,
            },
            dao_contracts: None,
            chains: Vec::new(),
        };

        let height = resolve_contract_set_target_height(&runtime, &config)
            .await
            .expect("fixed target height resolves without Datalens");

        assert_eq!(height, 568800);
    }
}
