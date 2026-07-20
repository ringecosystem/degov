use std::{collections::BTreeMap, future::Future, sync::Arc, time::Duration};

use anyhow as runtime_anyhow;
use datalens_sdk::RetryConfig;
use runtime_anyhow::{Context, Result, bail};
use sqlx::postgres::PgPoolOptions;
#[cfg(test)]
use tokio::time::timeout;
use tokio::{runtime::Handle, sync::Semaphore, task, time::sleep};

use crate::runner::IndexerRunnerProgress;
use crate::{
    ChainTool, DaoContractAddresses, DaoEventDecoder, DatalensConfig, DatalensDurableHeadReader,
    DatalensError, DatalensNativeClient, DatalensProvisionalLogQueryReader,
    DatalensQueryConcurrencyGate, DatalensQueryErrorClass, DatalensRuntimeContractSet,
    DatalensWarmupEnsureOutcome, EvmRpcChainTool, IndexerContractSetMode,
    IndexerContractSetRuntimeConfig, IndexerOnchainRefreshTick, IndexerRunner, IndexerRunnerReport,
    IndexerRunnerStore, IndexerRuntimeConfig, IndexerTargetHeight, MetricsRuntimeConfig,
    MultiChainToolOnchainRefreshReader, OnchainRefreshRuntimeConfig, OnchainRefreshTaskScope,
    OnchainRefreshTickReport, OnchainRefreshTickRunner, OnchainRefreshTickScheduler,
    OnchainRefreshWorker, OnchainRefreshWorkerError, PostgresIndexerRunnerStore,
    PostgresProvisionalCleanupStore, PostgresProvisionalSegmentStore,
    ProvisionalProposalOverlayStore, ProvisionalVoteOverlayStore, ProvisionalWorker,
    ProvisionalWorkerOptions,
    checkpoint::configured_range_progress,
    classify_datalens_query_error, datalens_query_error_is_current_head_race,
    datalens_retry_config, ensure_datalens_warmup_task,
    metrics::IndexerLatestHeadRecord,
    onchain_refresh_debounce_from_env,
    provisional::{DatalensProvisionalSegmentStore, ProvisionalWorkerError},
    required_env,
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
    let _metrics_server = crate::metrics::spawn_metrics_server(
        pool.clone(),
        MetricsRuntimeConfig::from_env().context("load metrics runtime configuration")?,
    )
    .await
    .context("start DeGov indexer metrics service")?;
    ensure_warmup_on_startup(&runtime, &config).await?;
    let datalens_query_gate = if runtime.datalens_query_concurrency.is_limited() {
        Some(
            DatalensQueryConcurrencyGate::new(runtime.datalens_query_concurrency)
                .context("create Datalens query concurrency gate")?,
        )
    } else {
        None
    };

    spawn_realtime_worker_if_enabled(&runtime, &config, pool.clone())?;

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

fn spawn_realtime_worker_if_enabled(
    runtime: &IndexerRuntimeConfig,
    config: &DatalensConfig,
    pool: sqlx::PgPool,
) -> Result<()> {
    if !realtime_worker_is_eligible(
        runtime.run_once,
        runtime.realtime.enabled,
        runtime.provisional.enabled,
        &runtime.realtime.dao_codes,
    ) {
        log::info!(
            "Datalens realtime worker is inert run_once={} enabled={} provisional_enabled={}",
            runtime.run_once,
            runtime.realtime.enabled,
            runtime.provisional.enabled
        );
        return Ok(());
    }
    let Some(realtime_datalens_config) = realtime_datalens_config(&runtime.realtime, config) else {
        log::warn!(
            "Datalens realtime worker is inert because DEGOV_REALTIME_DATALENS_APPLICATION must differ from DATALENS_APPLICATION and DEGOV_REALTIME_DATALENS_TOKEN is required"
        );
        return Ok(());
    };

    let contract_sets = runtime
        .configured_contract_sets(config)
        .context("select configured realtime contract sets")?;
    let configured_dao_codes = contract_sets
        .iter()
        .map(|contract_set| contract_set.dao_code.clone())
        .collect::<Vec<_>>();
    if !realtime_worker_has_configured_dao_match(&configured_dao_codes, &runtime.realtime.dao_codes)
    {
        log::warn!(
            "Datalens realtime worker is inert because no configured DAO matches DEGOV_REALTIME_DAO_CODES dao_codes={:?}",
            runtime.realtime.dao_codes
        );
        return Ok(());
    }
    let contract_sets = contract_sets
        .into_iter()
        .filter(|contract_set| {
            is_realtime_dao_allowlisted(&contract_set.dao_code, &runtime.realtime.dao_codes)
        })
        .collect::<Vec<_>>();
    if contract_sets.is_empty() {
        log::warn!(
            "Datalens realtime worker is inert because no configured DAO matches DEGOV_REALTIME_DAO_CODES dao_codes={:?}",
            runtime.realtime.dao_codes
        );
        return Ok(());
    }

    let runtime = runtime.clone();
    task::spawn(async move {
        run_realtime_worker_loop(runtime, contract_sets, pool, realtime_datalens_config).await;
    });
    Ok(())
}

async fn run_realtime_worker_loop(
    runtime: IndexerRuntimeConfig,
    contract_sets: Vec<DatalensRuntimeContractSet>,
    pool: sqlx::PgPool,
    realtime_datalens_config: DatalensConfig,
) {
    let mut passes = RealtimePassRegistry::default();
    let mut observed_heads = BTreeMap::new();

    loop {
        run_realtime_cycle(
            &runtime,
            &contract_sets,
            pool.clone(),
            &realtime_datalens_config,
            &mut passes,
            &mut observed_heads,
        )
        .await;
        sleep(runtime.realtime.poll_interval).await;
    }
}

async fn run_realtime_cycle(
    runtime: &IndexerRuntimeConfig,
    contract_sets: &[DatalensRuntimeContractSet],
    pool: sqlx::PgPool,
    realtime_datalens_config: &DatalensConfig,
    passes: &mut RealtimePassRegistry<RealtimeContractSetPassReport>,
    observed_heads: &mut BTreeMap<String, i64>,
) {
    for completed_pass in passes.reap_finished().await {
        match completed_pass.result {
            RealtimePassPoll::Completed(report) => {
                let observed_head = realtime_observed_head_after_pass(&report);
                if let Some(observed_head) = observed_head {
                    observed_heads.insert(report.contract_set_id.clone(), observed_head);
                }
                log::info!(
                    "Datalens realtime cycle completed dao_code={} chain_id={} contract_set_id={} range_start_block={:?} range_end_block={:?} latest_head={} current_head_race={} segments_written={:?} proposal_overlays_written={:?} proposal_event_overlays_written={:?} vote_overlays_written={:?}",
                    report.dao_code,
                    report.chain_id,
                    report.contract_set_id,
                    report.range.map(|range| range.0),
                    report.range.map(|range| range.1),
                    report.latest_head,
                    report.provisional.current_head_race,
                    report.provisional.segments_written,
                    report.provisional.proposal_overlays_written,
                    report.provisional.proposal_event_overlays_written,
                    report.provisional.vote_overlays_written
                );
            }
            RealtimePassPoll::Failed(error) => log::warn!(
                "Datalens realtime pass failed chain_id={} contract_set_id={} error={error:#}",
                completed_pass.chain_id,
                completed_pass.key
            ),
            #[cfg(test)]
            RealtimePassPoll::TimedOut | RealtimePassPoll::InFlight => {
                unreachable!("a finished realtime pass must complete or fail")
            }
        }
    }

    for timed_out_pass in passes.mark_timed_out(runtime.realtime.pass_timeout) {
        log::warn!(
            "Datalens realtime pass lease timed out; retaining the in-flight pass until it completes contract_set_id={} chain_id={} pass_timeout_ms={}",
            timed_out_pass.key,
            timed_out_pass.chain_id,
            runtime.realtime.pass_timeout.as_millis()
        );
    }

    let schedule_order = realtime_schedule_order(
        contract_sets,
        passes.last_started_keys(),
        passes.last_started_chain_id(),
        |contract_set| contract_set.contract_set_id.as_str(),
        |contract_set| contract_set.contract.chain_id,
    );
    for contract_set_index in schedule_order {
        let contract_set = contract_sets[contract_set_index].clone();
        let previous_head = observed_heads.get(&contract_set.contract_set_id).copied();
        let pass_key = contract_set.contract_set_id.clone();
        let dao_code = contract_set.dao_code.clone();
        let chain_id = contract_set.contract.chain_id;
        let contract_set_id = contract_set.contract_set_id.clone();
        if !passes.try_start(
            &pass_key,
            chain_id,
            runtime.realtime.max_in_flight,
            runtime.realtime.per_chain_max_in_flight,
            {
                let runtime = runtime.clone();
                let pool = pool.clone();
                let realtime_datalens_config = realtime_datalens_config.clone();
                move || {
                    run_realtime_contract_set_pass(
                        runtime,
                        contract_set,
                        pool,
                        realtime_datalens_config,
                        previous_head,
                    )
                }
            },
        ) {
            if passes.contains(&pass_key) {
                log::debug!(
                    "Datalens realtime cycle skipped an in-flight pass dao_code={} chain_id={} contract_set_id={}",
                    dao_code,
                    chain_id,
                    contract_set_id
                );
            } else {
                log::debug!(
                    "Datalens realtime cycle skipped because realtime pass capacity is reached dao_code={} chain_id={} active_passes={} active_chain_passes={} max_in_flight={} per_chain_max_in_flight={}",
                    dao_code,
                    chain_id,
                    passes.len(),
                    passes.chain_active_count(chain_id),
                    runtime.realtime.max_in_flight,
                    runtime.realtime.per_chain_max_in_flight
                );
            }
        } else {
            log::debug!(
                "Datalens realtime pass started dao_code={} chain_id={} contract_set_id={} active_passes={} active_chain_passes={}",
                dao_code,
                chain_id,
                contract_set_id,
                passes.len(),
                passes.chain_active_count(chain_id)
            );
        }
    }
}

fn realtime_observed_head_after_pass(report: &RealtimeContractSetPassReport) -> Option<i64> {
    (!report.provisional.current_head_race).then_some(report.latest_head)
}

fn realtime_schedule_order<T>(
    items: &[T],
    last_started_keys: &BTreeMap<i32, String>,
    last_started_chain_id: Option<i32>,
    key: impl for<'a> Fn(&'a T) -> &'a str,
    chain_id: impl Fn(&T) -> i32,
) -> Vec<usize> {
    let mut chain_lengths = BTreeMap::new();
    let mut chain_order = Vec::new();
    for item in items {
        let chain_id = chain_id(item);
        let chain_length = chain_lengths.entry(chain_id).or_insert(0usize);
        if *chain_length == 0 {
            chain_order.push(chain_id);
        }
        *chain_length += 1;
    }
    let global_chain_start = last_started_chain_id
        .and_then(|last_started_chain_id| {
            chain_order
                .iter()
                .position(|chain_id| *chain_id == last_started_chain_id)
        })
        .map(|last_started_chain_index| (last_started_chain_index + 1) % chain_order.len())
        .unwrap_or(0);
    let global_chain_ranks = chain_order
        .iter()
        .enumerate()
        .map(|(chain_index, chain_id)| {
            (
                *chain_id,
                (chain_index + chain_order.len() - global_chain_start) % chain_order.len(),
            )
        })
        .collect::<BTreeMap<_, _>>();

    let mut chain_ordinals = BTreeMap::new();
    let mut candidates = Vec::with_capacity(items.len());
    let mut last_started_ordinals = BTreeMap::new();
    for (index, item) in items.iter().enumerate() {
        let chain_id = chain_id(item);
        let ordinal = chain_ordinals.entry(chain_id).or_insert(0usize);
        if last_started_keys
            .get(&chain_id)
            .is_some_and(|last_started_key| key(item) == last_started_key)
        {
            last_started_ordinals.insert(chain_id, *ordinal);
        }
        candidates.push((index, chain_id, *ordinal));
        *ordinal += 1;
    }

    candidates.sort_by_key(|(index, chain_id, ordinal)| {
        let rank = last_started_ordinals
            .get(chain_id)
            .map(|last_started_ordinal| {
                (ordinal + chain_lengths[chain_id] - last_started_ordinal - 1)
                    % chain_lengths[chain_id]
            })
            .unwrap_or(*ordinal);
        (rank, global_chain_ranks[chain_id], *index)
    });
    candidates.into_iter().map(|(index, _, _)| index).collect()
}

