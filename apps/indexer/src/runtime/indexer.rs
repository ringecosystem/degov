use std::{collections::BTreeMap, future::Future, sync::Arc, time::Duration};

use anyhow as runtime_anyhow;
use runtime_anyhow::{Context, Result, bail};
use sqlx::postgres::PgPoolOptions;
use tokio::{runtime::Handle, sync::Semaphore, task, time::sleep};

use crate::{
    ChainTool, DaoContractAddresses, DaoEventDecoder, DatalensConfig, DatalensDurableHeadReader,
    DatalensError, DatalensNativeClient, DatalensQueryConcurrencyGate, DatalensQueryErrorClass,
    DatalensRuntimeContractSet, DatalensWarmupEnsureOutcome, EvmRpcChainTool,
    IndexerContractSetMode, IndexerContractSetRuntimeConfig, IndexerOnchainRefreshTick,
    IndexerRunner, IndexerRunnerReport, IndexerRuntimeConfig, IndexerTargetHeight,
    MultiChainToolOnchainRefreshReader, OnchainRefreshRuntimeConfig, OnchainRefreshTickReport,
    OnchainRefreshTickRunner, OnchainRefreshTickScheduler, OnchainRefreshWorker,
    OnchainRefreshWorkerError, PostgresIndexerRunnerStore, PostgresProvisionalCleanupStore,
    classify_datalens_query_error, datalens_retry_config, ensure_datalens_warmup_task,
    onchain_refresh_debounce_from_env, required_env,
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

    if runtime.run_once {
        run_contract_set_jobs(
            jobs,
            runtime.contract_set_max_concurrency,
            runtime.contract_set_per_chain_max_concurrency,
            move |contract_set| {
                let runtime = runtime.clone();
                let pool = pool.clone();
                let datalens_query_gate = datalens_query_gate.clone();
                async move {
                    run_configured_contract_set_pass(
                        &runtime,
                        contract_set,
                        pool,
                        datalens_query_gate,
                    )
                    .await
                }
            },
        )
        .await
    } else {
        run_recovering_contract_set_jobs(
            jobs,
            runtime.contract_set_max_concurrency,
            runtime.contract_set_per_chain_max_concurrency,
            move |contract_set, permit_scope| {
                let runtime = runtime.clone();
                let pool = pool.clone();
                let datalens_query_gate = datalens_query_gate.clone();
                async move {
                    run_recovering_configured_contract_set_pass(
                        runtime,
                        contract_set,
                        pool,
                        datalens_query_gate,
                        permit_scope,
                    )
                    .await
                }
            },
        )
        .await
    }
}

async fn run_configured_contract_set_pass(
    runtime: &IndexerRuntimeConfig,
    contract_set: DatalensRuntimeContractSet,
    pool: sqlx::PgPool,
    datalens_query_gate: Option<DatalensQueryConcurrencyGate>,
) -> Result<()> {
    match run_configured_contract_set_pass_result(
        runtime,
        contract_set.clone(),
        pool.clone(),
        datalens_query_gate,
    )
    .await
    {
        Ok(()) => Ok(()),
        Err(error) => handle_contract_set_pass_failure(runtime, &contract_set, error),
    }
}

async fn run_configured_contract_set_pass_result(
    runtime: &IndexerRuntimeConfig,
    contract_set: DatalensRuntimeContractSet,
    pool: sqlx::PgPool,
    datalens_query_gate: Option<DatalensQueryConcurrencyGate>,
) -> std::result::Result<(), ContractSetPassError> {
    let target_height = resolve_contract_set_target_height(runtime, &contract_set.config)
        .await
        .map_err(ContractSetPassError::setup)?;
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
        Err(error) => return Err(ContractSetPassError::setup(error)),
    };
    let report = match run_contract_set_pass(
        contract_runtime.clone(),
        contract_set.config.clone(),
        contract_set.addresses.clone(),
        pool.clone(),
        datalens_query_gate,
    )
    .await
    {
        Ok(report) => report,
        Err(error) => return Err(error.with_contract_runtime(contract_runtime.clone())),
    };
    cleanup_finalized_provisional_overlays(&contract_runtime, &contract_set, pool.clone())
        .await
        .map_err(ContractSetPassError::setup)?;

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

async fn run_recovering_configured_contract_set_pass(
    runtime: Arc<IndexerRuntimeConfig>,
    contract_set: DatalensRuntimeContractSet,
    pool: sqlx::PgPool,
    datalens_query_gate: Option<DatalensQueryConcurrencyGate>,
    permit_scope: ContractSetConcurrencyPermitScope,
) -> Result<()> {
    let log_context = format!(
        "dao_code={} chain_id={} contract_set_id={}",
        contract_set.dao_code, contract_set.contract.chain_id, contract_set.contract_set_id
    );

    run_recovering_contract_set_pass_loop(
        &log_context,
        runtime.poll_interval,
        move || {
            let runtime = runtime.clone();
            let contract_set = contract_set.clone();
            let pool = pool.clone();
            let datalens_query_gate = datalens_query_gate.clone();
            let permit_scope = permit_scope.clone();
            async move {
                let _permits = permit_scope
                    .acquire()
                    .await
                    .map_err(ContractSetPassError::setup)?;
                run_configured_contract_set_pass_result(
                    &runtime,
                    contract_set,
                    pool,
                    datalens_query_gate,
                )
                .await
            }
        },
        sleep,
    )
    .await
}

