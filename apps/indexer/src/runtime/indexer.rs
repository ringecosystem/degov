use std::{collections::BTreeMap, future::Future, sync::Arc};

use anyhow as runtime_anyhow;
use runtime_anyhow::{Context, Result, bail};
use sqlx::postgres::PgPoolOptions;
use tokio::{runtime::Handle, sync::Semaphore, task, time::sleep};

use crate::{
    DaoContractAddresses, DaoEventDecoder, DatalensConfig, DatalensDurableHeadReader,
    DatalensNativeClient, DatalensQueryConcurrencyGate, DatalensRuntimeContractSet,
    DatalensWarmupEnsureOutcome, EvmRpcChainTool, IndexerContractSetMode,
    IndexerContractSetRuntimeConfig, IndexerOnchainRefreshTick, IndexerRunner, IndexerRunnerReport,
    IndexerRuntimeConfig, IndexerTargetHeight, MultiChainToolOnchainRefreshReader,
    OnchainRefreshRuntimeConfig, OnchainRefreshTickReport, OnchainRefreshTickRunner,
    OnchainRefreshTickScheduler, OnchainRefreshWorker, OnchainRefreshWorkerError,
    PostgresIndexerRunnerStore, datalens_retry_config, ensure_datalens_warmup_task, required_env,
};

use super::{datalens::verify_datalens, migrate::apply_migrations};

pub async fn run_indexer() -> Result<()> {
    let config = DatalensConfig::from_env().context("load Datalens configuration")?;
    let database_url = required_env("DEGOV_INDEXER_DATABASE_URL")?;
    let runtime = IndexerRuntimeConfig::from_env()?;

    verify_datalens(&config).await?;
    log::info!(
        "Datalens indexer runtime boundary is ready contract_set_mode={} dao_filter={:?} dataset={} target_height={} contract_set_max_concurrency={} contract_set_per_chain_max_concurrency={} database_url_configured={}",
        runtime.contract_set_mode.as_str(),
        runtime.dao_filter,
        config.dataset.key(),
        runtime.target_height.as_log_value(),
        runtime.contract_set_max_concurrency.as_log_value(),
        runtime
            .contract_set_per_chain_max_concurrency
            .as_log_value(),
        !database_url.is_empty()
    );

    let pool = PgPoolOptions::new()
        .max_connections(runtime.database_max_connections)
        .connect(&database_url)
        .await
        .context("connect to DeGov indexer Postgres")?;
    apply_migrations(&pool).await?;
    ensure_warmup_on_startup(&runtime, &config).await?;
    let datalens_query_gate = if runtime.datalens_query_concurrency.is_limited() {
        Some(
            DatalensQueryConcurrencyGate::new(runtime.datalens_query_concurrency)
                .context("create Datalens query concurrency gate")?,
        )
    } else {
        None
    };

    loop {
        let contract_sets = runtime
            .configured_contract_sets(&config)
            .context("select Datalens indexer contract sets")?;

        match runtime.contract_set_mode {
            IndexerContractSetMode::Single => {
                for contract_set in contract_sets {
                    run_configured_contract_set_pass(
                        &runtime,
                        contract_set,
                        pool.clone(),
                        datalens_query_gate.clone(),
                    )
                    .await?;
                }
            }
            IndexerContractSetMode::All => {
                run_configured_contract_sets_pass(
                    runtime.clone(),
                    contract_sets,
                    pool.clone(),
                    datalens_query_gate.clone(),
                )
                .await?;
            }
        }

        if runtime.run_once {
            return Ok(());
        }

        sleep(runtime.poll_interval).await;
    }
}

async fn run_configured_contract_sets_pass(
    runtime: IndexerRuntimeConfig,
    contract_sets: Vec<DatalensRuntimeContractSet>,
    pool: sqlx::PgPool,
    datalens_query_gate: Option<DatalensQueryConcurrencyGate>,
) -> Result<()> {
    let jobs = contract_sets
        .into_iter()
        .map(|contract_set| ContractSetConcurrencyJob {
            chain_id: contract_set.contract.chain_id,
            contract_set,
        })
        .collect();
    let runtime = Arc::new(runtime);

    run_contract_set_jobs(
        jobs,
        runtime.contract_set_max_concurrency,
        runtime.contract_set_per_chain_max_concurrency,
        move |contract_set| {
            let runtime = runtime.clone();
            let pool = pool.clone();
            let datalens_query_gate = datalens_query_gate.clone();
            async move {
                run_configured_contract_set_pass(&runtime, contract_set, pool, datalens_query_gate)
                    .await
            }
        },
    )
    .await
}