async fn run_realtime_contract_set_pass(
    runtime: IndexerRuntimeConfig,
    contract_set: DatalensRuntimeContractSet,
    pool: sqlx::PgPool,
    realtime_datalens_config: DatalensConfig,
    previous_head: Option<i64>,
) -> Result<RealtimeContractSetPassReport> {
    let dao_code = contract_set.dao_code.clone();
    let chain_id = contract_set.contract.chain_id;
    let contract_set_id = contract_set.contract_set_id.clone();
    task::spawn_blocking(move || -> Result<_> {
        let mut contract_runtime = runtime
            .for_configured_contract_set_at_target(&contract_set, contract_set.contract.start_block)
            .context("build realtime contract set runtime")?;
        contract_runtime.provisional = runtime.provisional.clone();
        let config = realtime_datalens_config_for_contract_set(
            &realtime_datalens_config,
            &contract_set.config,
        );
        let mut client = DatalensNativeClient::from_config_with_retry_config(
            &config,
            datalens_retry_config(contract_runtime.query_max_attempts),
        )
        .context("create Datalens realtime client")?;
        let latest_head = client
            .latest_head_height(&config)
            .context("resolve Datalens realtime latest head")?;
        let range = plan_realtime_tail_range(
            previous_head,
            latest_head,
            contract_runtime.start_block,
            runtime.realtime.tail_window_blocks,
        );
        let provisional = match range {
            Some((from_block, to_block)) => {
                let mut store = PostgresProvisionalSegmentStore::new(pool);
                run_provisional_worker_for_range(
                    &contract_runtime,
                    &config,
                    &contract_set.addresses,
                    from_block,
                    to_block,
                    latest_head,
                    &mut client,
                    &mut store,
                )?
            }
            None => ProvisionalWorkerRunReport::default(),
        };
        Ok(RealtimeContractSetPassReport {
            dao_code,
            chain_id,
            contract_set_id,
            latest_head,
            range,
            provisional,
        })
    })
    .await
    .context("join Datalens realtime blocking pass")?
}

struct RealtimeContractSetPassReport {
    dao_code: String,
    chain_id: i32,
    contract_set_id: String,
    latest_head: i64,
    range: Option<(i64, i64)>,
    provisional: ProvisionalWorkerRunReport,
}

struct RealtimePassRegistry<T> {
    passes: BTreeMap<String, RealtimePass<T>>,
    last_started_keys: BTreeMap<i32, String>,
    last_started_chain_id: Option<i32>,
}

struct RealtimePass<T> {
    chain_id: i32,
    started_at: tokio::time::Instant,
    timeout_logged: bool,
    handle: task::JoinHandle<Result<T>>,
}

impl<T> RealtimePass<T> {
    fn new(chain_id: i32, handle: task::JoinHandle<Result<T>>) -> Self {
        Self {
            chain_id,
            started_at: tokio::time::Instant::now(),
            timeout_logged: false,
            handle,
        }
    }
}

struct RealtimePassCompletion<T> {
    key: String,
    chain_id: i32,
    result: RealtimePassPoll<T>,
}

struct RealtimePassTimeout {
    key: String,
    chain_id: i32,
}

impl<T> Default for RealtimePassRegistry<T> {
    fn default() -> Self {
        Self {
            passes: BTreeMap::new(),
            last_started_keys: BTreeMap::new(),
            last_started_chain_id: None,
        }
    }
}

impl<T> RealtimePassRegistry<T> {
    fn last_started_keys(&self) -> &BTreeMap<i32, String> {
        &self.last_started_keys
    }

    fn last_started_chain_id(&self) -> Option<i32> {
        self.last_started_chain_id
    }

    fn contains(&self, key: &str) -> bool {
        self.passes.contains_key(key)
    }

    fn len(&self) -> usize {
        self.passes.len()
    }

    fn chain_active_count(&self, chain_id: i32) -> usize {
        self.passes
            .values()
            .filter(|pass| pass.chain_id == chain_id)
            .count()
    }

    fn has_capacity(
        &self,
        chain_id: i32,
        max_in_flight: usize,
        per_chain_max_in_flight: usize,
    ) -> bool {
        self.len() < max_in_flight && self.chain_active_count(chain_id) < per_chain_max_in_flight
    }

    fn try_start<F, Fut>(
        &mut self,
        key: &str,
        chain_id: i32,
        max_in_flight: usize,
        per_chain_max_in_flight: usize,
        start: F,
    ) -> bool
    where
        T: Send + 'static,
        F: FnOnce() -> Fut,
        Fut: Future<Output = Result<T>> + Send + 'static,
    {
        if self.contains(key)
            || !self.has_capacity(chain_id, max_in_flight, per_chain_max_in_flight)
        {
            return false;
        }

        self.passes.insert(
            key.to_owned(),
            RealtimePass::new(chain_id, task::spawn(start())),
        );
        self.last_started_keys.insert(chain_id, key.to_owned());
        self.last_started_chain_id = Some(chain_id);
        true
    }

    async fn reap_finished(&mut self) -> Vec<RealtimePassCompletion<T>>
    where
        T: Send + 'static,
    {
        let finished_keys = self
            .passes
            .iter()
            .filter_map(|(key, pass)| pass.handle.is_finished().then_some(key.clone()))
            .collect::<Vec<_>>();
        let mut completions = Vec::with_capacity(finished_keys.len());

        for key in finished_keys {
            let pass = self
                .passes
                .remove(&key)
                .expect("finished realtime pass remains registered");
            let chain_id = pass.chain_id;
            let result = match pass.handle.await {
                Ok(Ok(report)) => RealtimePassPoll::Completed(report),
                Ok(Err(error)) => RealtimePassPoll::Failed(error),
                Err(error) => RealtimePassPoll::Failed(
                    runtime_anyhow::Error::new(error).context("join Datalens realtime pass"),
                ),
            };
            completions.push(RealtimePassCompletion {
                key,
                chain_id,
                result,
            });
        }

        completions
    }

    fn mark_timed_out(&mut self, timeout_duration: Duration) -> Vec<RealtimePassTimeout> {
        let now = tokio::time::Instant::now();

        self.passes
            .iter_mut()
            .filter_map(|(key, pass)| {
                (!pass.timeout_logged
                    && !pass.handle.is_finished()
                    && now.duration_since(pass.started_at) >= timeout_duration)
                    .then(|| {
                        pass.timeout_logged = true;
                        RealtimePassTimeout {
                            key: key.clone(),
                            chain_id: pass.chain_id,
                        }
                    })
            })
            .collect()
    }
}

enum RealtimePassPoll<T> {
    Completed(T),
    Failed(runtime_anyhow::Error),
    #[cfg(test)]
    TimedOut,
    #[cfg(test)]
    InFlight,
}

#[cfg(test)]
async fn poll_realtime_pass<T, F, Fut>(
    registry: &mut RealtimePassRegistry<T>,
    key: &str,
    chain_id: i32,
    timeout_duration: Duration,
    start: F,
) -> RealtimePassPoll<T>
where
    T: Send + 'static,
    F: FnOnce() -> Fut,
    Fut: Future<Output = Result<T>> + Send + 'static,
{
    let mut pass = match registry.passes.remove(key) {
        Some(pass) if pass.handle.is_finished() => pass.handle,
        Some(pass) => {
            registry.passes.insert(key.to_owned(), pass);
            return RealtimePassPoll::InFlight;
        }
        None => task::spawn(start()),
    };

    match poll_realtime_pass_handle(&mut pass, timeout_duration).await {
        RealtimePassPoll::TimedOut => {
            registry
                .passes
                .insert(key.to_owned(), RealtimePass::new(chain_id, pass));
            RealtimePassPoll::TimedOut
        }
        result => result,
    }
}

#[cfg(test)]
async fn poll_realtime_pass_handle<T>(
    pass: &mut task::JoinHandle<Result<T>>,
    timeout_duration: Duration,
) -> RealtimePassPoll<T>
where
    T: Send + 'static,
{
    match timeout(timeout_duration, pass).await {
        Ok(Ok(Ok(report))) => RealtimePassPoll::Completed(report),
        Ok(Ok(Err(error))) => RealtimePassPoll::Failed(error),
        Ok(Err(error)) => RealtimePassPoll::Failed(
            runtime_anyhow::Error::new(error).context("join Datalens realtime pass"),
        ),
        Err(_) => RealtimePassPoll::TimedOut,
    }
}