async fn cleanup_finalized_provisional_overlays(
    runtime: &IndexerContractSetRuntimeConfig,
    contract_set: &DatalensRuntimeContractSet,
    pool: sqlx::PgPool,
) -> Result<()> {
    let identity = crate::IndexerCheckpointIdentity {
        dao_code: runtime.dao_code.clone(),
        chain_id: contract_set.contract.chain_id,
        contract_set_id: runtime.checkpoint_contract_set_id.clone(),
        stream_id: runtime.checkpoint_stream_id.clone(),
        data_source_version: runtime.data_source_version.clone(),
    };
    let store = PostgresProvisionalCleanupStore::new(pool);
    let report = match store
        .cleanup_finalized_provisional_overlays(&identity, None)
        .await
    {
        Ok(report) => report,
        Err(error) => {
            log::warn!(
                "Datalens indexer provisional cleanup failed after final pass dao_code={} chain_id={} contract_set_id={} error={}",
                identity.dao_code,
                identity.chain_id,
                identity.contract_set_id,
                error
            );
            return Ok(());
        }
    };

    if report.segments_marked_finalized > 0
        || report.contributor_overlays_marked_finalized > 0
        || report.delegate_overlays_marked_finalized > 0
        || report.proposal_overlays_marked_finalized > 0
        || report.timelock_overlays_marked_finalized > 0
    {
        log::info!(
            "Datalens indexer provisional cleanup completed dao_code={} chain_id={} contract_set_id={} segments_marked_finalized={} contributor_overlays_marked_finalized={} delegate_overlays_marked_finalized={} proposal_overlays_marked_finalized={} timelock_overlays_marked_finalized={}",
            identity.dao_code,
            identity.chain_id,
            identity.contract_set_id,
            report.segments_marked_finalized,
            report.contributor_overlays_marked_finalized,
            report.delegate_overlays_marked_finalized,
            report.proposal_overlays_marked_finalized,
            report.timelock_overlays_marked_finalized
        );
    }

    Ok(())
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ContractSetPassFailureAction {
    Propagate,
    Continue,
}

const CONTRACT_SET_RETRY_INITIAL_BACKOFF: Duration = Duration::from_secs(1);
const CONTRACT_SET_RETRY_MAX_BACKOFF: Duration = Duration::from_secs(60);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct ContractSetRetryBackoff {
    next_delay: Duration,
}

impl Default for ContractSetRetryBackoff {
    fn default() -> Self {
        Self {
            next_delay: CONTRACT_SET_RETRY_INITIAL_BACKOFF,
        }
    }
}

impl ContractSetRetryBackoff {
    fn next_delay(&mut self) -> Duration {
        let delay = self.next_delay;
        self.next_delay = self
            .next_delay
            .checked_mul(2)
            .unwrap_or(CONTRACT_SET_RETRY_MAX_BACKOFF)
            .min(CONTRACT_SET_RETRY_MAX_BACKOFF);
        delay
    }

    fn reset(&mut self) {
        self.next_delay = CONTRACT_SET_RETRY_INITIAL_BACKOFF;
    }
}

async fn run_recovering_contract_set_pass_loop<Run, RunFuture, Sleep, SleepFuture>(
    log_context: &str,
    poll_interval: Duration,
    mut run_pass: Run,
    mut sleep_for: Sleep,
) -> Result<()>
where
    Run: FnMut() -> RunFuture,
    RunFuture: Future<Output = std::result::Result<(), ContractSetPassError>>,
    Sleep: FnMut(Duration) -> SleepFuture,
    SleepFuture: Future<Output = ()>,
{
    let mut backoff = ContractSetRetryBackoff::default();

    loop {
        match run_pass().await {
            Ok(()) => {
                backoff.reset();
                sleep_for(poll_interval).await;
            }
            Err(error) if contract_set_pass_error_is_retryable(&error) => {
                let delay = backoff.next_delay();
                let error = error.into_error();
                log::error!(
                    "Datalens indexer contract set pass failed; retrying long-running all-mode job after backoff {} retry_delay_ms={} error={}",
                    log_context,
                    delay.as_millis(),
                    error
                );
                sleep_for(delay).await;
            }
            Err(error) => return Err(error.into_error()),
        }
    }
}

fn contract_set_pass_failure_action(
    run_once: bool,
    error: &ContractSetPassError,
) -> ContractSetPassFailureAction {
    if run_once || !matches!(error, ContractSetPassError::Runner { .. }) {
        ContractSetPassFailureAction::Propagate
    } else {
        ContractSetPassFailureAction::Continue
    }
}

fn contract_set_pass_error_is_retryable(error: &ContractSetPassError) -> bool {
    matches!(error, ContractSetPassError::Runner { .. })
        || matches!(
            error,
            ContractSetPassError::Setup(error)
                if contains_recoverable_datalens_query_error(error)
        )
}

fn contains_recoverable_datalens_query_error(error: &runtime_anyhow::Error) -> bool {
    error
        .chain()
        .any(|cause| match cause.downcast_ref::<DatalensError>() {
            Some(DatalensError::Query(message)) => matches!(
                classify_datalens_query_error(message),
                DatalensQueryErrorClass::ProviderLimit | DatalensQueryErrorClass::Transient
            ),
            _ => false,
        })
}

#[derive(Debug)]
enum ContractSetPassError {
    Setup(runtime_anyhow::Error),
    Runner {
        error: runtime_anyhow::Error,
        contract_runtime: Option<IndexerContractSetRuntimeConfig>,
    },
}

impl ContractSetPassError {
    fn setup(error: runtime_anyhow::Error) -> Self {
        Self::Setup(error)
    }

    fn runner(error: runtime_anyhow::Error) -> Self {
        Self::Runner {
            error,
            contract_runtime: None,
        }
    }

    fn with_contract_runtime(self, contract_runtime: IndexerContractSetRuntimeConfig) -> Self {
        match self {
            Self::Runner { error, .. } => Self::Runner {
                error,
                contract_runtime: Some(contract_runtime),
            },
            error => error,
        }
    }

    fn contract_runtime(&self) -> Option<&IndexerContractSetRuntimeConfig> {
        match self {
            Self::Setup(_) => None,
            Self::Runner {
                contract_runtime, ..
            } => contract_runtime.as_ref(),
        }
    }

    fn into_error(self) -> runtime_anyhow::Error {
        match self {
            Self::Setup(error) | Self::Runner { error, .. } => error,
        }
    }
}

fn handle_contract_set_pass_failure(
    runtime: &IndexerRuntimeConfig,
    contract_set: &DatalensRuntimeContractSet,
    error: ContractSetPassError,
) -> Result<()> {
    match contract_set_pass_failure_action(runtime.run_once, &error) {
        ContractSetPassFailureAction::Propagate => Err(error.into_error()),
        ContractSetPassFailureAction::Continue => {
            let checkpoint_contract_set_id = error
                .contract_runtime()
                .map(|runtime| runtime.checkpoint_contract_set_id.as_str())
                .unwrap_or(contract_set.contract_set_id.as_str())
                .to_owned();
            log::error!(
                "Datalens indexer contract set pass failed; continuing long-running indexer dao_code={} chain_id={} contract_set_id={} error={}",
                contract_set.dao_code,
                contract_set.contract.chain_id,
                checkpoint_contract_set_id,
                error.into_error()
            );
            Ok(())
        }
    }
}

struct ContractSetConcurrencyJob<T> {
    chain_id: i32,
    contract_set: T,
}

struct ContractSetScopedJob<T> {
    contract_set: T,
    permit_scope: ContractSetConcurrencyPermitScope,
}

#[derive(Clone)]
struct ContractSetConcurrencyPermitScope {
    global: Option<Arc<Semaphore>>,
    per_chain: Option<Arc<Semaphore>>,
}

struct ContractSetConcurrencyPermits {
    _global: Option<tokio::sync::OwnedSemaphorePermit>,
    _per_chain: Option<tokio::sync::OwnedSemaphorePermit>,
}

impl ContractSetConcurrencyPermitScope {
    async fn acquire(&self) -> Result<ContractSetConcurrencyPermits> {
        Ok(ContractSetConcurrencyPermits {
            _per_chain: acquire_semaphore(self.per_chain.clone()).await?,
            _global: acquire_semaphore(self.global.clone()).await?,
        })
    }
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
    let jobs = scoped_contract_set_jobs(jobs, global_limit, per_chain_limit);
    let mut handles = task::JoinSet::new();

    for job in jobs {
        let run = run.clone();
        handles.spawn(async move {
            let _permits = job.permit_scope.acquire().await?;
            run(job.contract_set).await
        });
    }

    while let Some(result) = handles.join_next().await {
        match result {
            Ok(Ok(())) => {}
            Ok(Err(error)) => {
                handles.abort_all();
                bail!("Datalens indexer all-mode contract set pass failed: {error}");
            }
            Err(error) => {
                handles.abort_all();
                let error: runtime_anyhow::Error = error.into();
                bail!("Datalens indexer all-mode contract set pass failed: {error}");
            }
        }
    }

    Ok(())
}

async fn run_recovering_contract_set_jobs<T, F, Fut>(
    jobs: Vec<ContractSetConcurrencyJob<T>>,
    global_limit: crate::ContractSetConcurrencyLimit,
    per_chain_limit: crate::ContractSetConcurrencyLimit,
    run: F,
) -> Result<()>
where
    T: Send + 'static,
    F: Fn(T, ContractSetConcurrencyPermitScope) -> Fut + Clone + Send + Sync + 'static,
    Fut: Future<Output = Result<()>> + Send + 'static,
{
    let jobs = scoped_contract_set_jobs(jobs, global_limit, per_chain_limit);
    let mut handles = task::JoinSet::new();

    for job in jobs {
        let run = run.clone();
        handles.spawn(async move { run(job.contract_set, job.permit_scope).await });
    }

    while let Some(result) = handles.join_next().await {
        match result {
            Ok(Ok(())) => {}
            Ok(Err(error)) => {
                handles.abort_all();
                bail!("Datalens indexer all-mode contract set pass failed: {error}");
            }
            Err(error) => {
                handles.abort_all();
                let error: runtime_anyhow::Error = error.into();
                bail!("Datalens indexer all-mode contract set pass failed: {error}");
            }
        }
    }

    Ok(())
}

fn scoped_contract_set_jobs<T>(
    jobs: Vec<ContractSetConcurrencyJob<T>>,
    global_limit: crate::ContractSetConcurrencyLimit,
    per_chain_limit: crate::ContractSetConcurrencyLimit,
) -> Vec<ContractSetScopedJob<T>> {
    let global = semaphore_for_limit(global_limit);
    let per_chain = per_chain_semaphores(&jobs, per_chain_limit);

    jobs.into_iter()
        .map(|job| {
            let per_chain = per_chain
                .as_ref()
                .and_then(|semaphores| semaphores.get(&job.chain_id).cloned());
            ContractSetScopedJob {
                contract_set: job.contract_set,
                permit_scope: ContractSetConcurrencyPermitScope {
                    global: global.clone(),
                    per_chain,
                },
            }
        })
        .collect()
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
) -> std::result::Result<IndexerRunnerReport, ContractSetPassError> {
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

    let onchain_refresh_tick =
        build_onchain_refresh_tick(&runtime, pool.clone()).map_err(ContractSetPassError::setup)?;
    let projection_chain_tool =
        build_projection_chain_tool(&runtime, &config).map_err(ContractSetPassError::setup)?;
    let onchain_refresh_debounce =
        onchain_refresh_debounce_from_env().map_err(ContractSetPassError::setup)?;

    task::spawn_blocking(move || -> std::result::Result<_, ContractSetPassError> {
        let mut client = DatalensNativeClient::from_config_with_retry_config(
            &config,
            datalens_retry_config(runtime.query_max_attempts),
        )
        .context("create Datalens client")
        .map_err(ContractSetPassError::setup)?;
        if let Some(gate) = datalens_query_gate {
            client = client.with_query_concurrency_gate(gate);
        }
        let store = PostgresIndexerRunnerStore::new(pool)
            .with_onchain_refresh_debounce(onchain_refresh_debounce)
            .with_onchain_refresh_deferred_drain_batch_size(
                runtime.onchain_refresh_deferred_drain_batch_size,
            );
        let options = runtime
            .options(&config, &contracts)
            .map_err(ContractSetPassError::setup)?;
        let mut runner = IndexerRunner::new(
            options,
            runtime.contexts(&contracts),
            client,
            store,
            DaoEventDecoder,
        );
        if let Some(tick) = onchain_refresh_tick {
            runner = runner.with_onchain_refresh_tick(tick);
        }
        if let Some(chain_tool) = projection_chain_tool {
            runner = runner.with_chain_tool(chain_tool);
        }
        if let Some(chunks) = runtime.max_chunks_per_run {
            runner.request_shutdown_after_chunks(chunks);
        }

        runner
            .run_to_target(runtime.target_height)
            .context("run Datalens indexer to target height")
            .map_err(ContractSetPassError::runner)
    })
    .await
    .map_err(|error| {
        ContractSetPassError::setup(
            runtime_anyhow::Error::new(error).context("join Datalens indexer runner task"),
        )
    })?
}

fn build_projection_chain_tool(
    runtime: &IndexerContractSetRuntimeConfig,
    config: &DatalensConfig,
) -> Result<Option<Box<dyn ChainTool + Send + Sync>>> {
    let Some(chain_id) = config.chain.network_id else {
        return Ok(None);
    };
    let refresh_runtime = OnchainRefreshRuntimeConfig::from_env_for_indexer_tick()
        .context("load projection chain read runtime")?;
    let Some(rpc) = refresh_runtime.rpc_chains.get(&chain_id) else {
        bail!(
            "missing projection chain read RPC config for dao_code={} chain_id={}",
            runtime.dao_code,
            chain_id
        );
    };
    let chain_tool = EvmRpcChainTool::new(
        rpc.url.expose_secret().to_owned(),
        refresh_runtime.request_timeout,
    )
    .with_context(|| {
        format!(
            "create projection RPC ChainTool for dao_code={} chain_id={chain_id}",
            runtime.dao_code
        )
    })?;

    Ok(Some(Box::new(chain_tool)))
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
            Arc, Mutex,
            atomic::{AtomicUsize, Ordering},
        },
        time::Duration,
    };

    use crate::{
        ChainFamily, ChainIdentityConfig, DatalensFinality, DatalensProvisionalFinality,
        DatasetKeyConfig, ProvisionalRuntimeConfig, QueryLimitConfig, SecretString,
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
            onchain_refresh_deferred_drain_batch_size: 100,
            provisional: ProvisionalRuntimeConfig {
                enabled: false,
                finality: DatalensProvisionalFinality::SafeToLatest,
            },
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

    #[tokio::test]
    async fn test_contract_set_permit_scope_does_not_hold_global_while_waiting_for_per_chain() {
        let global = Arc::new(Semaphore::new(2));
        let chain_one = Arc::new(Semaphore::new(1));
        let chain_two = Arc::new(Semaphore::new(1));
        let chain_one_scope = ContractSetConcurrencyPermitScope {
            global: Some(global.clone()),
            per_chain: Some(chain_one),
        };
        let chain_two_scope = ContractSetConcurrencyPermitScope {
            global: Some(global.clone()),
            per_chain: Some(chain_two),
        };
        let _active_chain_one_pass = chain_one_scope
            .acquire()
            .await
            .expect("first chain one pass acquires permits");
        let waiting_chain_one_scope = chain_one_scope.clone();
        let waiting_chain_one =
            tokio::spawn(async move { waiting_chain_one_scope.acquire().await });

        tokio::time::sleep(Duration::from_millis(10)).await;

        let chain_two_permits =
            tokio::time::timeout(Duration::from_millis(20), chain_two_scope.acquire())
                .await
                .expect("chain two can acquire global while chain one waits for per-chain")
                .expect("chain two permits");

        drop(chain_two_permits);
        waiting_chain_one.abort();
    }

    #[tokio::test]
    async fn test_contract_set_jobs_returns_error_without_waiting_for_long_running_peer() {
        #[derive(Clone, Copy)]
        enum ScriptedJob {
            LongRunning,
            Fails,
        }

        let jobs = vec![
            ContractSetConcurrencyJob {
                chain_id: 1,
                contract_set: ScriptedJob::LongRunning,
            },
            ContractSetConcurrencyJob {
                chain_id: 2,
                contract_set: ScriptedJob::Fails,
            },
        ];

        let result = tokio::time::timeout(
            Duration::from_millis(100),
            run_contract_set_jobs(
                jobs,
                crate::ContractSetConcurrencyLimit::Unlimited,
                crate::ContractSetConcurrencyLimit::Unlimited,
                |job| async move {
                    match job {
                        ScriptedJob::LongRunning => {
                            tokio::time::sleep(Duration::from_secs(60)).await;
                            Ok(())
                        }
                        ScriptedJob::Fails => Err(runtime_anyhow::anyhow!("setup failed")),
                    }
                },
            ),
        )
        .await
        .expect("job error returns before long-running peer finishes")
        .expect_err("job failure propagates");

        assert!(result.to_string().contains("setup failed"));
    }

    #[tokio::test]
    async fn test_contract_set_jobs_retries_recoverable_all_mode_error_without_aborting_peers() {
        #[derive(Clone, Copy)]
        enum ScriptedJob {
            Recovering,
            Peer,
        }

        let attempts = Arc::new(AtomicUsize::new(0));
        let peer_started = Arc::new(AtomicUsize::new(0));
        let jobs = vec![
            ContractSetConcurrencyJob {
                chain_id: 1,
                contract_set: ScriptedJob::Recovering,
            },
            ContractSetConcurrencyJob {
                chain_id: 2,
                contract_set: ScriptedJob::Peer,
            },
        ];
        let job_attempts = attempts.clone();
        let job_peer_started = peer_started.clone();

        let result = tokio::time::timeout(
            Duration::from_millis(100),
            run_contract_set_jobs(
                jobs,
                crate::ContractSetConcurrencyLimit::Unlimited,
                crate::ContractSetConcurrencyLimit::Unlimited,
                move |job| {
                    let attempts = job_attempts.clone();
                    let peer_started = job_peer_started.clone();
                    async move {
                        match job {
                            ScriptedJob::Recovering => {
                                run_recovering_contract_set_pass_loop(
                                    "dao_code=demo-dao chain_id=1 contract_set_id=demo-scope",
                                    Duration::from_secs(60),
                                    move || {
                                        let attempt = attempts.fetch_add(1, Ordering::SeqCst);
                                        async move {
                                            if attempt == 0 {
                                                let error = runtime_anyhow::anyhow!(
                                                    crate::DatalensError::Query(
                                                        "503 no available server".to_owned()
                                                    )
                                                )
                                                .context(
                                                    "resolve latest Datalens durable head height",
                                                );
                                                return Err(ContractSetPassError::setup(error));
                                            }
                                            std::future::pending().await
                                        }
                                    },
                                    |_| async {},
                                )
                                .await
                            }
                            ScriptedJob::Peer => {
                                peer_started.fetch_add(1, Ordering::SeqCst);
                                std::future::pending().await
                            }
                        }
                    }
                },
            ),
        )
        .await;

        assert!(result.is_err());
        assert_eq!(attempts.load(Ordering::SeqCst), 2);
        assert_eq!(peer_started.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn test_recovering_contract_set_jobs_release_global_permit_between_passes() {
        let started = Arc::new(AtomicUsize::new(0));
        let jobs = (0..5)
            .map(|job_id| ContractSetConcurrencyJob {
                chain_id: job_id,
                contract_set: job_id,
            })
            .collect();

        let result = tokio::time::timeout(
            Duration::from_millis(200),
            run_recovering_contract_set_jobs(
                jobs,
                crate::ContractSetConcurrencyLimit::Limited(4),
                crate::ContractSetConcurrencyLimit::Unlimited,
                {
                    let started = started.clone();
                    move |job_id, permit_scope| {
                        let started = started.clone();
                        async move {
                            run_recovering_contract_set_pass_loop(
                                &format!(
                                    "dao_code=demo-dao-{job_id} chain_id={job_id} contract_set_id=demo-scope"
                                ),
                                Duration::from_secs(60),
                                move || {
                                    let permit_scope = permit_scope.clone();
                                    let started = started.clone();
                                    async move {
                                        let _permits = permit_scope
                                            .acquire()
                                            .await
                                            .map_err(ContractSetPassError::setup)?;
                                        started.fetch_add(1, Ordering::SeqCst);
                                        tokio::time::sleep(Duration::from_millis(10)).await;
                                        Ok(())
                                    }
                                },
                                |_| async {
                                    std::future::pending::<()>().await;
                                },
                            )
                            .await
                        }
                    }
                },
            ),
        )
        .await;

        assert!(result.is_err());
        assert_eq!(started.load(Ordering::SeqCst), 5);
    }

    #[tokio::test]
    async fn test_recovering_contract_set_jobs_do_not_hold_permit_while_caught_up_job_sleeps() {
        #[derive(Clone, Copy)]
        enum ScriptedJob {
            CaughtUp,
            Pending,
        }

        let pending_started = Arc::new(AtomicUsize::new(0));
        let caught_up_passed = Arc::new(tokio::sync::Notify::new());
        let jobs = vec![
            ContractSetConcurrencyJob {
                chain_id: 1,
                contract_set: ScriptedJob::CaughtUp,
            },
            ContractSetConcurrencyJob {
                chain_id: 2,
                contract_set: ScriptedJob::Pending,
            },
        ];

        let result = tokio::time::timeout(
            Duration::from_millis(100),
            run_recovering_contract_set_jobs(
                jobs,
                crate::ContractSetConcurrencyLimit::Limited(1),
                crate::ContractSetConcurrencyLimit::Unlimited,
                {
                    let pending_started = pending_started.clone();
                    let caught_up_passed = caught_up_passed.clone();
                    move |job, permit_scope| {
                        let pending_started = pending_started.clone();
                        let caught_up_passed = caught_up_passed.clone();
                        async move {
                            run_recovering_contract_set_pass_loop(
                                "dao_code=demo-dao chain_id=1 contract_set_id=demo-scope",
                                Duration::from_secs(60),
                                move || {
                                    let permit_scope = permit_scope.clone();
                                    let pending_started = pending_started.clone();
                                    let caught_up_passed = caught_up_passed.clone();
                                    async move {
                                        if matches!(job, ScriptedJob::Pending) {
                                            caught_up_passed.notified().await;
                                        }
                                        let _permits = permit_scope
                                            .acquire()
                                            .await
                                            .map_err(ContractSetPassError::setup)?;
                                        match job {
                                            ScriptedJob::CaughtUp => {
                                                caught_up_passed.notify_one();
                                            }
                                            ScriptedJob::Pending => {
                                                pending_started.fetch_add(1, Ordering::SeqCst);
                                            }
                                        }
                                        Ok(())
                                    }
                                },
                                |_| async {
                                    std::future::pending::<()>().await;
                                },
                            )
                            .await
                        }
                    }
                },
            ),
        )
        .await;

        assert!(result.is_err());
        assert_eq!(pending_started.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn test_recovering_contract_set_jobs_do_not_hold_permit_during_retry_backoff() {
        #[derive(Clone, Copy)]
        enum ScriptedJob {
            Retrying,
            Pending,
        }

        let pending_started = Arc::new(AtomicUsize::new(0));
        let retry_attempts = Arc::new(AtomicUsize::new(0));
        let retry_failed = Arc::new(tokio::sync::Notify::new());
        let jobs = vec![
            ContractSetConcurrencyJob {
                chain_id: 1,
                contract_set: ScriptedJob::Retrying,
            },
            ContractSetConcurrencyJob {
                chain_id: 2,
                contract_set: ScriptedJob::Pending,
            },
        ];

        let result = tokio::time::timeout(
            Duration::from_millis(100),
            run_recovering_contract_set_jobs(
                jobs,
                crate::ContractSetConcurrencyLimit::Limited(1),
                crate::ContractSetConcurrencyLimit::Unlimited,
                {
                    let pending_started = pending_started.clone();
                    let retry_attempts = retry_attempts.clone();
                    let retry_failed = retry_failed.clone();
                    move |job, permit_scope| {
                        let pending_started = pending_started.clone();
                        let retry_attempts = retry_attempts.clone();
                        let retry_failed = retry_failed.clone();
                        async move {
                            run_recovering_contract_set_pass_loop(
                                "dao_code=demo-dao chain_id=1 contract_set_id=demo-scope",
                                Duration::from_secs(60),
                                move || {
                                    let permit_scope = permit_scope.clone();
                                    let pending_started = pending_started.clone();
                                    let retry_attempts = retry_attempts.clone();
                                    let retry_failed = retry_failed.clone();
                                    async move {
                                        if matches!(job, ScriptedJob::Pending) {
                                            retry_failed.notified().await;
                                        }
                                        let _permits = permit_scope
                                            .acquire()
                                            .await
                                            .map_err(ContractSetPassError::setup)?;
                                        match job {
                                            ScriptedJob::Retrying => {
                                                retry_attempts.fetch_add(1, Ordering::SeqCst);
                                                retry_failed.notify_one();
                                                Err(ContractSetPassError::runner(
                                                    runtime_anyhow::anyhow!("query failed"),
                                                ))
                                            }
                                            ScriptedJob::Pending => {
                                                pending_started.fetch_add(1, Ordering::SeqCst);
                                                Ok(())
                                            }
                                        }
                                    }
                                },
                                |_| async {
                                    std::future::pending::<()>().await;
                                },
                            )
                            .await
                        }
                    }
                },
            ),
        )
        .await;

        assert!(result.is_err());
        assert_eq!(retry_attempts.load(Ordering::SeqCst), 1);
        assert_eq!(pending_started.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn test_recovering_contract_set_jobs_do_not_hold_permit_after_datalens_timeout() {
        #[derive(Clone, Copy)]
        enum ScriptedJob {
            Timeout,
            Pending,
        }

        let timeout_attempts = Arc::new(AtomicUsize::new(0));
        let pending_started = Arc::new(AtomicUsize::new(0));
        let timeout_failed = Arc::new(tokio::sync::Notify::new());
        let jobs = vec![
            ContractSetConcurrencyJob {
                chain_id: 1,
                contract_set: ScriptedJob::Timeout,
            },
            ContractSetConcurrencyJob {
                chain_id: 2,
                contract_set: ScriptedJob::Pending,
            },
        ];

        let result = tokio::time::timeout(
            Duration::from_millis(100),
            run_recovering_contract_set_jobs(
                jobs,
                crate::ContractSetConcurrencyLimit::Limited(1),
                crate::ContractSetConcurrencyLimit::Unlimited,
                {
                    let timeout_attempts = timeout_attempts.clone();
                    let pending_started = pending_started.clone();
                    let timeout_failed = timeout_failed.clone();
                    move |job, permit_scope| {
                        let timeout_attempts = timeout_attempts.clone();
                        let pending_started = pending_started.clone();
                        let timeout_failed = timeout_failed.clone();
                        async move {
                            run_recovering_contract_set_pass_loop(
                                "dao_code=ens-dao chain_id=1 contract_set_id=ens",
                                Duration::from_secs(60),
                                move || {
                                    let permit_scope = permit_scope.clone();
                                    let timeout_attempts = timeout_attempts.clone();
                                    let pending_started = pending_started.clone();
                                    let timeout_failed = timeout_failed.clone();
                                    async move {
                                        if matches!(job, ScriptedJob::Pending) {
                                            timeout_failed.notified().await;
                                        }
                                        let _permits = permit_scope
                                            .acquire()
                                            .await
                                            .map_err(ContractSetPassError::setup)?;
                                        match job {
                                            ScriptedJob::Timeout => {
                                                timeout_attempts.fetch_add(1, Ordering::SeqCst);
                                                timeout_failed.notify_one();
                                                Err(ContractSetPassError::runner(
                                                    runtime_anyhow::anyhow!(
                                                        crate::DatalensError::Query(
                                                            "Datalens query timed out after 60s"
                                                                .to_owned()
                                                        )
                                                    ),
                                                ))
                                            }
                                            ScriptedJob::Pending => {
                                                pending_started.fetch_add(1, Ordering::SeqCst);
                                                Ok(())
                                            }
                                        }
                                    }
                                },
                                |_| async {
                                    std::future::pending::<()>().await;
                                },
                            )
                            .await
                        }
                    }
                },
            ),
        )
        .await;

        assert!(result.is_err());
        assert_eq!(timeout_attempts.load(Ordering::SeqCst), 1);
        assert_eq!(pending_started.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn test_recovering_contract_set_jobs_unlimited_runs_every_job_without_permit_wait() {
        let started = Arc::new(AtomicUsize::new(0));
        let jobs = (0..5)
            .map(|job_id| ContractSetConcurrencyJob {
                chain_id: 1,
                contract_set: job_id,
            })
            .collect();

        let result = tokio::time::timeout(
            Duration::from_millis(100),
            run_recovering_contract_set_jobs(
                jobs,
                crate::ContractSetConcurrencyLimit::Unlimited,
                crate::ContractSetConcurrencyLimit::Unlimited,
                {
                    let started = started.clone();
                    move |job_id, permit_scope| {
                        let started = started.clone();
                        async move {
                            run_recovering_contract_set_pass_loop(
                                &format!(
                                    "dao_code=demo-dao-{job_id} chain_id=1 contract_set_id=demo-scope"
                                ),
                                Duration::from_secs(60),
                                move || {
                                    let permit_scope = permit_scope.clone();
                                    let started = started.clone();
                                    async move {
                                        let _permits = permit_scope
                                            .acquire()
                                            .await
                                            .map_err(ContractSetPassError::setup)?;
                                        started.fetch_add(1, Ordering::SeqCst);
                                        Ok(())
                                    }
                                },
                                |_| async {
                                    std::future::pending::<()>().await;
                                },
                            )
                            .await
                        }
                    }
                },
            ),
        )
        .await;

        assert!(result.is_err());
        assert_eq!(started.load(Ordering::SeqCst), 5);
    }

    #[test]
    fn test_contract_set_pass_failure_action_keeps_long_running_indexer_alive() {
        let error = ContractSetPassError::runner(runtime_anyhow::anyhow!("query failed"));

        assert_eq!(
            contract_set_pass_failure_action(false, &error),
            ContractSetPassFailureAction::Continue
        );
    }

    #[test]
    fn test_contract_set_pass_failure_action_keeps_run_once_fail_fast() {
        let error = ContractSetPassError::runner(runtime_anyhow::anyhow!("query failed"));

        assert_eq!(
            contract_set_pass_failure_action(true, &error),
            ContractSetPassFailureAction::Propagate
        );
    }

    #[test]
    fn test_contract_set_pass_failure_action_propagates_setup_failure_in_long_running_mode() {
        let error = ContractSetPassError::setup(runtime_anyhow::anyhow!("load tick runtime"));

        assert_eq!(
            contract_set_pass_failure_action(false, &error),
            ContractSetPassFailureAction::Propagate
        );
    }

    #[tokio::test]
    async fn test_recovering_contract_set_pass_loop_retries_runner_error_and_polls_after_success() {
        let attempts = Arc::new(AtomicUsize::new(0));
        let sleeps = Arc::new(Mutex::new(Vec::new()));
        let run_attempts = attempts.clone();
        let recorded_sleeps = sleeps.clone();

        let result = run_recovering_contract_set_pass_loop(
            "dao_code=demo-dao chain_id=1 contract_set_id=demo-scope",
            Duration::from_millis(10),
            move || {
                let attempt = run_attempts.fetch_add(1, Ordering::SeqCst);
                async move {
                    match attempt {
                        0 | 2 => Err(ContractSetPassError::runner(runtime_anyhow::anyhow!(
                            "query failed"
                        ))),
                        1 => Ok(()),
                        _ => Err(ContractSetPassError::setup(runtime_anyhow::anyhow!(
                            "stop loop"
                        ))),
                    }
                }
            },
            move |duration| {
                let sleeps = recorded_sleeps.clone();
                async move {
                    sleeps.lock().expect("sleep records").push(duration);
                }
            },
        )
        .await
        .expect_err("setup failure stops loop");

        assert!(result.to_string().contains("stop loop"));
        assert_eq!(attempts.load(Ordering::SeqCst), 4);
        assert_eq!(
            sleeps.lock().expect("sleep records").as_slice(),
            &[
                CONTRACT_SET_RETRY_INITIAL_BACKOFF,
                Duration::from_millis(10),
                CONTRACT_SET_RETRY_INITIAL_BACKOFF
            ]
        );
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