async fn run_configured_contract_set_pass(
    runtime: &IndexerRuntimeConfig,
    contract_set: DatalensRuntimeContractSet,
    pool: sqlx::PgPool,
    datalens_query_gate: Option<DatalensQueryConcurrencyGate>,
) -> Result<()> {
    let target_height = resolve_contract_set_target_height(runtime, &contract_set.config).await?;
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
            return Ok(());
        }
        Err(error) => return Err(error),
    };
    let report = run_contract_set_pass(
        contract_runtime.clone(),
        contract_set.config.clone(),
        contract_set.addresses.clone(),
        pool,
        datalens_query_gate,
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

    Ok(())
}

struct ContractSetConcurrencyJob<T> {
    chain_id: i32,
    contract_set: T,
}

async fn run_contract_set_jobs<T, F, Fut>(
    jobs: Vec<ContractSetConcurrencyJob<T>>,
    global_limit: crate::ContractSetConcurrencyLimit,
    per_chain_limit: crate::ContractSetConcurrencyLimit,
    run: F,
) -> Result<()>
where
    T: Send + 'static,
    F: Fn(T) -> Fut + Clone + Send + Sync + 'static,
    Fut: Future<Output = Result<()>> + Send + 'static,
{
    let global = semaphore_for_limit(global_limit);
    let per_chain = per_chain_semaphores(&jobs, per_chain_limit);
    let mut handles = Vec::with_capacity(jobs.len());

    for job in jobs {
        let global = global.clone();
        let per_chain = per_chain
            .as_ref()
            .and_then(|semaphores| semaphores.get(&job.chain_id).cloned());
        let run = run.clone();
        handles.push(task::spawn(async move {
            let _global_permit = acquire_semaphore(global).await?;
            let _per_chain_permit = acquire_semaphore(per_chain).await?;
            run(job.contract_set).await
        }));
    }

    let mut errors = Vec::new();
    for handle in handles {
        match handle.await {
            Ok(Ok(())) => {}
            Ok(Err(error)) => errors.push(error),
            Err(error) => errors.push(error.into()),
        }
    }

    if let Some(first_error) = errors.into_iter().next() {
        bail!("Datalens indexer all-mode contract set pass failed: {first_error}");
    }

    Ok(())
}

fn semaphore_for_limit(limit: crate::ContractSetConcurrencyLimit) -> Option<Arc<Semaphore>> {
    match limit {
        crate::ContractSetConcurrencyLimit::Limited(limit) => Some(Arc::new(Semaphore::new(limit))),
        crate::ContractSetConcurrencyLimit::Unlimited => None,
    }
}

fn per_chain_semaphores<T>(
    jobs: &[ContractSetConcurrencyJob<T>],
    limit: crate::ContractSetConcurrencyLimit,
) -> Option<BTreeMap<i32, Arc<Semaphore>>> {
    let crate::ContractSetConcurrencyLimit::Limited(limit) = limit else {
        return None;
    };
    let mut semaphores = BTreeMap::new();
    for job in jobs {
        semaphores
            .entry(job.chain_id)
            .or_insert_with(|| Arc::new(Semaphore::new(limit)));
    }
    Some(semaphores)
}

async fn acquire_semaphore(
    semaphore: Option<Arc<Semaphore>>,
) -> Result<Option<tokio::sync::OwnedSemaphorePermit>> {
    match semaphore {
        Some(semaphore) => semaphore
            .acquire_owned()
            .await
            .map(Some)
            .context("acquire Datalens contract set concurrency permit"),
        None => Ok(None),
    }
}