#[cfg(test)]
async fn poll_realtime_pass_with_runtime<T, F, Fut>(
    registry: &mut RealtimePassRegistry<T>,
    key: &str,
    chain_id: i32,
    runtime: &crate::RealtimeRuntimeConfig,
    start: F,
) -> RealtimePassPoll<T>
where
    T: Send + 'static,
    F: FnOnce() -> Fut,
    Fut: Future<Output = Result<T>> + Send + 'static,
{
    poll_realtime_pass(registry, key, chain_id, runtime.pass_timeout, start).await
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
        Ok(_) => Ok(()),
        Err(error) => handle_contract_set_pass_failure(runtime, &contract_set, error),
    }
}

async fn run_configured_contract_set_pass_result(
    runtime: &IndexerRuntimeConfig,
    contract_set: DatalensRuntimeContractSet,
    pool: sqlx::PgPool,
    datalens_query_gate: Option<DatalensQueryConcurrencyGate>,
) -> std::result::Result<ContractSetPassOutcome, ContractSetPassError> {
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
            return Ok(ContractSetPassOutcome::skipped(target_height));
        }
        Err(error) => return Err(ContractSetPassError::setup(error)),
    };
    let report = match run_contract_set_pass(
        runtime.contract_set_mode,
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

    Ok(ContractSetPassOutcome { report })
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
    RunFuture: Future,
    RunFuture::Output: ContractSetPassLoopResult,
    Sleep: FnMut(Duration) -> SleepFuture,
    SleepFuture: Future<Output = ()>,
{
    let mut backoff = ContractSetRetryBackoff::default();

    loop {
        match run_pass().await.into_result() {
            Ok(outcome) => {
                backoff.reset();
                sleep_for(outcome.next_poll_interval(poll_interval)).await;
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

trait ContractSetPassLoopResult {
    type Outcome: ContractSetPassLoopOutcome;

    fn into_result(self) -> std::result::Result<Self::Outcome, ContractSetPassError>;
}

impl<T> ContractSetPassLoopResult for std::result::Result<T, ContractSetPassError>
where
    T: ContractSetPassLoopOutcome,
{
    type Outcome = T;

    fn into_result(self) -> std::result::Result<Self::Outcome, ContractSetPassError> {
        self
    }
}

trait ContractSetPassLoopOutcome {
    fn next_poll_interval(&self, default_interval: Duration) -> Duration;
}

impl ContractSetPassLoopOutcome for () {
    fn next_poll_interval(&self, default_interval: Duration) -> Duration {
        default_interval
    }
}

#[derive(Clone, Debug)]
struct ContractSetPassOutcome {
    report: IndexerRunnerReport,
}

impl ContractSetPassOutcome {
    fn skipped(target_height: i64) -> Self {
        Self {
            report: IndexerRunnerReport {
                chunks_processed: 0,
                shutdown_requested: false,
                last_progress: IndexerRunnerProgress {
                    processed_height: None,
                    target_height,
                    synced_percentage: 100.0,
                    configured_start_block: target_height,
                    remaining_blocks: 0,
                    configured_range_synced_percentage: 100.0,
                    current_rate_blocks_per_second: None,
                    eta_seconds: None,
                    onchain_refresh_allowed: true,
                },
            },
        }
    }
}

impl ContractSetPassLoopOutcome for ContractSetPassOutcome {
    fn next_poll_interval(&self, default_interval: Duration) -> Duration {
        recovering_contract_set_poll_interval(&self.report, default_interval)
    }
}

const CAUGHT_UP_POLL_INTERVAL_MULTIPLIER: u32 = 12;
const NEAR_CAUGHT_UP_POLL_INTERVAL_MULTIPLIER: u32 = 3;
const NEAR_CAUGHT_UP_REMAINING_BLOCKS: i64 = 100;
const BACKLOG_REMAINING_BLOCKS: i64 = 100_000;

fn recovering_contract_set_poll_interval(
    report: &IndexerRunnerReport,
    default_interval: Duration,
) -> Duration {
    let remaining_blocks = report.last_progress.remaining_blocks;
    if remaining_blocks == 0 {
        default_interval * CAUGHT_UP_POLL_INTERVAL_MULTIPLIER
    } else if remaining_blocks <= NEAR_CAUGHT_UP_REMAINING_BLOCKS {
        default_interval * NEAR_CAUGHT_UP_POLL_INTERVAL_MULTIPLIER
    } else if remaining_blocks >= BACKLOG_REMAINING_BLOCKS {
        Duration::ZERO
    } else {
        default_interval
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

fn resolve_contract_set_max_chunks_per_run(
    contract_set_mode: IndexerContractSetMode,
    runtime: &IndexerContractSetRuntimeConfig,
    processed_height: Option<i64>,
    target_height: i64,
) -> Option<u64> {
    if let Some(chunks) = runtime.max_chunks_per_run {
        return Some(chunks);
    }
    if !matches!(contract_set_mode, IndexerContractSetMode::All) {
        return None;
    }

    let remaining_blocks =
        configured_range_progress(processed_height, runtime.start_block, target_height)
            .remaining_blocks;
    if remaining_blocks >= 10_000_000 {
        Some(20)
    } else if remaining_blocks >= 1_000_000 {
        Some(12)
    } else if remaining_blocks >= 100_000 {
        Some(6)
    } else {
        Some(1)
    }
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
    let concurrency = warmup_startup_global_concurrency(runtime, contract_sets.len());
    let per_chain_max_in_flight = runtime.datalens_query_concurrency.per_chain_max_in_flight;
    let wait_for_completion = contract_sets
        .iter()
        .any(|contract_set| contract_set.config.warmup.required);

    log::info!(
        "Datalens follow_query warmup startup ensure scheduling contract_set_count={} concurrency={} per_chain_concurrency={} wait_for_completion={}",
        contract_sets.len(),
        concurrency,
        per_chain_max_in_flight.map_or_else(|| "unlimited".to_owned(), |limit| limit.to_string()),
        wait_for_completion
    );

    if wait_for_completion {
        run_warmup_startup_ensure(
            contract_sets,
            retry_config,
            concurrency,
            per_chain_max_in_flight,
        )
        .await
    } else {
        task::spawn(async move {
            if let Err(error) = run_warmup_startup_ensure(
                contract_sets,
                retry_config,
                concurrency,
                per_chain_max_in_flight,
            )
            .await
            {
                log::warn!(
                    "Datalens follow_query warmup startup background ensure failed error={:#}",
                    error
                );
            }
        });
        Ok(())
    }
}

async fn run_warmup_startup_ensure(
    contract_sets: Vec<DatalensRuntimeContractSet>,
    retry_config: RetryConfig,
    concurrency: usize,
    per_chain_max_in_flight: Option<usize>,
) -> Result<()> {
    let global_semaphore = Arc::new(Semaphore::new(concurrency));
    let per_chain_semaphores =
        warmup_startup_per_chain_semaphores(per_chain_max_in_flight, &contract_sets);
    let mut handles = task::JoinSet::new();

    for contract_set in contract_sets {
        let config = contract_set.config.clone();
        let addresses = contract_set.addresses.clone();
        let dao_code = contract_set.dao_code.clone();
        let contract_set_id = contract_set.contract_set_id.clone();
        let chain_id = contract_set.contract.chain_id;
        let start_block = contract_set.contract.start_block;
        let warmup_required = config.warmup.required;
        let retry_config = retry_config.clone();
        let per_chain_permit = acquire_semaphore(
            per_chain_semaphores
                .as_ref()
                .and_then(|semaphores| semaphores.get(&chain_id).cloned()),
        )
        .await
        .context("acquire Datalens warmup startup per-chain concurrency permit")?;
        let global_permit = global_semaphore
            .clone()
            .acquire_owned()
            .await
            .context("acquire Datalens warmup startup concurrency permit")?;

        handles.spawn_blocking(move || -> Result<_> {
            let _global_permit = global_permit;
            let _per_chain_permit = per_chain_permit;
            let mut client =
                DatalensNativeClient::from_config_with_retry_config(&config, retry_config)
                    .context("create Datalens client")?;
            let outcome =
                ensure_datalens_warmup_task(&mut client, &config, &addresses, start_block)
                    .context("ensure Datalens follow_query warmup task")?;

            Ok(WarmupStartupEnsureResult {
                dao_code,
                chain_id,
                contract_set_id,
                warmup_required,
                outcome,
            })
        });
    }

    while let Some(result) = handles.join_next().await {
        let result = result.context("join Datalens warmup ensure task")??;

        match result.outcome {
            DatalensWarmupEnsureOutcome::Disabled => {}
            DatalensWarmupEnsureOutcome::Failed { error } => {
                log::warn!(
                    "Datalens follow_query warmup startup ensure failed; continuing indexing dao_code={} chain_id={} contract_set_id={} required={} error={}",
                    result.dao_code,
                    result.chain_id,
                    result.contract_set_id,
                    result.warmup_required,
                    error
                );
            }
            DatalensWarmupEnsureOutcome::Submitted { task_id, created } => {
                log::info!(
                    "Datalens follow_query warmup task ensured dao_code={} chain_id={} contract_set_id={} task_id={} created={}",
                    result.dao_code,
                    result.chain_id,
                    result.contract_set_id,
                    task_id,
                    created
                );
            }
        }
    }

    Ok(())
}

struct WarmupStartupEnsureResult {
    dao_code: String,
    chain_id: i32,
    contract_set_id: String,
    warmup_required: bool,
    outcome: DatalensWarmupEnsureOutcome,
}

fn warmup_startup_global_concurrency(
    runtime: &IndexerRuntimeConfig,
    contract_set_count: usize,
) -> usize {
    if contract_set_count == 0 {
        return 1;
    }

    runtime
        .datalens_query_concurrency
        .global_max_in_flight
        .unwrap_or(4)
        .min(contract_set_count)
        .max(1)
}

fn warmup_startup_per_chain_semaphores(
    per_chain_max_in_flight: Option<usize>,
    contract_sets: &[DatalensRuntimeContractSet],
) -> Option<BTreeMap<i32, Arc<Semaphore>>> {
    let limit = per_chain_max_in_flight?;
    let mut semaphores = BTreeMap::new();
    for contract_set in contract_sets {
        semaphores
            .entry(contract_set.contract.chain_id)
            .or_insert_with(|| Arc::new(Semaphore::new(limit)));
    }
    Some(semaphores)
}

async fn run_contract_set_pass(
    contract_set_mode: IndexerContractSetMode,
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
        contracts.timelock.as_deref().unwrap_or("none"),
        runtime.start_block,
        runtime.target_height
    );

    let onchain_refresh_tick = build_onchain_refresh_tick(&runtime, &config, pool.clone())
        .map_err(ContractSetPassError::setup)?;
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
        if let Some(gate) = datalens_query_gate.clone() {
            client = client.with_query_concurrency_gate(gate);
        }
        let mut store = PostgresIndexerRunnerStore::new(pool.clone())
            .with_onchain_refresh_debounce(onchain_refresh_debounce)
            .with_onchain_refresh_deferred_drain_batch_size(
                runtime.onchain_refresh_deferred_drain_batch_size,
            );
        let options = runtime
            .options(&config, &contracts)
            .map_err(ContractSetPassError::setup)?;
        let max_chunks_per_run = if runtime.max_chunks_per_run.is_some()
            || matches!(contract_set_mode, IndexerContractSetMode::Single)
        {
            runtime.max_chunks_per_run
        } else {
            let checkpoint = store
                .read_or_create_checkpoint(&options.checkpoint_identity, options.start_block)
                .context("read Datalens indexer checkpoint for chunk budget")
                .map_err(ContractSetPassError::setup)?;
            resolve_contract_set_max_chunks_per_run(
                contract_set_mode,
                &runtime,
                checkpoint.processed_height,
                runtime.target_height,
            )
        };
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
        if let Some(chunks) = max_chunks_per_run {
            runner.request_shutdown_after_chunks(chunks);
        }

        let report = runner
            .run_to_target(runtime.target_height)
            .context("run Datalens indexer to target height")
            .map_err(ContractSetPassError::runner)?;

        if runtime.provisional.enabled {
            let mut provisional_client = DatalensNativeClient::from_config_with_retry_config(
                &config,
                datalens_retry_config(runtime.query_max_attempts),
            )
            .context("create Datalens provisional client")
            .map_err(ContractSetPassError::setup)?;
            if let Some(gate) = datalens_query_gate {
                provisional_client = provisional_client.with_query_concurrency_gate(gate);
            }
            let metrics_pool = pool.clone();
            let mut provisional_store = PostgresProvisionalSegmentStore::new(pool);
            match run_provisional_worker_once(
                &runtime,
                &config,
                &contracts,
                &report,
                &mut provisional_client,
                &mut provisional_store,
            )
            {
                Ok(provisional_report) => {
                    if let (Some(chain_id), Some(latest_height)) =
                        (config.chain.network_id, provisional_report.latest_height)
                    {
                        let record = IndexerLatestHeadRecord {
                            dao_code: runtime.dao_code.clone(),
                            chain_id,
                            contract_set_id: runtime.checkpoint_contract_set_id.clone(),
                            stream_id: runtime.checkpoint_stream_id.clone(),
                            data_source_version: runtime.data_source_version.clone(),
                            latest_height,
                        };
                        if let Err(error) = Handle::current().block_on(
                            crate::metrics::record_indexer_latest_head(&metrics_pool, &record),
                        ) {
                            log::warn!(
                                "record Datalens latest head failed dao_code={} chain_id={} contract_set_id={} latest_height={} error={:#}",
                                runtime.dao_code,
                                chain_id,
                                runtime.checkpoint_contract_set_id,
                                latest_height,
                                error
                            );
                        }
                    }
                }
                Err(error) => {
                    log::warn!(
                        "Datalens provisional worker failed after durable pass dao_code={} chain_id={:?} contract_set_id={} error={:#}",
                        runtime.dao_code,
                        config.chain.network_id,
                        runtime.checkpoint_contract_set_id,
                        error.context("run Datalens provisional worker")
                    );
                }
            }
        } else {
            log::debug!(
                "Datalens provisional worker disabled dao_code={} chain_id={:?} contract_set_id={}",
                runtime.dao_code,
                config.chain.network_id,
                runtime.checkpoint_contract_set_id
            );
        }

        Ok(report)
    })
    .await
    .map_err(|error| {
        ContractSetPassError::setup(
            runtime_anyhow::Error::new(error).context("join Datalens indexer runner task"),
        )
    })?
}

fn run_provisional_worker_once<R, S>(
    runtime: &IndexerContractSetRuntimeConfig,
    config: &DatalensConfig,
    contracts: &DaoContractAddresses,
    report: &IndexerRunnerReport,
    reader: &mut R,
    store: &mut S,
) -> Result<ProvisionalWorkerRunReport>
where
    R: DatalensDurableHeadReader + DatalensProvisionalLogQueryReader,
    S: DatalensProvisionalSegmentStore
        + ProvisionalProposalOverlayStore
        + ProvisionalVoteOverlayStore,
{
    if !runtime.provisional.enabled {
        log::debug!(
            "Datalens provisional worker disabled dao_code={} chain_id={:?} contract_set_id={}",
            runtime.dao_code,
            config.chain.network_id,
            runtime.checkpoint_contract_set_id
        );
        return Ok(ProvisionalWorkerRunReport::default());
    }

    let Some(chain_id) = config.chain.network_id else {
        bail!(
            "missing Datalens chain network_id for provisional worker dao_code={} contract_set_id={}",
            runtime.dao_code,
            runtime.checkpoint_contract_set_id
        );
    };
    let latest_height = reader
        .latest_head_height(config)
        .context("resolve latest Datalens head height for provisional worker")?;
    let Some((from_block, to_block)) = provisional_tail_range(runtime, report, latest_height)
    else {
        log::debug!(
            "Datalens provisional worker skipped without latest tail dao_code={} chain_id={} contract_set_id={} durable_target_height={} latest_height={}",
            runtime.dao_code,
            chain_id,
            runtime.checkpoint_contract_set_id,
            runtime.target_height,
            latest_height
        );
        return Ok(ProvisionalWorkerRunReport {
            latest_height: Some(latest_height),
            current_head_race: false,
            segments_written: None,
            proposal_overlays_written: None,
            proposal_event_overlays_written: None,
            vote_overlays_written: None,
        });
    };
    run_provisional_worker_for_range(
        runtime,
        config,
        contracts,
        from_block,
        to_block,
        latest_height,
        reader,
        store,
    )
}

fn run_provisional_worker_for_range<R, S>(
    runtime: &IndexerContractSetRuntimeConfig,
    config: &DatalensConfig,
    contracts: &DaoContractAddresses,
    from_block: i64,
    to_block: i64,
    latest_height: i64,
    reader: &mut R,
    store: &mut S,
) -> Result<ProvisionalWorkerRunReport>
where
    R: DatalensProvisionalLogQueryReader,
    S: DatalensProvisionalSegmentStore
        + ProvisionalProposalOverlayStore
        + ProvisionalVoteOverlayStore,
{
    let Some(chain_id) = config.chain.network_id else {
        bail!(
            "missing Datalens chain network_id for provisional worker dao_code={} contract_set_id={}",
            runtime.dao_code,
            runtime.checkpoint_contract_set_id
        );
    };
    let options = ProvisionalWorkerOptions {
        datalens_config: config.clone(),
        addresses: contracts.clone(),
        dao_code: runtime.dao_code.clone(),
        contract_set_id: runtime.checkpoint_contract_set_id.clone(),
        chain_id,
        chain_name: config.chain.configured_name.clone(),
        finality: runtime.provisional.finality,
        from_block,
        to_block,
    };
    let mut worker = ProvisionalWorker::new(options, reader, store);
    let report = match worker.run_once() {
        Ok(report) => report,
        Err(error) => {
            if let Some(reason) = provisional_worker_current_head_race_reason(&error) {
                log::info!(
                    "Datalens provisional worker skipped current head race dao_code={} chain_id={} contract_set_id={} from_block={} to_block={} latest_height={} reason={}",
                    runtime.dao_code,
                    chain_id,
                    runtime.checkpoint_contract_set_id,
                    from_block,
                    to_block,
                    latest_height,
                    reason
                );
                return Ok(ProvisionalWorkerRunReport {
                    latest_height: Some(latest_height),
                    current_head_race: true,
                    segments_written: None,
                    proposal_overlays_written: None,
                    proposal_event_overlays_written: None,
                    vote_overlays_written: None,
                });
            }

            return Err(provisional_worker_error_to_anyhow(error));
        }
    };

    log::info!(
        "Datalens provisional worker completed dao_code={} chain_id={} contract_set_id={} finality={} range_start_block={} range_end_block={} segments_written={} proposal_overlays_written={} proposal_event_overlays_written={} vote_overlays_written={}",
        runtime.dao_code,
        chain_id,
        runtime.checkpoint_contract_set_id,
        runtime.provisional.finality.as_datalens_value(),
        from_block,
        to_block,
        report.segments_written,
        report.proposal_overlays_written,
        report.proposal_event_overlays_written,
        report.vote_overlays_written
    );

    Ok(ProvisionalWorkerRunReport {
        latest_height: Some(latest_height),
        current_head_race: false,
        segments_written: Some(report.segments_written),
        proposal_overlays_written: Some(report.proposal_overlays_written),
        proposal_event_overlays_written: Some(report.proposal_event_overlays_written),
        vote_overlays_written: Some(report.vote_overlays_written),
    })
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
struct ProvisionalWorkerRunReport {
    latest_height: Option<i64>,
    current_head_race: bool,
    segments_written: Option<usize>,
    proposal_overlays_written: Option<usize>,
    proposal_event_overlays_written: Option<usize>,
    vote_overlays_written: Option<usize>,
}

fn provisional_tail_range(
    runtime: &IndexerContractSetRuntimeConfig,
    report: &IndexerRunnerReport,
    latest_height: i64,
) -> Option<(i64, i64)> {
    if report.last_progress.remaining_blocks != 0 || latest_height <= runtime.target_height {
        return None;
    }

    Some((
        runtime
            .target_height
            .saturating_add(1)
            .max(runtime.start_block),
        latest_height,
    ))
}

fn plan_realtime_tail_range(
    previous_head: Option<i64>,
    latest_head: i64,
    start_block: i64,
    tail_window_blocks: i64,
) -> Option<(i64, i64)> {
    if previous_head.is_some_and(|head| latest_head <= head) || latest_head < start_block {
        return None;
    }

    let tail_start = latest_head
        .saturating_sub(tail_window_blocks.saturating_sub(1))
        .max(start_block);
    let from_block = previous_head
        .map(|head| head.saturating_add(1))
        .unwrap_or(tail_start)
        .max(tail_start);

    (from_block <= latest_head).then_some((from_block, latest_head))
}

fn is_realtime_dao_allowlisted(dao_code: &str, dao_codes: &[String]) -> bool {
    dao_codes.iter().any(|allowed| allowed == dao_code)
}

fn realtime_worker_is_eligible(
    run_once: bool,
    realtime_enabled: bool,
    provisional_enabled: bool,
    dao_codes: &[String],
) -> bool {
    !run_once && realtime_enabled && provisional_enabled && !dao_codes.is_empty()
}

fn realtime_datalens_config(
    realtime: &crate::RealtimeRuntimeConfig,
    durable_config: &DatalensConfig,
) -> Option<DatalensConfig> {
    let application = realtime.datalens_application.as_ref()?.trim();
    let token = realtime.datalens_token.as_ref()?;
    if application.is_empty()
        || application == durable_config.application
        || token.expose_secret().trim().is_empty()
    {
        return None;
    }

    let mut config = durable_config.clone();
    config.application = application.to_owned();
    config.bearer_token = token.clone();
    config.timeout = realtime.query_timeout;
    Some(config)
}

fn realtime_datalens_config_for_contract_set(
    realtime_config: &DatalensConfig,
    contract_set_config: &DatalensConfig,
) -> DatalensConfig {
    let mut config = contract_set_config.clone();
    config.application = realtime_config.application.clone();
    config.bearer_token = realtime_config.bearer_token.clone();
    config.timeout = realtime_config.timeout;
    config
}

fn realtime_worker_has_configured_dao_match(
    configured_dao_codes: &[String],
    allowlist: &[String],
) -> bool {
    configured_dao_codes
        .iter()
        .any(|dao_code| is_realtime_dao_allowlisted(dao_code, allowlist))
}

fn provisional_worker_error_to_anyhow(error: ProvisionalWorkerError) -> runtime_anyhow::Error {
    runtime_anyhow::Error::new(error)
}

fn provisional_worker_current_head_race_reason(error: &ProvisionalWorkerError) -> Option<&str> {
    match error {
        ProvisionalWorkerError::Datalens(DatalensError::Query(message))
            if datalens_query_error_is_current_head_race(message) =>
        {
            Some(message)
        }
        _ => None,
    }
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
    config: &DatalensConfig,
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
    let chain_id = config.chain.network_id.with_context(|| {
        format!(
            "missing onchain refresh tick chain id for dao_code={}",
            runtime.dao_code
        )
    })?;
    let runner = OnchainRefreshWorkerTickRunner {
        worker,
        handle: Handle::current(),
        scope: OnchainRefreshTaskScope {
            chain_id,
            contract_set_id: runtime.checkpoint_contract_set_id.clone(),
            dao_code: runtime.dao_code.clone(),
        },
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
    scope: OnchainRefreshTaskScope,
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
        self.handle.block_on(
            self.worker
                .run_once_with_batch_size_for_scope_without_backlog(max_tasks, &self.scope),
        )
    }

    fn backlog(&mut self) -> Option<u64> {
        None
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
        time::{Duration, Instant},
    };

    use datalens_sdk::native::QueryInput;

    use crate::{
        ChainFamily, ChainIdentityConfig, DatalensFinality, DatalensProvisionalCacheSegment,
        DatalensProvisionalFinality, DatalensProvisionalLogQueryResult,
        DatalensProvisionalSegmentWrite, DatasetKeyConfig, GovernanceTokenStandard,
        ProvisionalProposalEventOverlayWrite, ProvisionalProposalOverlayWrite,
        ProvisionalRuntimeConfig, ProvisionalTimelockOperationOverlayWrite,
        ProvisionalVoteCastGroupOverlayWrite, QueryLimitConfig, RealtimeRuntimeConfig,
        SecretString,
    };

    use super::*;

    async fn start_blocked_realtime_pass(
        starts: Arc<AtomicUsize>,
        release: Arc<tokio::sync::Semaphore>,
    ) -> task::JoinHandle<Result<()>> {
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let handle = task::spawn(async move {
            starts.fetch_add(1, Ordering::SeqCst);
            started_tx
                .send(())
                .expect("realtime pass start signal is received");
            let _permit = release
                .acquire()
                .await
                .expect("release semaphore remains open");
            Ok::<_, runtime_anyhow::Error>(())
        });

        started_rx
            .await
            .expect("realtime pass signals startup before its lease is polled");
        handle
    }

    #[test]
    fn test_resolve_contract_set_max_chunks_per_run_adapts_all_mode_from_remaining_blocks() {
        let runtime = contract_runtime_for_chunk_budget(None);

        assert_eq!(
            resolve_contract_set_max_chunks_per_run(
                IndexerContractSetMode::All,
                &runtime,
                Some(0),
                10_000_000
            ),
            Some(20)
        );
        assert_eq!(
            resolve_contract_set_max_chunks_per_run(
                IndexerContractSetMode::All,
                &runtime,
                Some(0),
                1_000_000
            ),
            Some(12)
        );
        assert_eq!(
            resolve_contract_set_max_chunks_per_run(
                IndexerContractSetMode::All,
                &runtime,
                Some(0),
                100_000
            ),
            Some(6)
        );
        assert_eq!(
            resolve_contract_set_max_chunks_per_run(
                IndexerContractSetMode::All,
                &runtime,
                Some(0),
                99_999
            ),
            Some(1)
        );
    }

    #[test]
    fn test_resolve_contract_set_max_chunks_per_run_uses_explicit_value() {
        let runtime = contract_runtime_for_chunk_budget(Some(9));

        assert_eq!(
            resolve_contract_set_max_chunks_per_run(
                IndexerContractSetMode::All,
                &runtime,
                Some(0),
                10_000_000
            ),
            Some(9)
        );
    }

    #[test]
    fn test_resolve_contract_set_max_chunks_per_run_leaves_single_mode_unset_by_default() {
        let runtime = contract_runtime_for_chunk_budget(None);

        assert_eq!(
            resolve_contract_set_max_chunks_per_run(
                IndexerContractSetMode::Single,
                &runtime,
                Some(0),
                10_000_000
            ),
            None
        );
    }

    #[test]
    fn test_recovering_contract_set_poll_interval_slows_caught_up_jobs() {
        let default_interval = Duration::from_secs(10);

        assert_eq!(
            recovering_contract_set_poll_interval(
                &runner_report_with_remaining_blocks(0),
                default_interval
            ),
            Duration::from_secs(120)
        );
    }

    #[test]
    fn test_recovering_contract_set_poll_interval_slows_near_caught_up_jobs() {
        let default_interval = Duration::from_secs(10);

        assert_eq!(
            recovering_contract_set_poll_interval(
                &runner_report_with_remaining_blocks(100),
                default_interval
            ),
            Duration::from_secs(30)
        );
    }

    #[test]
    fn test_recovering_contract_set_poll_interval_prioritizes_backlog_jobs() {
        let default_interval = Duration::from_secs(10);

        assert_eq!(
            recovering_contract_set_poll_interval(
                &runner_report_with_remaining_blocks(100_000),
                default_interval
            ),
            Duration::ZERO
        );
    }

    #[test]
    fn test_realtime_tail_planner_uses_latest_tail_on_first_observation() {
        assert_eq!(
            plan_realtime_tail_range(None, 105, 100, 8),
            Some((100, 105))
        );
    }

    #[test]
    fn test_realtime_tail_planner_uses_only_new_blocks_after_first_observation() {
        assert_eq!(
            plan_realtime_tail_range(Some(105), 108, 100, 8),
            Some((106, 108))
        );
    }

    #[test]
    fn test_realtime_tail_planner_bounds_large_recovery_gap_to_tail_window() {
        assert_eq!(
            plan_realtime_tail_range(Some(100), 200, 1, 8),
            Some((193, 200))
        );
    }

    #[test]
    fn test_realtime_tail_planner_skips_unchanged_or_regressed_heads() {
        assert_eq!(plan_realtime_tail_range(Some(105), 105, 100, 8), None);
        assert_eq!(plan_realtime_tail_range(Some(105), 104, 100, 8), None);
    }

    #[test]
    fn test_realtime_tail_planner_never_precedes_start_block() {
        assert_eq!(
            plan_realtime_tail_range(None, 102, 100, 8),
            Some((100, 102))
        );
    }

    #[test]
    fn test_realtime_allowlist_only_selects_explicit_configured_dao_codes() {
        let allowlist = vec!["demo-dao".to_owned()];

        assert!(is_realtime_dao_allowlisted("demo-dao", &allowlist));
        assert!(!is_realtime_dao_allowlisted("other-dao", &allowlist));
    }

    #[test]
    fn test_realtime_empty_allowlist_is_inert() {
        assert!(!is_realtime_dao_allowlisted("demo-dao", &[]));
    }

    #[test]
    fn test_realtime_datalens_config_requires_application_distinct_from_durable() {
        let durable = datalens_config();
        let shared_application = RealtimeRuntimeConfig {
            datalens_application: Some(durable.application.clone()),
            datalens_token: Some(SecretString::new("dedicated-realtime-token")),
            query_timeout: Duration::from_secs(5),
            ..Default::default()
        };
        let realtime = RealtimeRuntimeConfig {
            datalens_application: Some("degov-realtime".to_owned()),
            datalens_token: Some(SecretString::new("dedicated-realtime-token")),
            query_timeout: Duration::from_secs(5),
            ..Default::default()
        };

        assert!(realtime_datalens_config(&shared_application, &durable).is_none());
        let dedicated = realtime_datalens_config(&realtime, &durable)
            .expect("dedicated realtime Datalens configuration is complete");

        assert_eq!(dedicated.application, "degov-realtime");
        assert_eq!(
            dedicated.bearer_token.expose_secret(),
            "dedicated-realtime-token"
        );
        assert_eq!(dedicated.timeout, Duration::from_secs(5));
        assert_eq!(durable.application, "degov-test");
        assert_eq!(
            durable.bearer_token.expose_secret(),
            "unit-test-redacted-value"
        );
        assert_eq!(durable.timeout, Duration::from_secs(1));
    }

    #[test]
    fn test_realtime_worker_gating_requires_long_running_provisional_allowlisted_mode() {
        let dao_codes = vec!["demo-dao".to_owned()];

        assert!(realtime_worker_is_eligible(false, true, true, &dao_codes));
        assert!(!realtime_worker_is_eligible(true, true, true, &dao_codes));
        assert!(!realtime_worker_is_eligible(false, false, true, &dao_codes));
        assert!(!realtime_worker_is_eligible(false, true, false, &dao_codes));
        assert!(!realtime_worker_is_eligible(false, true, true, &[]));
    }

    #[test]
    fn test_realtime_worker_gating_rejects_unmatched_allowlist() {
        let configured = vec!["other-dao".to_owned()];
        let allowlist = vec!["demo-dao".to_owned()];

        assert!(!realtime_worker_has_configured_dao_match(
            &configured,
            &allowlist
        ));
    }

    #[test]
    fn test_realtime_current_head_race_keeps_observed_head_unadvanced_for_tail_retry() {
        let report = RealtimeContractSetPassReport {
            dao_code: "demo-dao".to_owned(),
            chain_id: 1,
            contract_set_id: "demo-dao:1".to_owned(),
            latest_head: 105,
            range: Some((100, 105)),
            provisional: ProvisionalWorkerRunReport {
                current_head_race: true,
                ..Default::default()
            },
        };

        let observed_head = realtime_observed_head_after_pass(&report);

        assert_eq!(observed_head, None);
        assert_eq!(
            plan_realtime_tail_range(observed_head, 106, 100, 8),
            Some((100, 106))
        );
    }

    #[tokio::test]
    async fn test_realtime_pass_lease_allows_completion_after_query_deadline() {
        let mut registry = RealtimePassRegistry::default();
        let realtime = RealtimeRuntimeConfig {
            query_timeout: Duration::from_millis(5),
            pass_timeout: Duration::from_millis(20),
            ..Default::default()
        };

        let result =
            poll_realtime_pass_with_runtime(&mut registry, "demo-dao:1", 1, &realtime, || async {
                sleep(Duration::from_millis(10)).await;
                Ok::<_, runtime_anyhow::Error>(())
            })
            .await;

        assert!(matches!(result, RealtimePassPoll::Completed(())));
    }

    #[tokio::test]
    async fn test_realtime_pass_registry_times_out_without_starting_an_overlapping_pass() {
        let starts = Arc::new(AtomicUsize::new(0));
        let release = Arc::new(tokio::sync::Semaphore::new(0));
        let mut registry = RealtimePassRegistry::default();

        let mut pass = start_blocked_realtime_pass(starts.clone(), release.clone()).await;
        let started_at = Instant::now();
        let first = poll_realtime_pass_handle(&mut pass, Duration::from_millis(5)).await;
        assert!(matches!(first, RealtimePassPoll::TimedOut));
        assert!(started_at.elapsed() < Duration::from_millis(100));
        assert_eq!(starts.load(Ordering::SeqCst), 1);
        registry
            .passes
            .insert("demo-dao:1".to_owned(), RealtimePass::new(1, pass));

        let second = poll_realtime_pass(
            &mut registry,
            "demo-dao:1",
            1,
            Duration::from_millis(5),
            || async { panic!("an in-flight chain must not start another realtime pass") },
        )
        .await;
        assert!(matches!(second, RealtimePassPoll::InFlight));
        assert_eq!(starts.load(Ordering::SeqCst), 1);

        release.add_permits(1);
        let completed = tokio::time::timeout(Duration::from_millis(100), async {
            loop {
                let result = poll_realtime_pass(
                    &mut registry,
                    "demo-dao:1",
                    1,
                    Duration::from_millis(5),
                    || async {
                        panic!("completed pass must be collected before a new pass can start")
                    },
                )
                .await;
                if !matches!(result, RealtimePassPoll::InFlight) {
                    return result;
                }
                task::yield_now().await;
            }
        })
        .await
        .expect("timed out pass eventually completes");
        assert!(matches!(completed, RealtimePassPoll::Completed(())));
    }

    #[tokio::test]
    async fn test_realtime_pass_registry_allows_two_distinct_daos_on_one_chain_at_capacity_two() {
        let starts = Arc::new(AtomicUsize::new(0));
        let release = Arc::new(tokio::sync::Semaphore::new(0));
        let mut registry = RealtimePassRegistry::default();

        for key in ["dao-a:1", "dao-b:1"] {
            assert!(registry.has_capacity(1, 2, 2));
            let mut pass = start_blocked_realtime_pass(starts.clone(), release.clone()).await;
            let result = poll_realtime_pass_handle(&mut pass, Duration::from_millis(5)).await;
            assert!(matches!(result, RealtimePassPoll::TimedOut));
            registry
                .passes
                .insert(key.to_owned(), RealtimePass::new(1, pass));
        }

        assert_eq!(starts.load(Ordering::SeqCst), 2);
        assert_eq!(registry.len(), 2);
        release.add_permits(2);
    }

    #[tokio::test]
    async fn test_realtime_scheduler_starts_two_distinct_passes_at_global_capacity_two() {
        let starts = Arc::new(AtomicUsize::new(0));
        let release = Arc::new(tokio::sync::Semaphore::new(0));
        let mut registry = RealtimePassRegistry::default();

        assert!(registry.try_start("dao-a:1", 1, 2, 1, {
            let starts = starts.clone();
            let release = release.clone();
            move || async move {
                starts.fetch_add(1, Ordering::SeqCst);
                let _permit = release
                    .acquire()
                    .await
                    .expect("release semaphore remains open");
                Ok::<_, runtime_anyhow::Error>(())
            }
        },));
        assert!(registry.try_start("dao-b:2", 2, 2, 1, {
            let starts = starts.clone();
            let release = release.clone();
            move || async move {
                starts.fetch_add(1, Ordering::SeqCst);
                let _permit = release
                    .acquire()
                    .await
                    .expect("release semaphore remains open");
                Ok::<_, runtime_anyhow::Error>(())
            }
        },));

        tokio::time::timeout(Duration::from_millis(100), async {
            while starts.load(Ordering::SeqCst) != 2 {
                task::yield_now().await;
            }
        })
        .await
        .expect("both admitted realtime passes start without waiting for a lease");
        assert_eq!(registry.len(), 2);
        release.add_permits(2);
    }

    #[tokio::test]
    async fn test_realtime_scheduler_respects_per_chain_capacity_when_starting_passes() {
        let starts = Arc::new(AtomicUsize::new(0));
        let release = Arc::new(tokio::sync::Semaphore::new(0));
        let mut registry = RealtimePassRegistry::default();

        assert!(registry.try_start("dao-a:1", 1, 2, 1, {
            let starts = starts.clone();
            let release = release.clone();
            move || async move {
                starts.fetch_add(1, Ordering::SeqCst);
                let _permit = release
                    .acquire()
                    .await
                    .expect("release semaphore remains open");
                Ok::<_, runtime_anyhow::Error>(())
            }
        },));
        assert!(!registry.try_start("dao-b:1", 1, 2, 1, || async {
            panic!("per-chain capacity must prevent a second realtime pass")
        }));

        tokio::time::timeout(Duration::from_millis(100), async {
            while starts.load(Ordering::SeqCst) != 1 {
                task::yield_now().await;
            }
        })
        .await
        .expect("the admitted realtime pass starts");
        assert_eq!(registry.len(), 1);
        release.add_permits(1);
    }

    #[tokio::test]
    async fn test_realtime_scheduler_rotates_same_chain_admission_after_a_pass_completes() {
        let keys = ["dao-a:1", "dao-b:1"];
        let mut registry = RealtimePassRegistry::default();
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();

        assert!(registry.try_start("dao-a:1", 1, 1, 1, move || async move {
            started_tx
                .send(())
                .expect("first realtime pass start signal is received");
            Ok::<_, runtime_anyhow::Error>(())
        }));
        started_rx
            .await
            .expect("first realtime pass starts before it is reaped");

        let completed = tokio::time::timeout(Duration::from_millis(100), async {
            loop {
                let completed = registry.reap_finished().await;
                if !completed.is_empty() {
                    return completed;
                }
                task::yield_now().await;
            }
        })
        .await
        .expect("first realtime pass completes");
        assert_eq!(completed.len(), 1);

        let next_start = realtime_schedule_order(
            &keys,
            registry.last_started_keys(),
            registry.last_started_chain_id(),
            |key| *key,
            |_| 1,
        )[0];
        assert_eq!(keys[next_start], "dao-b:1");
        assert!(registry.try_start(keys[next_start], 1, 1, 1, || async {
            Ok::<_, runtime_anyhow::Error>(())
        }));
    }

    #[test]
    fn test_realtime_scheduler_keeps_waiting_chain_work_ahead_of_a_restarted_peer() {
        let contract_sets = [
            ("dao-a:1", 1),
            ("dao-c:2", 2),
            ("dao-b:1", 1),
            ("dao-d:2", 2),
        ];
        let last_started_keys =
            BTreeMap::from([(1, "dao-a:1".to_owned()), (2, "dao-d:2".to_owned())]);

        let order = realtime_schedule_order(
            &contract_sets,
            &last_started_keys,
            None,
            |(key, _)| *key,
            |(_, chain_id)| *chain_id,
        );

        let waiting_chain_work = order
            .iter()
            .position(|index| *index == 2)
            .expect("waiting same-chain work is scheduled");
        let restarted_peer = order
            .iter()
            .position(|index| *index == 0)
            .expect("previously started same-chain work is scheduled");

        assert!(waiting_chain_work < restarted_peer);
    }

    #[tokio::test]
    async fn test_realtime_scheduler_rotates_global_capacity_between_grouped_chains() {
        let contract_sets = [
            ("dao-a:1", 1),
            ("dao-b:1", 1),
            ("dao-c:2", 2),
            ("dao-d:2", 2),
        ];
        let mut registry = RealtimePassRegistry::default();
        assert!(registry.try_start("dao-a:1", 1, 1, 1, || async {
            Ok::<_, runtime_anyhow::Error>(())
        }));
        tokio::time::timeout(Duration::from_millis(100), async {
            loop {
                if !registry.reap_finished().await.is_empty() {
                    return;
                }
                task::yield_now().await;
            }
        })
        .await
        .expect("first chain pass completes");

        let after_chain_one = realtime_schedule_order(
            &contract_sets,
            registry.last_started_keys(),
            registry.last_started_chain_id(),
            |(key, _)| *key,
            |(_, chain_id)| *chain_id,
        );
        assert_eq!(after_chain_one[0], 2);
        assert!(registry.try_start("dao-c:2", 2, 1, 1, || async {
            Ok::<_, runtime_anyhow::Error>(())
        }));
        tokio::time::timeout(Duration::from_millis(100), async {
            loop {
                if !registry.reap_finished().await.is_empty() {
                    return;
                }
                task::yield_now().await;
            }
        })
        .await
        .expect("second chain pass completes");

        let after_chain_two = realtime_schedule_order(
            &contract_sets,
            registry.last_started_keys(),
            registry.last_started_chain_id(),
            |(key, _)| *key,
            |(_, chain_id)| *chain_id,
        );
        assert_eq!(after_chain_two[0], 1);
    }

    #[test]
    fn test_realtime_scheduler_interleaves_chains_after_global_rotation() {
        let contract_sets = [
            ("dao-a:1", 1),
            ("dao-b:1", 1),
            ("dao-c:2", 2),
            ("dao-d:2", 2),
        ];
        let last_started_keys = BTreeMap::from([(1, "dao-a:1".to_owned())]);

        let order = realtime_schedule_order(
            &contract_sets,
            &last_started_keys,
            Some(1),
            |(key, _)| *key,
            |(_, chain_id)| *chain_id,
        );

        assert_eq!(order, vec![2, 1, 3, 0]);
    }

    #[tokio::test]
    async fn test_realtime_pass_registry_rejects_second_dao_when_per_chain_capacity_is_one() {
        let release = Arc::new(tokio::sync::Semaphore::new(0));
        let mut registry = RealtimePassRegistry::default();
        let mut pass =
            start_blocked_realtime_pass(Arc::new(AtomicUsize::new(0)), release.clone()).await;
        let first = poll_realtime_pass_handle(&mut pass, Duration::from_millis(5)).await;
        assert!(matches!(first, RealtimePassPoll::TimedOut));
        registry
            .passes
            .insert("dao-a:1".to_owned(), RealtimePass::new(1, pass));
        assert!(!registry.has_capacity(1, 2, 1));
        release.add_permits(1);
    }

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
            onchain_refresh_deferred_drain_enabled: false,
            onchain_refresh_deferred_drain_batch_size: 100,
            proposal_timestamp_backfill: Default::default(),
            provisional: ProvisionalRuntimeConfig {
                enabled: false,
                finality: DatalensProvisionalFinality::SafeToLatest,
            },
            realtime: Default::default(),
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

    #[test]
    fn test_provisional_worker_runtime_disabled_skips_reader_and_store() {
        let runtime = contract_runtime(ProvisionalRuntimeConfig {
            enabled: false,
            finality: DatalensProvisionalFinality::SafeToLatest,
        });
        let config = datalens_config();
        let contracts = dao_contracts();
        let mut reader = RecordingProvisionalReader::default();
        let mut store = RecordingProvisionalSegmentStore::default();

        let result = run_provisional_worker_once(
            &runtime,
            &config,
            &contracts,
            &runner_report_with_remaining_blocks(0),
            &mut reader,
            &mut store,
        )
        .expect("disabled provisional worker skips cleanly");

        assert_eq!(result.segments_written, None);
        assert_eq!(result.latest_height, None);
        assert_eq!(reader.latest_head_calls, 0);
        assert!(reader.finalities.is_empty());
        assert!(store.writes.is_empty());
    }

    #[test]
    fn test_provisional_worker_runtime_enabled_runs_safe_to_latest_path() {
        let runtime = contract_runtime(ProvisionalRuntimeConfig {
            enabled: true,
            finality: DatalensProvisionalFinality::SafeToLatest,
        });
        let config = datalens_config();
        let contracts = dao_contracts();
        let mut reader =
            RecordingProvisionalReader::with_segments(vec![DatalensProvisionalCacheSegment {
                source: "provider".to_owned(),
                finality: "safe_to_latest".to_owned(),
                range_start_block: 21,
                range_end_block: 25,
                anchor_block_number: Some(25),
                anchor_block_hash: Some("0xanchor".to_owned()),
                anchor_parent_hash: Some("0xparent".to_owned()),
                anchor_block_timestamp: Some(1_700_000_000),
            }]);
        let mut store = RecordingProvisionalSegmentStore::default();

        let result = run_provisional_worker_once(
            &runtime,
            &config,
            &contracts,
            &runner_report_with_remaining_blocks(0),
            &mut reader,
            &mut store,
        )
        .expect("enabled provisional worker runs");

        assert_eq!(result.segments_written, Some(1));
        assert_eq!(result.latest_height, Some(25));
        assert_eq!(reader.latest_head_calls, 1);
        assert_eq!(reader.ranges.len(), 1);
        assert!(reader.ranges.iter().all(|range| *range == (21, 25)));
        assert_eq!(reader.finalities.len(), 1);
        assert!(
            reader
                .finalities
                .iter()
                .all(|finality| finality.as_deref() == Some("safe_to_latest"))
        );
        assert_eq!(store.writes.len(), 1);
        assert_eq!(store.writes[0].segment_finality, "safe_to_latest");
        assert_eq!(store.writes[0].range_start_block, 21);
        assert_eq!(store.writes[0].range_end_block, 25);
    }

    #[test]
    fn test_provisional_worker_range_path_reuses_safe_to_latest_projection() {
        let runtime = contract_runtime(ProvisionalRuntimeConfig {
            enabled: true,
            finality: DatalensProvisionalFinality::SafeToLatest,
        });
        let config = datalens_config();
        let contracts = dao_contracts();
        let mut reader =
            RecordingProvisionalReader::with_segments(vec![DatalensProvisionalCacheSegment {
                source: "provider".to_owned(),
                finality: "safe_to_latest".to_owned(),
                range_start_block: 17,
                range_end_block: 19,
                anchor_block_number: Some(19),
                anchor_block_hash: Some("0xanchor".to_owned()),
                anchor_parent_hash: Some("0xparent".to_owned()),
                anchor_block_timestamp: Some(1_700_000_000),
            }]);
        let mut store = RecordingProvisionalSegmentStore::default();

        let result = run_provisional_worker_for_range(
            &runtime,
            &config,
            &contracts,
            17,
            19,
            19,
            &mut reader,
            &mut store,
        )
        .expect("range path writes provisional overlays");

        assert_eq!(result.segments_written, Some(1));
        assert_eq!(reader.latest_head_calls, 0);
        assert_eq!(reader.ranges, vec![(17, 19)]);
        assert_eq!(reader.finalities, vec![Some("safe_to_latest".to_owned())]);
        assert_eq!(store.writes.len(), 1);
    }

    #[test]
    fn test_provisional_worker_runtime_skips_until_durable_pass_catches_up() {
        let runtime = contract_runtime(ProvisionalRuntimeConfig {
            enabled: true,
            finality: DatalensProvisionalFinality::SafeToLatest,
        });
        let config = datalens_config();
        let contracts = dao_contracts();
        let mut reader = RecordingProvisionalReader::default();
        let mut store = RecordingProvisionalSegmentStore::default();

        let result = run_provisional_worker_once(
            &runtime,
            &config,
            &contracts,
            &runner_report_with_remaining_blocks(1),
            &mut reader,
            &mut store,
        )
        .expect("provisional worker skips while durable pass is behind");

        assert_eq!(result.segments_written, None);
        assert_eq!(result.latest_height, Some(25));
        assert_eq!(reader.latest_head_calls, 1);
        assert!(reader.finalities.is_empty());
        assert!(reader.ranges.is_empty());
        assert!(store.writes.is_empty());
    }

    #[test]
    fn test_provisional_worker_runtime_ignores_current_head_race() {
        let runtime = contract_runtime(ProvisionalRuntimeConfig {
            enabled: true,
            finality: DatalensProvisionalFinality::SafeToLatest,
        });
        let config = datalens_config();
        let contracts = dao_contracts();
        let mut reader = RecordingProvisionalReader::with_error(DatalensError::Query(
            r#"Datalens HTTP 400 invalid_input: "block range extends beyond current head block""#
                .to_owned(),
        ));
        let mut store = RecordingProvisionalSegmentStore::default();

        let result = run_provisional_worker_once(
            &runtime,
            &config,
            &contracts,
            &runner_report_with_remaining_blocks(0),
            &mut reader,
            &mut store,
        )
        .expect("current head race skips provisional worker run");

        assert_eq!(result.segments_written, None);
        assert_eq!(result.latest_height, Some(25));
        assert_eq!(reader.latest_head_calls, 1);
        assert_eq!(reader.ranges, vec![(21, 25)]);
        assert_eq!(reader.finalities, vec![Some("safe_to_latest".to_owned())]);
        assert!(store.writes.is_empty());
    }

    #[test]
    fn test_provisional_worker_runtime_keeps_other_datalens_query_errors() {
        let runtime = contract_runtime(ProvisionalRuntimeConfig {
            enabled: true,
            finality: DatalensProvisionalFinality::SafeToLatest,
        });
        let config = datalens_config();
        let contracts = dao_contracts();
        let mut reader = RecordingProvisionalReader::with_error(DatalensError::Query(
            "Datalens HTTP 400 invalid_input: selector is invalid".to_owned(),
        ));
        let mut store = RecordingProvisionalSegmentStore::default();

        let error = run_provisional_worker_once(
            &runtime,
            &config,
            &contracts,
            &runner_report_with_remaining_blocks(0),
            &mut reader,
            &mut store,
        )
        .expect_err("unrelated query errors still fail");

        assert!(
            error
                .to_string()
                .contains("provisional Datalens query error"),
            "{error:#}"
        );
        assert_eq!(reader.latest_head_calls, 1);
        assert_eq!(reader.ranges, vec![(21, 25)]);
        assert!(store.writes.is_empty());
    }

    #[test]
    fn test_datalens_query_error_is_current_head_race_is_narrow() {
        assert!(datalens_query_error_is_current_head_race(
            r#"Datalens HTTP 400 invalid_input: "block range extends beyond current head block""#
        ));
        assert!(!datalens_query_error_is_current_head_race(
            "Datalens HTTP 400 invalid_input: selector is invalid"
        ));
        assert!(!datalens_query_error_is_current_head_race(
            "Datalens HTTP 400 provider_timeout: block range extends beyond current head block"
        ));
    }

    fn contract_runtime_for_chunk_budget(
        max_chunks_per_run: Option<u64>,
    ) -> IndexerContractSetRuntimeConfig {
        IndexerContractSetRuntimeConfig {
            dao_code: "demo-dao".to_owned(),
            start_block: 0,
            target_height: 10_000_000,
            checkpoint_contract_set_id: "demo-dao:v1".to_owned(),
            checkpoint_stream_id: "datalens-native".to_owned(),
            data_source_version: "datalens-v1".to_owned(),
            query_max_attempts: 1,
            datalens_query_concurrency: Default::default(),
            contract_set_max_concurrency: crate::ContractSetConcurrencyLimit::Unlimited,
            contract_set_per_chain_max_concurrency: crate::ContractSetConcurrencyLimit::Unlimited,
            progress_refresh_lag_blocks: 100,
            adaptive_chunk_sizer: Default::default(),
            max_chunks_per_run,
            onchain_refresh_tick: Default::default(),
            onchain_refresh_deferred_drain_enabled: false,
            onchain_refresh_deferred_drain_batch_size: 100,
            proposal_timestamp_backfill: Default::default(),
            provisional: ProvisionalRuntimeConfig {
                enabled: false,
                finality: DatalensProvisionalFinality::SafeToLatest,
            },
        }
    }

    fn contract_runtime(provisional: ProvisionalRuntimeConfig) -> IndexerContractSetRuntimeConfig {
        IndexerContractSetRuntimeConfig {
            dao_code: "demo-dao".to_owned(),
            start_block: 10,
            target_height: 20,
            checkpoint_contract_set_id: "demo-set".to_owned(),
            checkpoint_stream_id: "datalens-native".to_owned(),
            data_source_version: "datalens-v1".to_owned(),
            query_max_attempts: 1,
            datalens_query_concurrency: Default::default(),
            contract_set_max_concurrency: crate::ContractSetConcurrencyLimit::Unlimited,
            contract_set_per_chain_max_concurrency: crate::ContractSetConcurrencyLimit::Unlimited,
            progress_refresh_lag_blocks: 100,
            adaptive_chunk_sizer: Default::default(),
            max_chunks_per_run: None,
            onchain_refresh_tick: Default::default(),
            onchain_refresh_deferred_drain_enabled: false,
            onchain_refresh_deferred_drain_batch_size: 100,
            proposal_timestamp_backfill: Default::default(),
            provisional,
        }
    }

    fn runner_report_with_remaining_blocks(remaining_blocks: i64) -> IndexerRunnerReport {
        IndexerRunnerReport {
            chunks_processed: 1,
            shutdown_requested: false,
            last_progress: IndexerRunnerProgress {
                processed_height: Some(100),
                target_height: 100 + remaining_blocks,
                synced_percentage: if remaining_blocks == 0 { 100.0 } else { 50.0 },
                configured_start_block: 0,
                remaining_blocks,
                configured_range_synced_percentage: if remaining_blocks == 0 {
                    100.0
                } else {
                    50.0
                },
                current_rate_blocks_per_second: None,
                eta_seconds: None,
                onchain_refresh_allowed: true,
            },
        }
    }

    fn datalens_config() -> DatalensConfig {
        DatalensConfig {
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
        }
    }

    fn dao_contracts() -> DaoContractAddresses {
        DaoContractAddresses {
            governor: "0x0000000000000000000000000000000000000100".to_owned(),
            governor_token: "0x0000000000000000000000000000000000000200".to_owned(),
            timelock: None,
            governor_token_standard: GovernanceTokenStandard::Erc20,
        }
    }

    #[test]
    fn test_all_mode_contract_set_runtime_preserves_enqueue_only_onchain_refresh() {
        let runtime = runtime_for_warmup_concurrency();
        let contract_set = crate::DatalensRuntimeContractSet {
            dao_code: "demo-dao".to_owned(),
            contract_set_id: "demo-dao:1:governor".to_owned(),
            contract: crate::DatalensContractSetConfig {
                dao_code: Some("demo-dao".to_owned()),
                chain_id: 1,
                network_name: "ethereum".to_owned(),
                governor: "0x0000000000000000000000000000000000000001".to_owned(),
                governor_token: "0x0000000000000000000000000000000000000002".to_owned(),
                governor_token_standard: crate::GovernanceTokenStandard::Erc20,
                timelock: None,
                start_block: 1,
            },
            config: DatalensConfig {
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
            },
            addresses: crate::DaoContractAddresses {
                governor: "0x0000000000000000000000000000000000000001".to_owned(),
                governor_token: "0x0000000000000000000000000000000000000002".to_owned(),
                timelock: None,
                governor_token_standard: crate::GovernanceTokenStandard::Erc20,
            },
        };

        let contract_runtime = runtime
            .for_configured_contract_set_at_target(&contract_set, 100)
            .expect("contract runtime builds");
        let options = contract_runtime
            .options(&contract_set.config, &contract_set.addresses)
            .expect("runner options build");

        assert!(!contract_runtime.onchain_refresh_tick.enabled);
        assert!(!contract_runtime.onchain_refresh_deferred_drain_enabled);
        assert!(!options.onchain_refresh_deferred_drain_enabled);
    }

    #[test]
    fn test_warmup_startup_concurrency_uses_query_limit_without_exceeding_contract_sets() {
        let mut runtime = runtime_for_warmup_concurrency();
        runtime.datalens_query_concurrency.global_max_in_flight = Some(8);

        assert_eq!(warmup_startup_global_concurrency(&runtime, 50), 8);
        assert_eq!(warmup_startup_global_concurrency(&runtime, 3), 3);
    }

    #[test]
    fn test_warmup_startup_concurrency_defaults_to_bounded_parallelism() {
        let runtime = runtime_for_warmup_concurrency();

        assert_eq!(warmup_startup_global_concurrency(&runtime, 50), 4);
        assert_eq!(warmup_startup_global_concurrency(&runtime, 0), 1);
    }

    #[test]
    fn test_warmup_startup_global_concurrency_does_not_use_per_chain_limit() {
        let mut runtime = runtime_for_warmup_concurrency();
        runtime.datalens_query_concurrency.per_chain_max_in_flight = Some(1);

        assert_eq!(warmup_startup_global_concurrency(&runtime, 50), 4);
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
                                                return Err::<(), _>(ContractSetPassError::setup(
                                                    error,
                                                ));
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

    fn runtime_for_warmup_concurrency() -> IndexerRuntimeConfig {
        IndexerRuntimeConfig {
            dao_filter: None,
            contract_set_mode: crate::IndexerContractSetMode::All,
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
            onchain_refresh_deferred_drain_enabled: false,
            onchain_refresh_deferred_drain_batch_size: 100,
            proposal_timestamp_backfill: Default::default(),
            provisional: ProvisionalRuntimeConfig {
                enabled: false,
                finality: DatalensProvisionalFinality::SafeToLatest,
            },
            realtime: Default::default(),
        }
    }

    #[derive(Default)]
    struct RecordingProvisionalReader {
        finalities: Vec<Option<String>>,
        latest_head_calls: usize,
        ranges: Vec<(u64, u64)>,
        next_error: Option<DatalensError>,
        next_segments: Vec<DatalensProvisionalCacheSegment>,
    }

    impl RecordingProvisionalReader {
        fn with_segments(next_segments: Vec<DatalensProvisionalCacheSegment>) -> Self {
            Self {
                finalities: Vec::new(),
                latest_head_calls: 0,
                ranges: Vec::new(),
                next_error: None,
                next_segments,
            }
        }

        fn with_error(next_error: DatalensError) -> Self {
            Self {
                next_error: Some(next_error),
                ..Default::default()
            }
        }
    }

    impl DatalensDurableHeadReader for RecordingProvisionalReader {
        fn durable_head_height(
            &mut self,
            _config: &DatalensConfig,
        ) -> std::result::Result<i64, DatalensError> {
            Ok(20)
        }

        fn latest_head_height(
            &mut self,
            _config: &DatalensConfig,
        ) -> std::result::Result<i64, DatalensError> {
            self.latest_head_calls += 1;
            Ok(25)
        }
    }

    impl DatalensProvisionalLogQueryReader for RecordingProvisionalReader {
        fn query_provisional_logs(
            &mut self,
            input: QueryInput,
        ) -> std::result::Result<DatalensProvisionalLogQueryResult, DatalensError> {
            self.finalities.push(input.finality);
            self.ranges.push((input.range.start, input.range.end));
            if let Some(error) = self.next_error.take() {
                return Err(error);
            }
            let segments = std::mem::take(&mut self.next_segments);

            Ok(DatalensProvisionalLogQueryResult {
                rows: serde_json::json!([]),
                segments,
            })
        }
    }

    #[derive(Default)]
    struct RecordingProvisionalSegmentStore {
        writes: Vec<DatalensProvisionalSegmentWrite>,
        vote_writes: Vec<ProvisionalVoteCastGroupOverlayWrite>,
    }

    impl DatalensProvisionalSegmentStore for RecordingProvisionalSegmentStore {
        type Error = String;

        fn write_provisional_segments(
            &mut self,
            segments: &[DatalensProvisionalSegmentWrite],
        ) -> std::result::Result<(), Self::Error> {
            self.writes.extend_from_slice(segments);
            Ok(())
        }
    }

    impl ProvisionalProposalOverlayStore for RecordingProvisionalSegmentStore {
        type Error = String;

        fn write_proposal_overlays(
            &mut self,
            _proposals: &[ProvisionalProposalOverlayWrite],
            _proposal_events: &[ProvisionalProposalEventOverlayWrite],
            _timelocks: &[ProvisionalTimelockOperationOverlayWrite],
        ) -> std::result::Result<(), Self::Error> {
            Ok(())
        }
    }

    impl ProvisionalVoteOverlayStore for RecordingProvisionalSegmentStore {
        type Error = String;

        fn write_vote_overlays(
            &mut self,
            votes: &[ProvisionalVoteCastGroupOverlayWrite],
        ) -> std::result::Result<(), Self::Error> {
            self.vote_writes.extend_from_slice(votes);
            Ok(())
        }
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
