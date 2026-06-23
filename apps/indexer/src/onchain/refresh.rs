use std::{
    collections::{BTreeMap, BTreeSet},
    fmt,
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use ethabi::{ParamType, Token, decode, encode, ethereum_types::U256};
use serde::Deserialize;
use serde_json::json;
use sha3::{Digest, Keccak256};
use sqlx::{PgPool, Postgres, QueryBuilder, Row, Transaction};
use thiserror::Error;

use crate::{
    BatchReadPlanConfig, BlockReadMode, ChainContracts, ChainReadExecutionReport, ChainReadFailure,
    ChainReadFailureKind, ChainReadKey, ChainReadMethod, ChainReadMetrics, ChainReadPlan,
    ChainReadPlanBuilder, ChainReadRequest, ChainReadResult, ChainReadValue, ChainTool,
    MulticallReadGroup, PartialChainReadFailureReport, ProvisionalContributorPowerOverlayWrite,
    ProvisionalDelegatePowerOverlayRelation, ProvisionalDelegatePowerOverlayWrite,
    ProvisionalPowerOverlayScope, ProvisionalPowerOverlayStore, ReadRequirement,
    store::postgres::{
        drain_deferred_onchain_refresh_tasks, drain_deferred_onchain_refresh_tasks_for_scope,
        repair_missing_onchain_refresh_contributor_coverage,
        repair_missing_onchain_refresh_contributor_coverage_for_scope,
    },
};

pub const DEFAULT_ONCHAIN_REFRESH_APPLY_BATCH_SIZE: usize = 200;
pub const MAX_ONCHAIN_REFRESH_APPLY_BATCH_SIZE: usize = 1_000;
const DEFAULT_ONCHAIN_REFRESH_MAX_ATTEMPTS: i32 = 3;
const MAX_ONCHAIN_REFRESH_APPLY_ROWS: usize = MAX_ONCHAIN_REFRESH_APPLY_BATCH_SIZE;
const MAX_ONCHAIN_REFRESH_EXHAUSTED_ARCHIVE_ROWS: i64 = 200;
const MAX_ONCHAIN_REFRESH_DATA_METRIC_REFRESH_ROWS: usize = 200;
const ONCHAIN_REFRESH_APPLY_MAX_ATTEMPTS: usize = 3;
const ONCHAIN_REFRESH_APPLY_RETRY_BASE_DELAY_MS: u64 = 50;
const MULTICALL3_ADDRESS: &str = "0xca11bde05977b3631167028862be2a173976ca11";
type OnchainRefreshApplyFuture<'a, T> =
    Pin<Box<dyn Future<Output = Result<T, OnchainRefreshWorkerError>> + 'a>>;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OnchainRefreshWorkerConfig {
    pub batch_size: usize,
    pub apply_batch_size: usize,
    pub max_attempts: i32,
    pub deferred_drain_batch_size: usize,
    pub debounce: Duration,
    pub lock_ttl: Duration,
    pub retry_delay: Duration,
    pub lock_owner: String,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct OnchainRefreshRunReport {
    pub claimed: usize,
    pub completed: usize,
    pub failed: usize,
    pub skipped_tasks: usize,
    pub rpc_error_failures: usize,
    pub validation_failures: usize,
    pub db_update_failures: usize,
    pub unique_accounts: usize,
    pub rpc_reads_requested: usize,
    pub rpc_reads_deduped: usize,
    pub cache_hits: usize,
    pub debounced_tasks: usize,
    pub data_metric_refreshes: usize,
    pub apply_chunks: usize,
    pub apply_batch_size: usize,
    pub duration_ms: u128,
    pub backlog: Option<u64>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OnchainRefreshTaskScope {
    pub chain_id: i32,
    pub contract_set_id: String,
    pub dao_code: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum OnchainRefreshClaimQueue {
    Pending,
    FailedRetry,
    StaleProcessing,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OnchainRefreshTickConfig {
    pub enabled: bool,
    pub max_tasks_per_tick: usize,
    pub max_tasks_per_run: usize,
    pub max_duration_per_tick: Duration,
    pub min_blocks_between_ticks: i64,
}

impl Default for OnchainRefreshTickConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            max_tasks_per_tick: 10,
            max_tasks_per_run: 10,
            max_duration_per_tick: Duration::from_millis(500),
            min_blocks_between_ticks: 100,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum OnchainRefreshTickSkipReason {
    Disabled,
    EmptyQueue,
    MinBlocks,
    TaskBudgetZero,
    DurationBudgetZero,
}

impl fmt::Display for OnchainRefreshTickSkipReason {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Disabled => formatter.write_str("disabled"),
            Self::EmptyQueue => formatter.write_str("empty_queue"),
            Self::MinBlocks => formatter.write_str("min_blocks"),
            Self::TaskBudgetZero => formatter.write_str("task_budget_zero"),
            Self::DurationBudgetZero => formatter.write_str("duration_budget_zero"),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OnchainRefreshTickReport {
    pub processed: usize,
    pub claimed: usize,
    pub completed: usize,
    pub failed: usize,
    pub skipped_tasks: usize,
    pub rpc_error_failures: usize,
    pub validation_failures: usize,
    pub db_update_failures: usize,
    pub cache_hits: usize,
    pub debounced_tasks: usize,
    pub duration: Duration,
    pub task_budget_hit: bool,
    pub duration_budget_hit: bool,
    pub skipped: Option<OnchainRefreshTickSkipReason>,
    pub backlog: Option<u64>,
}

pub trait OnchainRefreshTickClock {
    fn reset(&mut self) {}

    fn elapsed(&mut self) -> Duration;
}

#[derive(Clone, Debug, Default)]
pub struct SystemOnchainRefreshTickClock {
    started_at: Option<std::time::Instant>,
}

impl OnchainRefreshTickClock for SystemOnchainRefreshTickClock {
    fn reset(&mut self) {
        self.started_at = Some(std::time::Instant::now());
    }

    fn elapsed(&mut self) -> Duration {
        let started_at = self.started_at.get_or_insert_with(std::time::Instant::now);
        started_at.elapsed()
    }
}

pub trait OnchainRefreshTickRunner {
    type Error: fmt::Display;

    fn run_once(&mut self, max_tasks: usize) -> Result<OnchainRefreshRunReport, Self::Error>;

    fn backlog(&mut self) -> Option<u64> {
        None
    }
}

#[derive(Clone, Debug)]
pub struct OnchainRefreshTickScheduler<C = SystemOnchainRefreshTickClock> {
    config: OnchainRefreshTickConfig,
    clock: C,
    last_tick_block: Option<i64>,
}

impl OnchainRefreshTickScheduler<SystemOnchainRefreshTickClock> {
    pub fn from_config(config: OnchainRefreshTickConfig) -> Self {
        Self::new(config, SystemOnchainRefreshTickClock::default())
    }
}

impl<C> OnchainRefreshTickScheduler<C>
where
    C: OnchainRefreshTickClock,
{
    pub fn new(config: OnchainRefreshTickConfig, clock: C) -> Self {
        Self {
            config,
            clock,
            last_tick_block: None,
        }
    }

    pub fn run_tick<R>(
        &mut self,
        processed_block: i64,
        runner: &mut R,
    ) -> Result<OnchainRefreshTickReport, R::Error>
    where
        R: OnchainRefreshTickRunner,
    {
        if !self.config.enabled {
            return Ok(self.skipped(OnchainRefreshTickSkipReason::Disabled, runner.backlog()));
        }
        if self.config.max_tasks_per_tick == 0 {
            return Ok(self.skipped(
                OnchainRefreshTickSkipReason::TaskBudgetZero,
                runner.backlog(),
            ));
        }
        if self.config.max_tasks_per_run == 0 {
            return Ok(self.skipped(
                OnchainRefreshTickSkipReason::TaskBudgetZero,
                runner.backlog(),
            ));
        }
        if self.config.max_duration_per_tick.is_zero() {
            return Ok(self.skipped(
                OnchainRefreshTickSkipReason::DurationBudgetZero,
                runner.backlog(),
            ));
        }
        if self.last_tick_block.is_some_and(|last_tick_block| {
            processed_block.saturating_sub(last_tick_block) < self.config.min_blocks_between_ticks
        }) {
            return Ok(self.skipped(OnchainRefreshTickSkipReason::MinBlocks, runner.backlog()));
        }

        let mut report = OnchainRefreshTickReport {
            processed: 0,
            claimed: 0,
            completed: 0,
            failed: 0,
            duration: Duration::ZERO,
            task_budget_hit: false,
            duration_budget_hit: false,
            skipped_tasks: 0,
            rpc_error_failures: 0,
            validation_failures: 0,
            db_update_failures: 0,
            cache_hits: 0,
            debounced_tasks: 0,
            skipped: None,
            backlog: None,
        };
        self.clock.reset();

        loop {
            report.duration = self.clock.elapsed();
            if report.duration >= self.config.max_duration_per_tick {
                report.duration_budget_hit = true;
                break;
            }

            let remaining = self
                .config
                .max_tasks_per_tick
                .saturating_sub(report.processed);
            if remaining == 0 {
                report.task_budget_hit = true;
                break;
            }

            let run_budget = remaining.min(self.config.max_tasks_per_run);
            let batch = runner.run_once(run_budget)?;
            if batch.claimed == 0 {
                report.skipped =
                    (report.processed == 0).then_some(OnchainRefreshTickSkipReason::EmptyQueue);
                break;
            }

            let consumed = batch.claimed.min(run_budget);
            let completed = batch.completed.min(consumed);
            let failed = batch.failed.min(consumed.saturating_sub(completed));
            report.processed += consumed;
            report.claimed += consumed;
            report.completed += completed;
            report.failed += failed;
            report.skipped_tasks += batch.skipped_tasks;
            report.rpc_error_failures += batch.rpc_error_failures;
            report.validation_failures += batch.validation_failures;
            report.db_update_failures += batch.db_update_failures;
            report.cache_hits += batch.cache_hits;
            report.debounced_tasks += batch.debounced_tasks;
        }

        report.duration = self.clock.elapsed();
        report.backlog = runner.backlog();
        if report.claimed > 0
            || report.task_budget_hit
            || (report.duration_budget_hit && report.claimed > 0)
        {
            self.last_tick_block = Some(processed_block);
        }

        Ok(report)
    }

    fn skipped(
        &mut self,
        reason: OnchainRefreshTickSkipReason,
        backlog: Option<u64>,
    ) -> OnchainRefreshTickReport {
        OnchainRefreshTickReport {
            processed: 0,
            claimed: 0,
            completed: 0,
            failed: 0,
            skipped_tasks: 0,
            rpc_error_failures: 0,
            validation_failures: 0,
            db_update_failures: 0,
            cache_hits: 0,
            debounced_tasks: 0,
            duration: Duration::ZERO,
            task_budget_hit: false,
            duration_budget_hit: false,
            skipped: Some(reason),
            backlog,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OnchainRefreshTask {
    pub id: String,
    pub contract_set_id: String,
    pub chain_id: i32,
    pub dao_code: Option<String>,
    pub governor_address: String,
    pub token_address: String,
    pub account: String,
    pub refresh_balance: bool,
    pub refresh_power: bool,
    pub last_seen_block_number: String,
    pub last_seen_block_timestamp: String,
    pub last_seen_transaction_hash: String,
    pub attempts: i32,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct OnchainRefreshReadValue {
    pub task_id: String,
    pub balance: Option<String>,
    pub power: Option<String>,
    pub checkpoint_balance: Option<String>,
    pub checkpoint_power: Option<String>,
}

impl OnchainRefreshReadValue {
    fn balance_for_current_update(&self) -> Option<&str> {
        self.balance
            .as_deref()
            .or(self.checkpoint_balance.as_deref())
    }

    fn power_for_current_update(&self) -> Option<&str> {
        self.power.as_deref().or(self.checkpoint_power.as_deref())
    }
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct OnchainRefreshReadReport {
    pub values: Vec<OnchainRefreshReadValue>,
    pub failures: Vec<OnchainRefreshReadFailure>,
    pub rpc_reads_requested: usize,
    pub rpc_reads_deduped: usize,
    pub cache_hits: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OnchainRefreshReadFailure {
    pub task_id: String,
    pub message: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OnchainRefreshReaderError {
    message: String,
}

impl OnchainRefreshReaderError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for OnchainRefreshReaderError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for OnchainRefreshReaderError {}

pub trait OnchainRefreshReader: Clone + Send + Sync + 'static {
    fn read_tasks(
        &self,
        tasks: &[OnchainRefreshTask],
    ) -> Result<Vec<OnchainRefreshReadValue>, OnchainRefreshReaderError>;

    fn read_tasks_with_report(
        &self,
        tasks: &[OnchainRefreshTask],
    ) -> Result<OnchainRefreshReadReport, OnchainRefreshReaderError> {
        Ok(OnchainRefreshReadReport {
            values: self.read_tasks(tasks)?,
            ..OnchainRefreshReadReport::default()
        })
    }
}

#[derive(Debug, Error)]
pub enum OnchainRefreshWorkerError {
    #[error("onchain refresh database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("onchain refresh deferred drain error: {0}")]
    DeferredDrain(String),
    #[error("onchain refresh reader error: {0}")]
    Reader(#[from] OnchainRefreshReaderError),
    #[error("onchain refresh batch size exceeds i64")]
    BatchSizeOverflow,
    #[error("onchain refresh task {task_id} is missing {field}")]
    MissingReadValue {
        task_id: String,
        field: &'static str,
    },
}

#[derive(Debug, Error)]
pub enum LivePowerOverlayRefreshError {
    #[error("live power overlay reader error: {0}")]
    Reader(#[from] OnchainRefreshReaderError),
    #[error("live power overlay store error: {0}")]
    Store(String),
}

#[derive(Clone)]
pub struct OnchainRefreshWorker<R> {
    pool: PgPool,
    config: OnchainRefreshWorkerConfig,
    reader: R,
    current_power_method: ChainReadMethod,
}

impl<R> OnchainRefreshWorker<R>
where
    R: OnchainRefreshReader,
{
    pub fn new(pool: PgPool, config: OnchainRefreshWorkerConfig, reader: R) -> Self {
        Self {
            pool,
            config,
            reader,
            current_power_method: ChainReadMethod::GetVotes,
        }
    }

    pub fn with_current_power_method(mut self, current_power_method: ChainReadMethod) -> Self {
        self.current_power_method = current_power_method;
        self
    }

    pub async fn run_once(&self) -> Result<OnchainRefreshRunReport, OnchainRefreshWorkerError> {
        self.run_once_with_batch_size_and_scope(self.config.batch_size, None, false)
            .await
    }

    pub async fn run_once_with_batch_size(
        &self,
        batch_size: usize,
    ) -> Result<OnchainRefreshRunReport, OnchainRefreshWorkerError> {
        self.run_once_with_batch_size_and_scope(batch_size, None, true)
            .await
    }

    pub async fn run_once_with_batch_size_for_scope(
        &self,
        batch_size: usize,
        scope: &OnchainRefreshTaskScope,
    ) -> Result<OnchainRefreshRunReport, OnchainRefreshWorkerError> {
        self.run_once_with_batch_size_and_scope(batch_size, Some(scope), true)
            .await
    }

    pub async fn run_once_with_batch_size_for_scope_without_backlog(
        &self,
        batch_size: usize,
        scope: &OnchainRefreshTaskScope,
    ) -> Result<OnchainRefreshRunReport, OnchainRefreshWorkerError> {
        self.run_once_with_batch_size_and_scope(batch_size, Some(scope), false)
            .await
    }

    async fn run_once_with_batch_size_and_scope(
        &self,
        batch_size: usize,
        scope: Option<&OnchainRefreshTaskScope>,
        include_backlog: bool,
    ) -> Result<OnchainRefreshRunReport, OnchainRefreshWorkerError> {
        let started_at = Instant::now();
        let now_ms = unix_time_millis();
        let deferred_drain_started_at = Instant::now();
        let deferred_drain_target =
            worker_deferred_drain_target(self.config.deferred_drain_batch_size, batch_size);
        self.archive_exhausted_tasks(now_ms).await?;
        let deferred_drain_count = self
            .drain_deferred_onchain_refresh_backlog(deferred_drain_target, scope)
            .await?;
        if deferred_drain_count > 0 {
            log::info!(
                "onchain refresh worker materialized deferred tasks dao_code={} chain_id={} contract_set_id={} deferred_drain_count={} deferred_drain_batch_size={} deferred_drain_target={} deferred_drain_duration_ms={}",
                scope
                    .map(|scope| scope.dao_code.as_str())
                    .unwrap_or("global"),
                scope
                    .map(|scope| scope.chain_id.to_string())
                    .unwrap_or_else(|| "global".to_owned()),
                scope
                    .map(|scope| scope.contract_set_id.as_str())
                    .unwrap_or("global"),
                deferred_drain_count,
                self.config.deferred_drain_batch_size,
                deferred_drain_target,
                deferred_drain_started_at.elapsed().as_millis()
            );
        }
        let mut tasks = self.claim_tasks(now_ms, batch_size, scope).await?;
        if tasks.is_empty() {
            let coverage_repair_count = self
                .repair_missing_contributor_coverage(deferred_drain_target, scope)
                .await?;
            if coverage_repair_count > 0 {
                log::info!(
                    "onchain refresh worker repaired contributor coverage dao_code={} chain_id={} contract_set_id={} repaired_count={} repair_batch_size={}",
                    scope
                        .map(|scope| scope.dao_code.as_str())
                        .unwrap_or("global"),
                    scope
                        .map(|scope| scope.chain_id.to_string())
                        .unwrap_or_else(|| "global".to_owned()),
                    scope
                        .map(|scope| scope.contract_set_id.as_str())
                        .unwrap_or("global"),
                    coverage_repair_count,
                    deferred_drain_target
                );
                let repaired_deferred_drain_count = self
                    .drain_deferred_onchain_refresh_backlog(deferred_drain_target, scope)
                    .await?;
                if repaired_deferred_drain_count > 0 {
                    log::info!(
                        "onchain refresh worker materialized repaired contributor coverage dao_code={} chain_id={} contract_set_id={} deferred_drain_count={} deferred_drain_target={}",
                        scope
                            .map(|scope| scope.dao_code.as_str())
                            .unwrap_or("global"),
                        scope
                            .map(|scope| scope.chain_id.to_string())
                            .unwrap_or_else(|| "global".to_owned()),
                        scope
                            .map(|scope| scope.contract_set_id.as_str())
                            .unwrap_or("global"),
                        repaired_deferred_drain_count,
                        deferred_drain_target
                    );
                }
                tasks = self.claim_tasks(now_ms, batch_size, scope).await?;
            }
        }
        if tasks.is_empty() {
            let data_metric_refreshes = self.drain_data_metric_refresh_tasks(now_ms).await?;
            return Ok(OnchainRefreshRunReport {
                data_metric_refreshes,
                ..OnchainRefreshRunReport::default()
            });
        }

        let mut report = OnchainRefreshRunReport {
            claimed: tasks.len(),
            unique_accounts: unique_account_count(&tasks),
            apply_batch_size: self.config.apply_batch_size,
            completed: 0,
            failed: 0,
            ..OnchainRefreshRunReport::default()
        };

        let mut tasks_by_chain = BTreeMap::<i32, Vec<OnchainRefreshTask>>::new();
        for task in tasks {
            tasks_by_chain.entry(task.chain_id).or_default().push(task);
        }

        for (_chain_id, tasks) in tasks_by_chain {
            let read_report = match self.reader.read_tasks_with_report(&tasks) {
                Ok(report) => report,
                Err(error) => {
                    let message = error.to_string();
                    self.mark_tasks_failed(&tasks, &message, now_ms).await?;
                    report.failed += tasks.len();
                    report.rpc_error_failures += tasks.len();

                    continue;
                }
            };
            report.rpc_reads_requested += read_report.rpc_reads_requested;
            report.rpc_reads_deduped += read_report.rpc_reads_deduped;
            report.cache_hits += read_report.cache_hits;
            let failures = read_report
                .failures
                .into_iter()
                .map(|failure| (failure.task_id.clone(), failure.message))
                .collect::<BTreeMap<_, _>>();

            let values = read_report
                .values
                .into_iter()
                .map(|value| (value.task_id.clone(), value))
                .collect::<BTreeMap<_, _>>();
            let mut successes = Vec::new();

            for task in &tasks {
                match values.get(&task.id) {
                    Some(value) => match validate_read_value(task, value) {
                        Ok(()) => successes.push((task.clone(), value.clone())),
                        Err(error) => {
                            let message = error.to_string();
                            self.mark_task_failed(task, &message, now_ms).await?;
                            report.failed += 1;
                            report.validation_failures += 1;
                        }
                    },
                    None => {
                        if let Some(message) = failures.get(&task.id) {
                            self.mark_task_failed(task, message, now_ms).await?;
                            report.failed += 1;
                            report.rpc_error_failures += 1;
                        } else {
                            self.mark_task_failed(task, "missing reader result", now_ms)
                                .await?;
                            report.failed += 1;
                            report.validation_failures += 1;
                        }
                    }
                }
            }
            if !successes.is_empty() {
                for chunk in onchain_refresh_apply_chunks(&successes, self.config.apply_batch_size)
                {
                    let data_metric_scopes = data_metric_refresh_scopes_for_chunk(chunk);
                    report.apply_chunks += 1;
                    match self
                        .apply_success_batch(chunk, now_ms, &data_metric_scopes)
                        .await
                    {
                        Ok(batch_report) => {
                            report.completed += batch_report.completed;
                            report.debounced_tasks += batch_report.debounced_tasks;
                            report.skipped_tasks += batch_report.debounced_tasks;
                        }
                        Err(error) => {
                            let message = error.to_string();
                            let failed_tasks = chunk
                                .iter()
                                .map(|(task, _value)| task.clone())
                                .collect::<Vec<_>>();
                            self.mark_tasks_failed(&failed_tasks, &message, now_ms)
                                .await?;
                            report.failed += failed_tasks.len();
                            report.db_update_failures += failed_tasks.len();
                        }
                    }
                }
            }
            report.data_metric_refreshes += self.drain_data_metric_refresh_tasks(now_ms).await?;
        }

        report.duration_ms = started_at.elapsed().as_millis();
        if include_backlog {
            report.backlog = match scope {
                Some(scope) => self.ready_backlog_for_scope(scope).await.ok(),
                None => self.ready_backlog().await.ok(),
            };
        }

        log::info!(
            "onchain refresh batch completed dao_code={} chain_id={} contract_set_id={} claimed={} completed={} failed={} skipped_tasks={} rpc_error_failures={} validation_failures={} db_update_failures={} unique_accounts={} rpc_reads_requested={} rpc_reads_deduped={} cache_hits={} debounced_tasks={} data_metric_refreshes={} apply_chunks={} apply_batch_size={} duration_ms={} backlog={}",
            scope
                .map(|scope| scope.dao_code.as_str())
                .unwrap_or("global"),
            scope
                .map(|scope| scope.chain_id.to_string())
                .unwrap_or_else(|| "global".to_owned()),
            scope
                .map(|scope| scope.contract_set_id.as_str())
                .unwrap_or("global"),
            report.claimed,
            report.completed,
            report.failed,
            report.skipped_tasks,
            report.rpc_error_failures,
            report.validation_failures,
            report.db_update_failures,
            report.unique_accounts,
            report.rpc_reads_requested,
            report.rpc_reads_deduped,
            report.cache_hits,
            report.debounced_tasks,
            report.data_metric_refreshes,
            report.apply_chunks,
            report.apply_batch_size,
            report.duration_ms,
            report
                .backlog
                .map(|backlog| backlog.to_string())
                .unwrap_or_else(|| "unknown".to_owned())
        );

        Ok(report)
    }

    async fn drain_deferred_onchain_refresh_backlog(
        &self,
        target_rows: usize,
        scope: Option<&OnchainRefreshTaskScope>,
    ) -> Result<usize, OnchainRefreshWorkerError> {
        let mut drained_total = 0usize;
        while drained_total < target_rows {
            let batch_size = self
                .config
                .deferred_drain_batch_size
                .min(target_rows - drained_total);
            let drained = match scope {
                Some(scope) => {
                    drain_deferred_onchain_refresh_tasks_for_scope(&self.pool, batch_size, scope)
                        .await
                }
                None => drain_deferred_onchain_refresh_tasks(&self.pool, batch_size).await,
            }
            .map_err(|error| OnchainRefreshWorkerError::DeferredDrain(error.to_string()))?;

            drained_total += drained;
            if drained < batch_size {
                break;
            }
        }

        Ok(drained_total)
    }

    async fn repair_missing_contributor_coverage(
        &self,
        max_rows: usize,
        scope: Option<&OnchainRefreshTaskScope>,
    ) -> Result<usize, OnchainRefreshWorkerError> {
        match scope {
            Some(scope) => {
                repair_missing_onchain_refresh_contributor_coverage_for_scope(
                    &self.pool, max_rows, scope,
                )
                .await
            }
            None => repair_missing_onchain_refresh_contributor_coverage(&self.pool, max_rows).await,
        }
        .map_err(|error| OnchainRefreshWorkerError::DeferredDrain(error.to_string()))
    }

    async fn drain_data_metric_refresh_tasks(
        &self,
        now_ms: i64,
    ) -> Result<usize, OnchainRefreshWorkerError> {
        let mut refreshed_total = 0usize;
        let mut attempted_ids = BTreeSet::<String>::new();
        for _ in 0..MAX_ONCHAIN_REFRESH_DATA_METRIC_REFRESH_ROWS {
            let mut transaction = self.pool.begin().await?;
            let skipped_ids = attempted_ids.iter().cloned().collect::<Vec<_>>();
            let row = sqlx::query(
                "SELECT id, contract_set_id, chain_id, dao_code, governor_address, token_address
                 FROM onchain_refresh_data_metric_task
                 WHERE NOT (id = ANY($1::TEXT[]))
                 ORDER BY updated_at ASC, id ASC
                 LIMIT 1
                 FOR UPDATE SKIP LOCKED",
            )
            .bind(&skipped_ids)
            .fetch_optional(&mut *transaction)
            .await?;
            let Some(row) = row else {
                transaction.commit().await?;
                break;
            };

            let id: String = row.get("id");
            attempted_ids.insert(id.clone());
            let scope = DataMetricRefreshScope {
                contract_set_id: row.get("contract_set_id"),
                chain_id: row.get("chain_id"),
                dao_code: row.get("dao_code"),
                governor_address: row.get("governor_address"),
                token_address: row.get("token_address"),
            };

            if let Err(error) = refresh_data_metric_scope(&mut transaction, &scope).await {
                sqlx::query(
                    "UPDATE onchain_refresh_data_metric_task
                     SET attempts = attempts + 1,
                         last_error = $2,
                         updated_at = $3::NUMERIC(78, 0)
                     WHERE id = $1",
                )
                .bind(&id)
                .bind(truncate_error(&error.to_string()))
                .bind(now_ms.to_string())
                .execute(&mut *transaction)
                .await?;
                transaction.commit().await?;
                log::warn!(
                    "onchain refresh data metric refresh failed id={} error={}",
                    id,
                    error
                );
                continue;
            }

            sqlx::query("DELETE FROM onchain_refresh_data_metric_task WHERE id = $1")
                .bind(&id)
                .execute(&mut *transaction)
                .await?;
            transaction.commit().await?;
            refreshed_total += 1;
        }

        Ok(refreshed_total)
    }

    pub async fn ready_backlog(&self) -> Result<u64, OnchainRefreshWorkerError> {
        self.ready_backlog_with_scope(None).await
    }

    pub async fn ready_backlog_for_scope(
        &self,
        scope: &OnchainRefreshTaskScope,
    ) -> Result<u64, OnchainRefreshWorkerError> {
        self.ready_backlog_with_scope(Some(scope)).await
    }

    async fn ready_backlog_with_scope(
        &self,
        scope: Option<&OnchainRefreshTaskScope>,
    ) -> Result<u64, OnchainRefreshWorkerError> {
        let now_ms = unix_time_millis();
        let stale_before = now_ms.saturating_sub(duration_millis_i64(self.config.lock_ttl));
        let mut query = QueryBuilder::<Postgres>::new(
            "SELECT count(*)::BIGINT AS task_count
             FROM onchain_refresh_task
             WHERE (
                status = 'pending'
                OR (
                    status = 'failed'
                    AND attempts < ",
        );
        query.push_bind(self.config.max_attempts).push(
            "
                )
                OR (
                    status = 'processing'
                    AND locked_at IS NOT NULL
                    AND locked_at <= ",
        );
        query.push_bind(stale_before.to_string()).push(
            "::NUMERIC(78, 0)
                    AND attempts < ",
        );
        query
            .push_bind(self.config.max_attempts)
            .push(
                "
                )
             )
             AND next_run_at <= ",
            )
            .push_bind(now_ms.to_string())
            .push("::NUMERIC(78, 0)");
        push_onchain_refresh_scope_filter(&mut query, scope);
        let row = query.build().fetch_one(&self.pool).await?;

        let count: i64 = row.get("task_count");

        Ok(count.try_into().unwrap_or_default())
    }

    async fn claim_tasks(
        &self,
        now_ms: i64,
        batch_size: usize,
        scope: Option<&OnchainRefreshTaskScope>,
    ) -> Result<Vec<OnchainRefreshTask>, OnchainRefreshWorkerError> {
        let mut tasks = Vec::new();
        let queues = [
            OnchainRefreshClaimQueue::StaleProcessing,
            OnchainRefreshClaimQueue::FailedRetry,
            OnchainRefreshClaimQueue::Pending,
        ];
        let mut remaining_batch_size = batch_size;
        let fair_queue_batch_size = batch_size.div_ceil(queues.len());
        for queue in queues.iter().copied() {
            if remaining_batch_size == 0 {
                break;
            }
            let queue_batch_size = fair_queue_batch_size.min(remaining_batch_size);
            let claimed = self
                .claim_tasks_from_queue(now_ms, queue_batch_size, scope, queue)
                .await?;
            remaining_batch_size = remaining_batch_size.saturating_sub(claimed.len());
            tasks.extend(claimed);
        }
        for queue in queues {
            if remaining_batch_size == 0 {
                break;
            }
            let claimed = self
                .claim_tasks_from_queue(now_ms, remaining_batch_size, scope, queue)
                .await?;
            remaining_batch_size = remaining_batch_size.saturating_sub(claimed.len());
            tasks.extend(claimed);
        }

        Ok(tasks)
    }

    async fn claim_tasks_from_queue(
        &self,
        now_ms: i64,
        batch_size: usize,
        scope: Option<&OnchainRefreshTaskScope>,
        queue: OnchainRefreshClaimQueue,
    ) -> Result<Vec<OnchainRefreshTask>, OnchainRefreshWorkerError> {
        let stale_before = now_ms.saturating_sub(duration_millis_i64(self.config.lock_ttl));
        let batch_size =
            i64::try_from(batch_size).map_err(|_| OnchainRefreshWorkerError::BatchSizeOverflow)?;

        let mut query = QueryBuilder::<Postgres>::new(
            "WITH candidates AS (
                SELECT id
                FROM onchain_refresh_task
                WHERE status = ",
        );
        match queue {
            OnchainRefreshClaimQueue::Pending => {
                query.push("'pending'");
            }
            OnchainRefreshClaimQueue::FailedRetry => {
                query.push("'failed' AND attempts < ");
                push_attempt_limit(&mut query, self.config.max_attempts);
            }
            OnchainRefreshClaimQueue::StaleProcessing => {
                query
                    .push("'processing'")
                    .push(" AND locked_at IS NOT NULL AND locked_at <= ")
                    .push_bind(stale_before.to_string())
                    .push("::NUMERIC(78, 0) AND attempts < ");
                push_attempt_limit(&mut query, self.config.max_attempts);
            }
        }
        query
            .push(" AND next_run_at <= ")
            .push_bind(now_ms.to_string())
            .push("::NUMERIC(78, 0)");
        push_onchain_refresh_scope_filter(&mut query, scope);
        query
            .push(
                "
                ORDER BY next_run_at ASC, updated_at ASC, id ASC
                LIMIT ",
            )
            .push_bind(batch_size)
            .push(
                "
                FOR UPDATE SKIP LOCKED
             )
             UPDATE onchain_refresh_task
             SET status = 'processing',
                 attempts = attempts + 1,
                 locked_at = ",
            )
            .push_bind(now_ms.to_string())
            .push("::NUMERIC(78, 0), locked_by = ")
            .push_bind(&self.config.lock_owner)
            .push(
                ",
                 error = NULL,
                 updated_at = ",
            )
            .push_bind(now_ms.to_string())
            .push(
                "::NUMERIC(78, 0)
             FROM candidates
             WHERE onchain_refresh_task.id = candidates.id
             RETURNING
                 onchain_refresh_task.id,
                 onchain_refresh_task.contract_set_id,
                 onchain_refresh_task.chain_id,
                 onchain_refresh_task.dao_code,
                 onchain_refresh_task.governor_address,
                 onchain_refresh_task.token_address,
                 onchain_refresh_task.account,
                 onchain_refresh_task.refresh_balance,
                 onchain_refresh_task.refresh_power,
                 onchain_refresh_task.last_seen_block_number::TEXT AS last_seen_block_number,
                 onchain_refresh_task.last_seen_block_timestamp::TEXT AS last_seen_block_timestamp,
                 onchain_refresh_task.last_seen_transaction_hash,
                 onchain_refresh_task.attempts",
            );
        let rows = query.build().fetch_all(&self.pool).await?;

        Ok(rows
            .into_iter()
            .map(|row| OnchainRefreshTask {
                id: row.get("id"),
                contract_set_id: row.get("contract_set_id"),
                chain_id: row.get("chain_id"),
                dao_code: row.get("dao_code"),
                governor_address: row.get("governor_address"),
                token_address: row.get("token_address"),
                account: row.get("account"),
                refresh_balance: row.get("refresh_balance"),
                refresh_power: row.get("refresh_power"),
                last_seen_block_number: row.get("last_seen_block_number"),
                last_seen_block_timestamp: row.get("last_seen_block_timestamp"),
                last_seen_transaction_hash: row.get("last_seen_transaction_hash"),
                attempts: row.get("attempts"),
            })
            .collect())
    }

    async fn apply_success_batch(
        &self,
        successes: &[(OnchainRefreshTask, OnchainRefreshReadValue)],
        now_ms: i64,
        data_metric_scopes: &BTreeSet<DataMetricRefreshScope>,
    ) -> Result<OnchainRefreshApplyBatchReport, OnchainRefreshWorkerError> {
        retry_onchain_refresh_apply_operation(
            || Box::pin(self.apply_success_batch_once(successes, now_ms, data_metric_scopes)),
            Duration::from_millis(ONCHAIN_REFRESH_APPLY_RETRY_BASE_DELAY_MS),
        )
        .await
    }

    async fn apply_success_batch_once(
        &self,
        successes: &[(OnchainRefreshTask, OnchainRefreshReadValue)],
        now_ms: i64,
        data_metric_scopes: &BTreeSet<DataMetricRefreshScope>,
    ) -> Result<OnchainRefreshApplyBatchReport, OnchainRefreshWorkerError> {
        let mut transaction = self.pool.begin().await?;

        let result = async {
            let previous_values =
                read_contributor_refresh_values(&mut transaction, successes).await?;
            upsert_contributor_refresh(&mut transaction, successes).await?;
            reconcile_current_delegate_relation_power_from_balance(&mut transaction, successes)
                .await?;
            insert_refresh_checkpoints(
                &mut transaction,
                successes,
                &previous_values,
                self.current_power_method,
            )
            .await?;
            enqueue_data_metric_refresh_scopes(&mut transaction, data_metric_scopes, now_ms)
                .await?;
            let debounced_tasks = complete_tasks(
                &mut transaction,
                successes,
                now_ms,
                self.config.debounce,
                &self.config.lock_owner,
            )
            .await?;

            Ok::<_, OnchainRefreshWorkerError>(debounced_tasks)
        }
        .await;
        let debounced_tasks = match result {
            Ok(report) => report,
            Err(error) => {
                if let Err(rollback_error) = transaction.rollback().await {
                    log::warn!(
                        "onchain refresh success batch rollback failed error={} rollback_error={}",
                        error,
                        rollback_error
                    );
                }
                return Err(error);
            }
        };

        transaction.commit().await?;

        if let Err(error) = self.write_live_power_overlays(successes).await {
            log::warn!("onchain refresh live power overlay write failed error={error}");
        }

        Ok(OnchainRefreshApplyBatchReport {
            completed: successes.len().saturating_sub(debounced_tasks),
            debounced_tasks,
            data_metric_refreshes: 0,
        })
    }

    async fn write_live_power_overlays(
        &self,
        successes: &[(OnchainRefreshTask, OnchainRefreshReadValue)],
    ) -> Result<(), OnchainRefreshWorkerError> {
        let mut transaction = self.pool.begin().await?;
        if let Err(error) = upsert_live_power_overlays(&mut transaction, successes).await {
            if let Err(rollback_error) = transaction.rollback().await {
                log::warn!(
                    "onchain refresh live power overlay rollback failed error={} rollback_error={}",
                    error,
                    rollback_error
                );
            }
            return Err(error.into());
        }
        transaction.commit().await?;

        Ok(())
    }

    async fn mark_tasks_failed(
        &self,
        tasks: &[OnchainRefreshTask],
        error: &str,
        now_ms: i64,
    ) -> Result<(), OnchainRefreshWorkerError> {
        for task in tasks {
            self.mark_task_failed(task, error, now_ms).await?;
        }

        Ok(())
    }

    async fn mark_task_failed(
        &self,
        task: &OnchainRefreshTask,
        error: &str,
        now_ms: i64,
    ) -> Result<(), OnchainRefreshWorkerError> {
        let next_run_at = now_ms.saturating_add(duration_millis_i64(
            onchain_refresh_retry_backoff_delay(self.config.retry_delay, task.attempts),
        ));
        let status = if task.attempts >= self.config.max_attempts {
            "exhausted"
        } else {
            "failed"
        };

        sqlx::query(
            "UPDATE onchain_refresh_task
             SET status = $5,
                 next_run_at = $2::NUMERIC(78, 0),
                 locked_at = NULL,
                 locked_by = NULL,
                 processed_at = NULL,
                 error = $3,
                 updated_at = $4::NUMERIC(78, 0)
             WHERE id = $1
               AND status = 'processing'
               AND locked_by = $6",
        )
        .bind(&task.id)
        .bind(next_run_at.to_string())
        .bind(truncate_error(error))
        .bind(now_ms.to_string())
        .bind(status)
        .bind(&self.config.lock_owner)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    async fn archive_exhausted_tasks(&self, now_ms: i64) -> Result<(), OnchainRefreshWorkerError> {
        let stale_before = now_ms.saturating_sub(duration_millis_i64(self.config.lock_ttl));
        sqlx::query(
            "WITH candidates AS (
                SELECT id
                FROM onchain_refresh_task
                WHERE status = 'failed'
                  AND attempts >= $1
                LIMIT $2
                FOR UPDATE SKIP LOCKED
             )
             UPDATE onchain_refresh_task
             SET status = 'exhausted',
                 locked_at = NULL,
                 locked_by = NULL,
                 processed_at = COALESCE(processed_at, $3::NUMERIC(78, 0)),
                 updated_at = $3::NUMERIC(78, 0)
             FROM candidates
             WHERE onchain_refresh_task.id = candidates.id",
        )
        .bind(self.config.max_attempts)
        .bind(MAX_ONCHAIN_REFRESH_EXHAUSTED_ARCHIVE_ROWS)
        .bind(now_ms.to_string())
        .execute(&self.pool)
        .await?;

        sqlx::query(
            "WITH candidates AS (
                SELECT id
                FROM onchain_refresh_task
                WHERE status = 'processing'
                  AND attempts >= $1
                  AND locked_at IS NOT NULL
                  AND locked_at <= $2::NUMERIC(78, 0)
                LIMIT $3
                FOR UPDATE SKIP LOCKED
             )
             UPDATE onchain_refresh_task
             SET status = 'exhausted',
                 locked_at = NULL,
                 locked_by = NULL,
                 processed_at = COALESCE(processed_at, $4::NUMERIC(78, 0)),
                 updated_at = $4::NUMERIC(78, 0)
             FROM candidates
             WHERE onchain_refresh_task.id = candidates.id",
        )
        .bind(self.config.max_attempts)
        .bind(stale_before.to_string())
        .bind(MAX_ONCHAIN_REFRESH_EXHAUSTED_ARCHIVE_ROWS)
        .bind(now_ms.to_string())
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}

fn worker_deferred_drain_target(configured_batch_size: usize, claim_batch_size: usize) -> usize {
    configured_batch_size.max(claim_batch_size)
}

async fn retry_onchain_refresh_apply_operation<'a, T, F>(
    mut operation: F,
    base_delay: Duration,
) -> Result<T, OnchainRefreshWorkerError>
where
    F: FnMut() -> OnchainRefreshApplyFuture<'a, T>,
{
    let mut attempt = 1usize;
    loop {
        match operation().await {
            Ok(report) => return Ok(report),
            Err(error)
                if attempt < ONCHAIN_REFRESH_APPLY_MAX_ATTEMPTS
                    && is_retryable_onchain_refresh_apply_error(&error) =>
            {
                log::warn!(
                    "onchain refresh success batch retry scheduled attempt={} max_attempts={} error={}",
                    attempt + 1,
                    ONCHAIN_REFRESH_APPLY_MAX_ATTEMPTS,
                    error
                );
                tokio::time::sleep(onchain_refresh_apply_retry_delay(base_delay, attempt)).await;
                attempt += 1;
            }
            Err(error) => return Err(error),
        }
    }
}

fn is_retryable_onchain_refresh_apply_error(error: &OnchainRefreshWorkerError) -> bool {
    match error {
        OnchainRefreshWorkerError::Database(sqlx::Error::Database(error)) => error
            .code()
            .as_deref()
            .is_some_and(is_retryable_onchain_refresh_apply_sqlstate),
        _ => false,
    }
}

fn is_retryable_onchain_refresh_apply_sqlstate(code: &str) -> bool {
    matches!(code, "40P01" | "40001")
}

fn onchain_refresh_apply_retry_delay(base_delay: Duration, attempt: usize) -> Duration {
    let multiplier = u32::try_from(attempt).unwrap_or(u32::MAX).max(1);
    base_delay.saturating_mul(multiplier)
}

fn onchain_refresh_retry_backoff_delay(base_delay: Duration, attempts: i32) -> Duration {
    let exponent = attempts.saturating_sub(1).clamp(0, 5) as u32;
    let multiplier = 1u32.checked_shl(exponent).unwrap_or(32);

    base_delay.saturating_mul(multiplier)
}

fn push_attempt_limit(query: &mut QueryBuilder<'_, Postgres>, max_attempts: i32) {
    if max_attempts == DEFAULT_ONCHAIN_REFRESH_MAX_ATTEMPTS {
        query.push(DEFAULT_ONCHAIN_REFRESH_MAX_ATTEMPTS);
    } else {
        query.push_bind(max_attempts);
    }
}

fn push_onchain_refresh_scope_filter<'args>(
    query: &mut QueryBuilder<'args, Postgres>,
    scope: Option<&'args OnchainRefreshTaskScope>,
) {
    if let Some(scope) = scope {
        query
            .push(" AND chain_id = ")
            .push_bind(scope.chain_id)
            .push(" AND contract_set_id = ")
            .push_bind(&scope.contract_set_id)
            .push(" AND dao_code = ")
            .push_bind(&scope.dao_code);
    }
}

#[derive(Clone)]
pub struct MultiChainToolOnchainRefreshReader<T> {
    chain_tools: BTreeMap<i32, T>,
    read_plan_config: BatchReadPlanConfig,
    current_power_method: ChainReadMethod,
}

impl<T> MultiChainToolOnchainRefreshReader<T> {
    pub fn new(
        chain_tools: BTreeMap<i32, T>,
        read_plan_config: BatchReadPlanConfig,
        current_power_method: ChainReadMethod,
    ) -> Self {
        Self {
            chain_tools,
            read_plan_config: read_plan_config.validated(),
            current_power_method,
        }
    }
}

impl<T> OnchainRefreshReader for MultiChainToolOnchainRefreshReader<T>
where
    T: ChainTool + Clone + Send + Sync + 'static,
{
    fn read_tasks(
        &self,
        tasks: &[OnchainRefreshTask],
    ) -> Result<Vec<OnchainRefreshReadValue>, OnchainRefreshReaderError> {
        Ok(self.read_tasks_with_report(tasks)?.values)
    }

    fn read_tasks_with_report(
        &self,
        tasks: &[OnchainRefreshTask],
    ) -> Result<OnchainRefreshReadReport, OnchainRefreshReaderError> {
        let mut tasks_by_chain = BTreeMap::<i32, Vec<OnchainRefreshTask>>::new();
        for task in tasks {
            tasks_by_chain
                .entry(task.chain_id)
                .or_default()
                .push(task.clone());
        }

        let mut read_report = OnchainRefreshReadReport::default();
        for (chain_id, tasks) in tasks_by_chain {
            let chain_tool = self.chain_tools.get(&chain_id).ok_or_else(|| {
                OnchainRefreshReaderError::new(format!(
                    "missing onchain refresh RPC configuration for chain_id {chain_id}"
                ))
            })?;
            let reader = ChainToolOnchainRefreshReader::new(
                chain_tool.clone(),
                self.read_plan_config,
                self.current_power_method,
            );
            let chain_report = reader.read_tasks_with_report(&tasks)?;
            read_report.rpc_reads_requested += chain_report.rpc_reads_requested;
            read_report.rpc_reads_deduped += chain_report.rpc_reads_deduped;
            read_report.cache_hits += chain_report.cache_hits;
            read_report.values.extend(chain_report.values);
            read_report.failures.extend(chain_report.failures);
        }

        Ok(read_report)
    }
}

#[derive(Clone)]
pub struct ChainToolOnchainRefreshReader<T> {
    chain_tool: T,
    read_plan_config: BatchReadPlanConfig,
    current_power_method: ChainReadMethod,
}

impl<T> ChainToolOnchainRefreshReader<T> {
    pub fn new(
        chain_tool: T,
        read_plan_config: BatchReadPlanConfig,
        current_power_method: ChainReadMethod,
    ) -> Self {
        Self {
            chain_tool,
            read_plan_config: read_plan_config.validated(),
            current_power_method,
        }
    }
}

impl<T> OnchainRefreshReader for ChainToolOnchainRefreshReader<T>
where
    T: ChainTool + Clone + Send + Sync + 'static,
{
    fn read_tasks(
        &self,
        tasks: &[OnchainRefreshTask],
    ) -> Result<Vec<OnchainRefreshReadValue>, OnchainRefreshReaderError> {
        Ok(self.read_tasks_with_report(tasks)?.values)
    }

    fn read_tasks_with_report(
        &self,
        tasks: &[OnchainRefreshTask],
    ) -> Result<OnchainRefreshReadReport, OnchainRefreshReaderError> {
        let mut groups = BTreeMap::<(i32, String, String), Vec<&OnchainRefreshTask>>::new();
        for task in tasks {
            groups
                .entry((
                    task.chain_id,
                    task.governor_address.clone(),
                    task.token_address.clone(),
                ))
                .or_default()
                .push(task);
        }

        let mut values_by_key =
            BTreeMap::<(i32, String, String, ChainReadMethod, BlockReadMode), String>::new();
        let mut failures_by_key =
            BTreeMap::<(i32, String, String, ChainReadMethod, BlockReadMode), Vec<String>>::new();
        let mut read_report = OnchainRefreshReadReport::default();
        for ((chain_id, governor_address, token_address), group_tasks) in groups {
            let mut builder = ChainReadPlanBuilder::new(
                chain_id,
                ChainContracts {
                    governor: governor_address,
                    governor_token: token_address.clone(),
                    timelock: None,
                },
                self.read_plan_config,
            );

            for task in group_tasks {
                let activity_block = parse_u64(&task.last_seen_block_number)?;
                if task.refresh_power {
                    builder.add_account_latest_power_refresh_with_method(
                        &task.account,
                        activity_block,
                        crate::ChainReadReason::TokenActivityPowerRefresh,
                        self.current_power_method,
                    );
                    builder.add_optional_enrichment_read(
                        token_address.clone(),
                        self.current_power_method,
                        vec![task.account.clone()],
                        BlockReadMode::AtBlock(activity_block),
                    );
                }
                if task.refresh_balance {
                    builder.add_account_latest_balance_refresh(
                        &task.account,
                        activity_block,
                        crate::ChainReadReason::TokenActivityPowerRefresh,
                    );
                    builder.add_optional_enrichment_read(
                        token_address.clone(),
                        ChainReadMethod::BalanceOf,
                        vec![task.account.clone()],
                        BlockReadMode::AtBlock(activity_block),
                    );
                }
            }

            let plan = builder.build();
            let report = self.chain_tool.execute_read_plan_partial(&plan);
            read_report.rpc_reads_requested += report.metrics.requested_reads;
            read_report.rpc_reads_deduped += report.metrics.deduped_reads;
            read_report.cache_hits += report.metrics.cache_hits;
            for failure in report.partial_failures.required_failures {
                let Some(account) = failure.key.args.first() else {
                    return Err(OnchainRefreshReaderError::new(format!(
                        "missing account for failed {:?} read",
                        failure.key.method
                    )));
                };
                failures_by_key
                    .entry((
                        failure.key.chain_id,
                        normalize_identifier(&failure.key.contract_address),
                        normalize_identifier(account),
                        failure.key.method,
                        failure.key.block_mode,
                    ))
                    .or_default()
                    .push(failure.message);
            }
            for failure in report.partial_failures.optional_failures {
                log::warn!(
                    "onchain refresh optional checkpoint read failed chain_id={} method={:?} block_mode={:?} error={}",
                    failure.key.chain_id,
                    failure.key.method,
                    failure.key.block_mode,
                    failure.message
                );
            }

            for result in report.results {
                let Some(account) = result.key.args.first() else {
                    continue;
                };
                let value = match result.value {
                    ChainReadValue::Integer(value) => value,
                    other => {
                        return Err(OnchainRefreshReaderError::new(format!(
                            "expected integer chain read for {:?}, got {:?}",
                            result.key.method, other
                        )));
                    }
                };
                values_by_key.insert(
                    (
                        result.key.chain_id,
                        normalize_identifier(&result.key.contract_address),
                        normalize_identifier(account),
                        result.key.method,
                        result.key.block_mode,
                    ),
                    value,
                );
            }
        }

        for task in tasks {
            let mut task_failures = Vec::<String>::new();
            let activity_block = parse_u64(&task.last_seen_block_number)?;
            let power = if task.refresh_power {
                let key = (
                    task.chain_id,
                    normalize_identifier(&task.token_address),
                    normalize_identifier(&task.account),
                    self.current_power_method,
                    BlockReadMode::Latest,
                );
                match values_by_key.get(&key).cloned() {
                    Some(value) => Some(value),
                    None => {
                        if let Some(messages) = failures_by_key.get(&key) {
                            task_failures.extend(messages.iter().cloned());
                            None
                        } else {
                            return Err(OnchainRefreshReaderError::new(format!(
                                "missing power read for {}",
                                task.account
                            )));
                        }
                    }
                }
            } else {
                None
            };
            let checkpoint_power = if task.refresh_power {
                let key = (
                    task.chain_id,
                    normalize_identifier(&task.token_address),
                    normalize_identifier(&task.account),
                    self.current_power_method,
                    BlockReadMode::AtBlock(activity_block),
                );
                values_by_key.get(&key).cloned()
            } else {
                None
            };
            let balance = if task.refresh_balance {
                let key = (
                    task.chain_id,
                    normalize_identifier(&task.token_address),
                    normalize_identifier(&task.account),
                    ChainReadMethod::BalanceOf,
                    BlockReadMode::Latest,
                );
                match values_by_key.get(&key).cloned() {
                    Some(value) => Some(value),
                    None => {
                        if let Some(messages) = failures_by_key.get(&key) {
                            if power.is_some() && is_reverted_balance_read_failure(messages) {
                                None
                            } else {
                                task_failures.extend(messages.iter().cloned());
                                None
                            }
                        } else {
                            return Err(OnchainRefreshReaderError::new(format!(
                                "missing balance read for {}",
                                task.account
                            )));
                        }
                    }
                }
            } else {
                None
            };
            let checkpoint_balance = if task.refresh_balance {
                let key = (
                    task.chain_id,
                    normalize_identifier(&task.token_address),
                    normalize_identifier(&task.account),
                    ChainReadMethod::BalanceOf,
                    BlockReadMode::AtBlock(activity_block),
                );
                values_by_key.get(&key).cloned()
            } else {
                None
            };

            if task_failures.is_empty() {
                read_report.values.push(OnchainRefreshReadValue {
                    task_id: task.id.clone(),
                    balance,
                    power,
                    checkpoint_balance,
                    checkpoint_power,
                });
            } else {
                read_report.failures.push(OnchainRefreshReadFailure {
                    task_id: task.id.clone(),
                    message: task_failures.join("; "),
                });
            }
        }

        Ok(read_report)
    }
}

#[derive(Clone)]
pub struct LivePowerOverlayReader<T> {
    chain_tool: T,
    read_plan_config: BatchReadPlanConfig,
    current_power_method: ChainReadMethod,
}

impl<T> LivePowerOverlayReader<T> {
    pub fn new(
        chain_tool: T,
        read_plan_config: BatchReadPlanConfig,
        current_power_method: ChainReadMethod,
    ) -> Self {
        Self {
            chain_tool,
            read_plan_config: read_plan_config.validated(),
            current_power_method,
        }
    }
}

impl<T> LivePowerOverlayReader<T>
where
    T: ChainTool + Clone + Send + Sync + 'static,
{
    pub fn read_power_overlays(
        &self,
        tasks: &[OnchainRefreshTask],
    ) -> Result<Vec<ProvisionalContributorPowerOverlayWrite>, OnchainRefreshReaderError> {
        let mut groups = BTreeMap::<(i32, String, String), Vec<&OnchainRefreshTask>>::new();
        for task in tasks.iter().filter(|task| task.refresh_power) {
            groups
                .entry((
                    task.chain_id,
                    task.governor_address.clone(),
                    task.token_address.clone(),
                ))
                .or_default()
                .push(task);
        }

        let mut writes = Vec::new();
        for ((chain_id, governor_address, token_address), group_tasks) in groups {
            let mut builder = ChainReadPlanBuilder::new(
                chain_id,
                ChainContracts {
                    governor: governor_address.clone(),
                    governor_token: token_address.clone(),
                    timelock: None,
                },
                self.read_plan_config,
            );
            let mut tasks_by_account = BTreeMap::<String, &OnchainRefreshTask>::new();
            for task in group_tasks {
                tasks_by_account
                    .entry(normalize_identifier(&task.account))
                    .or_insert(task);
            }
            for task in tasks_by_account.values() {
                builder.add_account_latest_power_refresh_with_method(
                    &task.account,
                    parse_u64(&task.last_seen_block_number)?,
                    crate::ChainReadReason::TokenActivityPowerRefresh,
                    self.current_power_method,
                );
                builder.add_account_latest_balance_refresh(
                    &task.account,
                    parse_u64(&task.last_seen_block_number)?,
                    crate::ChainReadReason::TokenActivityPowerRefresh,
                );
            }

            let plan = builder.build();
            let report = self
                .chain_tool
                .execute_read_plan(&plan)
                .map_err(|failures| OnchainRefreshReaderError::new(format_failures(&failures)))?;

            let mut powers_by_account = BTreeMap::<String, String>::new();
            let mut balances_by_account = BTreeMap::<String, String>::new();
            for result in report.results {
                let Some(account) = result.key.args.first() else {
                    continue;
                };
                let value = match result.value {
                    ChainReadValue::Integer(value) => value,
                    other => {
                        return Err(OnchainRefreshReaderError::new(format!(
                            "expected integer chain read for {:?}, got {:?}",
                            result.key.method, other
                        )));
                    }
                };
                match result.key.method {
                    method if method == self.current_power_method => {
                        powers_by_account.insert(account.clone(), value);
                    }
                    ChainReadMethod::BalanceOf => {
                        balances_by_account.insert(account.clone(), value);
                    }
                    _ => {}
                }
            }

            for (account, task) in tasks_by_account {
                let power = powers_by_account.get(&account).cloned().ok_or_else(|| {
                    OnchainRefreshReaderError::new(format!("missing power read for {account}"))
                })?;
                writes.push(ProvisionalContributorPowerOverlayWrite {
                    id: provisional_contributor_power_overlay_id(task),
                    segment_id: None,
                    dao_code: task.dao_code.clone(),
                    contract_set_id: task.contract_set_id.clone(),
                    chain_id: Some(task.chain_id),
                    chain_name: None,
                    governor_address: Some(normalize_identifier(&governor_address)),
                    token_address: Some(normalize_identifier(&token_address)),
                    account: normalize_identifier(&task.account),
                    power,
                    balance: balances_by_account.get(&account).cloned(),
                    delegates_count_all: 0,
                    delegates_count_effective: 0,
                    last_vote_block_number: None,
                    last_vote_timestamp: None,
                    source: "live-onchain".to_owned(),
                    status: "available".to_owned(),
                    anchor_block_number: Some(task.last_seen_block_number.clone()),
                    anchor_block_hash: None,
                    anchor_parent_hash: None,
                    anchor_block_timestamp: Some(task.last_seen_block_timestamp.clone()),
                });
            }
        }

        Ok(writes)
    }
}

pub fn refresh_live_power_overlays<T, S>(
    reader: &LivePowerOverlayReader<T>,
    store: &mut S,
    tasks: &[OnchainRefreshTask],
) -> Result<usize, LivePowerOverlayRefreshError>
where
    T: ChainTool + Clone + Send + Sync + 'static,
    S: ProvisionalPowerOverlayStore,
{
    let contributors = reader.read_power_overlays(tasks)?;
    let scopes = tasks
        .iter()
        .filter(|task| task.refresh_power)
        .map(provisional_power_overlay_scope)
        .collect::<Vec<_>>();
    let relations = store
        .current_delegate_power_overlay_relations(&scopes)
        .map_err(|error| LivePowerOverlayRefreshError::Store(error.to_string()))?;
    let delegates = provisional_delegate_power_overlay_writes(&contributors, &relations);
    let writes = contributors.len() + delegates.len();
    store
        .write_power_overlays(&contributors, &delegates)
        .map_err(|error| LivePowerOverlayRefreshError::Store(error.to_string()))?;

    Ok(writes)
}

#[derive(Clone)]
pub struct EvmRpcChainTool {
    rpc_client: Arc<dyn EvmRpcClient>,
    cache: ChainReadCache,
    current_power_methods: CurrentPowerMethodPreferences,
}

impl EvmRpcChainTool {
    pub fn new(rpc_url: String, timeout: Duration) -> Result<Self, OnchainRefreshReaderError> {
        let client = reqwest::Client::builder()
            .timeout(timeout)
            .build()
            .map_err(|error| OnchainRefreshReaderError::new(error.to_string()))?;

        Ok(Self {
            rpc_client: Arc::new(ReqwestEvmRpcClient { rpc_url, client }),
            cache: ChainReadCache::default(),
            current_power_methods: CurrentPowerMethodPreferences::default(),
        })
    }

    #[cfg(test)]
    fn from_rpc_client<C>(rpc_client: C) -> Self
    where
        C: EvmRpcClient + 'static,
    {
        Self {
            rpc_client: Arc::new(rpc_client),
            cache: ChainReadCache::default(),
            current_power_methods: CurrentPowerMethodPreferences::default(),
        }
    }
}

trait EvmRpcClient: Send + Sync {
    fn eth_call(
        &self,
        contract_address: &str,
        data: &str,
        block_mode: BlockReadMode,
    ) -> Result<String, String>;

    fn eth_get_block_timestamp(&self, block_number: &str) -> Result<u128, String>;
}

struct ReqwestEvmRpcClient {
    rpc_url: String,
    client: reqwest::Client,
}

impl EvmRpcClient for ReqwestEvmRpcClient {
    fn eth_call(
        &self,
        contract_address: &str,
        data: &str,
        block_mode: BlockReadMode,
    ) -> Result<String, String> {
        let client = self.client.clone();
        let rpc_url = self.rpc_url.clone();
        let contract_address = contract_address.to_owned();
        let data = data.to_owned();
        thread::spawn(move || {
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .map_err(|error| error.to_string())?;
            runtime.block_on(async move {
                let body = json!({
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "eth_call",
                    "params": [
                        {
                            "to": contract_address,
                            "data": data,
                        },
                        block_tag(block_mode),
                    ],
                });
                let response = client
                    .post(&rpc_url)
                    .json(&body)
                    .send()
                    .await
                    .map_err(|error| error.to_string())?;

                if !response.status().is_success() {
                    return Err(format!(
                        "RPC eth_call failed with HTTP {}",
                        response.status()
                    ));
                }

                let payload = response
                    .json::<JsonRpcResponse>()
                    .await
                    .map_err(|error| error.to_string())?;
                if let Some(error) = payload.error {
                    return Err(error.message);
                }

                payload
                    .result
                    .ok_or_else(|| "RPC eth_call returned no result".to_owned())
            })
        })
        .join()
        .map_err(|_| "RPC eth_call worker thread panicked".to_owned())?
    }

    fn eth_get_block_timestamp(&self, block_number: &str) -> Result<u128, String> {
        let block_number = block_number
            .parse::<u64>()
            .map_err(|error| format!("parse block number {block_number}: {error}"))?;
        let client = self.client.clone();
        let rpc_url = self.rpc_url.clone();
        thread::spawn(move || {
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .map_err(|error| error.to_string())?;
            runtime.block_on(async move {
                let body = json!({
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "eth_getBlockByNumber",
                    "params": [
                        format!("0x{block_number:x}"),
                        false,
                    ],
                });
                let response = client
                    .post(&rpc_url)
                    .json(&body)
                    .send()
                    .await
                    .map_err(|error| error.to_string())?;

                if !response.status().is_success() {
                    return Err(format!(
                        "RPC eth_getBlockByNumber failed with HTTP {}",
                        response.status()
                    ));
                }

                let payload = response
                    .json::<JsonRpcBlockResponse>()
                    .await
                    .map_err(|error| error.to_string())?;
                if let Some(error) = payload.error {
                    return Err(error.message);
                }

                let block = payload
                    .result
                    .ok_or_else(|| "RPC eth_getBlockByNumber returned no result".to_owned())?;
                let timestamp = block
                    .timestamp
                    .strip_prefix("0x")
                    .ok_or_else(|| "block timestamp must be hex".to_owned())?;
                u128::from_str_radix(timestamp, 16)
                    .map_err(|error| format!("parse block timestamp: {error}"))
            })
        })
        .join()
        .map_err(|_| "RPC eth_getBlockByNumber worker thread panicked".to_owned())?
    }
}

#[derive(Clone, Debug, Default)]
struct ChainReadCache {
    values: Arc<Mutex<BTreeMap<ChainReadCacheKey, CachedChainReadValue>>>,
}

impl ChainReadCache {
    fn get(&self, key: &ChainReadKey) -> Option<ChainReadValue> {
        let key = ChainReadCacheKey::from_read_key(key)?;
        let mut values = self.values.lock().ok()?;
        let cached = values.get(&key)?;
        if cached.is_expired(&key) {
            values.remove(&key);
            return None;
        }
        Some(cached.value.clone())
    }

    fn insert(&self, key: &ChainReadKey, value: ChainReadValue) {
        let Some(key) = ChainReadCacheKey::from_read_key(key) else {
            return;
        };
        if let Ok(mut values) = self.values.lock() {
            values.insert(
                key,
                CachedChainReadValue {
                    value,
                    inserted_at: SystemTime::now(),
                },
            );
        }
    }
}

#[derive(Clone, Debug, Default)]
struct CurrentPowerMethodPreferences {
    methods: Arc<Mutex<BTreeMap<CurrentPowerMethodPreferenceKey, ChainReadMethod>>>,
}

impl CurrentPowerMethodPreferences {
    fn get(&self, key: &ChainReadKey) -> Option<ChainReadMethod> {
        let key = CurrentPowerMethodPreferenceKey::from_read_key(key)?;
        let methods = self.methods.lock().ok()?;
        methods.get(&key).copied()
    }

    fn insert(&self, key: &ChainReadKey, method: ChainReadMethod) {
        if !is_current_power_method(method) {
            return;
        }
        let Some(key) = CurrentPowerMethodPreferenceKey::from_read_key(key) else {
            return;
        };
        if let Ok(mut methods) = self.methods.lock() {
            methods.insert(key, method);
        }
    }
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
struct CurrentPowerMethodPreferenceKey {
    chain_id: i32,
    contract_address: String,
}

impl CurrentPowerMethodPreferenceKey {
    fn from_read_key(key: &ChainReadKey) -> Option<Self> {
        if !is_current_power_method(key.method) {
            return None;
        }

        Some(Self {
            chain_id: key.chain_id,
            contract_address: normalize_identifier(&key.contract_address),
        })
    }
}

#[derive(Clone, Debug)]
struct CachedChainReadValue {
    value: ChainReadValue,
    inserted_at: SystemTime,
}

impl CachedChainReadValue {
    fn is_expired(&self, key: &ChainReadCacheKey) -> bool {
        match key {
            ChainReadCacheKey::Decimals { .. } => false,
            ChainReadCacheKey::Quorum { .. } => self
                .inserted_at
                .elapsed()
                .map(|elapsed| elapsed >= QUORUM_CACHE_DURATION)
                .unwrap_or(true),
            ChainReadCacheKey::AccountCurrentValue { .. } => self
                .inserted_at
                .elapsed()
                .map(|elapsed| elapsed >= ACCOUNT_CURRENT_VALUE_CACHE_DURATION)
                .unwrap_or(true),
        }
    }
}

const QUORUM_CACHE_DURATION: Duration = Duration::from_secs(30 * 60);
const ACCOUNT_CURRENT_VALUE_CACHE_DURATION: Duration = Duration::from_secs(30);

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
enum ChainReadCacheKey {
    Decimals {
        chain_id: i32,
        contract_address: String,
    },
    Quorum {
        chain_id: i32,
        contract_address: String,
        args: Vec<String>,
        block_mode: BlockReadMode,
    },
    AccountCurrentValue {
        chain_id: i32,
        contract_address: String,
        method: ChainReadMethod,
        args: Vec<String>,
        block_mode: BlockReadMode,
    },
}

impl ChainReadCacheKey {
    fn from_read_key(key: &ChainReadKey) -> Option<Self> {
        match key.method {
            ChainReadMethod::Decimals => Some(Self::Decimals {
                chain_id: key.chain_id,
                contract_address: normalize_identifier(&key.contract_address),
            }),
            ChainReadMethod::Quorum => Some(Self::Quorum {
                chain_id: key.chain_id,
                contract_address: normalize_identifier(&key.contract_address),
                args: key
                    .args
                    .iter()
                    .map(|arg| normalize_identifier(arg))
                    .collect(),
                block_mode: key.block_mode,
            }),
            ChainReadMethod::BalanceOf
            | ChainReadMethod::GetVotes
            | ChainReadMethod::CurrentVotes => Some(Self::AccountCurrentValue {
                chain_id: key.chain_id,
                contract_address: normalize_identifier(&key.contract_address),
                method: key.method,
                args: key
                    .args
                    .iter()
                    .map(|arg| normalize_identifier(arg))
                    .collect(),
                block_mode: key.block_mode,
            }),
            _ => None,
        }
    }
}

impl ChainTool for EvmRpcChainTool {
    fn execute_read_plan(
        &self,
        plan: &ChainReadPlan,
    ) -> Result<ChainReadExecutionReport, PartialChainReadFailureReport> {
        let report = self.execute_read_plan_partial(plan);
        if !report.partial_failures.required_failures.is_empty() {
            return Err(report.partial_failures);
        }

        Ok(report)
    }

    fn execute_read_plan_partial(&self, plan: &ChainReadPlan) -> ChainReadExecutionReport {
        let mut results = Vec::new();
        let mut failures = PartialChainReadFailureReport::default();
        let mut cache_hits = 0;
        let mut executed_rpc_calls = 0;
        let mut covered_reads = vec![false; plan.reads.len()];

        let max_concurrency = plan.execution.max_concurrency.max(1);
        let shared_plan = Arc::new(plan.clone());
        for group_chunk in plan.execution.multicall_groups.chunks(max_concurrency) {
            let handles = group_chunk
                .iter()
                .cloned()
                .map(|group| {
                    let tool = self.clone();
                    let plan = Arc::clone(&shared_plan);
                    thread::spawn(move || tool.execute_multicall_group(&plan, &group))
                })
                .collect::<Vec<_>>();

            for handle in handles {
                let group_report = match handle.join() {
                    Ok(report) => report,
                    Err(_) => {
                        log::warn!(
                            "multicall worker thread panicked; falling back to per-read execution"
                        );
                        EvmRpcGroupExecutionReport::default()
                    }
                };
                cache_hits += group_report.cache_hits;
                executed_rpc_calls += group_report.executed_rpc_calls;
                for read_index in group_report.covered_read_indexes {
                    if let Some(covered) = covered_reads.get_mut(read_index) {
                        *covered = true;
                    }
                }
                results.extend(group_report.results);
                push_read_failures(plan, &mut failures, group_report.failures);
            }
        }

        for (read_index, read) in plan.reads.iter().enumerate() {
            if covered_reads.get(read_index).copied().unwrap_or(false) {
                continue;
            }
            match self.execute_read(read_index, read) {
                Ok((result, cache_hit)) => {
                    cache_hits += usize::from(cache_hit);
                    executed_rpc_calls += usize::from(!cache_hit);
                    results.push(result);
                }
                Err(message) => {
                    let failure = ChainReadFailure {
                        key: read.key.clone(),
                        kind: ChainReadFailureKind::Transport,
                        retryable: true,
                        message,
                    };
                    match read.requirement {
                        ReadRequirement::Required => failures.required_failures.push(failure),
                        ReadRequirement::Optional => failures.optional_failures.push(failure),
                    }
                }
            }
        }

        ChainReadExecutionReport {
            metrics: ChainReadMetrics {
                requested_reads: plan.metrics.requested_reads,
                deduped_reads: plan.metrics.deduped_reads,
                executed_rpc_calls,
                multicall_batch_size: plan.metrics.multicall_batch_size,
                failures: failures.required_failures.len() + failures.optional_failures.len(),
                cache_hits,
                ..ChainReadMetrics::default()
            },
            results,
            partial_failures: failures,
            ..ChainReadExecutionReport::default()
        }
    }
}

impl EvmRpcChainTool {
    fn execute_multicall_group(
        &self,
        plan: &ChainReadPlan,
        group: &MulticallReadGroup,
    ) -> EvmRpcGroupExecutionReport {
        let mut report = EvmRpcGroupExecutionReport::default();
        let mut calls = Vec::new();

        for read_index in &group.read_indexes {
            let Some(read) = plan.reads.get(*read_index) else {
                continue;
            };
            if !is_multicall_eligible(read) {
                continue;
            }

            if let Some(value) = self.cache.get(&read.key) {
                report.cache_hits += 1;
                report.covered_read_indexes.push(*read_index);
                report.results.push(ChainReadResult {
                    read_index: *read_index,
                    key: read.key.clone(),
                    value,
                });
                continue;
            }

            let call_key = self.current_power_call_key(&read.key);
            match encode_call_data(call_key.method, &call_key.args) {
                Ok(call_data) => calls.push(EvmMulticallRead {
                    read_index: *read_index,
                    read: read.clone(),
                    call_key,
                    call_data,
                }),
                Err(message) => {
                    report.covered_read_indexes.push(*read_index);
                    report.failures.push(ReadFailure {
                        read_index: *read_index,
                        message,
                        kind: ChainReadFailureKind::Internal,
                        retryable: false,
                    });
                }
            }
        }

        if calls.is_empty() {
            return report;
        }

        let call_data = match encode_aggregate3_call_data(&calls) {
            Ok(call_data) => call_data,
            Err(message) => {
                for call in calls {
                    report.covered_read_indexes.push(call.read_index);
                    report.failures.push(ReadFailure {
                        read_index: call.read_index,
                        message: message.clone(),
                        kind: ChainReadFailureKind::Internal,
                        retryable: false,
                    });
                }
                return report;
            }
        };

        match self.eth_call(MULTICALL3_ADDRESS, &call_data, group.block_mode) {
            Ok(value) => {
                report.executed_rpc_calls += 1;
                match decode_aggregate3_results(&value, calls.len()) {
                    Ok(results) => {
                        self.apply_multicall_results(calls, results, &mut report, false);
                    }
                    Err(message) => {
                        report.executed_rpc_calls = report.executed_rpc_calls.saturating_sub(1);
                        self.execute_multicall_fallback(calls, &mut report, message);
                    }
                }
            }
            Err(message) => {
                let latest_fallback_applicable = calls.iter().all(|call| {
                    should_try_latest_block_fallback_for_read(&call.read, call.call_key.method)
                });
                if should_try_latest_block_fallback_after_error(&message)
                    && latest_fallback_applicable
                {
                    if self
                        .execute_latest_multicall_fallback(calls.clone(), &mut report)
                        .is_ok()
                    {
                        return report;
                    }
                    self.execute_multicall_fallback(calls, &mut report, message);
                } else if should_try_latest_block_fallback_after_error(&message) {
                    self.execute_multicall_fallback(calls, &mut report, message);
                } else if should_try_direct_fallback_after_multicall_error(&message) {
                    self.execute_multicall_fallback(calls, &mut report, message);
                } else {
                    fail_multicall_group(calls, &mut report, message);
                }
            }
        }

        report
    }

    fn execute_latest_multicall_fallback(
        &self,
        calls: Vec<EvmMulticallRead>,
        report: &mut EvmRpcGroupExecutionReport,
    ) -> Result<(), String> {
        if !calls
            .iter()
            .all(|call| should_try_latest_block_fallback_for_read(&call.read, call.call_key.method))
        {
            return Err("latest multicall fallback is not applicable".to_owned());
        }

        let call_data = encode_aggregate3_call_data(&calls)?;
        let value = self.eth_call(MULTICALL3_ADDRESS, &call_data, BlockReadMode::Latest)?;
        report.executed_rpc_calls += 1;
        let results = decode_aggregate3_results(&value, calls.len())?;
        self.apply_multicall_results(calls, results, report, true);

        Ok(())
    }

    fn apply_multicall_results(
        &self,
        calls: Vec<EvmMulticallRead>,
        results: Vec<Aggregate3Result>,
        report: &mut EvmRpcGroupExecutionReport,
        cache_latest_key: bool,
    ) {
        for (call, result) in calls.into_iter().zip(results) {
            report.covered_read_indexes.push(call.read_index);
            if !result.success {
                match self.execute_power_method_fallback(
                    call.read_index,
                    &call.read,
                    call.call_key.method,
                ) {
                    PowerMethodFallbackOutcome::Success { result, cache_hit } => {
                        report.cache_hits += usize::from(cache_hit);
                        report.executed_rpc_calls += usize::from(!cache_hit);
                        report.results.push(result);
                        continue;
                    }
                    PowerMethodFallbackOutcome::Failure {
                        failure,
                        rpc_attempted,
                    } => {
                        report.executed_rpc_calls += usize::from(rpc_attempted);
                        report.failures.push(failure);
                        continue;
                    }
                    PowerMethodFallbackOutcome::NotApplicable => {}
                }
                report.failures.push(ReadFailure {
                    read_index: call.read_index,
                    message: "multicall subcall reverted".to_owned(),
                    kind: ChainReadFailureKind::Reverted,
                    retryable: false,
                });
                continue;
            }

            match decode_call_value(call.call_key.method, &result.return_data) {
                Ok(value) => {
                    let cache_key = if cache_latest_key {
                        ChainReadKey {
                            block_mode: BlockReadMode::Latest,
                            ..call.call_key.clone()
                        }
                    } else {
                        call.call_key.clone()
                    };
                    self.cache.insert(&cache_key, value.clone());
                    self.cache.insert(&call.read.key, value.clone());
                    self.current_power_methods
                        .insert(&call.read.key, call.call_key.method);
                    report.results.push(ChainReadResult {
                        read_index: call.read_index,
                        key: call.read.key,
                        value,
                    });
                }
                Err(message) => report.failures.push(ReadFailure {
                    read_index: call.read_index,
                    message,
                    kind: ChainReadFailureKind::Decode,
                    retryable: false,
                }),
            }
        }
    }

    fn execute_multicall_fallback(
        &self,
        calls: Vec<EvmMulticallRead>,
        report: &mut EvmRpcGroupExecutionReport,
        multicall_error: String,
    ) {
        for call in calls {
            report.covered_read_indexes.push(call.read_index);
            match self.execute_read(call.read_index, &call.read) {
                Ok((result, cache_hit)) => {
                    report.cache_hits += usize::from(cache_hit);
                    report.executed_rpc_calls += usize::from(!cache_hit);
                    report.results.push(result);
                }
                Err(message) => report.failures.push(ReadFailure {
                    read_index: call.read_index,
                    message: format!(
                        "multicall failed: {multicall_error}; fallback failed: {message}"
                    ),
                    kind: ChainReadFailureKind::Transport,
                    retryable: true,
                }),
            }
        }
    }

    fn execute_read(
        &self,
        read_index: usize,
        read: &crate::ChainReadRequest,
    ) -> Result<(ChainReadResult, bool), String> {
        if read.key.method == ChainReadMethod::TimelockOperationState {
            return self
                .execute_timelock_operation_state(read_index, read)
                .map(|result| (result, false));
        }
        if read.key.method == ChainReadMethod::BlockTimestamp {
            return self
                .execute_block_timestamp(read_index, read)
                .map(|result| (result, false));
        }

        if let Some(value) = self.cache.get(&read.key) {
            return Ok((
                ChainReadResult {
                    read_index,
                    key: read.key.clone(),
                    value,
                },
                true,
            ));
        }

        let call_key = self.current_power_call_key(&read.key);
        let data = encode_call_data(call_key.method, &call_key.args)?;
        let result = match self.eth_call(&call_key.contract_address, &data, call_key.block_mode) {
            Ok(result) => result,
            Err(message) => {
                if should_try_latest_block_fallback_after_error(&message) {
                    match self.execute_latest_block_fallback(read_index, read, call_key.method) {
                        Ok((result, cache_hit)) => return Ok((result, cache_hit)),
                        Err(fallback_message) => {
                            log::warn!(
                                "latest block fallback failed after historical state read error read_method={:?} error={} fallback_error={}",
                                call_key.method,
                                message,
                                fallback_message
                            );
                        }
                    }
                }
                if should_try_power_method_fallback_after_direct_error(&message) {
                    match self.execute_power_method_fallback(read_index, read, call_key.method) {
                        PowerMethodFallbackOutcome::Success { result, cache_hit } => {
                            return Ok((result, cache_hit));
                        }
                        PowerMethodFallbackOutcome::Failure { failure, .. } => {
                            return Err(failure.message);
                        }
                        PowerMethodFallbackOutcome::NotApplicable => {}
                    }
                }
                return Err(message);
            }
        };
        let value = match decode_call_value(call_key.method, &result) {
            Ok(value) => value,
            Err(message) => {
                match self.execute_power_method_fallback(read_index, read, call_key.method) {
                    PowerMethodFallbackOutcome::Success { result, cache_hit } => {
                        return Ok((result, cache_hit));
                    }
                    PowerMethodFallbackOutcome::Failure { failure, .. } => {
                        return Err(failure.message);
                    }
                    PowerMethodFallbackOutcome::NotApplicable => return Err(message),
                }
            }
        };
        self.cache.insert(&call_key, value.clone());
        self.cache.insert(&read.key, value.clone());
        self.current_power_methods
            .insert(&read.key, call_key.method);

        Ok((
            ChainReadResult {
                read_index,
                key: read.key.clone(),
                value,
            },
            false,
        ))
    }

    fn execute_latest_block_fallback(
        &self,
        read_index: usize,
        read: &crate::ChainReadRequest,
        method: ChainReadMethod,
    ) -> Result<(ChainReadResult, bool), String> {
        if !should_try_latest_block_fallback_for_read(read, method) {
            return Err("latest block fallback is not applicable".to_owned());
        }

        let fallback_key = ChainReadKey {
            method,
            block_mode: BlockReadMode::Latest,
            ..read.key.clone()
        };
        if let Some(value) = self.cache.get(&fallback_key) {
            self.cache.insert(&read.key, value.clone());
            return Ok((
                ChainReadResult {
                    read_index,
                    key: read.key.clone(),
                    value,
                },
                true,
            ));
        }

        let data = encode_call_data(fallback_key.method, &fallback_key.args)?;
        let result = self.eth_call(
            &fallback_key.contract_address,
            &data,
            fallback_key.block_mode,
        )?;
        let value = decode_call_value(fallback_key.method, &result)?;
        self.cache.insert(&fallback_key, value.clone());
        self.cache.insert(&read.key, value.clone());
        self.current_power_methods
            .insert(&read.key, fallback_key.method);

        Ok((
            ChainReadResult {
                read_index,
                key: read.key.clone(),
                value,
            },
            false,
        ))
    }

    fn execute_power_method_fallback(
        &self,
        read_index: usize,
        read: &crate::ChainReadRequest,
        failed_method: ChainReadMethod,
    ) -> PowerMethodFallbackOutcome {
        let Some(fallback_method) = alternate_current_power_method(failed_method) else {
            return PowerMethodFallbackOutcome::NotApplicable;
        };
        let fallback_key = ChainReadKey {
            method: fallback_method,
            ..read.key.clone()
        };
        if let Some(value) = self.cache.get(&fallback_key) {
            self.cache.insert(&read.key, value.clone());
            return PowerMethodFallbackOutcome::Success {
                result: ChainReadResult {
                    read_index,
                    key: read.key.clone(),
                    value,
                },
                cache_hit: true,
            };
        }

        let data = match encode_call_data(fallback_method, &read.key.args) {
            Ok(data) => data,
            Err(message) => {
                return PowerMethodFallbackOutcome::Failure {
                    failure: power_method_fallback_failure(
                        read_index,
                        format!("alternate current power method encode failed: {message}"),
                        ChainReadFailureKind::Internal,
                        false,
                    ),
                    rpc_attempted: false,
                };
            }
        };
        let result = match self.eth_call(&read.key.contract_address, &data, read.key.block_mode) {
            Ok(result) => result,
            Err(message) => {
                return PowerMethodFallbackOutcome::Failure {
                    failure: power_method_fallback_failure(
                        read_index,
                        format!("alternate current power method eth_call failed: {message}"),
                        ChainReadFailureKind::Transport,
                        true,
                    ),
                    rpc_attempted: true,
                };
            }
        };
        let value = match decode_call_value(fallback_method, &result) {
            Ok(value) => value,
            Err(message) => {
                return PowerMethodFallbackOutcome::Failure {
                    failure: power_method_fallback_failure(
                        read_index,
                        format!("alternate current power method decode failed: {message}"),
                        ChainReadFailureKind::Decode,
                        false,
                    ),
                    rpc_attempted: true,
                };
            }
        };
        self.cache.insert(&fallback_key, value.clone());
        self.cache.insert(&read.key, value.clone());
        self.current_power_methods
            .insert(&read.key, fallback_method);

        PowerMethodFallbackOutcome::Success {
            result: ChainReadResult {
                read_index,
                key: read.key.clone(),
                value,
            },
            cache_hit: false,
        }
    }

    fn execute_block_timestamp(
        &self,
        read_index: usize,
        read: &crate::ChainReadRequest,
    ) -> Result<ChainReadResult, String> {
        let block_number = read
            .key
            .args
            .first()
            .ok_or_else(|| "missing block number argument for BlockTimestamp".to_owned())?;
        let timestamp_seconds = self.eth_get_block_timestamp(block_number)?;

        Ok(ChainReadResult {
            read_index,
            key: read.key.clone(),
            value: ChainReadValue::Integer(
                timestamp_seconds
                    .checked_mul(1_000)
                    .ok_or_else(|| "block timestamp overflow".to_owned())?
                    .to_string(),
            ),
        })
    }

    fn current_power_call_key(&self, key: &ChainReadKey) -> ChainReadKey {
        let Some(method) = self.current_power_methods.get(key) else {
            return key.clone();
        };
        if method == key.method {
            return key.clone();
        }

        ChainReadKey {
            method,
            ..key.clone()
        }
    }

    fn execute_timelock_operation_state(
        &self,
        read_index: usize,
        read: &crate::ChainReadRequest,
    ) -> Result<ChainReadResult, String> {
        let operation_id =
            read.key.args.first().ok_or_else(|| {
                "missing operation id argument for TimelockOperationState".to_owned()
            })?;
        let state = if self.eth_call_bool(
            &read.key.contract_address,
            "isOperationDone(bytes32)",
            operation_id,
            read.key.block_mode,
        )? {
            "3"
        } else if self.eth_call_bool(
            &read.key.contract_address,
            "isOperationReady(bytes32)",
            operation_id,
            read.key.block_mode,
        )? {
            "2"
        } else if self.eth_call_bool(
            &read.key.contract_address,
            "isOperationPending(bytes32)",
            operation_id,
            read.key.block_mode,
        )? {
            "1"
        } else {
            "0"
        };

        Ok(ChainReadResult {
            read_index,
            key: read.key.clone(),
            value: ChainReadValue::Integer(state.to_owned()),
        })
    }

    fn eth_call_bool(
        &self,
        contract_address: &str,
        signature: &str,
        operation_id: &str,
        block_mode: BlockReadMode,
    ) -> Result<bool, String> {
        let data = encode_function_call(signature, vec![bytes32_argument(operation_id)?])?;
        let result = self.eth_call(contract_address, &data, block_mode)?;
        decode_bool(&result)
    }

    fn eth_call(
        &self,
        contract_address: &str,
        data: &str,
        block_mode: BlockReadMode,
    ) -> Result<String, String> {
        self.rpc_client.eth_call(contract_address, data, block_mode)
    }

    fn eth_get_block_timestamp(&self, block_number: &str) -> Result<u128, String> {
        self.rpc_client.eth_get_block_timestamp(block_number)
    }
}

fn fail_multicall_group(
    calls: Vec<EvmMulticallRead>,
    report: &mut EvmRpcGroupExecutionReport,
    multicall_error: String,
) {
    for call in calls {
        report.covered_read_indexes.push(call.read_index);
        report.failures.push(ReadFailure {
            read_index: call.read_index,
            message: format!("multicall failed: {multicall_error}"),
            kind: ChainReadFailureKind::Transport,
            retryable: true,
        });
    }
}

fn should_try_power_method_fallback_after_direct_error(message: &str) -> bool {
    let message = message.to_ascii_lowercase();
    message.contains("execution reverted") || message.contains("revert")
}

fn should_try_latest_block_fallback_after_error(message: &str) -> bool {
    let message = message.to_ascii_lowercase();
    (message.contains("historical state") && message.contains("not available"))
        || message.contains("endpoint missing data")
        || message.contains("remote endpoint does not have this data")
}

fn should_try_direct_fallback_after_multicall_error(message: &str) -> bool {
    message.to_ascii_lowercase().contains("out of gas")
}

fn is_reverted_balance_read_failure(messages: &[String]) -> bool {
    !messages.is_empty()
        && messages.iter().all(|message| {
            let message = message.to_ascii_lowercase();
            message.contains("revert")
        })
}

fn should_try_latest_block_fallback_for_read(
    read: &crate::ChainReadRequest,
    method: ChainReadMethod,
) -> bool {
    read.requirement == ReadRequirement::Required
        && matches!(read.key.block_mode, BlockReadMode::AtBlock(_))
        && matches!(
            method,
            ChainReadMethod::BalanceOf | ChainReadMethod::GetVotes | ChainReadMethod::CurrentVotes
        )
}

fn power_method_fallback_failure(
    read_index: usize,
    message: String,
    kind: ChainReadFailureKind,
    retryable: bool,
) -> ReadFailure {
    ReadFailure {
        read_index,
        message: format!("multicall subcall reverted; {message}"),
        kind,
        retryable,
    }
}

#[derive(Clone, Debug)]
struct EvmMulticallRead {
    read_index: usize,
    read: ChainReadRequest,
    call_key: ChainReadKey,
    call_data: String,
}

#[derive(Clone, Debug, Default)]
struct EvmRpcGroupExecutionReport {
    results: Vec<ChainReadResult>,
    failures: Vec<ReadFailure>,
    covered_read_indexes: Vec<usize>,
    cache_hits: usize,
    executed_rpc_calls: usize,
}

#[derive(Clone, Debug)]
struct ReadFailure {
    read_index: usize,
    message: String,
    kind: ChainReadFailureKind,
    retryable: bool,
}

#[derive(Clone, Debug)]
enum PowerMethodFallbackOutcome {
    NotApplicable,
    Success {
        result: ChainReadResult,
        cache_hit: bool,
    },
    Failure {
        failure: ReadFailure,
        rpc_attempted: bool,
    },
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
struct OnchainRefreshApplyBatchReport {
    completed: usize,
    debounced_tasks: usize,
    data_metric_refreshes: usize,
}

fn validate_read_value(
    task: &OnchainRefreshTask,
    value: &OnchainRefreshReadValue,
) -> Result<(), OnchainRefreshWorkerError> {
    if task.refresh_power && value.power.is_none() {
        return Err(OnchainRefreshWorkerError::MissingReadValue {
            task_id: task.id.clone(),
            field: "power",
        });
    }
    if task.refresh_balance
        && value.balance.is_none()
        && value.checkpoint_balance.is_none()
        && !effective_refresh_power(task, value)
    {
        return Err(OnchainRefreshWorkerError::MissingReadValue {
            task_id: task.id.clone(),
            field: "balance",
        });
    }

    Ok(())
}

async fn upsert_contributor_refresh(
    transaction: &mut Transaction<'_, Postgres>,
    successes: &[(OnchainRefreshTask, OnchainRefreshReadValue)],
) -> Result<(), sqlx::Error> {
    for refresh_power in [false, true] {
        for refresh_balance in [false, true] {
            let group = successes
                .iter()
                .filter(|(task, _value)| {
                    effective_refresh_power(task, _value) == refresh_power
                        && effective_refresh_balance(task, _value) == refresh_balance
                })
                .collect::<Vec<_>>();
            if group.is_empty() {
                continue;
            }
            upsert_contributor_refresh_group(transaction, &group, refresh_power, refresh_balance)
                .await?;
        }
    }

    Ok(())
}

async fn upsert_contributor_refresh_group(
    transaction: &mut Transaction<'_, Postgres>,
    successes: &[&(OnchainRefreshTask, OnchainRefreshReadValue)],
    refresh_power: bool,
    refresh_balance: bool,
) -> Result<(), sqlx::Error> {
    let mut query = QueryBuilder::<Postgres>::new(
        "INSERT INTO contributor (
            id, contract_set_id, chain_id, dao_code, governor_address, token_address, contract_address,
            log_index, transaction_index, block_number, block_timestamp, transaction_hash,
            power, balance, delegates_count_all, delegates_count_effective
         )
         ",
    );
    query.push_values(successes, |mut values, (task, value)| {
        values
            .push_bind(contributor_ref(task))
            .push_bind(&task.contract_set_id)
            .push_bind(task.chain_id)
            .push_bind(&task.dao_code)
            .push_bind(&task.governor_address)
            .push_bind(&task.token_address)
            .push_bind(&task.token_address)
            .push("0")
            .push("0")
            .push_bind(&task.last_seen_block_number)
            .push_unseparated("::NUMERIC(78, 0)")
            .push_bind(&task.last_seen_block_timestamp)
            .push_unseparated("::NUMERIC(78, 0)")
            .push_bind(&task.last_seen_transaction_hash)
            .push("CASE WHEN ")
            .push_bind_unseparated(effective_refresh_power(task, value))
            .push_unseparated(" THEN ")
            .push_bind_unseparated(value.power_for_current_update())
            .push_unseparated("::NUMERIC(78, 0) ELSE 0::NUMERIC(78, 0) END")
            .push("CASE WHEN ")
            .push_bind_unseparated(effective_refresh_balance(task, value))
            .push_unseparated(" THEN ")
            .push_bind_unseparated(value.balance_for_current_update())
            .push_unseparated("::NUMERIC(78, 0) ELSE NULL END")
            .push("0")
            .push("0");
    });
    query.push(
        "
         ON CONFLICT (contract_set_id, id) DO UPDATE
         SET chain_id = EXCLUDED.chain_id,
             dao_code = EXCLUDED.dao_code,
             governor_address = EXCLUDED.governor_address,
             token_address = EXCLUDED.token_address,
             contract_address = EXCLUDED.contract_address,
             block_number = GREATEST(contributor.block_number, EXCLUDED.block_number),
             block_timestamp = GREATEST(contributor.block_timestamp, EXCLUDED.block_timestamp),
             transaction_hash = EXCLUDED.transaction_hash,
             power = CASE WHEN ",
    );
    query
        .push_bind(refresh_power)
        .push(" THEN EXCLUDED.power ELSE contributor.power END, balance = CASE WHEN ")
        .push_bind(refresh_balance)
        .push(" THEN EXCLUDED.balance ELSE contributor.balance END");
    query.build().execute(&mut **transaction).await?;

    Ok(())
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
struct DelegateRelationBalanceRefreshKey {
    contract_set_id: String,
    chain_id: i32,
    dao_code: Option<String>,
    governor_address: String,
    token_address: String,
    account: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct DelegateRelationBalanceRefresh {
    key: DelegateRelationBalanceRefreshKey,
    balance: String,
}

async fn reconcile_current_delegate_relation_power_from_balance(
    transaction: &mut Transaction<'_, Postgres>,
    successes: &[(OnchainRefreshTask, OnchainRefreshReadValue)],
) -> Result<(), sqlx::Error> {
    let mut refreshes_by_key = BTreeMap::new();
    for (task, value) in successes {
        let Some(balance) = value
            .balance_for_current_update()
            .filter(|_| effective_refresh_balance(task, value))
        else {
            continue;
        };
        let key = DelegateRelationBalanceRefreshKey {
            contract_set_id: task.contract_set_id.clone(),
            chain_id: task.chain_id,
            dao_code: task.dao_code.clone(),
            governor_address: task.governor_address.clone(),
            token_address: task.token_address.clone(),
            account: task.account.clone(),
        };
        refreshes_by_key.insert(
            key.clone(),
            DelegateRelationBalanceRefresh {
                key,
                balance: balance.to_owned(),
            },
        );
    }

    if refreshes_by_key.is_empty() {
        return Ok(());
    }

    let refreshes = refreshes_by_key.into_values().collect::<Vec<_>>();
    for chunk in refreshes.chunks(MAX_ONCHAIN_REFRESH_APPLY_ROWS) {
        let mut query = QueryBuilder::<Postgres>::new("");
        push_delegate_relation_balance_refresh_query(&mut query, chunk);
        query.build().fetch_one(&mut **transaction).await?;
    }

    Ok(())
}

fn push_delegate_relation_balance_refresh_query<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    refreshes: &[DelegateRelationBalanceRefresh],
) {
    let contract_set_ids = refreshes
        .iter()
        .map(|refresh| refresh.key.contract_set_id.clone())
        .collect::<Vec<_>>();
    let chain_ids = refreshes
        .iter()
        .map(|refresh| refresh.key.chain_id)
        .collect::<Vec<_>>();
    let dao_codes = refreshes
        .iter()
        .map(|refresh| refresh.key.dao_code.clone())
        .collect::<Vec<_>>();
    let governor_addresses = refreshes
        .iter()
        .map(|refresh| refresh.key.governor_address.clone())
        .collect::<Vec<_>>();
    let token_addresses = refreshes
        .iter()
        .map(|refresh| refresh.key.token_address.clone())
        .collect::<Vec<_>>();
    let delegators = refreshes
        .iter()
        .map(|refresh| refresh.key.account.clone())
        .collect::<Vec<_>>();
    let balances = refreshes
        .iter()
        .map(|refresh| refresh.balance.clone())
        .collect::<Vec<_>>();

    query
        .push(
            "WITH refreshed AS MATERIALIZED (
                SELECT
                    contract_set_id,
                    chain_id,
                    dao_code,
                    governor_address,
                    token_address,
                    delegator,
                    balance_text::NUMERIC(78, 0) AS balance
                FROM unnest(",
        )
        .push_bind(contract_set_ids)
        .push("::TEXT[], ")
        .push_bind(chain_ids)
        .push("::INT4[], ")
        .push_bind(dao_codes)
        .push("::TEXT[], ")
        .push_bind(governor_addresses)
        .push("::TEXT[], ")
        .push_bind(token_addresses)
        .push("::TEXT[], ")
        .push_bind(delegators)
        .push("::TEXT[], ")
        .push_bind(balances)
        .push(
            "::TEXT[]
                ) AS refreshed_input (
                    contract_set_id, chain_id, dao_code, governor_address, token_address,
                    delegator, balance_text
                )
             ),
             current_edges AS (
                SELECT DISTINCT ON (delegate.contract_set_id, delegate.id)
                    delegate.contract_set_id,
                    delegate.id,
                    delegate.from_delegate,
                    delegate.to_delegate,
                    delegate.power AS previous_power,
                    refreshed.balance AS new_power
                FROM delegate
                JOIN refreshed
                  ON refreshed.contract_set_id = delegate.contract_set_id
                 AND refreshed.chain_id = delegate.chain_id
                 AND refreshed.dao_code IS NOT DISTINCT FROM delegate.dao_code
                 AND refreshed.governor_address IS NOT DISTINCT FROM delegate.governor_address
                 AND (
                    delegate.token_address IS NOT DISTINCT FROM refreshed.token_address
                    OR delegate.token_address IS NULL
                 )
                 AND refreshed.delegator = delegate.from_delegate
                WHERE delegate.is_current = TRUE
                ORDER BY delegate.contract_set_id, delegate.id
             ),
             mapping_edges AS (
                SELECT
                    delegate_mapping.contract_set_id,
                    delegate_mapping.id,
                    delegate_mapping.\"from\",
                    delegate_mapping.\"to\" AS to_delegate,
                    delegate_mapping.power AS previous_power,
                    current_edges.new_power,
                    CASE
                        WHEN delegate_mapping.power <= 0 AND current_edges.new_power > 0 THEN 1
                        WHEN delegate_mapping.power > 0 AND current_edges.new_power <= 0 THEN -1
                        ELSE 0
                    END AS effective_count_delta
                FROM delegate_mapping
                JOIN current_edges
                  ON current_edges.contract_set_id = delegate_mapping.contract_set_id
                 AND current_edges.from_delegate = delegate_mapping.id
                 AND current_edges.from_delegate = delegate_mapping.\"from\"
                 AND current_edges.to_delegate = delegate_mapping.\"to\"
                WHERE delegate_mapping.power IS DISTINCT FROM current_edges.new_power
             ),
             updated_delegates AS (
                UPDATE delegate
                SET power = current_edges.new_power
                FROM current_edges
                WHERE delegate.contract_set_id = current_edges.contract_set_id
                  AND delegate.id = current_edges.id
                  AND delegate.power IS DISTINCT FROM current_edges.new_power
                RETURNING delegate.contract_set_id, delegate.to_delegate
             ),
             updated_delegate_mappings AS (
                UPDATE delegate_mapping
                SET power = mapping_edges.new_power
                FROM mapping_edges
                WHERE delegate_mapping.contract_set_id = mapping_edges.contract_set_id
                  AND delegate_mapping.id = mapping_edges.id
                  AND delegate_mapping.\"from\" = mapping_edges.\"from\"
                  AND delegate_mapping.\"to\" = mapping_edges.to_delegate
                  AND delegate_mapping.power IS DISTINCT FROM mapping_edges.new_power
                RETURNING
                    mapping_edges.contract_set_id,
                    mapping_edges.to_delegate,
                    mapping_edges.effective_count_delta
             ),
             effective_count_deltas AS (
                SELECT
                    contract_set_id,
                    to_delegate,
                    SUM(effective_count_delta)::INT AS count_delta
                FROM updated_delegate_mappings
                WHERE effective_count_delta <> 0
                GROUP BY contract_set_id, to_delegate
             ),
             updated_effective_counts AS (
                UPDATE contributor
                SET delegates_count_effective =
                    GREATEST(0, contributor.delegates_count_effective + effective_count_deltas.count_delta)
                FROM effective_count_deltas
                WHERE contributor.contract_set_id = effective_count_deltas.contract_set_id
                  AND contributor.id = effective_count_deltas.to_delegate
                RETURNING contributor.id
             )
             SELECT
                (SELECT count(*)::BIGINT FROM updated_delegates) AS delegate_updates,
                (SELECT count(*)::BIGINT FROM updated_delegate_mappings) AS mapping_updates,
                (SELECT count(*)::BIGINT FROM updated_effective_counts) AS count_updates",
        );
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
struct ContributorRefreshValues {
    power: Option<String>,
    balance: Option<String>,
}

async fn read_contributor_refresh_values(
    transaction: &mut Transaction<'_, Postgres>,
    successes: &[(OnchainRefreshTask, OnchainRefreshReadValue)],
) -> Result<BTreeMap<(String, String), ContributorRefreshValues>, sqlx::Error> {
    if successes.is_empty() {
        return Ok(BTreeMap::new());
    }

    let mut values = BTreeMap::new();
    for chunk in successes.chunks(MAX_ONCHAIN_REFRESH_APPLY_ROWS) {
        let mut query = QueryBuilder::<Postgres>::new(
            "SELECT contract_set_id, id, power::TEXT AS power, balance::TEXT AS balance
             FROM contributor
             WHERE (contract_set_id, id) IN ",
        );
        query.push_tuples(chunk, |mut tuple, (task, _value)| {
            tuple
                .push_bind(&task.contract_set_id)
                .push_bind(contributor_ref(task));
        });

        for row in query.build().fetch_all(&mut **transaction).await? {
            values.insert(
                (row.get("contract_set_id"), row.get("id")),
                ContributorRefreshValues {
                    power: row.get("power"),
                    balance: row.get("balance"),
                },
            );
        }
    }

    Ok(values)
}

async fn insert_refresh_checkpoints(
    transaction: &mut Transaction<'_, Postgres>,
    successes: &[(OnchainRefreshTask, OnchainRefreshReadValue)],
    previous_values: &BTreeMap<(String, String), ContributorRefreshValues>,
    current_power_method: ChainReadMethod,
) -> Result<(), sqlx::Error> {
    let balance_successes = successes
        .iter()
        .filter(|(task, value)| checkpoint_balance_value(task, value).is_some())
        .collect::<Vec<_>>();
    if !balance_successes.is_empty() {
        let mut query = QueryBuilder::<Postgres>::new(
            "INSERT INTO token_balance_checkpoint (
                id, contract_set_id, chain_id, dao_code, governor_address, token_address, contract_address,
                account, previous_balance, new_balance, delta, source, cause, block_number,
                block_timestamp, transaction_hash
             )
             ",
        );
        query.push_values(balance_successes, |mut values, (task, value)| {
            let previous = previous_values
                .get(&(task.contract_set_id.clone(), contributor_ref(task)))
                .cloned()
                .unwrap_or_default();
            let previous_balance = previous.balance.unwrap_or_else(|| "0".to_owned());
            let new_balance = checkpoint_balance_value(task, value).unwrap_or("0");
            values
                .push_bind(format!(
                    "onchain-refresh-balance-{}",
                    onchain_refresh_checkpoint_scope(task)
                ))
                .push_bind(&task.contract_set_id)
                .push_bind(task.chain_id)
                .push_bind(&task.dao_code)
                .push_bind(&task.governor_address)
                .push_bind(&task.token_address)
                .push_bind(&task.token_address)
                .push_bind(&task.account)
                .push_bind(previous_balance.clone())
                .push_unseparated("::NUMERIC(78, 0)")
                .push_bind(new_balance)
                .push_unseparated("::NUMERIC(78, 0)")
                .push("(")
                .push_bind_unseparated(new_balance)
                .push_unseparated("::NUMERIC(78, 0) - ")
                .push_bind_unseparated(previous_balance)
                .push_unseparated("::NUMERIC(78, 0))")
                .push("'balanceOf'")
                .push("'onchain-refresh'")
                .push_bind(&task.last_seen_block_number)
                .push_unseparated("::NUMERIC(78, 0)")
                .push_bind(&task.last_seen_block_timestamp)
                .push_unseparated("::NUMERIC(78, 0)")
                .push("'onchain-refresh'");
        });
        query.push(" ON CONFLICT (contract_set_id, id) DO NOTHING");
        query.build().execute(&mut **transaction).await?;
    }

    let power_successes = successes
        .iter()
        .filter(|(task, value)| checkpoint_power_value(task, value).is_some())
        .collect::<Vec<_>>();
    if !power_successes.is_empty() {
        let source = current_power_checkpoint_source(current_power_method);
        let mut query = QueryBuilder::<Postgres>::new(
            "INSERT INTO vote_power_checkpoint (
                id, contract_set_id, chain_id, dao_code, governor_address, token_address, contract_address,
                account, clock_mode, timepoint, previous_power, new_power, delta, source, cause,
                block_number, block_timestamp, transaction_hash
             )
             ",
        );
        query.push_values(power_successes, |mut values, (task, value)| {
            let previous = previous_values
                .get(&(task.contract_set_id.clone(), contributor_ref(task)))
                .cloned()
                .unwrap_or_default();
            let previous_power = previous.power.unwrap_or_else(|| "0".to_owned());
            let new_power = checkpoint_power_value(task, value).unwrap_or("0");
            values
                .push_bind(format!(
                    "onchain-refresh-power-{}",
                    onchain_refresh_checkpoint_scope(task)
                ))
                .push_bind(&task.contract_set_id)
                .push_bind(task.chain_id)
                .push_bind(&task.dao_code)
                .push_bind(&task.governor_address)
                .push_bind(&task.token_address)
                .push_bind(&task.token_address)
                .push_bind(&task.account)
                .push("'blocknumber'")
                .push_bind(&task.last_seen_block_number)
                .push_unseparated("::NUMERIC(78, 0)")
                .push_bind(previous_power.clone())
                .push_unseparated("::NUMERIC(78, 0)")
                .push_bind(new_power)
                .push_unseparated("::NUMERIC(78, 0)")
                .push("(")
                .push_bind_unseparated(new_power)
                .push_unseparated("::NUMERIC(78, 0) - ")
                .push_bind_unseparated(previous_power)
                .push_unseparated("::NUMERIC(78, 0))")
                .push_bind(source)
                .push("'onchain-refresh'")
                .push_bind(&task.last_seen_block_number)
                .push_unseparated("::NUMERIC(78, 0)")
                .push_bind(&task.last_seen_block_timestamp)
                .push_unseparated("::NUMERIC(78, 0)")
                .push("'onchain-refresh'");
        });
        query.push(" ON CONFLICT (contract_set_id, id) DO NOTHING");
        query.build().execute(&mut **transaction).await?;
    }

    Ok(())
}

fn checkpoint_balance_value<'a>(
    task: &OnchainRefreshTask,
    value: &'a OnchainRefreshReadValue,
) -> Option<&'a str> {
    effective_refresh_balance(task, value)
        .then_some(value.checkpoint_balance.as_deref())
        .flatten()
}

fn checkpoint_power_value<'a>(
    task: &OnchainRefreshTask,
    value: &'a OnchainRefreshReadValue,
) -> Option<&'a str> {
    effective_refresh_power(task, value)
        .then_some(value.checkpoint_power.as_deref())
        .flatten()
}

fn effective_refresh_balance(task: &OnchainRefreshTask, value: &OnchainRefreshReadValue) -> bool {
    task.refresh_balance && value.balance_for_current_update().is_some()
}

fn effective_refresh_power(task: &OnchainRefreshTask, value: &OnchainRefreshReadValue) -> bool {
    task.refresh_power && value.power_for_current_update().is_some()
}

async fn upsert_live_power_overlays(
    transaction: &mut Transaction<'_, Postgres>,
    successes: &[(OnchainRefreshTask, OnchainRefreshReadValue)],
) -> Result<(), sqlx::Error> {
    let contributors = live_contributor_power_overlay_writes(successes);
    if contributors.is_empty() {
        return Ok(());
    }

    upsert_live_contributor_power_overlays(transaction, &contributors).await?;
    let relations = read_live_delegate_power_overlay_relations(transaction, &contributors).await?;
    let delegates = provisional_delegate_power_overlay_writes(&contributors, &relations);
    upsert_live_delegate_power_overlays(transaction, &delegates).await?;

    Ok(())
}

fn live_contributor_power_overlay_writes(
    successes: &[(OnchainRefreshTask, OnchainRefreshReadValue)],
) -> Vec<ProvisionalContributorPowerOverlayWrite> {
    successes
        .iter()
        .filter_map(|(task, value)| {
            let power = value.power_for_current_update()?;
            effective_refresh_power(task, value).then(|| ProvisionalContributorPowerOverlayWrite {
                id: provisional_contributor_power_overlay_id(task),
                segment_id: None,
                dao_code: task.dao_code.clone(),
                contract_set_id: task.contract_set_id.clone(),
                chain_id: Some(task.chain_id),
                chain_name: None,
                governor_address: Some(normalize_identifier(&task.governor_address)),
                token_address: Some(normalize_identifier(&task.token_address)),
                account: normalize_identifier(&task.account),
                power: power.to_owned(),
                balance: value.balance_for_current_update().map(str::to_owned),
                delegates_count_all: 0,
                delegates_count_effective: 0,
                last_vote_block_number: None,
                last_vote_timestamp: None,
                source: "live-onchain".to_owned(),
                status: "available".to_owned(),
                anchor_block_number: Some(task.last_seen_block_number.clone()),
                anchor_block_hash: None,
                anchor_parent_hash: None,
                anchor_block_timestamp: Some(task.last_seen_block_timestamp.clone()),
            })
        })
        .collect()
}

async fn upsert_live_contributor_power_overlays(
    transaction: &mut Transaction<'_, Postgres>,
    contributors: &[ProvisionalContributorPowerOverlayWrite],
) -> Result<(), sqlx::Error> {
    let mut query = QueryBuilder::<Postgres>::new(
        "INSERT INTO degov_provisional_contributor_power_overlay (
             id, segment_id, contract_set_id, chain_id, chain_name, dao_code, governor_address,
             token_address, account, power, balance, delegates_count_all,
             delegates_count_effective, last_vote_block_number, last_vote_timestamp, source,
             status, anchor_block_number, anchor_block_hash, anchor_parent_hash,
             anchor_block_timestamp
         )
         ",
    );
    query.push_values(contributors, |mut values, contributor| {
        values
            .push_bind(&contributor.id)
            .push_bind(&contributor.segment_id)
            .push_bind(&contributor.contract_set_id)
            .push_bind(contributor.chain_id)
            .push_bind(&contributor.chain_name)
            .push_bind(&contributor.dao_code)
            .push_bind(&contributor.governor_address)
            .push_bind(&contributor.token_address)
            .push_bind(&contributor.account)
            .push_bind(&contributor.power)
            .push_unseparated("::NUMERIC(78, 0)")
            .push_bind(&contributor.balance)
            .push_unseparated("::NUMERIC(78, 0)")
            .push_bind(contributor.delegates_count_all)
            .push_bind(contributor.delegates_count_effective)
            .push_bind(&contributor.last_vote_block_number)
            .push_unseparated("::NUMERIC(78, 0)")
            .push_bind(&contributor.last_vote_timestamp)
            .push_unseparated("::NUMERIC(78, 0)")
            .push_bind(&contributor.source)
            .push_bind(&contributor.status)
            .push_bind(&contributor.anchor_block_number)
            .push_unseparated("::NUMERIC(78, 0)")
            .push_bind(&contributor.anchor_block_hash)
            .push_bind(&contributor.anchor_parent_hash)
            .push_bind(&contributor.anchor_block_timestamp)
            .push_unseparated("::NUMERIC(78, 0)");
    });
    query.push(
        "
         ON CONFLICT ON CONSTRAINT degov_provisional_contributor_power_overlay_scope_unique
         DO UPDATE SET
             id = EXCLUDED.id,
             segment_id = EXCLUDED.segment_id,
             power = EXCLUDED.power,
             balance = EXCLUDED.balance,
             delegates_count_all = EXCLUDED.delegates_count_all,
             delegates_count_effective = EXCLUDED.delegates_count_effective,
             last_vote_block_number = EXCLUDED.last_vote_block_number,
             last_vote_timestamp = EXCLUDED.last_vote_timestamp,
             status = EXCLUDED.status,
             anchor_block_number = EXCLUDED.anchor_block_number,
             anchor_block_hash = EXCLUDED.anchor_block_hash,
             anchor_parent_hash = EXCLUDED.anchor_parent_hash,
             anchor_block_timestamp = EXCLUDED.anchor_block_timestamp,
             updated_at = now()",
    );
    query.build().execute(&mut **transaction).await?;

    Ok(())
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
struct LiveDelegateRelationScope {
    contract_set_id: String,
    chain_id: Option<i32>,
    dao_code: Option<String>,
    governor_address: Option<String>,
    token_address: Option<String>,
}

async fn read_live_delegate_power_overlay_relations(
    transaction: &mut Transaction<'_, Postgres>,
    contributors: &[ProvisionalContributorPowerOverlayWrite],
) -> Result<Vec<ProvisionalDelegatePowerOverlayRelation>, sqlx::Error> {
    let mut accounts_by_scope = BTreeMap::<LiveDelegateRelationScope, Vec<String>>::new();
    for contributor in contributors {
        accounts_by_scope
            .entry(LiveDelegateRelationScope {
                contract_set_id: contributor.contract_set_id.clone(),
                chain_id: contributor.chain_id,
                dao_code: contributor.dao_code.clone(),
                governor_address: contributor.governor_address.clone(),
                token_address: contributor.token_address.clone(),
            })
            .or_default()
            .push(contributor.account.clone());
    }

    let mut relations = Vec::new();
    for (scope, mut accounts) in accounts_by_scope {
        accounts.sort();
        accounts.dedup();
        let mut query = QueryBuilder::<Postgres>::new("");
        push_live_delegate_power_overlay_relations_query(&mut query, &scope, &accounts);
        let rows = query.build().fetch_all(&mut **transaction).await?;

        relations.extend(rows.into_iter().map(|row| {
            ProvisionalDelegatePowerOverlayRelation {
                contract_set_id: row.get("contract_set_id"),
                chain_id: row.get("chain_id"),
                chain_name: None,
                dao_code: row.get("dao_code"),
                governor_address: row.get("governor_address"),
                token_address: row
                    .get::<Option<String>, _>("token_address")
                    .or_else(|| scope.token_address.clone()),
                delegator: row.get("from_delegate"),
                delegate: row.get("to_delegate"),
                is_current: row.get("is_current"),
            }
        }));
    }

    Ok(relations)
}

fn push_live_delegate_power_overlay_relations_query<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    scope: &'a LiveDelegateRelationScope,
    accounts: &'a [String],
) {
    query
        .push("WITH scoped_accounts AS MATERIALIZED (SELECT account FROM unnest(")
        .push_bind(accounts)
        .push(
            "::TEXT[]) AS account)
         SELECT
             delegate.contract_set_id,
             delegate.chain_id,
             delegate.dao_code,
             delegate.governor_address,
             COALESCE(delegate.token_address, ",
        )
        .push_bind(&scope.token_address)
        .push(
            ") AS token_address,
             delegate.from_delegate,
             delegate.to_delegate,
             delegate.is_current
         FROM scoped_accounts
         JOIN LATERAL (
             SELECT
                 contract_set_id, chain_id, dao_code, governor_address, token_address,
                 from_delegate, to_delegate, is_current
             FROM delegate
             WHERE contract_set_id = ",
        )
        .push_bind(&scope.contract_set_id);

    push_optional_i32_predicate(query, "chain_id", scope.chain_id);
    push_optional_string_predicate(query, "dao_code", &scope.dao_code);
    push_optional_string_predicate(query, "governor_address", &scope.governor_address);

    query.push(" AND from_delegate = scoped_accounts.account");
    match &scope.token_address {
        Some(token_address) => {
            query
                .push(" AND (token_address = ")
                .push_bind(token_address)
                .push(" OR token_address IS NULL)");
        }
        None => {
            query.push(" AND token_address IS NULL");
        }
    }
    query.push(" AND is_current = TRUE OFFSET 0) delegate ON TRUE");
}

fn push_optional_i32_predicate(
    query: &mut QueryBuilder<'_, Postgres>,
    column_name: &'static str,
    value: Option<i32>,
) {
    query.push(" AND ").push(column_name);
    match value {
        Some(value) => {
            query.push(" = ").push_bind(value);
        }
        None => {
            query.push(" IS NULL");
        }
    }
}

fn push_optional_string_predicate<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    column_name: &'static str,
    value: &'a Option<String>,
) {
    query.push(" AND ").push(column_name);
    match value {
        Some(value) => {
            query.push(" = ").push_bind(value);
        }
        None => {
            query.push(" IS NULL");
        }
    }
}

async fn upsert_live_delegate_power_overlays(
    transaction: &mut Transaction<'_, Postgres>,
    delegates: &[ProvisionalDelegatePowerOverlayWrite],
) -> Result<(), sqlx::Error> {
    if delegates.is_empty() {
        return Ok(());
    }

    let mut query = QueryBuilder::<Postgres>::new(
        "INSERT INTO degov_provisional_delegate_power_overlay (
             id, segment_id, contract_set_id, chain_id, chain_name, dao_code, governor_address,
             token_address, delegator, delegate, power, is_current, source, status,
             anchor_block_number, anchor_block_hash, anchor_parent_hash, anchor_block_timestamp
         )
         ",
    );
    query.push_values(delegates, |mut values, delegate| {
        values
            .push_bind(&delegate.id)
            .push_bind(&delegate.segment_id)
            .push_bind(&delegate.contract_set_id)
            .push_bind(delegate.chain_id)
            .push_bind(&delegate.chain_name)
            .push_bind(&delegate.dao_code)
            .push_bind(&delegate.governor_address)
            .push_bind(&delegate.token_address)
            .push_bind(&delegate.delegator)
            .push_bind(&delegate.delegate)
            .push_bind(&delegate.power)
            .push_unseparated("::NUMERIC(78, 0)")
            .push_bind(delegate.is_current)
            .push_bind(&delegate.source)
            .push_bind(&delegate.status)
            .push_bind(&delegate.anchor_block_number)
            .push_unseparated("::NUMERIC(78, 0)")
            .push_bind(&delegate.anchor_block_hash)
            .push_bind(&delegate.anchor_parent_hash)
            .push_bind(&delegate.anchor_block_timestamp)
            .push_unseparated("::NUMERIC(78, 0)");
    });
    query.push(
        "
         ON CONFLICT ON CONSTRAINT degov_provisional_delegate_power_overlay_scope_unique
         DO UPDATE SET
             id = EXCLUDED.id,
             segment_id = EXCLUDED.segment_id,
             power = EXCLUDED.power,
             is_current = EXCLUDED.is_current,
             status = EXCLUDED.status,
             anchor_block_number = EXCLUDED.anchor_block_number,
             anchor_block_hash = EXCLUDED.anchor_block_hash,
             anchor_parent_hash = EXCLUDED.anchor_parent_hash,
             anchor_block_timestamp = EXCLUDED.anchor_block_timestamp,
             updated_at = now()",
    );
    query.build().execute(&mut **transaction).await?;

    Ok(())
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
struct DataMetricRefreshScope {
    contract_set_id: String,
    chain_id: i32,
    dao_code: Option<String>,
    governor_address: String,
    token_address: String,
}

async fn enqueue_data_metric_refresh_scopes(
    transaction: &mut Transaction<'_, Postgres>,
    scopes: &BTreeSet<DataMetricRefreshScope>,
    now_ms: i64,
) -> Result<(), sqlx::Error> {
    if scopes.is_empty() {
        return Ok(());
    }

    let mut query = QueryBuilder::<Postgres>::new(
        "INSERT INTO onchain_refresh_data_metric_task (
            id, contract_set_id, chain_id, dao_code, governor_address, token_address,
            created_at, updated_at
         ) ",
    );
    query.push_values(scopes, |mut values, scope| {
        values
            .push_bind(data_metric_refresh_task_id(scope))
            .push_bind(&scope.contract_set_id)
            .push_bind(scope.chain_id)
            .push_bind(&scope.dao_code)
            .push_bind(&scope.governor_address)
            .push_bind(&scope.token_address)
            .push_bind(now_ms.to_string())
            .push_unseparated("::NUMERIC(78, 0)")
            .push_bind(now_ms.to_string())
            .push_unseparated("::NUMERIC(78, 0)");
    });
    query.push(
        " ON CONFLICT (id) DO UPDATE
          SET token_address = EXCLUDED.token_address,
              updated_at = EXCLUDED.updated_at",
    );
    query.build().execute(&mut **transaction).await?;

    Ok(())
}

fn data_metric_refresh_scopes_for_chunk(
    successes: &[(OnchainRefreshTask, OnchainRefreshReadValue)],
) -> BTreeSet<DataMetricRefreshScope> {
    successes
        .iter()
        .map(|(task, _value)| data_metric_refresh_scope(task))
        .collect()
}

fn data_metric_refresh_scope(task: &OnchainRefreshTask) -> DataMetricRefreshScope {
    DataMetricRefreshScope {
        contract_set_id: task.contract_set_id.clone(),
        chain_id: task.chain_id,
        dao_code: task.dao_code.clone(),
        governor_address: task.governor_address.clone(),
        token_address: task.token_address.clone(),
    }
}

fn data_metric_refresh_task_id(scope: &DataMetricRefreshScope) -> String {
    format!(
        "{}:{}:{}:{}",
        scope.contract_set_id,
        scope.chain_id,
        scope.dao_code.as_deref().unwrap_or(""),
        scope.governor_address
    )
}

async fn refresh_data_metric_scope(
    transaction: &mut Transaction<'_, Postgres>,
    scope: &DataMetricRefreshScope,
) -> Result<(), sqlx::Error> {
    let metric_id = data_metric_id(
        scope.chain_id,
        &scope.governor_address,
        scope.dao_code.as_deref(),
    );

    sqlx::query(
        "INSERT INTO data_metric (
            id, contract_set_id, chain_id, dao_code, governor_address, token_address,
            power_sum, contributor_count, holders_count, member_count
         )
         SELECT
            $1, $2, $3, $4, $5, $6,
            COALESCE(sum(power), 0)::NUMERIC(78, 0),
            count(*)::INTEGER,
            (
                CASE
                    WHEN count(balance) > 0 THEN count(*) FILTER (WHERE balance > 0)
                    ELSE count(*)
                END
            )::INTEGER,
            (
                CASE
                    WHEN count(balance) > 0 THEN count(*) FILTER (WHERE balance > 0)
                    ELSE count(*)
                END
            )::INTEGER
         FROM contributor
         WHERE contract_set_id = $2 AND chain_id = $3 AND governor_address = $5 AND dao_code IS NOT DISTINCT FROM $4
         ON CONFLICT ON CONSTRAINT data_metric_scope_unique DO UPDATE
         SET token_address = COALESCE(data_metric.token_address, EXCLUDED.token_address),
             power_sum = EXCLUDED.power_sum,
             contributor_count = EXCLUDED.contributor_count,
             holders_count = EXCLUDED.holders_count,
             member_count = EXCLUDED.member_count",
    )
    .bind(metric_id)
    .bind(&scope.contract_set_id)
    .bind(scope.chain_id)
    .bind(&scope.dao_code)
    .bind(&scope.governor_address)
    .bind(&scope.token_address)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn complete_tasks(
    transaction: &mut Transaction<'_, Postgres>,
    successes: &[(OnchainRefreshTask, OnchainRefreshReadValue)],
    now_ms: i64,
    debounce: Duration,
    lock_owner: &str,
) -> Result<usize, sqlx::Error> {
    let task_ids = successes
        .iter()
        .map(|(task, _value)| task.id.clone())
        .collect::<Vec<_>>();
    let next_run_at = now_ms.saturating_add(duration_millis_i64(debounce));
    let rows = sqlx::query(
        "UPDATE onchain_refresh_task
         SET status = CASE WHEN pending_after_lock THEN 'pending' ELSE 'completed' END,
             next_run_at = CASE WHEN pending_after_lock THEN $2::NUMERIC(78, 0) ELSE next_run_at END,
             attempts = CASE WHEN pending_after_lock THEN 0 ELSE attempts END,
             locked_at = NULL,
             locked_by = NULL,
             processed_at = CASE WHEN pending_after_lock THEN processed_at ELSE $3::NUMERIC(78, 0) END,
             error = NULL,
             last_seen_block_number = COALESCE(pending_after_lock_block_number, last_seen_block_number),
             last_seen_block_timestamp = COALESCE(pending_after_lock_block_timestamp, last_seen_block_timestamp),
             last_seen_transaction_hash = COALESCE(pending_after_lock_transaction_hash, last_seen_transaction_hash),
             pending_after_lock = false,
             pending_after_lock_block_number = NULL,
             pending_after_lock_block_timestamp = NULL,
             pending_after_lock_transaction_hash = NULL,
             updated_at = $3::NUMERIC(78, 0)
         WHERE id = ANY($1)
           AND status = 'processing'
           AND locked_by = $4
         RETURNING status",
    )
    .bind(&task_ids)
    .bind(next_run_at.to_string())
    .bind(now_ms.to_string())
    .bind(lock_owner)
    .fetch_all(&mut **transaction)
    .await?;

    Ok(rows
        .into_iter()
        .filter(|row| row.get::<String, _>("status") == "pending")
        .count())
}

fn unix_time_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}

fn duration_millis_i64(duration: Duration) -> i64 {
    duration.as_millis().min(i64::MAX as u128) as i64
}

fn unique_account_count(tasks: &[OnchainRefreshTask]) -> usize {
    tasks
        .iter()
        .map(|task| {
            (
                task.chain_id,
                task.contract_set_id.clone(),
                task.dao_code.clone(),
                normalize_identifier(&task.governor_address),
                normalize_identifier(&task.token_address),
                normalize_identifier(&task.account),
            )
        })
        .collect::<std::collections::BTreeSet<_>>()
        .len()
}

fn onchain_refresh_apply_chunks<T>(
    items: &[T],
    apply_batch_size: usize,
) -> std::slice::Chunks<'_, T> {
    items.chunks(apply_batch_size.max(1))
}

fn truncate_error(error: &str) -> String {
    const MAX_ERROR_LENGTH: usize = 2048;
    error.chars().take(MAX_ERROR_LENGTH).collect()
}

fn data_metric_id(chain_id: i32, governor_address: &str, dao_code: Option<&str>) -> String {
    let _ = (chain_id, governor_address, dao_code);
    "global".to_owned()
}

fn onchain_refresh_checkpoint_scope(task: &OnchainRefreshTask) -> String {
    format!(
        "{}:{}:{}:{}:{}:{}:{}",
        task.contract_set_id,
        task.chain_id,
        task.dao_code.as_deref().unwrap_or_default(),
        task.governor_address,
        task.token_address,
        task.account,
        task.last_seen_block_number,
    )
}

fn contributor_ref(task: &OnchainRefreshTask) -> String {
    normalize_identifier(&task.account)
}

fn provisional_contributor_power_overlay_id(task: &OnchainRefreshTask) -> String {
    format!(
        "{}:{}:{}:{}:{}:{}:live-onchain",
        task.contract_set_id,
        task.chain_id,
        task.dao_code.as_deref().unwrap_or_default(),
        normalize_identifier(&task.governor_address),
        normalize_identifier(&task.token_address),
        normalize_identifier(&task.account),
    )
}

fn provisional_power_overlay_scope(task: &OnchainRefreshTask) -> ProvisionalPowerOverlayScope {
    ProvisionalPowerOverlayScope {
        contract_set_id: task.contract_set_id.clone(),
        chain_id: task.chain_id,
        dao_code: task.dao_code.clone(),
        governor_address: normalize_identifier(&task.governor_address),
        token_address: normalize_identifier(&task.token_address),
        account: normalize_identifier(&task.account),
    }
}

fn provisional_delegate_power_overlay_writes(
    contributors: &[ProvisionalContributorPowerOverlayWrite],
    relations: &[ProvisionalDelegatePowerOverlayRelation],
) -> Vec<ProvisionalDelegatePowerOverlayWrite> {
    let contributors_by_scope = contributors
        .iter()
        .map(|contributor| {
            (
                (
                    contributor.contract_set_id.clone(),
                    contributor.chain_id,
                    contributor.dao_code.clone(),
                    contributor.governor_address.clone(),
                    contributor.token_address.clone(),
                    contributor.account.clone(),
                ),
                contributor,
            )
        })
        .collect::<BTreeMap<_, _>>();

    relations
        .iter()
        .filter_map(|relation| {
            let contributor = contributors_by_scope.get(&(
                relation.contract_set_id.clone(),
                relation.chain_id,
                relation.dao_code.clone(),
                relation.governor_address.clone(),
                relation.token_address.clone(),
                relation.delegator.clone(),
            ))?;
            let power = contributor.balance.as_ref()?;

            Some(ProvisionalDelegatePowerOverlayWrite {
                id: provisional_delegate_power_overlay_id(relation),
                segment_id: contributor.segment_id.clone(),
                dao_code: relation.dao_code.clone(),
                contract_set_id: relation.contract_set_id.clone(),
                chain_id: relation.chain_id,
                chain_name: relation.chain_name.clone(),
                governor_address: relation.governor_address.clone(),
                token_address: relation.token_address.clone(),
                delegator: relation.delegator.clone(),
                delegate: relation.delegate.clone(),
                power: power.clone(),
                is_current: relation.is_current,
                source: contributor.source.clone(),
                status: contributor.status.clone(),
                anchor_block_number: contributor.anchor_block_number.clone(),
                anchor_block_hash: contributor.anchor_block_hash.clone(),
                anchor_parent_hash: contributor.anchor_parent_hash.clone(),
                anchor_block_timestamp: contributor.anchor_block_timestamp.clone(),
            })
        })
        .collect()
}

fn provisional_delegate_power_overlay_id(
    relation: &ProvisionalDelegatePowerOverlayRelation,
) -> String {
    format!(
        "{}:{}:{}:{}:{}:{}:{}:live-onchain",
        relation.contract_set_id,
        relation.chain_id.unwrap_or_default(),
        relation.dao_code.as_deref().unwrap_or_default(),
        relation.governor_address.as_deref().unwrap_or_default(),
        relation.token_address.as_deref().unwrap_or_default(),
        relation.delegator,
        relation.delegate,
    )
}

fn current_power_checkpoint_source(method: ChainReadMethod) -> &'static str {
    match method {
        ChainReadMethod::CurrentVotes => "getCurrentVotes",
        _ => "getVotes",
    }
}

#[cfg(test)]
fn current_power_signature(method: ChainReadMethod) -> &'static str {
    match method {
        ChainReadMethod::CurrentVotes => "getCurrentVotes(address)",
        _ => "getVotes(address)",
    }
}

fn parse_u64(value: &str) -> Result<u64, OnchainRefreshReaderError> {
    value.parse::<u64>().map_err(|error| {
        OnchainRefreshReaderError::new(format!("parse block number {value}: {error}"))
    })
}

fn normalize_identifier(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

fn format_failures(failures: &PartialChainReadFailureReport) -> String {
    failures
        .required_failures
        .iter()
        .chain(failures.optional_failures.iter())
        .map(|failure| failure.message.as_str())
        .collect::<Vec<_>>()
        .join("; ")
}

fn push_read_failures(
    plan: &ChainReadPlan,
    failures: &mut PartialChainReadFailureReport,
    read_failures: Vec<ReadFailure>,
) {
    for read_failure in read_failures {
        let Some(read) = plan.reads.get(read_failure.read_index) else {
            failures.required_failures.push(ChainReadFailure {
                key: ChainReadKey {
                    chain_id: 0,
                    contract_address: String::new(),
                    method: ChainReadMethod::BalanceOf,
                    args: Vec::new(),
                    block_mode: BlockReadMode::Latest,
                },
                kind: read_failure.kind,
                retryable: read_failure.retryable,
                message: read_failure.message,
            });
            continue;
        };
        let failure = ChainReadFailure {
            key: read.key.clone(),
            kind: read_failure.kind,
            retryable: read_failure.retryable,
            message: read_failure.message,
        };
        match read.requirement {
            ReadRequirement::Required => failures.required_failures.push(failure),
            ReadRequirement::Optional => failures.optional_failures.push(failure),
        }
    }
}

fn is_multicall_eligible(read: &ChainReadRequest) -> bool {
    !matches!(
        read.key.method,
        ChainReadMethod::BlockTimestamp | ChainReadMethod::TimelockOperationState
    )
}

fn alternate_current_power_method(method: ChainReadMethod) -> Option<ChainReadMethod> {
    match method {
        ChainReadMethod::GetVotes => Some(ChainReadMethod::CurrentVotes),
        ChainReadMethod::CurrentVotes => Some(ChainReadMethod::GetVotes),
        _ => None,
    }
}

fn is_current_power_method(method: ChainReadMethod) -> bool {
    matches!(
        method,
        ChainReadMethod::GetVotes | ChainReadMethod::CurrentVotes
    )
}

fn encode_call_data(method: ChainReadMethod, args: &[String]) -> Result<String, String> {
    let (signature, tokens) = match method {
        ChainReadMethod::BlockTimestamp => {
            return Err("BlockTimestamp uses eth_getBlockByNumber".to_owned());
        }
        ChainReadMethod::CountingMode => ("COUNTING_MODE()", vec![]),
        ChainReadMethod::ClockMode => ("CLOCK_MODE()", vec![]),
        ChainReadMethod::Decimals => ("decimals()", vec![]),
        ChainReadMethod::Delegates => (
            "delegates(address)",
            vec![address_argument(required_arg(method, args, 0)?)?],
        ),
        ChainReadMethod::BalanceOf => (
            "balanceOf(address)",
            vec![address_argument(required_arg(method, args, 0)?)?],
        ),
        ChainReadMethod::GetVotes => (
            "getVotes(address)",
            vec![address_argument(required_arg(method, args, 0)?)?],
        ),
        ChainReadMethod::CurrentVotes => (
            "getCurrentVotes(address)",
            vec![address_argument(required_arg(method, args, 0)?)?],
        ),
        ChainReadMethod::GetPastVotes => (
            "getPastVotes(address,uint256)",
            vec![
                address_argument(required_arg(method, args, 0)?)?,
                uint_argument(required_arg(method, args, 1)?)?,
            ],
        ),
        ChainReadMethod::GetPriorVotes => (
            "getPriorVotes(address,uint256)",
            vec![
                address_argument(required_arg(method, args, 0)?)?,
                uint_argument(required_arg(method, args, 1)?)?,
            ],
        ),
        ChainReadMethod::ProposalSnapshot => (
            "proposalSnapshot(uint256)",
            vec![uint_argument(required_arg(method, args, 0)?)?],
        ),
        ChainReadMethod::ProposalDeadline => (
            "proposalDeadline(uint256)",
            vec![uint_argument(required_arg(method, args, 0)?)?],
        ),
        ChainReadMethod::State => (
            "state(uint256)",
            vec![uint_argument(required_arg(method, args, 0)?)?],
        ),
        ChainReadMethod::Quorum => (
            "quorum(uint256)",
            vec![uint_argument(required_arg(method, args, 0)?)?],
        ),
        ChainReadMethod::TimelockEta => (
            "getTimestamp(bytes32)",
            vec![bytes32_argument(required_arg(method, args, 0)?)?],
        ),
        ChainReadMethod::TimelockOperationState => {
            return Err("TimelockOperationState uses derived timelock calls".to_owned());
        }
    };

    encode_function_call(signature, tokens)
}

fn encode_aggregate3_call_data(calls: &[EvmMulticallRead]) -> Result<String, String> {
    let call_tokens = calls
        .iter()
        .map(|call| {
            let call_data = decode_hex_result(&call.call_data)?;
            let target = call.read.key.contract_address.parse().map_err(|error| {
                format!(
                    "invalid multicall target {}: {error}",
                    call.read.key.contract_address
                )
            })?;
            Ok(Token::Tuple(vec![
                Token::Address(target),
                Token::Bool(true),
                Token::Bytes(call_data),
            ]))
        })
        .collect::<Result<Vec<_>, String>>()?;

    encode_function_call(
        "aggregate3((address,bool,bytes)[])",
        vec![Token::Array(call_tokens)],
    )
}

#[cfg(test)]
fn decode_aggregate3_call_data(data: &str) -> Result<Vec<Aggregate3Call>, String> {
    let bytes = decode_hex_result(data)?;
    if bytes.len() < 4 || bytes[..4] != function_selector("aggregate3((address,bool,bytes)[])") {
        return Err("multicall data selector mismatch".to_owned());
    }
    let tokens = decode(
        &[ParamType::Array(Box::new(ParamType::Tuple(vec![
            ParamType::Address,
            ParamType::Bool,
            ParamType::Bytes,
        ])))],
        &bytes[4..],
    )
    .map_err(|error| error.to_string())?;

    let Some(Token::Array(calls)) = tokens.first() else {
        return Err("multicall data did not decode as aggregate3 calls".to_owned());
    };

    calls
        .iter()
        .map(|token| {
            let Token::Tuple(values) = token else {
                return Err("multicall call did not decode as tuple".to_owned());
            };
            let [
                Token::Address(target),
                Token::Bool(allow_failure),
                Token::Bytes(call_data),
            ] = values.as_slice()
            else {
                return Err("multicall call tuple shape mismatch".to_owned());
            };
            Ok(Aggregate3Call {
                target: format!("0x{}", hex::encode(target.as_bytes())),
                allow_failure: *allow_failure,
                call_data: format!("0x{}", hex::encode(call_data)),
            })
        })
        .collect()
}

fn decode_aggregate3_results(
    value: &str,
    expected_count: usize,
) -> Result<Vec<Aggregate3Result>, String> {
    let bytes = decode_hex_result(value)?;
    let tokens = decode(
        &[ParamType::Array(Box::new(ParamType::Tuple(vec![
            ParamType::Bool,
            ParamType::Bytes,
        ])))],
        &bytes,
    )
    .map_err(|error| error.to_string())?;
    let Some(Token::Array(results)) = tokens.first() else {
        return Err("multicall result did not decode as aggregate3 results".to_owned());
    };
    if results.len() != expected_count {
        return Err(format!(
            "multicall result count mismatch expected={expected_count} actual={}",
            results.len()
        ));
    }

    results
        .iter()
        .map(|token| {
            let Token::Tuple(values) = token else {
                return Err("multicall result did not decode as tuple".to_owned());
            };
            let [Token::Bool(success), Token::Bytes(return_data)] = values.as_slice() else {
                return Err("multicall result tuple shape mismatch".to_owned());
            };
            Ok(Aggregate3Result {
                success: *success,
                return_data: format!("0x{}", hex::encode(return_data)),
            })
        })
        .collect()
}

#[cfg(test)]
#[derive(Clone, Debug, Eq, PartialEq)]
struct Aggregate3Call {
    target: String,
    allow_failure: bool,
    call_data: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct Aggregate3Result {
    success: bool,
    return_data: String,
}

fn encode_function_call(signature: &str, tokens: Vec<Token>) -> Result<String, String> {
    let selector = function_selector(signature);
    let args = encode(&tokens);

    Ok(format!("0x{}{}", hex::encode(selector), hex::encode(args)))
}

fn function_selector(signature: &str) -> [u8; 4] {
    let digest = Keccak256::digest(signature.as_bytes());
    [digest[0], digest[1], digest[2], digest[3]]
}

fn required_arg<'a>(
    method: ChainReadMethod,
    args: &'a [String],
    index: usize,
) -> Result<&'a str, String> {
    args.get(index)
        .map(String::as_str)
        .ok_or_else(|| format!("missing argument {index} for {method:?}"))
}

fn address_argument(address: &str) -> Result<Token, String> {
    address
        .parse()
        .map(Token::Address)
        .map_err(|error| format!("invalid address argument {address}: {error}"))
}

fn uint_argument(value: &str) -> Result<Token, String> {
    let uint = if let Some(hex_value) = value.trim().strip_prefix("0x") {
        if hex_value.len() > 64
            || !hex_value
                .chars()
                .all(|character| character.is_ascii_hexdigit())
        {
            return Err(format!("invalid uint argument {value}"));
        }
        let bytes = hex::decode(format!("{hex_value:0>64}")).map_err(|error| error.to_string())?;
        U256::from_big_endian(&bytes)
    } else {
        U256::from_dec_str(value)
            .map_err(|error| format!("invalid uint argument {value}: {error}"))?
    };

    Ok(Token::Uint(uint))
}

fn bytes32_argument(value: &str) -> Result<Token, String> {
    let value = value
        .trim()
        .strip_prefix("0x")
        .ok_or_else(|| format!("invalid bytes32 argument {value}"))?;
    if value.len() != 64 || !value.chars().all(|character| character.is_ascii_hexdigit()) {
        return Err(format!("invalid bytes32 argument 0x{value}"));
    }

    hex::decode(value)
        .map(Token::FixedBytes)
        .map_err(|error| error.to_string())
}

fn block_tag(block_mode: BlockReadMode) -> String {
    match block_mode {
        BlockReadMode::Fresh | BlockReadMode::Latest => "latest".to_owned(),
        BlockReadMode::Safe => "safe".to_owned(),
        BlockReadMode::Finalized => "finalized".to_owned(),
        BlockReadMode::AtBlock(block_number) => format!("0x{block_number:x}"),
    }
}

fn decode_uint256(value: &str) -> Result<String, String> {
    let value = value
        .trim()
        .strip_prefix("0x")
        .ok_or_else(|| "eth_call result must be hex".to_owned())?;
    if value.is_empty() {
        return Err("eth_call returned empty data".to_owned());
    }
    let bytes = hex::decode(value).map_err(|error| error.to_string())?;
    let tokens = decode(&[ParamType::Uint(256)], &bytes).map_err(|error| error.to_string())?;

    match tokens.first() {
        Some(Token::Uint(value)) => Ok(value.to_string()),
        _ => Err("eth_call result did not decode as uint256".to_owned()),
    }
}

fn decode_string(value: &str) -> Result<String, String> {
    let bytes = decode_hex_result(value)?;
    let tokens = decode(&[ParamType::String], &bytes).map_err(|error| error.to_string())?;

    match tokens.first() {
        Some(Token::String(value)) => Ok(value.clone()),
        _ => Err("eth_call result did not decode as string".to_owned()),
    }
}

fn decode_bool(value: &str) -> Result<bool, String> {
    let bytes = decode_hex_result(value)?;
    let tokens = decode(&[ParamType::Bool], &bytes).map_err(|error| error.to_string())?;

    match tokens.first() {
        Some(Token::Bool(value)) => Ok(*value),
        _ => Err("eth_call result did not decode as bool".to_owned()),
    }
}

fn decode_address(value: &str) -> Result<String, String> {
    let bytes = decode_hex_result(value)?;
    let tokens = decode(&[ParamType::Address], &bytes).map_err(|error| error.to_string())?;

    match tokens.first() {
        Some(Token::Address(value)) => Ok(format!("0x{}", hex::encode(value.as_bytes()))),
        _ => Err("eth_call result did not decode as address".to_owned()),
    }
}

fn decode_call_value(method: ChainReadMethod, value: &str) -> Result<ChainReadValue, String> {
    match method {
        ChainReadMethod::CountingMode | ChainReadMethod::ClockMode => {
            decode_string(value).map(ChainReadValue::String)
        }
        ChainReadMethod::Delegates => decode_address(value).map(ChainReadValue::String),
        _ => decode_uint256(value).map(ChainReadValue::Integer),
    }
}

fn decode_hex_result(value: &str) -> Result<Vec<u8>, String> {
    let value = value
        .trim()
        .strip_prefix("0x")
        .ok_or_else(|| "eth_call result must be hex".to_owned())?;
    if value.is_empty() {
        return Err("eth_call returned empty data".to_owned());
    }

    hex::decode(value).map_err(|error| error.to_string())
}

#[derive(Debug, Deserialize)]
struct JsonRpcResponse {
    result: Option<String>,
    error: Option<JsonRpcError>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcBlockResponse {
    result: Option<JsonRpcBlock>,
    error: Option<JsonRpcError>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcBlock {
    timestamp: String,
}

#[derive(Debug, Deserialize)]
struct JsonRpcError {
    message: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::{borrow::Cow, error::Error as StdError};

    #[derive(Debug)]
    struct FakeDatabaseError {
        code: &'static str,
    }

    impl fmt::Display for FakeDatabaseError {
        fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            write!(formatter, "fake database error {}", self.code)
        }
    }

    impl StdError for FakeDatabaseError {}

    impl sqlx::error::DatabaseError for FakeDatabaseError {
        fn message(&self) -> &str {
            "fake database error"
        }

        fn code(&self) -> Option<Cow<'_, str>> {
            Some(Cow::Borrowed(self.code))
        }

        fn as_error(&self) -> &(dyn StdError + Send + Sync + 'static) {
            self
        }

        fn as_error_mut(&mut self) -> &mut (dyn StdError + Send + Sync + 'static) {
            self
        }

        fn into_error(self: Box<Self>) -> Box<dyn StdError + Send + Sync + 'static> {
            self
        }

        fn kind(&self) -> sqlx::error::ErrorKind {
            sqlx::error::ErrorKind::Other
        }
    }

    fn fake_database_error(code: &'static str) -> OnchainRefreshWorkerError {
        OnchainRefreshWorkerError::Database(sqlx::Error::Database(Box::new(FakeDatabaseError {
            code,
        })))
    }

    #[test]
    fn test_live_delegate_power_overlay_relation_query_uses_account_driven_lateral_lookup() {
        let scope = LiveDelegateRelationScope {
            contract_set_id: "contract-set".to_owned(),
            chain_id: Some(1),
            dao_code: Some("dao".to_owned()),
            governor_address: Some("0xgovernor".to_owned()),
            token_address: Some("0xtoken".to_owned()),
        };
        let accounts = vec![
            "0x0000000000000000000000000000000000000001".to_owned(),
            "0x0000000000000000000000000000000000000002".to_owned(),
        ];
        let mut query = QueryBuilder::<Postgres>::new("");

        push_live_delegate_power_overlay_relations_query(&mut query, &scope, &accounts);
        let sql = query.sql();

        assert!(sql.contains("WITH scoped_accounts AS MATERIALIZED"));
        assert!(sql.contains("JOIN LATERAL"));
        assert!(sql.contains("from_delegate = scoped_accounts.account"));
        assert!(sql.contains("OFFSET 0"));
        assert!(!sql.contains("from_delegate = ANY"));
        assert!(!sql.contains("IS NOT DISTINCT FROM"));
    }

    #[test]
    fn test_onchain_refresh_scope_filter_uses_indexable_dao_code_equality() {
        let scope = OnchainRefreshTaskScope {
            chain_id: 1,
            contract_set_id: "contract-set".to_owned(),
            dao_code: "dao".to_owned(),
        };
        let mut query = QueryBuilder::<Postgres>::new("SELECT 1 WHERE true");

        push_onchain_refresh_scope_filter(&mut query, Some(&scope));
        let sql = query.sql();

        assert!(sql.contains("chain_id = "));
        assert!(sql.contains("contract_set_id = "));
        assert!(sql.contains("dao_code = "));
        assert!(!sql.contains("dao_code IS NOT DISTINCT FROM"));
    }

    #[test]
    fn test_delegate_relation_balance_refresh_query_uses_fixed_unnest_input() {
        let refreshes = vec![DelegateRelationBalanceRefresh {
            key: DelegateRelationBalanceRefreshKey {
                contract_set_id: "contract-set".to_owned(),
                chain_id: 1,
                dao_code: Some("dao".to_owned()),
                governor_address: "0xgovernor".to_owned(),
                token_address: "0xtoken".to_owned(),
                account: "0xaccount".to_owned(),
            },
            balance: "42".to_owned(),
        }];
        let mut query = QueryBuilder::<Postgres>::new("");

        push_delegate_relation_balance_refresh_query(&mut query, &refreshes);
        let sql = query.sql();

        assert!(sql.contains("WITH refreshed AS MATERIALIZED"));
        assert!(sql.contains("unnest("));
        assert!(sql.contains("::TEXT[]"));
        assert!(sql.contains("::INT4[]"));
        assert!(sql.contains("balance_text::NUMERIC(78, 0) AS balance"));
        assert!(!sql.contains("VALUES"));
    }

    #[test]
    fn test_delegate_relation_balance_refresh_query_updates_effective_count_by_delta() {
        let refreshes = vec![DelegateRelationBalanceRefresh {
            key: DelegateRelationBalanceRefreshKey {
                contract_set_id: "contract-set".to_owned(),
                chain_id: 1,
                dao_code: Some("dao".to_owned()),
                governor_address: "0xgovernor".to_owned(),
                token_address: "0xtoken".to_owned(),
                account: "0xaccount".to_owned(),
            },
            balance: "42".to_owned(),
        }];
        let mut query = QueryBuilder::<Postgres>::new("");

        push_delegate_relation_balance_refresh_query(&mut query, &refreshes);
        let sql = query.sql();

        assert!(sql.contains("mapping_edges AS"));
        assert!(sql.contains("effective_count_delta"));
        assert!(sql.contains("effective_count_deltas AS"));
        assert!(sql.contains("SUM(effective_count_delta)::INT AS count_delta"));
        assert!(sql.contains(
            "GREATEST(0, contributor.delegates_count_effective + effective_count_deltas.count_delta)"
        ));
        assert!(!sql.contains("COUNT(delegate_mapping.id)"));
        assert!(!sql.contains("positive_count"));
    }

    #[test]
    fn test_insert_refresh_checkpoints_skips_values_without_checkpoint_values() {
        let task = OnchainRefreshTask {
            id: "task-one".to_owned(),
            contract_set_id: "contract-set".to_owned(),
            chain_id: 1,
            dao_code: Some("dao".to_owned()),
            governor_address: "0xgovernor".to_owned(),
            token_address: "0xtoken".to_owned(),
            account: "0xaccount".to_owned(),
            refresh_balance: true,
            refresh_power: true,
            last_seen_block_number: "12".to_owned(),
            last_seen_block_timestamp: "12000".to_owned(),
            last_seen_transaction_hash: "0xtask".to_owned(),
            attempts: 0,
        };
        let latest_only = OnchainRefreshReadValue {
            task_id: "task-one".to_owned(),
            balance: Some("99".to_owned()),
            power: Some("88".to_owned()),
            checkpoint_balance: None,
            checkpoint_power: None,
        };
        let with_checkpoints = OnchainRefreshReadValue {
            checkpoint_balance: Some("11".to_owned()),
            checkpoint_power: Some("22".to_owned()),
            ..latest_only.clone()
        };

        assert_eq!(checkpoint_balance_value(&task, &latest_only), None);
        assert_eq!(checkpoint_power_value(&task, &latest_only), None);
        assert_eq!(
            checkpoint_balance_value(&task, &with_checkpoints),
            Some("11")
        );
        assert_eq!(checkpoint_power_value(&task, &with_checkpoints), Some("22"));
    }

    #[test]
    fn test_encode_call_data_accepts_hex_uint_arguments() {
        let decimal = encode_call_data(ChainReadMethod::State, &["42".to_owned()])
            .expect("decimal proposal id encodes");
        let hex = encode_call_data(ChainReadMethod::State, &["0x2a".to_owned()])
            .expect("hex proposal id encodes");

        assert_eq!(hex, decimal);
    }

    #[test]
    fn test_worker_deferred_drain_target_tracks_claim_budget() {
        assert_eq!(worker_deferred_drain_target(100, 1_000), 1_000);
        assert_eq!(worker_deferred_drain_target(2_000, 1_000), 2_000);
    }

    #[test]
    fn test_onchain_refresh_apply_retry_classifies_retryable_sqlstates() {
        assert!(is_retryable_onchain_refresh_apply_sqlstate("40P01"));
        assert!(is_retryable_onchain_refresh_apply_sqlstate("40001"));
        assert!(!is_retryable_onchain_refresh_apply_sqlstate("23505"));
    }

    #[tokio::test]
    async fn test_onchain_refresh_apply_retry_retries_retryable_errors_until_success() {
        let attempts = Arc::new(AtomicUsize::new(0));

        let result = retry_onchain_refresh_apply_operation(
            {
                let attempts = attempts.clone();
                move || {
                    let attempts = attempts.clone();
                    Box::pin(async move {
                        let attempt = attempts.fetch_add(1, Ordering::SeqCst);
                        if attempt < 2 {
                            Err(fake_database_error("40P01"))
                        } else {
                            Ok("ok")
                        }
                    })
                }
            },
            Duration::ZERO,
        )
        .await
        .expect("retryable errors eventually succeed");

        assert_eq!(result, "ok");
        assert_eq!(attempts.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn test_onchain_refresh_apply_retry_stops_at_max_attempts() {
        let attempts = Arc::new(AtomicUsize::new(0));

        let error = retry_onchain_refresh_apply_operation(
            {
                let attempts = attempts.clone();
                move || {
                    let attempts = attempts.clone();
                    Box::pin(async move {
                        attempts.fetch_add(1, Ordering::SeqCst);
                        Err::<(), _>(fake_database_error("40P01"))
                    })
                }
            },
            Duration::ZERO,
        )
        .await
        .expect_err("retryable errors stop after max attempts");

        assert!(is_retryable_onchain_refresh_apply_error(&error));
        assert_eq!(attempts.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn test_onchain_refresh_apply_retry_does_not_retry_non_retryable_errors() {
        let attempts = Arc::new(AtomicUsize::new(0));

        let error = retry_onchain_refresh_apply_operation(
            {
                let attempts = attempts.clone();
                move || {
                    let attempts = attempts.clone();
                    Box::pin(async move {
                        attempts.fetch_add(1, Ordering::SeqCst);
                        Err::<(), _>(fake_database_error("23505"))
                    })
                }
            },
            Duration::ZERO,
        )
        .await
        .expect_err("non-retryable errors fail immediately");

        assert!(!is_retryable_onchain_refresh_apply_error(&error));
        assert_eq!(attempts.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn test_default_onchain_refresh_apply_batch_size_keeps_transactions_small() {
        assert_eq!(DEFAULT_ONCHAIN_REFRESH_APPLY_BATCH_SIZE, 200);
    }

    #[test]
    fn test_exhausted_archive_batch_size_keeps_cleanup_transactions_small() {
        assert_eq!(MAX_ONCHAIN_REFRESH_EXHAUSTED_ARCHIVE_ROWS, 200);
    }

    #[test]
    fn test_onchain_refresh_apply_chunks_uses_configured_size() {
        let items = vec![1, 2, 3, 4, 5];
        let chunks = onchain_refresh_apply_chunks(&items, 2)
            .map(|chunk| chunk.to_vec())
            .collect::<Vec<_>>();

        assert_eq!(chunks, vec![vec![1, 2], vec![3, 4], vec![5]]);
    }

    #[test]
    fn test_onchain_refresh_apply_chunks_treats_zero_size_as_one() {
        let items = vec![1, 2, 3];
        let chunks = onchain_refresh_apply_chunks(&items, 0)
            .map(|chunk| chunk.to_vec())
            .collect::<Vec<_>>();

        assert_eq!(chunks, vec![vec![1], vec![2], vec![3]]);
    }

    #[test]
    fn test_chain_read_cache_keys_decimals_by_token_and_quorum_by_timepoint() {
        let cache = ChainReadCache::default();
        let decimals = ChainReadKey {
            chain_id: 1,
            contract_address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_owned(),
            method: ChainReadMethod::Decimals,
            args: vec![],
            block_mode: BlockReadMode::Safe,
        };
        let same_token_latest = ChainReadKey {
            block_mode: BlockReadMode::Latest,
            ..decimals.clone()
        };
        let quorum_10 = ChainReadKey {
            chain_id: 1,
            contract_address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb".to_owned(),
            method: ChainReadMethod::Quorum,
            args: vec!["10".to_owned()],
            block_mode: BlockReadMode::Safe,
        };
        let quorum_11 = ChainReadKey {
            args: vec!["11".to_owned()],
            ..quorum_10.clone()
        };

        cache.insert(&decimals, ChainReadValue::Integer("18".to_owned()));
        cache.insert(&quorum_10, ChainReadValue::Integer("100".to_owned()));

        assert_eq!(
            cache.get(&same_token_latest),
            Some(ChainReadValue::Integer("18".to_owned()))
        );
        assert_eq!(cache.get(&quorum_11), None);
    }

    #[test]
    fn test_chain_read_cache_dedupes_current_account_reads_briefly() {
        let cache = ChainReadCache::default();
        let power = ChainReadKey {
            chain_id: 1,
            contract_address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_owned(),
            method: ChainReadMethod::GetVotes,
            args: vec!["0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb".to_owned()],
            block_mode: BlockReadMode::Safe,
        };
        let same_account_latest = ChainReadKey {
            block_mode: BlockReadMode::Latest,
            ..power.clone()
        };
        let other_account = ChainReadKey {
            args: vec!["0xcccccccccccccccccccccccccccccccccccccccc".to_owned()],
            ..power.clone()
        };

        cache.insert(&power, ChainReadValue::Integer("100".to_owned()));

        assert_eq!(
            cache.get(&power),
            Some(ChainReadValue::Integer("100".to_owned()))
        );
        assert_eq!(cache.get(&same_account_latest), None);
        assert_eq!(cache.get(&other_account), None);
    }

    #[test]
    fn test_chain_read_cache_keeps_historical_current_account_reads_block_specific() {
        let cache = ChainReadCache::default();
        let balance = ChainReadKey {
            chain_id: 1,
            contract_address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_owned(),
            method: ChainReadMethod::BalanceOf,
            args: vec!["0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb".to_owned()],
            block_mode: BlockReadMode::AtBlock(200),
        };
        let same_account_next_block = ChainReadKey {
            block_mode: BlockReadMode::AtBlock(201),
            ..balance.clone()
        };
        let same_account_safe = ChainReadKey {
            block_mode: BlockReadMode::Safe,
            ..balance.clone()
        };
        let same_account_latest = ChainReadKey {
            block_mode: BlockReadMode::Latest,
            ..balance.clone()
        };

        cache.insert(&balance, ChainReadValue::Integer("100".to_owned()));

        assert_eq!(
            cache.get(&balance),
            Some(ChainReadValue::Integer("100".to_owned()))
        );
        assert_eq!(cache.get(&same_account_next_block), None);
        assert_eq!(cache.get(&same_account_safe), None);
        assert_eq!(cache.get(&same_account_latest), None);
    }

    #[test]
    fn test_chain_read_cache_expires_current_account_reads() {
        let cache = ChainReadCache::default();
        let balance = ChainReadKey {
            chain_id: 1,
            contract_address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_owned(),
            method: ChainReadMethod::BalanceOf,
            args: vec!["0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb".to_owned()],
            block_mode: BlockReadMode::Safe,
        };

        cache.insert(&balance, ChainReadValue::Integer("100".to_owned()));

        let expired_at =
            SystemTime::now() - ACCOUNT_CURRENT_VALUE_CACHE_DURATION - Duration::from_secs(1);
        let mut values = cache.values.lock().expect("cache lock");
        values
            .get_mut(&ChainReadCacheKey::from_read_key(&balance).expect("balance key"))
            .expect("balance value")
            .inserted_at = expired_at;
        drop(values);

        assert_eq!(cache.get(&balance), None);
    }

    #[test]
    fn test_chain_read_cache_expires_quorum_but_not_decimals() {
        let cache = ChainReadCache::default();
        let decimals = ChainReadKey {
            chain_id: 1,
            contract_address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_owned(),
            method: ChainReadMethod::Decimals,
            args: vec![],
            block_mode: BlockReadMode::Safe,
        };
        let quorum = ChainReadKey {
            chain_id: 1,
            contract_address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb".to_owned(),
            method: ChainReadMethod::Quorum,
            args: vec!["10".to_owned()],
            block_mode: BlockReadMode::Safe,
        };

        cache.insert(&decimals, ChainReadValue::Integer("18".to_owned()));
        cache.insert(&quorum, ChainReadValue::Integer("100".to_owned()));

        let expired_at = SystemTime::now() - QUORUM_CACHE_DURATION - Duration::from_secs(1);
        let mut values = cache.values.lock().expect("cache lock");
        values
            .get_mut(&ChainReadCacheKey::from_read_key(&decimals).expect("decimals key"))
            .expect("decimals value")
            .inserted_at = expired_at;
        values
            .get_mut(&ChainReadCacheKey::from_read_key(&quorum).expect("quorum key"))
            .expect("quorum value")
            .inserted_at = expired_at;
        drop(values);

        assert_eq!(
            cache.get(&decimals),
            Some(ChainReadValue::Integer("18".to_owned()))
        );
        assert_eq!(cache.get(&quorum), None);
    }

    #[derive(Clone, Default)]
    struct MockEvmRpcClient {
        eth_call_count: Arc<AtomicUsize>,
    }

    impl EvmRpcClient for MockEvmRpcClient {
        fn eth_call(
            &self,
            _contract_address: &str,
            data: &str,
            _block_mode: BlockReadMode,
        ) -> Result<String, String> {
            self.eth_call_count.fetch_add(1, Ordering::SeqCst);
            let calls = decode_aggregate3_call_data(data).expect("aggregate3 calldata decodes");
            let return_data = calls
                .into_iter()
                .enumerate()
                .map(|(index, _call)| {
                    let value = U256::from(index + 100);
                    Token::Tuple(vec![
                        Token::Bool(true),
                        Token::Bytes(encode(&[Token::Uint(value)])),
                    ])
                })
                .collect::<Vec<_>>();

            Ok(format!(
                "0x{}",
                hex::encode(encode(&[Token::Array(return_data)]))
            ))
        }

        fn eth_get_block_timestamp(&self, _block_number: &str) -> Result<u128, String> {
            Ok(0)
        }
    }

    #[derive(Clone, Default)]
    struct MulticallOutOfGasFallbackMockEvmRpcClient {
        eth_call_count: Arc<AtomicUsize>,
    }

    impl EvmRpcClient for MulticallOutOfGasFallbackMockEvmRpcClient {
        fn eth_call(
            &self,
            _contract_address: &str,
            data: &str,
            _block_mode: BlockReadMode,
        ) -> Result<String, String> {
            let call_count = self.eth_call_count.fetch_add(1, Ordering::SeqCst);
            if data.starts_with(&format!(
                "0x{}",
                hex::encode(function_selector("aggregate3((address,bool,bytes)[])"))
            )) {
                return Err("out of gas".to_owned());
            }

            Ok(format!(
                "0x{}",
                hex::encode(encode(&[Token::Uint(U256::from(call_count + 200))]))
            ))
        }

        fn eth_get_block_timestamp(&self, _block_number: &str) -> Result<u128, String> {
            Ok(0)
        }
    }

    #[derive(Clone, Default)]
    struct RevertingBalanceZeroPowerRefreshMockEvmRpcClient;

    impl EvmRpcClient for RevertingBalanceZeroPowerRefreshMockEvmRpcClient {
        fn eth_call(
            &self,
            _contract_address: &str,
            data: &str,
            _block_mode: BlockReadMode,
        ) -> Result<String, String> {
            if data.starts_with(&format!(
                "0x{}",
                hex::encode(function_selector("aggregate3((address,bool,bytes)[])"))
            )) {
                return Err("out of gas".to_owned());
            }

            if data.starts_with(&format!(
                "0x{}",
                hex::encode(function_selector("balanceOf(address)"))
            )) {
                return Err("execution reverted: 0x".to_owned());
            }

            if data.starts_with(&format!(
                "0x{}",
                hex::encode(function_selector("getVotes(address)"))
            )) {
                return Ok(format!(
                    "0x{}",
                    hex::encode(encode(&[Token::Uint(U256::zero())]))
                ));
            }

            Err("unexpected eth_call".to_owned())
        }

        fn eth_get_block_timestamp(&self, _block_number: &str) -> Result<u128, String> {
            Ok(0)
        }
    }

    #[derive(Clone, Default)]
    struct PartialFailureMockEvmRpcClient;

    impl EvmRpcClient for PartialFailureMockEvmRpcClient {
        fn eth_call(
            &self,
            _contract_address: &str,
            data: &str,
            _block_mode: BlockReadMode,
        ) -> Result<String, String> {
            let calls = decode_aggregate3_call_data(data).expect("aggregate3 calldata decodes");
            let decimals_selector = format!("0x{}", hex::encode(function_selector("decimals()")));
            let return_data = calls
                .into_iter()
                .map(|call| {
                    if call.call_data.starts_with(&decimals_selector) {
                        Token::Tuple(vec![Token::Bool(false), Token::Bytes(Vec::new())])
                    } else {
                        Token::Tuple(vec![
                            Token::Bool(true),
                            Token::Bytes(encode(&[Token::Uint(U256::from(100))])),
                        ])
                    }
                })
                .collect::<Vec<_>>();

            Ok(format!(
                "0x{}",
                hex::encode(encode(&[Token::Array(return_data)]))
            ))
        }

        fn eth_get_block_timestamp(&self, _block_number: &str) -> Result<u128, String> {
            Ok(0)
        }
    }

    #[derive(Clone, Default)]
    struct RequiredPartialFailureMockEvmRpcClient;

    impl EvmRpcClient for RequiredPartialFailureMockEvmRpcClient {
        fn eth_call(
            &self,
            _contract_address: &str,
            data: &str,
            _block_mode: BlockReadMode,
        ) -> Result<String, String> {
            if !data.starts_with(&format!(
                "0x{}",
                hex::encode(function_selector("aggregate3((address,bool,bytes)[])"))
            )) {
                return Err("fallback unavailable".to_owned());
            }
            let calls = decode_aggregate3_call_data(data).expect("aggregate3 calldata decodes");
            let return_data = calls
                .into_iter()
                .enumerate()
                .map(|(index, _call)| {
                    if index == 1 {
                        Token::Tuple(vec![Token::Bool(false), Token::Bytes(Vec::new())])
                    } else {
                        Token::Tuple(vec![
                            Token::Bool(true),
                            Token::Bytes(encode(&[Token::Uint(U256::from(index + 100))])),
                        ])
                    }
                })
                .collect::<Vec<_>>();

            Ok(format!(
                "0x{}",
                hex::encode(encode(&[Token::Array(return_data)]))
            ))
        }

        fn eth_get_block_timestamp(&self, _block_number: &str) -> Result<u128, String> {
            Ok(0)
        }
    }

    #[derive(Clone, Default)]
    struct TransportFailureMockEvmRpcClient {
        eth_call_count: Arc<AtomicUsize>,
    }

    impl EvmRpcClient for TransportFailureMockEvmRpcClient {
        fn eth_call(
            &self,
            _contract_address: &str,
            _data: &str,
            _block_mode: BlockReadMode,
        ) -> Result<String, String> {
            self.eth_call_count.fetch_add(1, Ordering::SeqCst);
            Err("transport unavailable".to_owned())
        }

        fn eth_get_block_timestamp(&self, _block_number: &str) -> Result<u128, String> {
            Ok(0)
        }
    }

    #[derive(Clone)]
    struct PowerMethodFallbackMockEvmRpcClient {
        eth_call_count: Arc<AtomicUsize>,
        primary_method: ChainReadMethod,
        fallback_method: ChainReadMethod,
    }

    impl EvmRpcClient for PowerMethodFallbackMockEvmRpcClient {
        fn eth_call(
            &self,
            _contract_address: &str,
            data: &str,
            _block_mode: BlockReadMode,
        ) -> Result<String, String> {
            self.eth_call_count.fetch_add(1, Ordering::SeqCst);
            if data.starts_with(&format!(
                "0x{}",
                hex::encode(function_selector("aggregate3((address,bool,bytes)[])"))
            )) {
                let calls = decode_aggregate3_call_data(data).expect("aggregate3 calldata decodes");
                let primary_selector = format!(
                    "0x{}",
                    hex::encode(function_selector(current_power_signature(
                        self.primary_method
                    )))
                );
                let return_data = calls
                    .into_iter()
                    .map(|call| {
                        if call.call_data.starts_with(&primary_selector) {
                            Token::Tuple(vec![Token::Bool(false), Token::Bytes(Vec::new())])
                        } else {
                            Token::Tuple(vec![
                                Token::Bool(true),
                                Token::Bytes(encode(&[Token::Uint(U256::from(100))])),
                            ])
                        }
                    })
                    .collect::<Vec<_>>();

                return Ok(format!(
                    "0x{}",
                    hex::encode(encode(&[Token::Array(return_data)]))
                ));
            }

            let fallback_selector = format!(
                "0x{}",
                hex::encode(function_selector(current_power_signature(
                    self.fallback_method
                )))
            );
            if data.starts_with(&fallback_selector) {
                return Ok(format!(
                    "0x{}",
                    hex::encode(encode(&[Token::Uint(U256::from(250))]))
                ));
            }

            Err("unexpected eth_call".to_owned())
        }

        fn eth_get_block_timestamp(&self, _block_number: &str) -> Result<u128, String> {
            Ok(0)
        }
    }

    #[derive(Clone)]
    struct MulticallDecodeFallbackPowerMethodMockEvmRpcClient {
        eth_call_count: Arc<AtomicUsize>,
        primary_method: ChainReadMethod,
        fallback_method: ChainReadMethod,
        primary_error: &'static str,
    }

    impl EvmRpcClient for MulticallDecodeFallbackPowerMethodMockEvmRpcClient {
        fn eth_call(
            &self,
            _contract_address: &str,
            data: &str,
            _block_mode: BlockReadMode,
        ) -> Result<String, String> {
            self.eth_call_count.fetch_add(1, Ordering::SeqCst);
            if data.starts_with(&format!(
                "0x{}",
                hex::encode(function_selector("aggregate3((address,bool,bytes)[])"))
            )) {
                return Ok("0x".to_owned());
            }

            let primary_selector = format!(
                "0x{}",
                hex::encode(function_selector(current_power_signature(
                    self.primary_method
                )))
            );
            if data.starts_with(&primary_selector) {
                return Err(self.primary_error.to_owned());
            }

            let fallback_selector = format!(
                "0x{}",
                hex::encode(function_selector(current_power_signature(
                    self.fallback_method
                )))
            );
            if data.starts_with(&fallback_selector) {
                return Ok(format!(
                    "0x{}",
                    hex::encode(encode(&[Token::Uint(U256::from(250))]))
                ));
            }

            Err("unexpected eth_call".to_owned())
        }

        fn eth_get_block_timestamp(&self, _block_number: &str) -> Result<u128, String> {
            Ok(0)
        }
    }

    #[derive(Clone)]
    struct HistoricalStateFallbackMockEvmRpcClient {
        block_modes: Arc<Mutex<Vec<BlockReadMode>>>,
        at_block_error: &'static str,
    }

    impl EvmRpcClient for HistoricalStateFallbackMockEvmRpcClient {
        fn eth_call(
            &self,
            _contract_address: &str,
            data: &str,
            block_mode: BlockReadMode,
        ) -> Result<String, String> {
            self.block_modes
                .lock()
                .expect("block mode lock")
                .push(block_mode);
            if data.starts_with(&format!(
                "0x{}",
                hex::encode(function_selector("aggregate3((address,bool,bytes)[])"))
            )) {
                return match block_mode {
                    BlockReadMode::AtBlock(_) => Err(self.at_block_error.to_owned()),
                    BlockReadMode::Latest => Ok(format!(
                        "0x{}",
                        hex::encode(encode(&[Token::Array(vec![Token::Tuple(vec![
                            Token::Bool(true),
                            Token::Bytes(encode(&[Token::Uint(U256::from(777))])),
                        ])])]))
                    )),
                    _ => Err("unexpected block mode".to_owned()),
                };
            }

            match block_mode {
                BlockReadMode::AtBlock(_) => Err(self.at_block_error.to_owned()),
                BlockReadMode::Latest => Ok(format!(
                    "0x{}",
                    hex::encode(encode(&[Token::Uint(U256::from(777))]))
                )),
                _ => Err("unexpected block mode".to_owned()),
            }
        }

        fn eth_get_block_timestamp(&self, _block_number: &str) -> Result<u128, String> {
            Ok(0)
        }
    }

    #[derive(Clone)]
    struct LatestMulticallFallbackMockEvmRpcClient {
        block_modes: Arc<Mutex<Vec<BlockReadMode>>>,
        at_block_result: Result<String, &'static str>,
    }

    impl EvmRpcClient for LatestMulticallFallbackMockEvmRpcClient {
        fn eth_call(
            &self,
            _contract_address: &str,
            data: &str,
            block_mode: BlockReadMode,
        ) -> Result<String, String> {
            self.block_modes
                .lock()
                .expect("block mode lock")
                .push(block_mode);

            let calls = decode_aggregate3_call_data(data).expect("aggregate3 calldata decodes");
            match block_mode {
                BlockReadMode::AtBlock(_) => {
                    return self
                        .at_block_result
                        .clone()
                        .map_err(std::string::ToString::to_string);
                }
                BlockReadMode::Latest => {}
                _ => return Err("unexpected block mode".to_owned()),
            }

            let return_data = calls
                .into_iter()
                .enumerate()
                .map(|(index, _call)| {
                    Token::Tuple(vec![
                        Token::Bool(true),
                        Token::Bytes(encode(&[Token::Uint(U256::from(index + 700))])),
                    ])
                })
                .collect::<Vec<_>>();

            Ok(format!(
                "0x{}",
                hex::encode(encode(&[Token::Array(return_data)]))
            ))
        }

        fn eth_get_block_timestamp(&self, _block_number: &str) -> Result<u128, String> {
            Ok(0)
        }
    }

    #[test]
    fn test_evm_rpc_chain_tool_executes_multicall_groups_once() {
        let rpc = MockEvmRpcClient::default();
        let calls = rpc.eth_call_count.clone();
        let tool = EvmRpcChainTool::from_rpc_client(rpc);
        let mut builder = ChainReadPlanBuilder::new(
            1,
            ChainContracts {
                governor: "0x1000000000000000000000000000000000000000".to_owned(),
                governor_token: "0x2000000000000000000000000000000000000000".to_owned(),
                timelock: None,
            },
            BatchReadPlanConfig {
                max_concurrency: 4,
                multicall_batch_size: 10,
            },
        );
        builder.add_account_power_refresh(
            "0x0000000000000000000000000000000000000001",
            200,
            crate::ChainReadReason::TokenActivityPowerRefresh,
        );
        builder.add_account_power_refresh(
            "0x0000000000000000000000000000000000000002",
            200,
            crate::ChainReadReason::TokenActivityPowerRefresh,
        );

        let report = tool
            .execute_read_plan(&builder.build())
            .expect("multicall reads succeed");

        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(report.metrics.executed_rpc_calls, 1);
        assert_eq!(report.results.len(), 2);
        assert_eq!(
            report.results[0].value,
            ChainReadValue::Integer("100".to_owned())
        );
        assert_eq!(
            report.results[1].value,
            ChainReadValue::Integer("101".to_owned())
        );
    }

    #[test]
    fn test_evm_rpc_chain_tool_falls_back_to_direct_reads_after_multicall_out_of_gas() {
        let rpc = MulticallOutOfGasFallbackMockEvmRpcClient::default();
        let calls = rpc.eth_call_count.clone();
        let tool = EvmRpcChainTool::from_rpc_client(rpc);
        let mut builder = ChainReadPlanBuilder::new(
            56,
            ChainContracts {
                governor: "0x1000000000000000000000000000000000000000".to_owned(),
                governor_token: "0x2000000000000000000000000000000000000000".to_owned(),
                timelock: None,
            },
            BatchReadPlanConfig {
                max_concurrency: 4,
                multicall_batch_size: 10,
            },
        );
        builder.add_account_latest_balance_refresh(
            "0x0000000000000000000000000000000000000001",
            200,
            crate::ChainReadReason::TokenActivityPowerRefresh,
        );
        builder.add_account_latest_balance_refresh(
            "0x0000000000000000000000000000000000000002",
            200,
            crate::ChainReadReason::TokenActivityPowerRefresh,
        );

        let report = tool
            .execute_read_plan(&builder.build())
            .expect("direct fallback reads succeed after multicall out of gas");

        assert_eq!(calls.load(Ordering::SeqCst), 3);
        assert_eq!(report.metrics.executed_rpc_calls, 2);
        assert_eq!(report.results.len(), 2);
        assert_eq!(
            report.results[0].value,
            ChainReadValue::Integer("201".to_owned())
        );
        assert_eq!(
            report.results[1].value,
            ChainReadValue::Integer("202".to_owned())
        );
    }

    #[test]
    fn test_onchain_refresh_skips_reverted_balance_when_power_read_succeeds() {
        let chain_tool =
            EvmRpcChainTool::from_rpc_client(RevertingBalanceZeroPowerRefreshMockEvmRpcClient);
        let reader = ChainToolOnchainRefreshReader::new(
            chain_tool,
            BatchReadPlanConfig {
                max_concurrency: 4,
                multicall_batch_size: 10,
            },
            ChainReadMethod::GetVotes,
        );
        let task = OnchainRefreshTask {
            id: "task-one".to_owned(),
            contract_set_id: "contract-set".to_owned(),
            chain_id: 56,
            dao_code: Some("ark-dao".to_owned()),
            governor_address: "0x1000000000000000000000000000000000000000".to_owned(),
            token_address: "0x2000000000000000000000000000000000000000".to_owned(),
            account: "0x0000000000000000000000000000000000000001".to_owned(),
            refresh_balance: true,
            refresh_power: true,
            last_seen_block_number: "200".to_owned(),
            last_seen_block_timestamp: "200000".to_owned(),
            last_seen_transaction_hash: "0xtx".to_owned(),
            attempts: 0,
        };

        let report = reader
            .read_tasks_with_report(&[task.clone()])
            .expect("refresh read completes with skipped balance");

        assert_eq!(report.failures, vec![]);
        assert_eq!(report.values.len(), 1);
        assert_eq!(report.values[0].balance.as_deref(), None);
        assert_eq!(report.values[0].power.as_deref(), Some("0"));
        validate_read_value(&task, &report.values[0])
            .expect("partial power refresh should not fail on skipped balance");
    }

    #[test]
    fn test_evm_rpc_chain_tool_uses_cache_before_multicall() {
        let rpc = MockEvmRpcClient::default();
        let calls = rpc.eth_call_count.clone();
        let tool = EvmRpcChainTool::from_rpc_client(rpc);
        let mut builder = ChainReadPlanBuilder::new(
            1,
            ChainContracts {
                governor: "0x1000000000000000000000000000000000000000".to_owned(),
                governor_token: "0x2000000000000000000000000000000000000000".to_owned(),
                timelock: None,
            },
            BatchReadPlanConfig {
                max_concurrency: 4,
                multicall_batch_size: 10,
            },
        );
        builder.add_account_power_refresh(
            "0x0000000000000000000000000000000000000001",
            200,
            crate::ChainReadReason::TokenActivityPowerRefresh,
        );
        let plan = builder.build();

        tool.execute_read_plan(&plan).expect("first read succeeds");
        let cached = tool.execute_read_plan(&plan).expect("second read succeeds");

        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(cached.metrics.executed_rpc_calls, 0);
        assert_eq!(cached.metrics.cache_hits, 1);
    }

    #[test]
    fn test_evm_rpc_chain_tool_falls_back_to_alternate_current_power_method() {
        let rpc = PowerMethodFallbackMockEvmRpcClient {
            eth_call_count: Arc::default(),
            primary_method: ChainReadMethod::GetVotes,
            fallback_method: ChainReadMethod::CurrentVotes,
        };
        let calls = rpc.eth_call_count.clone();
        let tool = EvmRpcChainTool::from_rpc_client(rpc);
        let mut builder = ChainReadPlanBuilder::new(
            1,
            ChainContracts {
                governor: "0x1000000000000000000000000000000000000000".to_owned(),
                governor_token: "0x2000000000000000000000000000000000000000".to_owned(),
                timelock: None,
            },
            BatchReadPlanConfig {
                max_concurrency: 4,
                multicall_batch_size: 10,
            },
        );
        builder.add_account_power_refresh(
            "0x0000000000000000000000000000000000000001",
            200,
            crate::ChainReadReason::TokenActivityPowerRefresh,
        );

        let plan = builder.build();
        let report = tool
            .execute_read_plan(&plan)
            .expect("power read falls back to alternate method");

        assert_eq!(calls.load(Ordering::SeqCst), 2);
        assert_eq!(report.results.len(), 1);
        assert_eq!(report.results[0].key.method, ChainReadMethod::GetVotes);
        assert_eq!(
            report.results[0].value,
            ChainReadValue::Integer("250".to_owned())
        );

        let cached = tool
            .execute_read_plan(&plan)
            .expect("fallback result is cached under original read key");
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        assert_eq!(cached.metrics.cache_hits, 1);
        assert_eq!(
            cached.results[0].value,
            ChainReadValue::Integer("250".to_owned())
        );

        let mut next_builder = ChainReadPlanBuilder::new(
            1,
            ChainContracts {
                governor: "0x1000000000000000000000000000000000000000".to_owned(),
                governor_token: "0x2000000000000000000000000000000000000000".to_owned(),
                timelock: None,
            },
            BatchReadPlanConfig {
                max_concurrency: 4,
                multicall_batch_size: 10,
            },
        );
        next_builder.add_account_power_refresh(
            "0x0000000000000000000000000000000000000002",
            200,
            crate::ChainReadReason::TokenActivityPowerRefresh,
        );

        let next = tool
            .execute_read_plan(&next_builder.build())
            .expect("learned fallback method is used for later account reads");
        assert_eq!(calls.load(Ordering::SeqCst), 3);
        assert_eq!(next.metrics.executed_rpc_calls, 1);
        assert_eq!(next.results[0].key.method, ChainReadMethod::GetVotes);
        assert_eq!(
            next.results[0].value,
            ChainReadValue::Integer("100".to_owned())
        );
    }

    #[test]
    fn test_evm_rpc_chain_tool_falls_back_from_current_votes_to_get_votes() {
        let rpc = PowerMethodFallbackMockEvmRpcClient {
            eth_call_count: Arc::default(),
            primary_method: ChainReadMethod::CurrentVotes,
            fallback_method: ChainReadMethod::GetVotes,
        };
        let calls = rpc.eth_call_count.clone();
        let tool = EvmRpcChainTool::from_rpc_client(rpc);
        let mut builder = ChainReadPlanBuilder::new(
            1,
            ChainContracts {
                governor: "0x1000000000000000000000000000000000000000".to_owned(),
                governor_token: "0x2000000000000000000000000000000000000000".to_owned(),
                timelock: None,
            },
            BatchReadPlanConfig {
                max_concurrency: 4,
                multicall_batch_size: 10,
            },
        );
        builder.add_account_power_refresh_with_method(
            "0x0000000000000000000000000000000000000001",
            200,
            crate::ChainReadReason::TokenActivityPowerRefresh,
            ChainReadMethod::CurrentVotes,
        );

        let report = tool
            .execute_read_plan(&builder.build())
            .expect("current votes read falls back to getVotes");

        assert_eq!(calls.load(Ordering::SeqCst), 2);
        assert_eq!(report.results.len(), 1);
        assert_eq!(report.results[0].key.method, ChainReadMethod::CurrentVotes);
        assert_eq!(
            report.results[0].value,
            ChainReadValue::Integer("250".to_owned())
        );
    }

    #[test]
    fn test_evm_rpc_chain_tool_uses_power_method_fallback_after_multicall_decode_failure() {
        let rpc = MulticallDecodeFallbackPowerMethodMockEvmRpcClient {
            eth_call_count: Arc::default(),
            primary_method: ChainReadMethod::GetVotes,
            fallback_method: ChainReadMethod::CurrentVotes,
            primary_error: "execution reverted",
        };
        let calls = rpc.eth_call_count.clone();
        let tool = EvmRpcChainTool::from_rpc_client(rpc);
        let mut builder = ChainReadPlanBuilder::new(
            1,
            ChainContracts {
                governor: "0x1000000000000000000000000000000000000000".to_owned(),
                governor_token: "0x2000000000000000000000000000000000000000".to_owned(),
                timelock: None,
            },
            BatchReadPlanConfig {
                max_concurrency: 4,
                multicall_batch_size: 10,
            },
        );
        builder.add_account_power_refresh(
            "0x0000000000000000000000000000000000000001",
            200,
            crate::ChainReadReason::TokenActivityPowerRefresh,
        );

        let report = tool
            .execute_read_plan(&builder.build())
            .expect("direct fallback read uses alternate current power method");

        assert_eq!(calls.load(Ordering::SeqCst), 3);
        assert_eq!(report.results.len(), 1);
        assert_eq!(report.results[0].key.method, ChainReadMethod::GetVotes);
        assert_eq!(
            report.results[0].value,
            ChainReadValue::Integer("250".to_owned())
        );
    }

    #[test]
    fn test_evm_rpc_chain_tool_does_not_use_power_method_fallback_after_transport_error() {
        let rpc = MulticallDecodeFallbackPowerMethodMockEvmRpcClient {
            eth_call_count: Arc::default(),
            primary_method: ChainReadMethod::GetVotes,
            fallback_method: ChainReadMethod::CurrentVotes,
            primary_error: "RPC eth_call failed with HTTP 500",
        };
        let calls = rpc.eth_call_count.clone();
        let tool = EvmRpcChainTool::from_rpc_client(rpc);
        let mut builder = ChainReadPlanBuilder::new(
            1,
            ChainContracts {
                governor: "0x1000000000000000000000000000000000000000".to_owned(),
                governor_token: "0x2000000000000000000000000000000000000000".to_owned(),
                timelock: None,
            },
            BatchReadPlanConfig {
                max_concurrency: 4,
                multicall_batch_size: 10,
            },
        );
        builder.add_account_power_refresh(
            "0x0000000000000000000000000000000000000001",
            200,
            crate::ChainReadReason::TokenActivityPowerRefresh,
        );

        let failures = tool
            .execute_read_plan(&builder.build())
            .expect_err("transport failure is reported");

        assert_eq!(calls.load(Ordering::SeqCst), 2);
        assert_eq!(failures.required_failures.len(), 1);
        assert!(failures.required_failures[0].message.contains("HTTP 500"));
    }

    #[test]
    fn test_evm_rpc_chain_tool_falls_back_to_latest_for_missing_historical_state() {
        let block_modes = Arc::new(Mutex::new(Vec::new()));
        let tool = EvmRpcChainTool::from_rpc_client(HistoricalStateFallbackMockEvmRpcClient {
            block_modes: block_modes.clone(),
            at_block_error: "historical state abc is not available",
        });
        let mut builder = ChainReadPlanBuilder::new(
            1,
            ChainContracts {
                governor: "0x1000000000000000000000000000000000000000".to_owned(),
                governor_token: "0x2000000000000000000000000000000000000000".to_owned(),
                timelock: None,
            },
            BatchReadPlanConfig {
                max_concurrency: 4,
                multicall_batch_size: 10,
            },
        );
        builder.add_account_balance_refresh(
            "0x0000000000000000000000000000000000000001",
            200,
            crate::ChainReadReason::TokenActivityPowerRefresh,
        );

        let report = tool
            .execute_read_plan(&builder.build())
            .expect("missing historical state falls back to latest");

        assert_eq!(report.results.len(), 1);
        assert_eq!(
            report.results[0].value,
            ChainReadValue::Integer("777".to_owned())
        );
        assert_eq!(
            *block_modes.lock().expect("block mode lock"),
            vec![BlockReadMode::AtBlock(200), BlockReadMode::Latest]
        );
    }

    #[test]
    fn test_evm_rpc_chain_tool_does_not_fallback_optional_historical_reads_to_latest() {
        let block_modes = Arc::new(Mutex::new(Vec::new()));
        let tool = EvmRpcChainTool::from_rpc_client(HistoricalStateFallbackMockEvmRpcClient {
            block_modes: block_modes.clone(),
            at_block_error: "historical state abc is not available",
        });
        let contracts = ChainContracts {
            governor: "0x1000000000000000000000000000000000000000".to_owned(),
            governor_token: "0x2000000000000000000000000000000000000000".to_owned(),
            timelock: None,
        };
        let mut builder = ChainReadPlanBuilder::new(
            1,
            contracts.clone(),
            BatchReadPlanConfig {
                max_concurrency: 4,
                multicall_batch_size: 10,
            },
        );
        builder.add_optional_enrichment_read(
            contracts.governor_token,
            ChainReadMethod::BalanceOf,
            vec!["0x0000000000000000000000000000000000000001".to_owned()],
            BlockReadMode::AtBlock(200),
        );

        let report = tool.execute_read_plan_partial(&builder.build());

        assert_eq!(report.results, vec![]);
        assert_eq!(report.partial_failures.required_failures, vec![]);
        assert_eq!(report.partial_failures.optional_failures.len(), 1);
        assert_eq!(
            *block_modes.lock().expect("block mode lock"),
            vec![BlockReadMode::AtBlock(200), BlockReadMode::AtBlock(200)]
        );
    }

    #[test]
    fn test_evm_rpc_chain_tool_preserves_required_fallback_in_mixed_historical_group() {
        let block_modes = Arc::new(Mutex::new(Vec::new()));
        let tool = EvmRpcChainTool::from_rpc_client(HistoricalStateFallbackMockEvmRpcClient {
            block_modes: block_modes.clone(),
            at_block_error: "historical state abc is not available",
        });
        let contracts = ChainContracts {
            governor: "0x1000000000000000000000000000000000000000".to_owned(),
            governor_token: "0x2000000000000000000000000000000000000000".to_owned(),
            timelock: None,
        };
        let mut builder = ChainReadPlanBuilder::new(
            1,
            contracts.clone(),
            BatchReadPlanConfig {
                max_concurrency: 4,
                multicall_batch_size: 10,
            },
        );
        builder.add_account_balance_refresh(
            "0x0000000000000000000000000000000000000001",
            200,
            crate::ChainReadReason::TokenActivityPowerRefresh,
        );
        builder.add_optional_enrichment_read(
            contracts.governor_token,
            ChainReadMethod::BalanceOf,
            vec!["0x0000000000000000000000000000000000000002".to_owned()],
            BlockReadMode::AtBlock(200),
        );

        let report = tool
            .execute_read_plan(&builder.build())
            .expect("required read falls back when optional read cannot use latest");

        assert_eq!(report.results.len(), 1);
        assert_eq!(
            report.results[0].value,
            ChainReadValue::Integer("777".to_owned())
        );
        assert_eq!(report.partial_failures.required_failures, vec![]);
        assert_eq!(report.partial_failures.optional_failures.len(), 1);
        assert_eq!(
            *block_modes.lock().expect("block mode lock"),
            vec![
                BlockReadMode::AtBlock(200),
                BlockReadMode::AtBlock(200),
                BlockReadMode::Latest,
                BlockReadMode::AtBlock(200)
            ]
        );
    }

    #[test]
    fn test_evm_rpc_chain_tool_retries_historical_state_multicall_at_latest() {
        let block_modes = Arc::new(Mutex::new(Vec::new()));
        let tool = EvmRpcChainTool::from_rpc_client(LatestMulticallFallbackMockEvmRpcClient {
            block_modes: block_modes.clone(),
            at_block_result: Err("historical state abc is not available"),
        });
        let mut builder = ChainReadPlanBuilder::new(
            1,
            ChainContracts {
                governor: "0x1000000000000000000000000000000000000000".to_owned(),
                governor_token: "0x2000000000000000000000000000000000000000".to_owned(),
                timelock: None,
            },
            BatchReadPlanConfig {
                max_concurrency: 4,
                multicall_batch_size: 10,
            },
        );
        builder.add_account_balance_refresh(
            "0x0000000000000000000000000000000000000001",
            200,
            crate::ChainReadReason::TokenActivityPowerRefresh,
        );
        builder.add_account_balance_refresh(
            "0x0000000000000000000000000000000000000002",
            200,
            crate::ChainReadReason::TokenActivityPowerRefresh,
        );

        let plan = builder.build();
        let report = tool
            .execute_read_plan(&plan)
            .expect("historical aggregate falls back to latest aggregate");

        assert_eq!(
            *block_modes.lock().expect("block mode lock"),
            vec![BlockReadMode::AtBlock(200), BlockReadMode::Latest]
        );
        assert_eq!(report.results.len(), 2);
        assert_eq!(
            report.results[0].value,
            ChainReadValue::Integer("700".to_owned())
        );
        assert_eq!(
            report.results[1].value,
            ChainReadValue::Integer("701".to_owned())
        );

        let cached = tool
            .execute_read_plan(&plan)
            .expect("latest aggregate results are cached under original read keys");
        assert_eq!(
            *block_modes.lock().expect("block mode lock"),
            vec![BlockReadMode::AtBlock(200), BlockReadMode::Latest]
        );
        assert_eq!(cached.metrics.executed_rpc_calls, 0);
        assert_eq!(cached.metrics.cache_hits, 2);
    }

    #[test]
    fn test_evm_rpc_chain_tool_does_not_fallback_to_latest_for_transport_error() {
        let block_modes = Arc::new(Mutex::new(Vec::new()));
        let tool = EvmRpcChainTool::from_rpc_client(HistoricalStateFallbackMockEvmRpcClient {
            block_modes: block_modes.clone(),
            at_block_error: "RPC eth_call failed with HTTP 500",
        });
        let mut builder = ChainReadPlanBuilder::new(
            1,
            ChainContracts {
                governor: "0x1000000000000000000000000000000000000000".to_owned(),
                governor_token: "0x2000000000000000000000000000000000000000".to_owned(),
                timelock: None,
            },
            BatchReadPlanConfig {
                max_concurrency: 4,
                multicall_batch_size: 10,
            },
        );
        builder.add_account_balance_refresh(
            "0x0000000000000000000000000000000000000001",
            200,
            crate::ChainReadReason::TokenActivityPowerRefresh,
        );

        let failures = tool
            .execute_read_plan(&builder.build())
            .expect_err("transport error does not fall back to latest");

        assert_eq!(failures.required_failures.len(), 1);
        assert!(failures.required_failures[0].message.contains("HTTP 500"));
        assert_eq!(
            *block_modes.lock().expect("block mode lock"),
            vec![BlockReadMode::AtBlock(200)]
        );
    }

    #[test]
    fn test_evm_rpc_chain_tool_keeps_successes_when_optional_multicall_item_fails() {
        let tool = EvmRpcChainTool::from_rpc_client(PartialFailureMockEvmRpcClient);
        let contracts = ChainContracts {
            governor: "0x1000000000000000000000000000000000000000".to_owned(),
            governor_token: "0x2000000000000000000000000000000000000000".to_owned(),
            timelock: None,
        };
        let mut builder = ChainReadPlanBuilder::new(
            1,
            contracts.clone(),
            BatchReadPlanConfig {
                max_concurrency: 4,
                multicall_batch_size: 10,
            },
        );
        builder.add_account_power_refresh(
            "0x0000000000000000000000000000000000000001",
            200,
            crate::ChainReadReason::TokenActivityPowerRefresh,
        );
        builder.add_optional_enrichment_read(
            contracts.governor_token,
            ChainReadMethod::Decimals,
            vec![],
            BlockReadMode::Safe,
        );

        let report = tool
            .execute_read_plan(&builder.build())
            .expect("required read survives optional multicall failure");

        assert_eq!(report.metrics.executed_rpc_calls, 2);
        assert_eq!(report.results.len(), 1);
        assert_eq!(
            report.results[0].value,
            ChainReadValue::Integer("100".to_owned())
        );
        assert_eq!(report.partial_failures.required_failures.len(), 0);
        assert_eq!(report.partial_failures.optional_failures.len(), 1);
    }

    #[test]
    fn test_evm_rpc_chain_tool_partial_report_keeps_successes_when_required_multicall_item_fails() {
        let mut builder = ChainReadPlanBuilder::new(
            1,
            ChainContracts {
                governor: "0x1000000000000000000000000000000000000000".to_owned(),
                governor_token: "0x2000000000000000000000000000000000000000".to_owned(),
                timelock: None,
            },
            BatchReadPlanConfig {
                max_concurrency: 4,
                multicall_batch_size: 10,
            },
        );
        builder.add_account_power_refresh(
            "0x0000000000000000000000000000000000000001",
            200,
            crate::ChainReadReason::TokenActivityPowerRefresh,
        );
        builder.add_account_power_refresh(
            "0x0000000000000000000000000000000000000002",
            200,
            crate::ChainReadReason::TokenActivityPowerRefresh,
        );
        let plan = builder.build();

        let failure = EvmRpcChainTool::from_rpc_client(RequiredPartialFailureMockEvmRpcClient)
            .execute_read_plan(&plan)
            .expect_err("required failure still fails regular read plan");
        assert_eq!(failure.required_failures.len(), 1);
        assert_eq!(
            failure.required_failures[0].kind,
            ChainReadFailureKind::Transport
        );
        assert!(failure.required_failures[0].retryable);
        assert!(
            failure.required_failures[0]
                .message
                .contains("alternate current power method eth_call failed")
        );

        let tool = EvmRpcChainTool::from_rpc_client(RequiredPartialFailureMockEvmRpcClient);
        let report = tool.execute_read_plan_partial(&plan);

        assert_eq!(report.results.len(), 1);
        assert_eq!(
            report.results[0].value,
            ChainReadValue::Integer("100".to_owned())
        );
        assert_eq!(report.partial_failures.required_failures.len(), 1);
        assert_eq!(report.metrics.executed_rpc_calls, 2);
    }

    #[test]
    fn test_evm_rpc_chain_tool_does_not_fallback_per_read_on_multicall_transport_failure() {
        let rpc = TransportFailureMockEvmRpcClient::default();
        let calls = rpc.eth_call_count.clone();
        let tool = EvmRpcChainTool::from_rpc_client(rpc);
        let mut builder = ChainReadPlanBuilder::new(
            1,
            ChainContracts {
                governor: "0x1000000000000000000000000000000000000000".to_owned(),
                governor_token: "0x2000000000000000000000000000000000000000".to_owned(),
                timelock: None,
            },
            BatchReadPlanConfig {
                max_concurrency: 4,
                multicall_batch_size: 10,
            },
        );
        builder.add_account_power_refresh(
            "0x0000000000000000000000000000000000000001",
            200,
            crate::ChainReadReason::TokenActivityPowerRefresh,
        );
        builder.add_account_power_refresh(
            "0x0000000000000000000000000000000000000002",
            200,
            crate::ChainReadReason::TokenActivityPowerRefresh,
        );

        let failure = tool
            .execute_read_plan(&builder.build())
            .expect_err("required multicall transport failure fails the plan");

        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(failure.required_failures.len(), 2);
        assert!(
            failure
                .required_failures
                .iter()
                .all(|failure| failure.retryable)
        );
    }
}