async fn ensure_warmup_on_startup(
    runtime: &IndexerRuntimeConfig,
    config: &DatalensConfig,
) -> Result<()> {
    if !config.warmup.enabled || !config.warmup.ensure_on_startup {
        log::info!(
            "Datalens follow_query warmup startup ensure disabled enabled={} ensure_on_startup={}",
            config.warmup.enabled,
            config.warmup.ensure_on_startup
        );
        return Ok(());
    }

    let contract_sets = runtime
        .configured_contract_sets(config)
        .context("select Datalens warmup contract sets")?;
    let retry_config = datalens_retry_config(runtime.query_max_attempts);

    for contract_set in contract_sets {
        let config = contract_set.config.clone();
        let addresses = contract_set.addresses.clone();
        let dao_code = contract_set.dao_code.clone();
        let contract_set_id = contract_set.contract_set_id.clone();
        let chain_id = contract_set.contract.chain_id;
        let start_block = contract_set.contract.start_block;
        let warmup_required = config.warmup.required;
        let retry_config = retry_config.clone();
        let outcome = task::spawn_blocking(move || -> Result<_> {
            let mut client =
                DatalensNativeClient::from_config_with_retry_config(&config, retry_config)
                    .context("create Datalens client")?;
            ensure_datalens_warmup_task(&mut client, &config, &addresses, start_block)
                .context("ensure Datalens follow_query warmup task")
        })
        .await
        .context("join Datalens warmup ensure task")??;

        match outcome {
            DatalensWarmupEnsureOutcome::Disabled => {}
            DatalensWarmupEnsureOutcome::Failed { error } => {
                log::warn!(
                    "Datalens follow_query warmup startup ensure failed; continuing indexing dao_code={} chain_id={} contract_set_id={} required={} error={}",
                    dao_code,
                    chain_id,
                    contract_set_id,
                    warmup_required,
                    error
                );
            }
            DatalensWarmupEnsureOutcome::Submitted { task_id, created } => {
                log::info!(
                    "Datalens follow_query warmup task ensured dao_code={} chain_id={} contract_set_id={} task_id={} created={}",
                    dao_code,
                    chain_id,
                    contract_set_id,
                    task_id,
                    created
                );
            }
        }
    }

    Ok(())
}

