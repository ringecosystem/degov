use std::{
    collections::BTreeMap,
    fmt,
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
    },
};

pub const DEFAULT_ONCHAIN_REFRESH_APPLY_BATCH_SIZE: usize = 1_000;
const MAX_ONCHAIN_REFRESH_APPLY_ROWS: usize = DEFAULT_ONCHAIN_REFRESH_APPLY_BATCH_SIZE;
const MULTICALL3_ADDRESS: &str = "0xca11bde05977b3631167028862be2a173976ca11";

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

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OnchainRefreshReadValue {
    pub task_id: String,
    pub balance: Option<String>,
    pub power: Option<String>,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct OnchainRefreshReadReport {
    pub values: Vec<OnchainRefreshReadValue>,
    pub rpc_reads_requested: usize,
    pub rpc_reads_deduped: usize,
    pub cache_hits: usize,
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
        let deferred_drain_batch_size =
            worker_deferred_drain_batch_size(self.config.deferred_drain_batch_size, batch_size);
        let deferred_drain_count = match scope {
            Some(scope) => {
                drain_deferred_onchain_refresh_tasks_for_scope(
                    &self.pool,
                    deferred_drain_batch_size,
                    scope,
                )
                .await
            }
            None => {
                drain_deferred_onchain_refresh_tasks(&self.pool, deferred_drain_batch_size).await
            }
        }
        .map_err(|error| OnchainRefreshWorkerError::DeferredDrain(error.to_string()))?;
        if deferred_drain_count > 0 {
            log::info!(
                "onchain refresh worker materialized deferred tasks dao_code={} chain_id={} contract_set_id={} deferred_drain_count={} deferred_drain_batch_size={} deferred_drain_duration_ms={}",
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
                deferred_drain_batch_size,
                deferred_drain_started_at.elapsed().as_millis()
            );
        }
        let tasks = self.claim_tasks(now_ms, batch_size, scope).await?;
        if tasks.is_empty() {
            return Ok(OnchainRefreshRunReport::default());
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
                        self.mark_task_failed(task, "missing reader result", now_ms)
                            .await?;
                        report.failed += 1;
                        report.validation_failures += 1;
                    }
                }
            }
            if !successes.is_empty() {
                for chunk in onchain_refresh_apply_chunks(&successes, self.config.apply_batch_size)
                {
                    report.apply_chunks += 1;
                    match self.apply_success_batch(chunk, now_ms).await {
                        Ok(batch_report) => {
                            report.completed += batch_report.completed;
                            report.debounced_tasks += batch_report.debounced_tasks;
                            report.skipped_tasks += batch_report.debounced_tasks;
                            report.data_metric_refreshes += batch_report.data_metric_refreshes;
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
        for queue in [
            OnchainRefreshClaimQueue::Pending,
            OnchainRefreshClaimQueue::FailedRetry,
            OnchainRefreshClaimQueue::StaleProcessing,
        ] {
            if tasks.len() >= batch_size {
                break;
            }
            let remaining_batch_size = batch_size - tasks.len();
            tasks.extend(
                self.claim_tasks_from_queue(now_ms, remaining_batch_size, scope, queue)
                    .await?,
            );
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
                query.push_bind("pending");
            }
            OnchainRefreshClaimQueue::FailedRetry => {
                query
                    .push_bind("failed")
                    .push(" AND attempts < ")
                    .push_bind(self.config.max_attempts);
            }
            OnchainRefreshClaimQueue::StaleProcessing => {
                query
                    .push_bind("processing")
                    .push(" AND locked_at IS NOT NULL AND locked_at <= ")
                    .push_bind(stale_before.to_string())
                    .push("::NUMERIC(78, 0) AND attempts < ")
                    .push_bind(self.config.max_attempts);
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
            let data_metric_refreshes = refresh_data_metrics(&mut transaction, successes).await?;
            let debounced_tasks =
                complete_tasks(&mut transaction, successes, now_ms, self.config.debounce).await?;

            Ok::<_, OnchainRefreshWorkerError>((data_metric_refreshes, debounced_tasks))
        }
        .await;
        let (data_metric_refreshes, debounced_tasks) = match result {
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
            data_metric_refreshes,
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

        sqlx::query(
            "UPDATE onchain_refresh_task
             SET status = 'failed',
                 next_run_at = $2::NUMERIC(78, 0),
                 locked_at = NULL,
                 locked_by = NULL,
                 processed_at = NULL,
                 error = $3,
                 updated_at = $4::NUMERIC(78, 0)
             WHERE id = $1",
        )
        .bind(&task.id)
        .bind(next_run_at.to_string())
        .bind(truncate_error(error))
        .bind(now_ms.to_string())
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}

fn worker_deferred_drain_batch_size(
    configured_batch_size: usize,
    claim_batch_size: usize,
) -> usize {
    configured_batch_size.max(claim_batch_size)
}

fn onchain_refresh_retry_backoff_delay(base_delay: Duration, attempts: i32) -> Duration {
    let exponent = attempts.saturating_sub(1).clamp(0, 5) as u32;
    let multiplier = 1u32.checked_shl(exponent).unwrap_or(32);

    base_delay.saturating_mul(multiplier)
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
            .push(" AND dao_code IS NOT DISTINCT FROM ")
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

        let mut values_by_key = BTreeMap::<(i32, String, String, ChainReadMethod), String>::new();
        let mut read_report = OnchainRefreshReadReport::default();
        for ((chain_id, governor_address, token_address), group_tasks) in groups {
            let mut builder = ChainReadPlanBuilder::new(
                chain_id,
                ChainContracts {
                    governor: governor_address,
                    governor_token: token_address,
                    timelock: None,
                },
                self.read_plan_config,
            );

            for task in group_tasks {
                if task.refresh_power {
                    builder.add_account_power_refresh_with_method(
                        &task.account,
                        parse_u64(&task.last_seen_block_number)?,
                        crate::ChainReadReason::TokenActivityPowerRefresh,
                        self.current_power_method,
                    );
                }
                if task.refresh_balance {
                    builder.add_account_balance_refresh(
                        &task.account,
                        parse_u64(&task.last_seen_block_number)?,
                        crate::ChainReadReason::TokenActivityPowerRefresh,
                    );
                }
            }

            let plan = builder.build();
            let report = self
                .chain_tool
                .execute_read_plan(&plan)
                .map_err(|failures| OnchainRefreshReaderError::new(format_failures(&failures)))?;
            read_report.rpc_reads_requested += report.metrics.requested_reads;
            read_report.rpc_reads_deduped += report.metrics.deduped_reads;
            read_report.cache_hits += report.metrics.cache_hits;

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
                        result.key.contract_address.clone(),
                        account.clone(),
                        result.key.method,
                    ),
                    value,
                );
            }
        }

        read_report.values = tasks
            .iter()
            .map(|task| {
                let power = if task.refresh_power {
                    Some(
                        values_by_key
                            .get(&(
                                task.chain_id,
                                normalize_identifier(&task.token_address),
                                normalize_identifier(&task.account),
                                self.current_power_method,
                            ))
                            .cloned()
                            .ok_or_else(|| {
                                OnchainRefreshReaderError::new(format!(
                                    "missing power read for {}",
                                    task.account
                                ))
                            })?,
                    )
                } else {
                    None
                };
                let balance = if task.refresh_balance {
                    Some(
                        values_by_key
                            .get(&(
                                task.chain_id,
                                normalize_identifier(&task.token_address),
                                normalize_identifier(&task.account),
                                ChainReadMethod::BalanceOf,
                            ))
                            .cloned()
                            .ok_or_else(|| {
                                OnchainRefreshReaderError::new(format!(
                                    "missing balance read for {}",
                                    task.account
                                ))
                            })?,
                    )
                } else {
                    None
                };

                Ok(OnchainRefreshReadValue {
                    task_id: task.id.clone(),
                    balance,
                    power,
                })
            })
            .collect::<Result<Vec<_>, OnchainRefreshReaderError>>()?;

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
                builder.add_account_balance_refresh(
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

        if !failures.required_failures.is_empty() {
            return Err(failures);
        }

        Ok(ChainReadExecutionReport {
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
        })
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

            match encode_call_data(read.key.method, &read.key.args) {
                Ok(call_data) => calls.push(EvmMulticallRead {
                    read_index: *read_index,
                    read: read.clone(),
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
                        for (call, result) in calls.into_iter().zip(results) {
                            report.covered_read_indexes.push(call.read_index);
                            if !result.success {
                                report.failures.push(ReadFailure {
                                    read_index: call.read_index,
                                    message: "multicall subcall reverted".to_owned(),
                                    kind: ChainReadFailureKind::Reverted,
                                    retryable: false,
                                });
                                continue;
                            }

                            match decode_call_value(call.read.key.method, &result.return_data) {
                                Ok(value) => {
                                    self.cache.insert(&call.read.key, value.clone());
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
                    Err(message) => {
                        report.executed_rpc_calls = report.executed_rpc_calls.saturating_sub(1);
                        self.execute_multicall_fallback(calls, &mut report, message);
                    }
                }
            }
            Err(message) => {
                fail_multicall_group(calls, &mut report, message);
            }
        }

        report
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

        let data = encode_call_data(read.key.method, &read.key.args)?;
        let result = self.eth_call(&read.key.contract_address, &data, read.key.block_mode)?;
        let value = decode_call_value(read.key.method, &result)?;
        self.cache.insert(&read.key, value.clone());

        Ok((
            ChainReadResult {
                read_index,
                key: read.key.clone(),
                value,
            },
            false,
        ))
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

#[derive(Clone, Debug)]
struct EvmMulticallRead {
    read_index: usize,
    read: ChainReadRequest,
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
    if task.refresh_balance && value.balance.is_none() {
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
                    task.refresh_power == refresh_power && task.refresh_balance == refresh_balance
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
            .push_bind_unseparated(task.refresh_power)
            .push_unseparated(" THEN ")
            .push_bind_unseparated(value.power.as_deref())
            .push_unseparated("::NUMERIC(78, 0) ELSE 0::NUMERIC(78, 0) END")
            .push("CASE WHEN ")
            .push_bind_unseparated(task.refresh_balance)
            .push_unseparated(" THEN ")
            .push_bind_unseparated(value.balance.as_deref())
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
        let Some(balance) = value.balance.as_ref().filter(|_| task.refresh_balance) else {
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
                balance: balance.clone(),
            },
        );
    }

    if refreshes_by_key.is_empty() {
        return Ok(());
    }

    let refreshes = refreshes_by_key.into_values().collect::<Vec<_>>();
    for chunk in refreshes.chunks(MAX_ONCHAIN_REFRESH_APPLY_ROWS) {
        let mut query = QueryBuilder::<Postgres>::new(
            "WITH refreshed (
                contract_set_id, chain_id, dao_code, governor_address, token_address,
                delegator, balance
             ) AS (",
        );
        query.push_values(chunk, |mut values, refresh| {
            values
                .push_bind(&refresh.key.contract_set_id)
                .push_bind(refresh.key.chain_id)
                .push_bind(&refresh.key.dao_code)
                .push_bind(&refresh.key.governor_address)
                .push_bind(&refresh.key.token_address)
                .push_bind(&refresh.key.account)
                .push_bind(&refresh.balance)
                .push_unseparated("::NUMERIC(78, 0)");
        });
        query.push(
            "),
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
             affected_delegates AS (
                SELECT DISTINCT
                    contract_set_id,
                    to_delegate
                FROM current_edges
             ),
             updated_delegates AS (
                UPDATE delegate
                SET power = current_edges.new_power
                FROM current_edges
                WHERE delegate.contract_set_id = current_edges.contract_set_id
                  AND delegate.id = current_edges.id
                  AND delegate.power IS DISTINCT FROM current_edges.new_power
                RETURNING delegate.id
             ),
             updated_delegate_mappings AS (
                UPDATE delegate_mapping
                SET power = current_edges.new_power
                FROM current_edges
                WHERE delegate_mapping.contract_set_id = current_edges.contract_set_id
                  AND delegate_mapping.id = current_edges.from_delegate
                  AND delegate_mapping.\"from\" = current_edges.from_delegate
                  AND delegate_mapping.\"to\" = current_edges.to_delegate
                  AND delegate_mapping.power IS DISTINCT FROM current_edges.new_power
                RETURNING delegate_mapping.id
             ),
             effective_counts AS (
                SELECT
                    affected_delegates.contract_set_id,
                    affected_delegates.to_delegate,
                    COUNT(delegate_mapping.id) FILTER (
                        WHERE COALESCE(current_edges.new_power, delegate_mapping.power) > 0
                    )::INT AS positive_count
                FROM affected_delegates
                LEFT JOIN delegate_mapping
                  ON delegate_mapping.contract_set_id = affected_delegates.contract_set_id
                 AND delegate_mapping.\"to\" = affected_delegates.to_delegate
                LEFT JOIN current_edges
                  ON current_edges.contract_set_id = delegate_mapping.contract_set_id
                 AND current_edges.from_delegate = delegate_mapping.\"from\"
                 AND current_edges.to_delegate = delegate_mapping.\"to\"
                GROUP BY affected_delegates.contract_set_id, affected_delegates.to_delegate
             ),
             updated_effective_counts AS (
                UPDATE contributor
                SET delegates_count_effective = effective_counts.positive_count
                FROM effective_counts
                WHERE contributor.contract_set_id = effective_counts.contract_set_id
                  AND contributor.id = effective_counts.to_delegate
                  AND contributor.delegates_count_effective IS DISTINCT FROM effective_counts.positive_count
                RETURNING contributor.id
             )
             SELECT
                (SELECT count(*)::BIGINT FROM updated_delegates) AS delegate_updates,
                (SELECT count(*)::BIGINT FROM updated_delegate_mappings) AS mapping_updates,
                (SELECT count(*)::BIGINT FROM updated_effective_counts) AS count_updates",
        );
        query.build().fetch_one(&mut **transaction).await?;
    }

    Ok(())
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
        .filter(|(task, _value)| task.refresh_balance)
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
            let new_balance = value.balance.as_deref().unwrap_or("0");
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
        .filter(|(task, _value)| task.refresh_power)
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
            let new_power = value.power.as_deref().unwrap_or("0");
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
            let power = value.power.as_ref()?;
            task.refresh_power
                .then(|| ProvisionalContributorPowerOverlayWrite {
                    id: provisional_contributor_power_overlay_id(task),
                    segment_id: None,
                    dao_code: task.dao_code.clone(),
                    contract_set_id: task.contract_set_id.clone(),
                    chain_id: Some(task.chain_id),
                    chain_name: None,
                    governor_address: Some(normalize_identifier(&task.governor_address)),
                    token_address: Some(normalize_identifier(&task.token_address)),
                    account: normalize_identifier(&task.account),
                    power: power.clone(),
                    balance: value.balance.clone(),
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
        let rows = sqlx::query(
            "SELECT
                 contract_set_id, chain_id, dao_code, governor_address, token_address,
                 from_delegate, to_delegate, is_current
             FROM delegate
             WHERE contract_set_id = $1
               AND chain_id IS NOT DISTINCT FROM $2
               AND dao_code IS NOT DISTINCT FROM $3
               AND governor_address IS NOT DISTINCT FROM $4
               AND (token_address IS NOT DISTINCT FROM $5 OR token_address IS NULL)
               AND from_delegate = ANY($6)
               AND is_current = TRUE",
        )
        .bind(&scope.contract_set_id)
        .bind(scope.chain_id)
        .bind(&scope.dao_code)
        .bind(&scope.governor_address)
        .bind(&scope.token_address)
        .bind(&accounts)
        .fetch_all(&mut **transaction)
        .await?;

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

async fn refresh_data_metrics(
    transaction: &mut Transaction<'_, Postgres>,
    successes: &[(OnchainRefreshTask, OnchainRefreshReadValue)],
) -> Result<usize, sqlx::Error> {
    let scopes = successes
        .iter()
        .map(|(task, _value)| DataMetricRefreshScope {
            contract_set_id: task.contract_set_id.clone(),
            chain_id: task.chain_id,
            dao_code: task.dao_code.clone(),
            governor_address: task.governor_address.clone(),
            token_address: task.token_address.clone(),
        })
        .collect::<std::collections::BTreeSet<_>>();

    for scope in &scopes {
        refresh_data_metric_scope(transaction, scope).await?;
    }

    Ok(scopes.len())
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
         RETURNING status",
    )
    .bind(&task_ids)
    .bind(next_run_at.to_string())
    .bind(now_ms.to_string())
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

    #[test]
    fn test_encode_call_data_accepts_hex_uint_arguments() {
        let decimal = encode_call_data(ChainReadMethod::State, &["42".to_owned()])
            .expect("decimal proposal id encodes");
        let hex = encode_call_data(ChainReadMethod::State, &["0x2a".to_owned()])
            .expect("hex proposal id encodes");

        assert_eq!(hex, decimal);
    }

    #[test]
    fn test_worker_deferred_drain_batch_size_tracks_claim_budget() {
        assert_eq!(worker_deferred_drain_batch_size(100, 1_000), 1_000);
        assert_eq!(worker_deferred_drain_batch_size(2_000, 1_000), 2_000);
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

        assert_eq!(report.metrics.executed_rpc_calls, 1);
        assert_eq!(report.results.len(), 1);
        assert_eq!(
            report.results[0].value,
            ChainReadValue::Integer("100".to_owned())
        );
        assert_eq!(report.partial_failures.required_failures.len(), 0);
        assert_eq!(report.partial_failures.optional_failures.len(), 1);
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
