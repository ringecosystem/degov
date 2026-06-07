use std::{
    collections::BTreeMap,
    env,
    error::Error,
    sync::{
        Arc, Mutex as StdMutex,
        atomic::{AtomicU64, Ordering},
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use degov_datalens_indexer::{
    BatchReadPlanConfig, BlockReadMode, ChainReadExecutionReport, ChainReadMethod,
    ChainReadMetrics, ChainReadPlan, ChainReadResult, ChainReadValue, ChainTool,
    MultiChainToolOnchainRefreshReader, OnchainRefreshReadValue, OnchainRefreshReader,
    OnchainRefreshReaderError, OnchainRefreshRunReport, OnchainRefreshTask,
    OnchainRefreshTickClock, OnchainRefreshTickConfig, OnchainRefreshTickRunner,
    OnchainRefreshTickScheduler, OnchainRefreshTickSkipReason, OnchainRefreshWorker,
    OnchainRefreshWorkerConfig, PartialChainReadFailureReport, runtime::apply_migrations,
};
use sqlx::{PgPool, Row, postgres::PgPoolOptions};
use tokio::sync::{Mutex, MutexGuard};

static SCHEMA_COUNTER: AtomicU64 = AtomicU64::new(0);
static DATABASE_TEST_LOCK: Mutex<()> = Mutex::const_new(());

#[test]
fn test_onchain_refresh_tick_skips_when_disabled() {
    let mut runner = ScriptedTickRunner::new([OnchainRefreshRunReport {
        claimed: 1,
        completed: 1,
        failed: 0,
    }]);
    let mut scheduler = OnchainRefreshTickScheduler::new(
        OnchainRefreshTickConfig {
            enabled: false,
            max_tasks_per_tick: 10,
            max_duration_per_tick: Duration::from_millis(100),
            min_blocks_between_ticks: 0,
        },
        FakeTickClock::default(),
    );

    let report = scheduler.run_tick(100, &mut runner).expect("tick runs");

    assert_eq!(report.processed, 0);
    assert_eq!(report.skipped, Some(OnchainRefreshTickSkipReason::Disabled));
    assert_eq!(runner.calls, Vec::<usize>::new());
}

#[test]
fn test_onchain_refresh_tick_reports_empty_queue() {
    let mut runner = ScriptedTickRunner::new([OnchainRefreshRunReport::default()]);
    let mut scheduler = OnchainRefreshTickScheduler::new(
        OnchainRefreshTickConfig {
            enabled: true,
            max_tasks_per_tick: 10,
            max_duration_per_tick: Duration::from_millis(100),
            min_blocks_between_ticks: 0,
        },
        FakeTickClock::default(),
    );

    let report = scheduler.run_tick(100, &mut runner).expect("tick runs");

    assert_eq!(report.processed, 0);
    assert_eq!(
        report.skipped,
        Some(OnchainRefreshTickSkipReason::EmptyQueue)
    );
    assert_eq!(runner.calls, vec![1]);
}

#[test]
fn test_onchain_refresh_tick_empty_queue_does_not_advance_schedule() {
    let mut empty_runner = ScriptedTickRunner::new([OnchainRefreshRunReport::default()]);
    let mut scheduler = OnchainRefreshTickScheduler::new(
        OnchainRefreshTickConfig {
            enabled: true,
            max_tasks_per_tick: 10,
            max_duration_per_tick: Duration::from_millis(100),
            min_blocks_between_ticks: 10,
        },
        FakeTickClock::default(),
    );

    let empty_report = scheduler
        .run_tick(100, &mut empty_runner)
        .expect("empty tick runs");

    assert_eq!(
        empty_report.skipped,
        Some(OnchainRefreshTickSkipReason::EmptyQueue)
    );

    let mut task_runner = ScriptedTickRunner::new([OnchainRefreshRunReport {
        claimed: 1,
        completed: 1,
        failed: 0,
    }]);
    let task_report = scheduler
        .run_tick(101, &mut task_runner)
        .expect("next tick is not delayed by empty queue");

    assert_eq!(task_report.processed, 1);
    assert_eq!(task_report.skipped, None);
    assert_eq!(task_runner.calls, vec![1, 1]);
}

#[test]
fn test_onchain_refresh_tick_stops_at_task_budget() {
    let mut runner = ScriptedTickRunner::new([
        OnchainRefreshRunReport {
            claimed: 1,
            completed: 1,
            failed: 0,
        },
        OnchainRefreshRunReport {
            claimed: 1,
            completed: 1,
            failed: 0,
        },
        OnchainRefreshRunReport {
            claimed: 1,
            completed: 1,
            failed: 0,
        },
    ]);
    let mut scheduler = OnchainRefreshTickScheduler::new(
        OnchainRefreshTickConfig {
            enabled: true,
            max_tasks_per_tick: 3,
            max_duration_per_tick: Duration::from_millis(100),
            min_blocks_between_ticks: 0,
        },
        FakeTickClock::default(),
    );

    let report = scheduler.run_tick(100, &mut runner).expect("tick runs");

    assert_eq!(report.processed, 3);
    assert!(report.task_budget_hit);
    assert!(!report.duration_budget_hit);
    assert_eq!(runner.calls, vec![1, 1, 1]);
}

#[test]
fn test_onchain_refresh_tick_stops_at_duration_budget_between_single_task_claims() {
    let mut runner = ScriptedTickRunner::new([
        OnchainRefreshRunReport {
            claimed: 1,
            completed: 1,
            failed: 0,
        },
        OnchainRefreshRunReport {
            claimed: 1,
            completed: 1,
            failed: 0,
        },
    ]);
    let mut scheduler = OnchainRefreshTickScheduler::new(
        OnchainRefreshTickConfig {
            enabled: true,
            max_tasks_per_tick: 10,
            max_duration_per_tick: Duration::from_millis(5),
            min_blocks_between_ticks: 0,
        },
        FakeTickClock::with_step(Duration::from_millis(10)),
    );

    let report = scheduler.run_tick(100, &mut runner).expect("tick runs");

    assert_eq!(report.processed, 1);
    assert!(!report.task_budget_hit);
    assert!(report.duration_budget_hit);
    assert_eq!(runner.calls, vec![1]);
}

#[test]
fn test_onchain_refresh_tick_failure_does_not_advance_schedule() {
    let mut runner = FailingTickRunner::default();
    let mut scheduler = OnchainRefreshTickScheduler::new(
        OnchainRefreshTickConfig {
            enabled: true,
            max_tasks_per_tick: 10,
            max_duration_per_tick: Duration::from_millis(100),
            min_blocks_between_ticks: 10,
        },
        FakeTickClock::default(),
    );

    let error = scheduler
        .run_tick(100, &mut runner)
        .expect_err("tick failure propagates");
    assert_eq!(error, "mock tick failure");

    let mut retry_runner = ScriptedTickRunner::new([OnchainRefreshRunReport::default()]);
    let report = scheduler
        .run_tick(101, &mut retry_runner)
        .expect("tick retries before min block interval after failure");

    assert_eq!(
        report.skipped,
        Some(OnchainRefreshTickSkipReason::EmptyQueue)
    );
    assert_eq!(retry_runner.calls, vec![1]);
}

struct TestDatabase {
    _guard: MutexGuard<'static, ()>,
    pool: PgPool,
    schema: String,
}

impl TestDatabase {
    async fn connect() -> Result<Self, Box<dyn Error>> {
        let guard = DATABASE_TEST_LOCK.lock().await;
        let database_url = env::var("DEGOV_INDEXER_TEST_DATABASE_URL")
            .map_err(|_| "DEGOV_INDEXER_TEST_DATABASE_URL is required")?;
        let pool = PgPoolOptions::new()
            .max_connections(1)
            .connect(&database_url)
            .await?;
        let schema = unique_schema_name();

        sqlx::query("DROP SCHEMA IF EXISTS squid_processor CASCADE")
            .execute(&pool)
            .await?;
        sqlx::query(&format!(r#"CREATE SCHEMA "{schema}""#))
            .execute(&pool)
            .await?;
        sqlx::query(&format!(r#"SET search_path TO "{schema}""#))
            .execute(&pool)
            .await?;
        apply_migrations(&pool).await?;

        Ok(Self {
            _guard: guard,
            pool,
            schema,
        })
    }

    async fn cleanup(&self) -> Result<(), sqlx::Error> {
        sqlx::query("DROP SCHEMA IF EXISTS squid_processor CASCADE")
            .execute(&self.pool)
            .await?;
        sqlx::query(&format!(
            r#"DROP SCHEMA IF EXISTS "{}" CASCADE"#,
            self.schema
        ))
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}

impl Drop for TestDatabase {
    fn drop(&mut self) {
        let pool = self.pool.clone();
        let schema = self.schema.clone();

        if let Ok(handle) = tokio::runtime::Handle::try_current() {
            tokio::task::block_in_place(|| {
                handle.block_on(async move {
                    let _ = sqlx::query("DROP SCHEMA IF EXISTS squid_processor CASCADE")
                        .execute(&pool)
                        .await;
                    let _ = sqlx::query(&format!(r#"DROP SCHEMA IF EXISTS "{schema}" CASCADE"#))
                        .execute(&pool)
                        .await;
                });
            });
        }
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn test_onchain_refresh_worker_updates_contributors_tasks_and_metrics()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    seed_contributor(&database.pool, ACCOUNT_ONE, "3", Some("4")).await?;
    seed_data_metric(&database.pool, "7").await?;
    seed_task(
        &database.pool,
        "task-one",
        ACCOUNT_ONE,
        "pending",
        0,
        true,
        true,
    )
    .await?;
    seed_task(
        &database.pool,
        "task-two",
        ACCOUNT_TWO,
        "failed",
        1,
        false,
        true,
    )
    .await?;

    let reader = MockOnchainRefreshReader::new([
        (
            "task-one",
            OnchainRefreshReadValue {
                task_id: "task-one".to_owned(),
                balance: Some("17".to_owned()),
                power: Some("11".to_owned()),
            },
        ),
        (
            "task-two",
            OnchainRefreshReadValue {
                task_id: "task-two".to_owned(),
                balance: None,
                power: Some("5".to_owned()),
            },
        ),
    ]);
    let worker = OnchainRefreshWorker::new(
        database.pool.clone(),
        OnchainRefreshWorkerConfig {
            batch_size: 10,
            max_attempts: 3,
            lock_ttl: Duration::from_secs(60),
            retry_delay: Duration::from_secs(30),
            lock_owner: "test-worker".to_owned(),
        },
        reader,
    );

    let report = worker.run_once().await?;

    assert_eq!(report.claimed, 2);
    assert_eq!(report.completed, 2);
    assert_eq!(report.failed, 0);
    assert_eq!(
        contributor_values(&database.pool, ACCOUNT_ONE).await?,
        ("11".to_owned(), Some("17".to_owned()))
    );
    assert_eq!(
        contributor_values(&database.pool, ACCOUNT_TWO).await?,
        ("5".to_owned(), None)
    );
    assert_completed_task(&database.pool, "task-one", 1).await?;
    assert_completed_task(&database.pool, "task-two", 2).await?;
    assert_data_metric(&database.pool, "16", 2, 7).await?;
    assert_power_checkpoint(&database.pool, ACCOUNT_ONE, "3", "11", "8").await?;
    assert_power_checkpoint(&database.pool, ACCOUNT_TWO, "0", "5", "5").await?;
    assert_balance_checkpoint(&database.pool, ACCOUNT_ONE, "4", "17", "13").await?;
    assert_table_count(&database.pool, "token_balance_checkpoint", 1).await?;

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_onchain_refresh_worker_uses_current_votes_checkpoint_source()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    seed_task(
        &database.pool,
        "task-one",
        ACCOUNT_ONE,
        "pending",
        0,
        false,
        true,
    )
    .await?;

    let reader = MockOnchainRefreshReader::new([(
        "task-one",
        OnchainRefreshReadValue {
            task_id: "task-one".to_owned(),
            balance: None,
            power: Some("11".to_owned()),
        },
    )]);
    let worker = OnchainRefreshWorker::new(
        database.pool.clone(),
        OnchainRefreshWorkerConfig {
            batch_size: 10,
            max_attempts: 3,
            lock_ttl: Duration::from_secs(60),
            retry_delay: Duration::from_secs(30),
            lock_owner: "test-worker".to_owned(),
        },
        reader,
    )
    .with_current_power_method(ChainReadMethod::CurrentVotes);

    let report = worker.run_once().await?;

    assert_eq!(report.completed, 1);
    assert_power_checkpoint_source(&database.pool, ACCOUNT_ONE, "getCurrentVotes").await?;

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_onchain_refresh_worker_marks_claimed_tasks_failed_when_reader_fails()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    seed_contributor(&database.pool, ACCOUNT_ONE, "3", Some("4")).await?;
    seed_data_metric(&database.pool, "7").await?;
    seed_task(
        &database.pool,
        "task-one",
        ACCOUNT_ONE,
        "pending",
        0,
        true,
        true,
    )
    .await?;

    let worker = OnchainRefreshWorker::new(
        database.pool.clone(),
        OnchainRefreshWorkerConfig {
            batch_size: 10,
            max_attempts: 3,
            lock_ttl: Duration::from_secs(60),
            retry_delay: Duration::from_secs(30),
            lock_owner: "test-worker".to_owned(),
        },
        FailingOnchainRefreshReader,
    );

    let report = worker.run_once().await?;

    assert_eq!(report.claimed, 1);
    assert_eq!(report.completed, 0);
    assert_eq!(report.failed, 1);
    assert_eq!(
        contributor_values(&database.pool, ACCOUNT_ONE).await?,
        ("3".to_owned(), Some("4".to_owned()))
    );
    let row = sqlx::query(
        "SELECT
            status,
            attempts,
            error,
            locked_at::TEXT AS locked_at,
            locked_by,
            processed_at::TEXT AS processed_at,
            next_run_at::TEXT AS next_run_at
         FROM onchain_refresh_task
         WHERE id = $1",
    )
    .bind("task-one")
    .fetch_one(&database.pool)
    .await?;

    assert_eq!(row.get::<String, _>("status"), "failed");
    assert_eq!(row.get::<i32, _>("attempts"), 1);
    assert!(
        row.get::<Option<String>, _>("error")
            .expect("error")
            .contains("mock reader failed")
    );
    assert_eq!(row.get::<Option<String>, _>("locked_at"), None);
    assert_eq!(row.get::<Option<String>, _>("locked_by"), None);
    assert_eq!(row.get::<Option<String>, _>("processed_at"), None);
    assert!(row.get::<String, _>("next_run_at").parse::<i64>()? > 0);
    assert_data_metric(&database.pool, "7", 1, 7).await?;

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_onchain_refresh_worker_checkpoint_ids_include_scope() -> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    seed_task_with_scope(
        &database.pool,
        "task-one",
        "demo-dao",
        46,
        "demo-dao",
        GOVERNOR,
        TOKEN,
        ACCOUNT_ONE,
        "pending",
        0,
        true,
        true,
    )
    .await?;
    seed_task_with_scope(
        &database.pool,
        "task-two",
        "other-dao",
        46,
        "other-dao",
        GOVERNOR_TWO,
        TOKEN_TWO,
        ACCOUNT_ONE,
        "pending",
        0,
        true,
        true,
    )
    .await?;

    let reader = MockOnchainRefreshReader::new([
        (
            "task-one",
            OnchainRefreshReadValue {
                task_id: "task-one".to_owned(),
                balance: Some("17".to_owned()),
                power: Some("11".to_owned()),
            },
        ),
        (
            "task-two",
            OnchainRefreshReadValue {
                task_id: "task-two".to_owned(),
                balance: Some("23".to_owned()),
                power: Some("19".to_owned()),
            },
        ),
    ]);
    let worker = OnchainRefreshWorker::new(
        database.pool.clone(),
        OnchainRefreshWorkerConfig {
            batch_size: 10,
            max_attempts: 3,
            lock_ttl: Duration::from_secs(60),
            retry_delay: Duration::from_secs(30),
            lock_owner: "test-worker".to_owned(),
        },
        reader,
    );

    let report = worker.run_once().await?;

    assert_eq!(report.completed, 2);
    assert_scoped_checkpoint_count(&database.pool, "vote_power_checkpoint", ACCOUNT_ONE, 2).await?;
    assert_scoped_checkpoint_count(&database.pool, "token_balance_checkpoint", ACCOUNT_ONE, 2)
        .await?;

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_onchain_refresh_worker_updates_only_matching_contract_set_contributor()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    seed_contributor_with_scope(
        &database.pool,
        SCOPE_ONE,
        46,
        "demo-dao",
        GOVERNOR,
        TOKEN,
        ACCOUNT_ONE,
        "3",
        Some("4"),
    )
    .await?;
    seed_contributor_with_scope(
        &database.pool,
        SCOPE_TWO,
        46,
        "demo-dao",
        GOVERNOR,
        TOKEN,
        ACCOUNT_ONE,
        "31",
        Some("41"),
    )
    .await?;
    seed_data_metric_with_scope(&database.pool, SCOPE_TWO, "31", 1, 7).await?;
    seed_task_with_contract_set(
        &database.pool,
        "task-one",
        SCOPE_ONE,
        46,
        "demo-dao",
        GOVERNOR,
        TOKEN,
        ACCOUNT_ONE,
        "pending",
        0,
        true,
        true,
    )
    .await?;

    let reader = MockOnchainRefreshReader::new([(
        "task-one",
        OnchainRefreshReadValue {
            task_id: "task-one".to_owned(),
            balance: Some("17".to_owned()),
            power: Some("11".to_owned()),
        },
    )]);
    let worker = OnchainRefreshWorker::new(
        database.pool.clone(),
        OnchainRefreshWorkerConfig {
            batch_size: 10,
            max_attempts: 3,
            lock_ttl: Duration::from_secs(60),
            retry_delay: Duration::from_secs(30),
            lock_owner: "test-worker".to_owned(),
        },
        reader,
    );

    let report = worker.run_once().await?;

    assert_eq!(report.completed, 1);
    assert_eq!(
        contributor_values_by_scope(&database.pool, SCOPE_ONE, ACCOUNT_ONE).await?,
        ("11".to_owned(), Some("17".to_owned()))
    );
    assert_eq!(
        contributor_values_by_scope(&database.pool, SCOPE_TWO, ACCOUNT_ONE).await?,
        ("31".to_owned(), Some("41".to_owned()))
    );
    assert_eq!(
        data_metric_values_by_scope(&database.pool, SCOPE_ONE).await?,
        ("11".to_owned(), 1)
    );
    assert_eq!(
        data_metric_values_by_scope(&database.pool, SCOPE_TWO).await?,
        ("31".to_owned(), 1)
    );
    assert_table_count(&database.pool, "contributor", 2).await?;
    assert_power_checkpoint(&database.pool, ACCOUNT_ONE, "3", "11", "8").await?;
    assert_balance_checkpoint(&database.pool, ACCOUNT_ONE, "4", "17", "13").await?;

    database.cleanup().await?;

    Ok(())
}

#[test]
fn test_multi_chain_reader_routes_tasks_to_matching_chain_tool() {
    let ethereum_tool = StaticValueChainTool::new("101");
    let lisk_tool = StaticValueChainTool::new("202");
    let reader = MultiChainToolOnchainRefreshReader::new(
        BTreeMap::from([(1, ethereum_tool.clone()), (1135, lisk_tool.clone())]),
        BatchReadPlanConfig::default(),
        ChainReadMethod::GetVotes,
    );

    let values = reader
        .read_tasks(&[
            task_for_chain("task-one", 1, ACCOUNT_ONE),
            task_for_chain("task-two", 1135, ACCOUNT_TWO),
        ])
        .expect("read tasks");
    let values = values
        .into_iter()
        .map(|value| (value.task_id.clone(), value))
        .collect::<BTreeMap<_, _>>();

    assert_eq!(
        values.get("task-one").expect("task-one").power.as_deref(),
        Some("101")
    );
    assert_eq!(
        values.get("task-two").expect("task-two").power.as_deref(),
        Some("202")
    );

    for plan in ethereum_tool
        .captured_plans()
        .into_iter()
        .chain(lisk_tool.captured_plans())
    {
        for read in plan.reads {
            assert_eq!(read.key.block_mode, BlockReadMode::Safe);
        }
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn test_onchain_refresh_worker_fails_only_missing_rpc_chain_group()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    seed_task_with_scope(
        &database.pool,
        "task-one",
        "ethereum-dao",
        1,
        "ethereum-dao",
        GOVERNOR,
        TOKEN,
        ACCOUNT_ONE,
        "pending",
        0,
        false,
        true,
    )
    .await?;
    seed_task_with_scope(
        &database.pool,
        "task-two",
        "lisk-dao",
        1135,
        "lisk-dao",
        GOVERNOR_TWO,
        TOKEN_TWO,
        ACCOUNT_TWO,
        "pending",
        0,
        false,
        true,
    )
    .await?;

    let reader = MultiChainToolOnchainRefreshReader::new(
        BTreeMap::from([(1, StaticValueChainTool::new("101"))]),
        BatchReadPlanConfig::default(),
        ChainReadMethod::GetVotes,
    );
    let worker = OnchainRefreshWorker::new(
        database.pool.clone(),
        OnchainRefreshWorkerConfig {
            batch_size: 10,
            max_attempts: 3,
            lock_ttl: Duration::from_secs(60),
            retry_delay: Duration::from_secs(30),
            lock_owner: "test-worker".to_owned(),
        },
        reader,
    );

    let report = worker.run_once().await?;

    assert_eq!(report.claimed, 2);
    assert_eq!(report.completed, 1);
    assert_eq!(report.failed, 1);
    assert_completed_task(&database.pool, "task-one", 1).await?;
    assert_failed_task_error_contains(&database.pool, "task-two", "chain_id 1135").await?;

    database.cleanup().await?;

    Ok(())
}

#[derive(Clone, Debug)]
struct MockOnchainRefreshReader {
    values: BTreeMap<String, OnchainRefreshReadValue>,
}

impl MockOnchainRefreshReader {
    fn new<const N: usize>(values: [(&'static str, OnchainRefreshReadValue); N]) -> Self {
        Self {
            values: values
                .into_iter()
                .map(|(task_id, value)| (task_id.to_owned(), value))
                .collect(),
        }
    }
}

impl OnchainRefreshReader for MockOnchainRefreshReader {
    fn read_tasks(
        &self,
        tasks: &[OnchainRefreshTask],
    ) -> Result<Vec<OnchainRefreshReadValue>, OnchainRefreshReaderError> {
        tasks
            .iter()
            .map(|task| {
                self.values.get(&task.id).cloned().ok_or_else(|| {
                    OnchainRefreshReaderError::new(format!("missing mock value for {}", task.id))
                })
            })
            .collect()
    }
}

#[derive(Clone, Debug)]
struct FailingOnchainRefreshReader;

impl OnchainRefreshReader for FailingOnchainRefreshReader {
    fn read_tasks(
        &self,
        _tasks: &[OnchainRefreshTask],
    ) -> Result<Vec<OnchainRefreshReadValue>, OnchainRefreshReaderError> {
        Err(OnchainRefreshReaderError::new("mock reader failed"))
    }
}

#[derive(Clone, Debug)]
struct StaticValueChainTool {
    value: String,
    plans: Arc<StdMutex<Vec<ChainReadPlan>>>,
}

impl StaticValueChainTool {
    fn new(value: &str) -> Self {
        Self {
            value: value.to_owned(),
            plans: Arc::new(StdMutex::new(Vec::new())),
        }
    }

    fn captured_plans(&self) -> Vec<ChainReadPlan> {
        self.plans.lock().expect("plans lock").clone()
    }
}

impl ChainTool for StaticValueChainTool {
    fn execute_read_plan(
        &self,
        plan: &ChainReadPlan,
    ) -> Result<ChainReadExecutionReport, PartialChainReadFailureReport> {
        self.plans.lock().expect("plans lock").push(plan.clone());
        Ok(ChainReadExecutionReport {
            metrics: ChainReadMetrics {
                requested_reads: plan.metrics.requested_reads,
                deduped_reads: plan.metrics.deduped_reads,
                executed_rpc_calls: plan.reads.len(),
                multicall_batch_size: plan.metrics.multicall_batch_size,
                ..ChainReadMetrics::default()
            },
            results: plan
                .reads
                .iter()
                .enumerate()
                .map(|(read_index, read)| ChainReadResult {
                    read_index,
                    key: read.key.clone(),
                    value: ChainReadValue::Integer(self.value.clone()),
                })
                .collect(),
            ..ChainReadExecutionReport::default()
        })
    }
}

fn task_for_chain(task_id: &str, chain_id: i32, account: &str) -> OnchainRefreshTask {
    OnchainRefreshTask {
        id: task_id.to_owned(),
        contract_set_id: format!("scope-{chain_id}"),
        chain_id,
        dao_code: Some(format!("dao-{chain_id}")),
        governor_address: GOVERNOR.to_owned(),
        token_address: TOKEN.to_owned(),
        account: account.to_owned(),
        refresh_balance: false,
        refresh_power: true,
        last_seen_block_number: "12".to_owned(),
        last_seen_block_timestamp: "12000".to_owned(),
        last_seen_transaction_hash: "0xtask".to_owned(),
        attempts: 0,
    }
}

async fn seed_contributor(
    pool: &PgPool,
    account: &str,
    power: &str,
    balance: Option<&str>,
) -> Result<(), sqlx::Error> {
    seed_contributor_with_scope(
        pool, "demo-dao", 46, "demo-dao", GOVERNOR, TOKEN, account, power, balance,
    )
    .await
}

async fn seed_contributor_with_scope(
    pool: &PgPool,
    contract_set_id: &str,
    chain_id: i32,
    dao_code: &str,
    governor: &str,
    token: &str,
    account: &str,
    power: &str,
    balance: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO contributor (
            id, contract_set_id, chain_id, dao_code, governor_address, token_address, contract_address,
            log_index, transaction_index, block_number, block_timestamp, transaction_hash,
            power, balance, delegates_count_all, delegates_count_effective
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $6, 0, 0, 10::NUMERIC(78, 0),
            1000::NUMERIC(78, 0), '0xseed', $7::NUMERIC(78, 0), $8::NUMERIC(78, 0), 0, 0
         )",
    )
    .bind(account)
    .bind(contract_set_id)
    .bind(chain_id)
    .bind(dao_code)
    .bind(governor)
    .bind(token)
    .bind(power)
    .bind(balance)
    .execute(pool)
    .await?;

    Ok(())
}

async fn seed_data_metric(pool: &PgPool, power_sum: &str) -> Result<(), sqlx::Error> {
    seed_data_metric_with_scope(pool, "demo-dao", power_sum, 1, 7).await
}

async fn seed_data_metric_with_scope(
    pool: &PgPool,
    contract_set_id: &str,
    power_sum: &str,
    member_count: i32,
    votes_count: i32,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO data_metric (
            id, contract_set_id, chain_id, dao_code, governor_address, token_address, power_sum,
            member_count, votes_count
         )
         VALUES (
            'global',
            $1, 46, 'demo-dao', $2, $3, $4::NUMERIC(78, 0), $5, $6
         )",
    )
    .bind(contract_set_id)
    .bind(GOVERNOR)
    .bind(TOKEN)
    .bind(power_sum)
    .bind(member_count)
    .bind(votes_count)
    .execute(pool)
    .await?;

    Ok(())
}

async fn seed_task(
    pool: &PgPool,
    task_id: &str,
    account: &str,
    status: &str,
    attempts: i32,
    refresh_balance: bool,
    refresh_power: bool,
) -> Result<(), sqlx::Error> {
    seed_task_with_scope(
        pool,
        task_id,
        "demo-dao",
        46,
        "demo-dao",
        GOVERNOR,
        TOKEN,
        account,
        status,
        attempts,
        refresh_balance,
        refresh_power,
    )
    .await
}

async fn seed_task_with_scope(
    pool: &PgPool,
    task_id: &str,
    contract_set_id: &str,
    chain_id: i32,
    dao_code: &str,
    governor: &str,
    token: &str,
    account: &str,
    status: &str,
    attempts: i32,
    refresh_balance: bool,
    refresh_power: bool,
) -> Result<(), sqlx::Error> {
    seed_task_with_contract_set(
        pool,
        task_id,
        contract_set_id,
        chain_id,
        dao_code,
        governor,
        token,
        account,
        status,
        attempts,
        refresh_balance,
        refresh_power,
    )
    .await
}

async fn seed_task_with_contract_set(
    pool: &PgPool,
    task_id: &str,
    contract_set_id: &str,
    chain_id: i32,
    dao_code: &str,
    governor: &str,
    token: &str,
    account: &str,
    status: &str,
    attempts: i32,
    refresh_balance: bool,
    refresh_power: bool,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO onchain_refresh_task (
            id, contract_set_id, chain_id, dao_code, governor_address, token_address, account,
            refresh_balance, refresh_power, reason, first_seen_block_number,
            last_seen_block_number, last_seen_block_timestamp, last_seen_transaction_hash,
            status, attempts, next_run_at, pending_after_lock, created_at, updated_at
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, 'token-activity',
            10::NUMERIC(78, 0), 12::NUMERIC(78, 0), 12000::NUMERIC(78, 0),
            '0xtask', $10, $11, 0::NUMERIC(78, 0), false, 10000::NUMERIC(78, 0),
            10000::NUMERIC(78, 0)
         )",
    )
    .bind(task_id)
    .bind(contract_set_id)
    .bind(chain_id)
    .bind(dao_code)
    .bind(governor)
    .bind(token)
    .bind(account)
    .bind(refresh_balance)
    .bind(refresh_power)
    .bind(status)
    .bind(attempts)
    .execute(pool)
    .await?;

    Ok(())
}

async fn contributor_values(
    pool: &PgPool,
    account: &str,
) -> Result<(String, Option<String>), sqlx::Error> {
    let row = sqlx::query(
        "SELECT power::TEXT AS power, balance::TEXT AS balance
         FROM contributor
         WHERE id = $1",
    )
    .bind(account)
    .fetch_one(pool)
    .await?;

    Ok((
        row.get::<String, _>("power"),
        row.get::<Option<String>, _>("balance"),
    ))
}

async fn contributor_values_by_scope(
    pool: &PgPool,
    contract_set_id: &str,
    account: &str,
) -> Result<(String, Option<String>), sqlx::Error> {
    let row = sqlx::query(
        "SELECT power::TEXT AS power, balance::TEXT AS balance
         FROM contributor
         WHERE contract_set_id = $1 AND id = $2",
    )
    .bind(contract_set_id)
    .bind(account)
    .fetch_one(pool)
    .await?;

    Ok((
        row.get::<String, _>("power"),
        row.get::<Option<String>, _>("balance"),
    ))
}

async fn data_metric_values_by_scope(
    pool: &PgPool,
    contract_set_id: &str,
) -> Result<(String, i32), sqlx::Error> {
    let row = sqlx::query(
        "SELECT power_sum::TEXT AS power_sum, member_count
         FROM data_metric
         WHERE contract_set_id = $1",
    )
    .bind(contract_set_id)
    .fetch_one(pool)
    .await?;

    Ok((
        row.get::<String, _>("power_sum"),
        row.get::<i32, _>("member_count"),
    ))
}

async fn assert_completed_task(
    pool: &PgPool,
    task_id: &str,
    attempts: i32,
) -> Result<(), sqlx::Error> {
    let row = sqlx::query(
        "SELECT
            status,
            attempts,
            error,
            locked_at::TEXT AS locked_at,
            locked_by,
            processed_at::TEXT AS processed_at
         FROM onchain_refresh_task
         WHERE id = $1",
    )
    .bind(task_id)
    .fetch_one(pool)
    .await?;

    assert_eq!(row.get::<String, _>("status"), "completed");
    assert_eq!(row.get::<i32, _>("attempts"), attempts);
    assert_eq!(row.get::<Option<String>, _>("error"), None);
    assert_eq!(row.get::<Option<String>, _>("locked_at"), None);
    assert_eq!(row.get::<Option<String>, _>("locked_by"), None);
    assert!(row.get::<Option<String>, _>("processed_at").is_some());

    Ok(())
}

async fn assert_failed_task_error_contains(
    pool: &PgPool,
    task_id: &str,
    expected_error: &str,
) -> Result<(), sqlx::Error> {
    let row = sqlx::query(
        "SELECT status, attempts, error
         FROM onchain_refresh_task
         WHERE id = $1",
    )
    .bind(task_id)
    .fetch_one(pool)
    .await?;

    assert_eq!(row.get::<String, _>("status"), "failed");
    assert_eq!(row.get::<i32, _>("attempts"), 1);
    assert!(
        row.get::<Option<String>, _>("error")
            .expect("error")
            .contains(expected_error)
    );

    Ok(())
}

async fn assert_data_metric(
    pool: &PgPool,
    power_sum: &str,
    member_count: i32,
    votes_count: i32,
) -> Result<(), sqlx::Error> {
    let row = sqlx::query(
        "SELECT power_sum::TEXT AS power_sum, member_count, votes_count
         FROM data_metric
         WHERE chain_id = 46 AND governor_address = $1 AND dao_code = 'demo-dao'",
    )
    .bind(GOVERNOR)
    .fetch_one(pool)
    .await?;

    assert_eq!(row.get::<String, _>("power_sum"), power_sum);
    assert_eq!(row.get::<i32, _>("member_count"), member_count);
    assert_eq!(row.get::<i32, _>("votes_count"), votes_count);

    Ok(())
}

async fn assert_power_checkpoint(
    pool: &PgPool,
    account: &str,
    previous_power: &str,
    new_power: &str,
    delta: &str,
) -> Result<(), sqlx::Error> {
    let row = sqlx::query(
        "SELECT previous_power::TEXT AS previous_power, new_power::TEXT AS new_power,
                delta::TEXT AS delta, source, cause, block_number::TEXT AS block_number,
                block_timestamp::TEXT AS block_timestamp, transaction_hash
         FROM vote_power_checkpoint
         WHERE account = $1",
    )
    .bind(account)
    .fetch_one(pool)
    .await?;

    assert_eq!(row.get::<String, _>("previous_power"), previous_power);
    assert_eq!(row.get::<String, _>("new_power"), new_power);
    assert_eq!(row.get::<String, _>("delta"), delta);
    assert_eq!(row.get::<String, _>("source"), "getVotes");
    assert_eq!(row.get::<String, _>("cause"), "onchain-refresh");
    assert_eq!(row.get::<String, _>("block_number"), "12");
    assert_eq!(row.get::<String, _>("block_timestamp"), "12000");
    assert_eq!(row.get::<String, _>("transaction_hash"), "onchain-refresh");

    Ok(())
}

async fn assert_power_checkpoint_source(
    pool: &PgPool,
    account: &str,
    source: &str,
) -> Result<(), sqlx::Error> {
    let row = sqlx::query(
        "SELECT source
         FROM vote_power_checkpoint
         WHERE account = $1",
    )
    .bind(account)
    .fetch_one(pool)
    .await?;

    assert_eq!(row.get::<String, _>("source"), source);

    Ok(())
}

async fn assert_balance_checkpoint(
    pool: &PgPool,
    account: &str,
    previous_balance: &str,
    new_balance: &str,
    delta: &str,
) -> Result<(), sqlx::Error> {
    let row = sqlx::query(
        "SELECT previous_balance::TEXT AS previous_balance,
                new_balance::TEXT AS new_balance, delta::TEXT AS delta, source, cause,
                block_number::TEXT AS block_number, block_timestamp::TEXT AS block_timestamp,
                transaction_hash
         FROM token_balance_checkpoint
         WHERE account = $1",
    )
    .bind(account)
    .fetch_one(pool)
    .await?;

    assert_eq!(row.get::<String, _>("previous_balance"), previous_balance);
    assert_eq!(row.get::<String, _>("new_balance"), new_balance);
    assert_eq!(row.get::<String, _>("delta"), delta);
    assert_eq!(row.get::<String, _>("source"), "balanceOf");
    assert_eq!(row.get::<String, _>("cause"), "onchain-refresh");
    assert_eq!(row.get::<String, _>("block_number"), "12");
    assert_eq!(row.get::<String, _>("block_timestamp"), "12000");
    assert_eq!(row.get::<String, _>("transaction_hash"), "onchain-refresh");

    Ok(())
}

async fn assert_table_count(pool: &PgPool, table: &str, expected: i64) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query(&format!("SELECT count(*)::BIGINT FROM {table}"))
        .fetch_one(pool)
        .await?
        .get(0);

    assert_eq!(count, expected);

    Ok(())
}

async fn assert_scoped_checkpoint_count(
    pool: &PgPool,
    table: &str,
    account: &str,
    expected: i64,
) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query(&format!(
        "SELECT count(*)::BIGINT FROM {table} WHERE account = $1"
    ))
    .bind(account)
    .fetch_one(pool)
    .await?
    .get(0);

    assert_eq!(count, expected);

    Ok(())
}

fn unique_schema_name() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_millis();
    let sequence = SCHEMA_COUNTER.fetch_add(1, Ordering::Relaxed);

    format!(
        "degov_onchain_refresh_worker_test_{}_{}_{}",
        std::process::id(),
        millis,
        sequence
    )
}

#[derive(Default)]
struct FakeTickClock {
    elapsed: Duration,
    step: Duration,
}

impl FakeTickClock {
    fn with_step(step: Duration) -> Self {
        Self {
            elapsed: Duration::ZERO,
            step,
        }
    }
}

impl OnchainRefreshTickClock for FakeTickClock {
    fn elapsed(&mut self) -> Duration {
        let elapsed = self.elapsed;
        self.elapsed += self.step;
        elapsed
    }
}

struct ScriptedTickRunner {
    reports: Vec<OnchainRefreshRunReport>,
    calls: Vec<usize>,
}

impl ScriptedTickRunner {
    fn new<const N: usize>(reports: [OnchainRefreshRunReport; N]) -> Self {
        Self {
            reports: reports.into_iter().rev().collect(),
            calls: Vec::new(),
        }
    }
}

impl OnchainRefreshTickRunner for ScriptedTickRunner {
    type Error = String;

    fn run_once(&mut self, max_tasks: usize) -> Result<OnchainRefreshRunReport, Self::Error> {
        self.calls.push(max_tasks);
        Ok(self.reports.pop().unwrap_or_default())
    }
}

#[derive(Default)]
struct FailingTickRunner;

impl OnchainRefreshTickRunner for FailingTickRunner {
    type Error = String;

    fn run_once(&mut self, _max_tasks: usize) -> Result<OnchainRefreshRunReport, Self::Error> {
        Err("mock tick failure".to_owned())
    }
}

const GOVERNOR: &str = "0x1111111111111111111111111111111111111111";
const GOVERNOR_TWO: &str = "0x3333333333333333333333333333333333333333";
const TOKEN: &str = "0x2222222222222222222222222222222222222222";
const TOKEN_TWO: &str = "0x4444444444444444444444444444444444444444";
const SCOPE_ONE: &str = "scope:timelock-a:erc20:dataset-a";
const SCOPE_TWO: &str = "scope:timelock-b:erc721:dataset-b";
const ACCOUNT_ONE: &str = "0x0000000000000000000000000000000000000001";
const ACCOUNT_TWO: &str = "0x0000000000000000000000000000000000000002";
