use std::{
    collections::BTreeMap,
    env,
    error::Error,
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use degov_datalens_indexer::{
    OnchainRefreshReadValue, OnchainRefreshReader, OnchainRefreshReaderError, OnchainRefreshTask,
    OnchainRefreshWorker, OnchainRefreshWorkerConfig,
};
use sqlx::{PgPool, Row, postgres::PgPoolOptions};
use tokio::sync::{Mutex, MutexGuard};

const SCHEMA_SQL: &str = include_str!("../schema/postgres.sql");
static SCHEMA_COUNTER: AtomicU64 = AtomicU64::new(0);
static DATABASE_TEST_LOCK: Mutex<()> = Mutex::const_new(());

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
        sqlx::raw_sql(SCHEMA_SQL).execute(&pool).await?;

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

async fn seed_contributor(
    pool: &PgPool,
    account: &str,
    power: &str,
    balance: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO contributor (
            id, chain_id, dao_code, governor_address, token_address, contract_address,
            log_index, transaction_index, block_number, block_timestamp, transaction_hash,
            power, balance, delegates_count_all, delegates_count_effective
         )
         VALUES (
            $1, 46, 'demo-dao', $2, $3, $3, 0, 0, 10::NUMERIC(78, 0),
            1000::NUMERIC(78, 0), '0xseed', $4::NUMERIC(78, 0), $5::NUMERIC(78, 0), 0, 0
         )",
    )
    .bind(account)
    .bind(GOVERNOR)
    .bind(TOKEN)
    .bind(power)
    .bind(balance)
    .execute(pool)
    .await?;

    Ok(())
}

async fn seed_data_metric(pool: &PgPool, power_sum: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO data_metric (
            id, chain_id, dao_code, governor_address, token_address, power_sum,
            member_count, votes_count
         )
         VALUES (
            '46:0x1111111111111111111111111111111111111111:demo-dao',
            46, 'demo-dao', $1, $2, $3::NUMERIC(78, 0), 1, 7
         )",
    )
    .bind(GOVERNOR)
    .bind(TOKEN)
    .bind(power_sum)
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
    sqlx::query(
        "INSERT INTO onchain_refresh_task (
            id, chain_id, dao_code, governor_address, token_address, account,
            refresh_balance, refresh_power, reason, first_seen_block_number,
            last_seen_block_number, last_seen_block_timestamp, last_seen_transaction_hash,
            status, attempts, next_run_at, pending_after_lock, created_at, updated_at
         )
         VALUES (
            $1, 46, 'demo-dao', $2, $3, $4, $5, $6, 'token-activity',
            10::NUMERIC(78, 0), 12::NUMERIC(78, 0), 12000::NUMERIC(78, 0),
            '0xtask', $7, $8, 0::NUMERIC(78, 0), false, 10000::NUMERIC(78, 0),
            10000::NUMERIC(78, 0)
         )",
    )
    .bind(task_id)
    .bind(GOVERNOR)
    .bind(TOKEN)
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

const GOVERNOR: &str = "0x1111111111111111111111111111111111111111";
const TOKEN: &str = "0x2222222222222222222222222222222222222222";
const ACCOUNT_ONE: &str = "0x0000000000000000000000000000000000000001";
const ACCOUNT_TWO: &str = "0x0000000000000000000000000000000000000002";
