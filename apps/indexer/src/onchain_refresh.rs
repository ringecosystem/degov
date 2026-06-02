use std::{
    collections::BTreeMap,
    fmt,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use ethabi::{ParamType, Token, decode};
use serde::Deserialize;
use serde_json::json;
use sqlx::{PgPool, Postgres, Row, Transaction};
use thiserror::Error;

use crate::{
    BatchReadPlanConfig, BlockReadMode, ChainContracts, ChainReadExecutionReport, ChainReadFailure,
    ChainReadFailureKind, ChainReadMethod, ChainReadMetrics, ChainReadPlan, ChainReadPlanBuilder,
    ChainReadResult, ChainReadValue, ChainTool, PartialChainReadFailureReport, ReadRequirement,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OnchainRefreshWorkerConfig {
    pub batch_size: usize,
    pub max_attempts: i32,
    pub lock_ttl: Duration,
    pub retry_delay: Duration,
    pub lock_owner: String,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct OnchainRefreshRunReport {
    pub claimed: usize,
    pub completed: usize,
    pub failed: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OnchainRefreshTask {
    pub id: String,
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
}

#[derive(Debug, Error)]
pub enum OnchainRefreshWorkerError {
    #[error("onchain refresh database error: {0}")]
    Database(#[from] sqlx::Error),
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

#[derive(Clone)]
pub struct OnchainRefreshWorker<R> {
    pool: PgPool,
    config: OnchainRefreshWorkerConfig,
    reader: R,
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
        }
    }

    pub async fn run_once(&self) -> Result<OnchainRefreshRunReport, OnchainRefreshWorkerError> {
        let now_ms = unix_time_millis();
        let tasks = self.claim_tasks(now_ms).await?;
        if tasks.is_empty() {
            return Ok(OnchainRefreshRunReport::default());
        }

        let mut report = OnchainRefreshRunReport {
            claimed: tasks.len(),
            completed: 0,
            failed: 0,
        };
        let values = match self.reader.read_tasks(&tasks) {
            Ok(values) => values
                .into_iter()
                .map(|value| (value.task_id.clone(), value))
                .collect::<BTreeMap<_, _>>(),
            Err(error) => {
                let message = error.to_string();
                self.mark_tasks_failed(&tasks, &message, now_ms).await?;
                report.failed = tasks.len();

                return Ok(report);
            }
        };

        for task in tasks {
            match values.get(&task.id) {
                Some(value) => match self.apply_success(&task, value, now_ms).await {
                    Ok(()) => report.completed += 1,
                    Err(error) => {
                        let message = error.to_string();
                        self.mark_task_failed(&task.id, &message, now_ms).await?;
                        report.failed += 1;
                    }
                },
                None => {
                    self.mark_task_failed(&task.id, "missing reader result", now_ms)
                        .await?;
                    report.failed += 1;
                }
            }
        }

        Ok(report)
    }

    async fn claim_tasks(
        &self,
        now_ms: i64,
    ) -> Result<Vec<OnchainRefreshTask>, OnchainRefreshWorkerError> {
        let stale_before = now_ms.saturating_sub(duration_millis_i64(self.config.lock_ttl));
        let batch_size = i64::try_from(self.config.batch_size)
            .map_err(|_| OnchainRefreshWorkerError::BatchSizeOverflow)?;

        let rows = sqlx::query(
            "WITH candidates AS (
                SELECT id
                FROM onchain_refresh_task
                WHERE (
                    status IN ('pending', 'failed')
                    OR (
                        status = 'processing'
                        AND locked_at IS NOT NULL
                        AND locked_at <= $2::NUMERIC(78, 0)
                    )
                )
                AND next_run_at <= $1::NUMERIC(78, 0)
                AND attempts < $4
                ORDER BY next_run_at ASC, updated_at ASC, id ASC
                LIMIT $3
                FOR UPDATE SKIP LOCKED
             )
             UPDATE onchain_refresh_task
             SET status = 'processing',
                 attempts = attempts + 1,
                 locked_at = $1::NUMERIC(78, 0),
                 locked_by = $5,
                 error = NULL,
                 updated_at = $1::NUMERIC(78, 0)
             FROM candidates
             WHERE onchain_refresh_task.id = candidates.id
             RETURNING
                 onchain_refresh_task.id,
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
        )
        .bind(now_ms.to_string())
        .bind(stale_before.to_string())
        .bind(batch_size)
        .bind(self.config.max_attempts)
        .bind(&self.config.lock_owner)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| OnchainRefreshTask {
                id: row.get("id"),
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

    async fn apply_success(
        &self,
        task: &OnchainRefreshTask,
        value: &OnchainRefreshReadValue,
        now_ms: i64,
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

        let mut transaction = self.pool.begin().await?;

        let previous = read_contributor_refresh_values(&mut transaction, &task.account).await?;
        upsert_contributor_refresh(&mut transaction, task, value).await?;
        insert_refresh_checkpoints(&mut transaction, task, value, previous).await?;
        refresh_data_metric(&mut transaction, task).await?;
        complete_task(&mut transaction, &task.id, now_ms).await?;

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
            self.mark_task_failed(&task.id, error, now_ms).await?;
        }

        Ok(())
    }

    async fn mark_task_failed(
        &self,
        task_id: &str,
        error: &str,
        now_ms: i64,
    ) -> Result<(), OnchainRefreshWorkerError> {
        let next_run_at = now_ms.saturating_add(duration_millis_i64(self.config.retry_delay));

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
        .bind(task_id)
        .bind(next_run_at.to_string())
        .bind(truncate_error(error))
        .bind(now_ms.to_string())
        .execute(&self.pool)
        .await?;

        Ok(())
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
        for ((chain_id, governor_address, token_address), group_tasks) in groups {
            let mut builder = ChainReadPlanBuilder::new(
                chain_id,
                ChainContracts {
                    governor: governor_address,
                    governor_token: token_address,
                    timelock: String::new(),
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

        tasks
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
            .collect()
    }
}

#[derive(Clone)]
pub struct EvmRpcChainTool {
    rpc_url: String,
    client: reqwest::blocking::Client,
}

impl EvmRpcChainTool {
    pub fn new(rpc_url: String, timeout: Duration) -> Result<Self, OnchainRefreshReaderError> {
        let client = reqwest::blocking::Client::builder()
            .timeout(timeout)
            .build()
            .map_err(|error| OnchainRefreshReaderError::new(error.to_string()))?;

        Ok(Self { rpc_url, client })
    }
}

impl ChainTool for EvmRpcChainTool {
    fn execute_read_plan(
        &self,
        plan: &ChainReadPlan,
    ) -> Result<ChainReadExecutionReport, PartialChainReadFailureReport> {
        let mut results = Vec::new();
        let mut failures = PartialChainReadFailureReport::default();

        for (read_index, read) in plan.reads.iter().enumerate() {
            match self.execute_read(read_index, read) {
                Ok(result) => results.push(result),
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
                executed_rpc_calls: results.len(),
                multicall_batch_size: plan.metrics.multicall_batch_size,
                failures: failures.optional_failures.len(),
                ..ChainReadMetrics::default()
            },
            results,
            partial_failures: failures,
            ..ChainReadExecutionReport::default()
        })
    }
}

impl EvmRpcChainTool {
    fn execute_read(
        &self,
        read_index: usize,
        read: &crate::ChainReadRequest,
    ) -> Result<ChainReadResult, String> {
        let data = encode_call_data(read.key.method, &read.key.args)?;
        let result = self.eth_call(&read.key.contract_address, &data, read.key.block_mode)?;
        let value = decode_uint256(&result)?;

        Ok(ChainReadResult {
            read_index,
            key: read.key.clone(),
            value: ChainReadValue::Integer(value),
        })
    }

    fn eth_call(
        &self,
        contract_address: &str,
        data: &str,
        block_mode: BlockReadMode,
    ) -> Result<String, String> {
        let response = self
            .client
            .post(&self.rpc_url)
            .json(&json!({
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
            }))
            .send()
            .map_err(|error| error.to_string())?;

        if !response.status().is_success() {
            return Err(format!(
                "RPC eth_call failed with HTTP {}",
                response.status()
            ));
        }

        let payload = response
            .json::<JsonRpcResponse>()
            .map_err(|error| error.to_string())?;
        if let Some(error) = payload.error {
            return Err(error.message);
        }

        payload
            .result
            .ok_or_else(|| "RPC eth_call returned no result".to_owned())
    }
}

async fn upsert_contributor_refresh(
    transaction: &mut Transaction<'_, Postgres>,
    task: &OnchainRefreshTask,
    value: &OnchainRefreshReadValue,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO contributor (
            id, chain_id, dao_code, governor_address, token_address, contract_address,
            log_index, transaction_index, block_number, block_timestamp, transaction_hash,
            power, balance, delegates_count_all, delegates_count_effective
         )
         VALUES (
            $1, $2, $3, $4, $5, $5, 0, 0, $6::NUMERIC(78, 0), $7::NUMERIC(78, 0), $8,
            CASE WHEN $9 THEN $10::NUMERIC(78, 0) ELSE 0::NUMERIC(78, 0) END,
            CASE WHEN $11 THEN $12::NUMERIC(78, 0) ELSE NULL END,
            0, 0
         )
         ON CONFLICT (id) DO UPDATE
         SET chain_id = EXCLUDED.chain_id,
             dao_code = EXCLUDED.dao_code,
             governor_address = EXCLUDED.governor_address,
             token_address = EXCLUDED.token_address,
             contract_address = EXCLUDED.contract_address,
             block_number = GREATEST(contributor.block_number, EXCLUDED.block_number),
             block_timestamp = GREATEST(contributor.block_timestamp, EXCLUDED.block_timestamp),
             transaction_hash = EXCLUDED.transaction_hash,
             power = CASE WHEN $9 THEN EXCLUDED.power ELSE contributor.power END,
             balance = CASE WHEN $11 THEN EXCLUDED.balance ELSE contributor.balance END",
    )
    .bind(&task.account)
    .bind(task.chain_id)
    .bind(&task.dao_code)
    .bind(&task.governor_address)
    .bind(&task.token_address)
    .bind(&task.last_seen_block_number)
    .bind(&task.last_seen_block_timestamp)
    .bind(&task.last_seen_transaction_hash)
    .bind(task.refresh_power)
    .bind(value.power.as_deref())
    .bind(task.refresh_balance)
    .bind(value.balance.as_deref())
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
struct ContributorRefreshValues {
    power: Option<String>,
    balance: Option<String>,
}

async fn read_contributor_refresh_values(
    transaction: &mut Transaction<'_, Postgres>,
    account: &str,
) -> Result<ContributorRefreshValues, sqlx::Error> {
    let row = sqlx::query(
        "SELECT power::TEXT AS power, balance::TEXT AS balance
         FROM contributor
         WHERE id = $1",
    )
    .bind(account)
    .fetch_optional(&mut **transaction)
    .await?;

    Ok(row
        .map(|row| ContributorRefreshValues {
            power: row.get("power"),
            balance: row.get("balance"),
        })
        .unwrap_or_default())
}

async fn insert_refresh_checkpoints(
    transaction: &mut Transaction<'_, Postgres>,
    task: &OnchainRefreshTask,
    value: &OnchainRefreshReadValue,
    previous: ContributorRefreshValues,
) -> Result<(), sqlx::Error> {
    if task.refresh_balance {
        let previous_balance = previous.balance.as_deref().unwrap_or("0");
        let new_balance = value.balance.as_deref().unwrap_or("0");
        sqlx::query(
            "INSERT INTO token_balance_checkpoint (
                id, chain_id, dao_code, governor_address, token_address, contract_address,
                account, previous_balance, new_balance, delta, source, cause, block_number,
                block_timestamp, transaction_hash
             )
             VALUES (
                $1, $2, $3, $4, $5, $5, $6, $7::NUMERIC(78, 0), $8::NUMERIC(78, 0),
                ($8::NUMERIC(78, 0) - $7::NUMERIC(78, 0)), 'balanceOf', 'onchain-refresh',
                $9::NUMERIC(78, 0), $10::NUMERIC(78, 0), 'onchain-refresh'
             )
             ON CONFLICT (id) DO NOTHING",
        )
        .bind(format!(
            "onchain-refresh-balance-{}",
            onchain_refresh_checkpoint_scope(task)
        ))
        .bind(task.chain_id)
        .bind(&task.dao_code)
        .bind(&task.governor_address)
        .bind(&task.token_address)
        .bind(&task.account)
        .bind(previous_balance)
        .bind(new_balance)
        .bind(&task.last_seen_block_number)
        .bind(&task.last_seen_block_timestamp)
        .execute(&mut **transaction)
        .await?;
    }

    if task.refresh_power {
        let previous_power = previous.power.as_deref().unwrap_or("0");
        let new_power = value.power.as_deref().unwrap_or("0");
        sqlx::query(
            "INSERT INTO vote_power_checkpoint (
                id, chain_id, dao_code, governor_address, token_address, contract_address,
                account, clock_mode, timepoint, previous_power, new_power, delta, source, cause,
                block_number, block_timestamp, transaction_hash
             )
             VALUES (
                $1, $2, $3, $4, $5, $5, $6, 'blocknumber', $7::NUMERIC(78, 0),
                $8::NUMERIC(78, 0), $9::NUMERIC(78, 0),
                ($9::NUMERIC(78, 0) - $8::NUMERIC(78, 0)), 'getVotes', 'onchain-refresh',
                $7::NUMERIC(78, 0), $10::NUMERIC(78, 0), 'onchain-refresh'
             )
             ON CONFLICT (id) DO NOTHING",
        )
        .bind(format!(
            "onchain-refresh-power-{}",
            onchain_refresh_checkpoint_scope(task)
        ))
        .bind(task.chain_id)
        .bind(&task.dao_code)
        .bind(&task.governor_address)
        .bind(&task.token_address)
        .bind(&task.account)
        .bind(&task.last_seen_block_number)
        .bind(previous_power)
        .bind(new_power)
        .bind(&task.last_seen_block_timestamp)
        .execute(&mut **transaction)
        .await?;
    }

    Ok(())
}

async fn refresh_data_metric(
    transaction: &mut Transaction<'_, Postgres>,
    task: &OnchainRefreshTask,
) -> Result<(), sqlx::Error> {
    let metric_id = data_metric_id(
        task.chain_id,
        &task.governor_address,
        task.dao_code.as_deref(),
    );

    sqlx::query(
        "INSERT INTO data_metric (
            id, chain_id, dao_code, governor_address, token_address, power_sum, member_count
         )
         SELECT
            $1, $2, $3, $4, $5,
            COALESCE(sum(power), 0)::NUMERIC(78, 0),
            count(*)::INTEGER
         FROM contributor
         WHERE chain_id = $2 AND governor_address = $4 AND dao_code IS NOT DISTINCT FROM $3
         ON CONFLICT ON CONSTRAINT data_metric_scope_unique DO UPDATE
         SET token_address = COALESCE(data_metric.token_address, EXCLUDED.token_address),
             power_sum = EXCLUDED.power_sum,
             member_count = EXCLUDED.member_count",
    )
    .bind(metric_id)
    .bind(task.chain_id)
    .bind(&task.dao_code)
    .bind(&task.governor_address)
    .bind(&task.token_address)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn complete_task(
    transaction: &mut Transaction<'_, Postgres>,
    task_id: &str,
    now_ms: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE onchain_refresh_task
         SET status = CASE WHEN pending_after_lock THEN 'pending' ELSE 'completed' END,
             next_run_at = CASE WHEN pending_after_lock THEN $2::NUMERIC(78, 0) ELSE next_run_at END,
             locked_at = NULL,
             locked_by = NULL,
             processed_at = CASE WHEN pending_after_lock THEN processed_at ELSE $2::NUMERIC(78, 0) END,
             error = NULL,
             last_seen_block_number = COALESCE(pending_after_lock_block_number, last_seen_block_number),
             last_seen_block_timestamp = COALESCE(pending_after_lock_block_timestamp, last_seen_block_timestamp),
             last_seen_transaction_hash = COALESCE(pending_after_lock_transaction_hash, last_seen_transaction_hash),
             pending_after_lock = false,
             pending_after_lock_block_number = NULL,
             pending_after_lock_block_timestamp = NULL,
             pending_after_lock_transaction_hash = NULL,
             updated_at = $2::NUMERIC(78, 0)
         WHERE id = $1",
    )
    .bind(task_id)
    .bind(now_ms.to_string())
    .execute(&mut **transaction)
    .await?;

    Ok(())
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
        "{}:{}:{}:{}:{}:{}",
        task.chain_id,
        task.dao_code.as_deref().unwrap_or_default(),
        task.governor_address,
        task.token_address,
        task.account,
        task.last_seen_block_number,
    )
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

fn encode_call_data(method: ChainReadMethod, args: &[String]) -> Result<String, String> {
    let selector = match method {
        ChainReadMethod::BalanceOf => "0x70a08231",
        ChainReadMethod::GetVotes => "0x9ab24eb0",
        ChainReadMethod::CurrentVotes => "0xb58131b0",
        method => return Err(format!("unsupported onchain refresh method {method:?}")),
    };
    let account = args
        .first()
        .ok_or_else(|| format!("missing account argument for {method:?}"))?;

    Ok(format!(
        "{selector}{}",
        encode_address_argument(account)?.trim_start_matches("0x")
    ))
}

fn encode_address_argument(address: &str) -> Result<String, String> {
    let value = address.trim_start_matches("0x");
    if value.len() != 40 || !value.chars().all(|character| character.is_ascii_hexdigit()) {
        return Err(format!("invalid address argument {address}"));
    }

    Ok(format!("{value:0>64}"))
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

#[derive(Debug, Deserialize)]
struct JsonRpcResponse {
    result: Option<String>,
    error: Option<JsonRpcError>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcError {
    message: String,
}