async fn run_contract_set_pass(
    runtime: IndexerContractSetRuntimeConfig,
    config: DatalensConfig,
    contracts: DaoContractAddresses,
    pool: sqlx::PgPool,
    datalens_query_gate: Option<DatalensQueryConcurrencyGate>,
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

    let onchain_refresh_tick = build_onchain_refresh_tick(&runtime, pool.clone())?;

    task::spawn_blocking(move || -> Result<_> {
        let mut client = DatalensNativeClient::from_config_with_retry_config(
            &config,
            datalens_retry_config(runtime.query_max_attempts),
        )
        .context("create Datalens client")?;
        if let Some(gate) = datalens_query_gate {
            client = client.with_query_concurrency_gate(gate);
        }
        let store = PostgresIndexerRunnerStore::new(pool);
        let mut runner = IndexerRunner::new(
            runtime.options(&config, &contracts)?,
            runtime.contexts(&contracts),
            client,
            store,
            DaoEventDecoder,
        );
        if let Some(tick) = onchain_refresh_tick {
            runner = runner.with_onchain_refresh_tick(tick);
        }
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

fn build_onchain_refresh_tick(
    runtime: &IndexerContractSetRuntimeConfig,
    pool: sqlx::PgPool,
) -> Result<Option<Box<dyn IndexerOnchainRefreshTick>>> {
    if !runtime.onchain_refresh_tick.enabled {
        return Ok(None);
    }

    let refresh_runtime = OnchainRefreshRuntimeConfig::from_env_for_indexer_tick()
        .context("load onchain refresh tick runtime")?;
    let chain_tools = refresh_runtime
        .rpc_chains
        .iter()
        .map(|(chain_id, rpc)| {
            let chain_tool = EvmRpcChainTool::new(
                rpc.url.expose_secret().to_owned(),
                refresh_runtime.request_timeout,
            )
            .with_context(|| {
                format!("create onchain refresh tick RPC ChainTool for chain_id {chain_id}")
            })?;

            Ok((*chain_id, chain_tool))
        })
        .collect::<Result<BTreeMap<_, _>>>()?;
    let reader = MultiChainToolOnchainRefreshReader::new(
        chain_tools,
        refresh_runtime.read_plan_config(),
        refresh_runtime.current_power_method,
    );
    let mut worker_config = refresh_runtime.worker_config();
    worker_config.lock_owner = format!("degov-indexer-onchain-refresh-tick:{}", std::process::id());
    let worker = OnchainRefreshWorker::new(pool, worker_config, reader)
        .with_current_power_method(refresh_runtime.current_power_method);
    let runner = OnchainRefreshWorkerTickRunner {
        worker,
        handle: Handle::current(),
    };
    let tick = IndexerOnchainRefreshWorkerTick {
        scheduler: OnchainRefreshTickScheduler::from_config(runtime.onchain_refresh_tick.clone()),
        runner,
    };

    Ok(Some(Box::new(tick)))
}

struct IndexerOnchainRefreshWorkerTick<R> {
    scheduler: OnchainRefreshTickScheduler,
    runner: R,
}

impl<R> IndexerOnchainRefreshTick for IndexerOnchainRefreshWorkerTick<R>
where
    R: OnchainRefreshTickRunner + Send,
{
    fn run_after_chunk(
        &mut self,
        processed_block: i64,
    ) -> std::result::Result<OnchainRefreshTickReport, String> {
        self.scheduler
            .run_tick(processed_block, &mut self.runner)
            .map_err(|error| error.to_string())
    }
}

struct OnchainRefreshWorkerTickRunner<R> {
    worker: OnchainRefreshWorker<R>,
    handle: Handle,
}

impl<R> OnchainRefreshTickRunner for OnchainRefreshWorkerTickRunner<R>
where
    R: crate::OnchainRefreshReader,
{
    type Error = OnchainRefreshWorkerError;

    fn run_once(
        &mut self,
        max_tasks: usize,
    ) -> std::result::Result<crate::OnchainRefreshRunReport, Self::Error> {
        self.handle
            .block_on(self.worker.run_once_with_batch_size(max_tasks))
    }

    fn backlog(&mut self) -> Option<u64> {
        self.handle.block_on(self.worker.ready_backlog()).ok()
    }
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
    use std::{
        sync::{
            Arc,
            atomic::{AtomicUsize, Ordering},
        },
        time::Duration,
    };

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
            datalens_query_concurrency: Default::default(),
            contract_set_max_concurrency: crate::ContractSetConcurrencyLimit::Unlimited,
            contract_set_per_chain_max_concurrency: crate::ContractSetConcurrencyLimit::Unlimited,
            progress_refresh_lag_blocks: 100,
            adaptive_chunk_sizer: Default::default(),
            onchain_refresh_tick: Default::default(),
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
            warmup: Default::default(),
            dao_contracts: None,
            chains: Vec::new(),
        };

        let height = resolve_contract_set_target_height(&runtime, &config)
            .await
            .expect("fixed target height resolves without Datalens");

        assert_eq!(height, 568800);
    }

    #[tokio::test]
    async fn test_contract_set_jobs_global_concurrency_is_honored() {
        let observed = ObservedConcurrency::default();
        let jobs = vec![
            ContractSetConcurrencyJob {
                chain_id: 1,
                contract_set: observed.clone(),
            },
            ContractSetConcurrencyJob {
                chain_id: 2,
                contract_set: observed.clone(),
            },
            ContractSetConcurrencyJob {
                chain_id: 3,
                contract_set: observed.clone(),
            },
            ContractSetConcurrencyJob {
                chain_id: 4,
                contract_set: observed.clone(),
            },
        ];

        run_contract_set_jobs(
            jobs,
            crate::ContractSetConcurrencyLimit::Limited(2),
            crate::ContractSetConcurrencyLimit::Unlimited,
            observed_job,
        )
        .await
        .expect("jobs run");

        assert_eq!(observed.max_seen(), 2);
    }

    #[tokio::test]
    async fn test_contract_set_jobs_per_chain_concurrency_is_honored() {
        let observed = ObservedConcurrency::default();
        let jobs = (0..4)
            .map(|_| ContractSetConcurrencyJob {
                chain_id: 1,
                contract_set: observed.clone(),
            })
            .collect();

        run_contract_set_jobs(
            jobs,
            crate::ContractSetConcurrencyLimit::Unlimited,
            crate::ContractSetConcurrencyLimit::Limited(2),
            observed_job,
        )
        .await
        .expect("jobs run");

        assert_eq!(observed.max_seen(), 2);
    }

    #[tokio::test]
    async fn test_contract_set_jobs_unlimited_allows_all_jobs_to_run_together() {
        let observed = ObservedConcurrency::default();
        let jobs = (0..4)
            .map(|_| ContractSetConcurrencyJob {
                chain_id: 1,
                contract_set: observed.clone(),
            })
            .collect();

        run_contract_set_jobs(
            jobs,
            crate::ContractSetConcurrencyLimit::Unlimited,
            crate::ContractSetConcurrencyLimit::Unlimited,
            observed_job,
        )
        .await
        .expect("jobs run");

        assert_eq!(observed.max_seen(), 4);
    }

    #[derive(Clone, Default)]
    struct ObservedConcurrency {
        current: Arc<AtomicUsize>,
        max: Arc<AtomicUsize>,
    }

    impl ObservedConcurrency {
        fn max_seen(&self) -> usize {
            self.max.load(Ordering::SeqCst)
        }
    }

    async fn observed_job(observed: ObservedConcurrency) -> Result<()> {
        let current = observed.current.fetch_add(1, Ordering::SeqCst) + 1;
        observed.max.fetch_max(current, Ordering::SeqCst);
        tokio::time::sleep(Duration::from_millis(20)).await;
        observed.current.fetch_sub(1, Ordering::SeqCst);
        Ok(())
    }
}
