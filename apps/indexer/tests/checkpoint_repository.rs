use std::{
    env,
    error::Error,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use degov_datalens_indexer::{
    CheckpointRepository, IndexerCheckpointIdentity, plan_next_checkpoint_range,
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
        sqlx::query(
            "CREATE TABLE checkpoint_projection_fixture (
                id TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
        )
        .execute(&pool)
        .await?;

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

fn unique_schema_name() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_millis();

    let sequence = SCHEMA_COUNTER.fetch_add(1, Ordering::Relaxed);

    format!(
        "degov_checkpoint_test_{}_{}_{}",
        std::process::id(),
        millis,
        sequence
    )
}

fn identity() -> IndexerCheckpointIdentity {
    IndexerCheckpointIdentity {
        dao_code: "demo-dao".to_owned(),
        chain_id: 1,
        stream_id: "governor-and-token-logs".to_owned(),
        data_source_version: "datalens-v1".to_owned(),
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn test_checkpoint_commit_advances_with_business_writes() -> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    let repository = CheckpointRepository::new(database.pool.clone());
    let identity = identity();

    let checkpoint = repository.read_or_create(&identity, 100).await?;
    assert_eq!(checkpoint.next_block, 100);
    assert_eq!(checkpoint.processed_height, None);
    assert!(!checkpoint.updated_at.is_empty());

    let mut transaction = database.pool.begin().await?;
    sqlx::query("INSERT INTO checkpoint_projection_fixture (id, value) VALUES ($1, $2)")
        .bind("range-100-109")
        .bind("committed")
        .execute(&mut *transaction)
        .await?;
    repository
        .advance_after_projection(&mut transaction, &identity, 109, Some(120))
        .await?;
    transaction.commit().await?;

    let checkpoint = repository.read_or_create(&identity, 100).await?;
    assert_eq!(checkpoint.next_block, 110);
    assert_eq!(checkpoint.processed_height, Some(109));
    assert_eq!(checkpoint.target_height, Some(120));
    assert_legacy_processor_height(&database.pool, 109).await?;

    let count: i64 = sqlx::query("SELECT count(*)::BIGINT FROM checkpoint_projection_fixture")
        .fetch_one(&database.pool)
        .await?
        .get(0);
    assert_eq!(count, 1);

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_checkpoint_rollback_keeps_previous_state() -> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    let repository = CheckpointRepository::new(database.pool.clone());
    let identity = identity();

    repository.read_or_create(&identity, 100).await?;

    let mut transaction = database.pool.begin().await?;
    sqlx::query("INSERT INTO checkpoint_projection_fixture (id, value) VALUES ($1, $2)")
        .bind("range-100-109")
        .bind("rolled-back")
        .execute(&mut *transaction)
        .await?;
    repository
        .advance_after_projection(&mut transaction, &identity, 109, Some(120))
        .await?;
    transaction.rollback().await?;

    let checkpoint = repository.read_or_create(&identity, 100).await?;
    assert_eq!(checkpoint.next_block, 100);
    assert_eq!(checkpoint.processed_height, None);
    assert_legacy_processor_status_is_empty(&database.pool).await?;

    let count: i64 = sqlx::query("SELECT count(*)::BIGINT FROM checkpoint_projection_fixture")
        .fetch_one(&database.pool)
        .await?
        .get(0);
    assert_eq!(count, 0);

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_checkpoint_restart_resumes_from_committed_next_block() -> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    let repository = CheckpointRepository::new(database.pool.clone());
    let identity = identity();

    repository.read_or_create(&identity, 42).await?;
    let mut transaction = database.pool.begin().await?;
    repository
        .advance_after_projection(&mut transaction, &identity, 49, Some(55))
        .await?;
    transaction.commit().await?;

    let restarted_repository = CheckpointRepository::new(database.pool.clone());
    let checkpoint = restarted_repository.read_or_create(&identity, 42).await?;
    let range = plan_next_checkpoint_range(&checkpoint, 5, 55)?.expect("range");

    assert_eq!(range.from_block, 50);
    assert_eq!(range.to_block, 54);
    assert_legacy_processor_height(&database.pool, 49).await?;

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_checkpoint_duplicate_range_replay_is_idempotent() -> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    let repository = CheckpointRepository::new(database.pool.clone());
    let identity = identity();

    repository.read_or_create(&identity, 10).await?;

    for value in ["first", "duplicate"] {
        let mut transaction = database.pool.begin().await?;
        sqlx::query(
            "INSERT INTO checkpoint_projection_fixture (id, value)
             VALUES ($1, $2)
             ON CONFLICT (id) DO NOTHING",
        )
        .bind("event-10")
        .bind(value)
        .execute(&mut *transaction)
        .await?;
        repository
            .advance_after_projection(&mut transaction, &identity, 10, Some(10))
            .await?;
        transaction.commit().await?;
    }

    let checkpoint = repository.read_or_create(&identity, 10).await?;
    assert_eq!(checkpoint.next_block, 11);
    assert_eq!(checkpoint.processed_height, Some(10));
    assert_legacy_processor_height(&database.pool, 10).await?;

    let rows = sqlx::query("SELECT id, value FROM checkpoint_projection_fixture")
        .fetch_all(&database.pool)
        .await?;
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].get::<String, _>("value"), "first");

    database.cleanup().await?;

    Ok(())
}

async fn assert_legacy_processor_height(
    pool: &PgPool,
    expected_height: i64,
) -> Result<(), sqlx::Error> {
    let height: i64 = sqlx::query("SELECT height::BIGINT FROM squid_processor.status WHERE id = 0")
        .fetch_one(pool)
        .await?
        .get(0);

    assert_eq!(height, expected_height);

    Ok(())
}

async fn assert_legacy_processor_status_is_empty(pool: &PgPool) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query("SELECT count(*)::BIGINT FROM squid_processor.status")
        .fetch_one(pool)
        .await?
        .get(0);

    assert_eq!(count, 0);

    Ok(())
}
