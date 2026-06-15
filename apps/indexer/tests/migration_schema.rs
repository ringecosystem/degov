use std::{
    env,
    error::Error,
    fs,
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use degov_datalens_indexer::runtime::apply_migrations;
use sqlx::{PgPool, postgres::PgPoolOptions};
use tokio::sync::{Mutex, MutexGuard};

static SCHEMA_COUNTER: AtomicU64 = AtomicU64::new(0);
static DATABASE_TEST_LOCK: Mutex<()> = Mutex::const_new(());

const REQUIRED_TABLES: &[&str] = &[
    "degov_indexer_checkpoint",
    "degov_indexer_reconcile_task",
    "delegate_changed",
    "delegate_votes_changed",
    "token_transfer",
    "vote_power_checkpoint",
    "token_balance_checkpoint",
    "onchain_refresh_task",
    "proposal_canceled",
    "proposal_created",
    "proposal_executed",
    "proposal_queued",
    "proposal_extended",
    "voting_delay_set",
    "voting_period_set",
    "proposal_threshold_set",
    "quorum_numerator_updated",
    "late_quorum_vote_extension_set",
    "timelock_change",
    "vote_cast",
    "vote_cast_with_params",
    "vote_cast_group",
    "proposal",
    "proposal_action",
    "proposal_state_epoch",
    "governance_parameter_checkpoint",
    "proposal_deadline_extension",
    "timelock_operation",
    "timelock_call",
    "timelock_role_event",
    "timelock_min_delay_change",
    "data_metric",
    "delegate_rolling",
    "delegate",
    "contributor",
    "delegate_mapping",
    "degov_provisional_segment",
    "degov_provisional_contributor_power_overlay",
    "degov_provisional_delegate_power_overlay",
    "degov_provisional_proposal_overlay",
    "degov_provisional_timelock_operation_overlay",
];

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
        let schema = unique_schema_name();

        let setup_pool = PgPoolOptions::new()
            .max_connections(1)
            .connect(&database_url)
            .await?;
        sqlx::query("DROP SCHEMA IF EXISTS squid_processor CASCADE")
            .execute(&setup_pool)
            .await?;
        sqlx::query(&format!(r#"CREATE SCHEMA "{schema}""#))
            .execute(&setup_pool)
            .await?;
        setup_pool.close().await;

        let pool = PgPoolOptions::new()
            .max_connections(1)
            .connect(&database_url_with_search_path(&database_url, &schema))
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

#[tokio::test(flavor = "multi_thread")]
async fn test_migration_applies_required_schema_to_clean_postgres() -> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;

    apply_migrations(&database.pool).await?;

    for table_name in REQUIRED_TABLES {
        assert_table_exists(&database.pool, &database.schema, table_name).await?;
    }
    assert_index_exists(
        &database.pool,
        &database.schema,
        "delegate_rolling_metadata_preload_idx",
    )
    .await?;
    assert_index_exists(
        &database.pool,
        &database.schema,
        "delegate_mapping_to_lookup_idx",
    )
    .await?;
    assert_index_exists(
        &database.pool,
        &database.schema,
        "contributor_data_metric_scope_idx",
    )
    .await?;
    assert_removed_processor_status_table_absent(&database.pool).await?;
    assert_table_exists(&database.pool, &database.schema, "_sqlx_migrations").await?;

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_migration_can_run_twice_without_deleting_existing_rows() -> Result<(), Box<dyn Error>>
{
    let database = TestDatabase::connect().await?;

    apply_migrations(&database.pool).await?;
    sqlx::query(
        r#"
        INSERT INTO degov_indexer_checkpoint (
            dao_code,
            chain_id,
            contract_set_id,
            stream_id,
            data_source_version,
            next_block
        )
        VALUES ('migration-test-dao', 1135, 'default', 'governor-events', 'test', 42)
        "#,
    )
    .execute(&database.pool)
    .await?;

    apply_migrations(&database.pool).await?;

    let checkpoint_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM degov_indexer_checkpoint")
        .fetch_one(&database.pool)
        .await?;
    assert_eq!(checkpoint_count, 1);

    database.cleanup().await?;

    Ok(())
}

#[test]
fn test_indexer_keeps_init_migration_stable_and_appends_runtime_markers()
-> Result<(), Box<dyn Error>> {
    let migrations_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("migrations");
    let mut migration_files = fs::read_dir(migrations_dir)?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|file_name| file_name.ends_with(".sql"))
        .collect::<Vec<_>>();
    migration_files.sort();

    assert_eq!(
        migration_files,
        ["0001_init.sql", "0002_hot_path_runtime_indexes.sql"]
    );

    let init_migration = include_str!("../migrations/0001_init.sql");
    assert!(init_migration.contains("fresh index initialization"));
    assert!(init_migration.contains("No historical in-place migration"));
    assert!(init_migration.contains("reset or recreate"));

    let hot_path_migration = include_str!("../migrations/0002_hot_path_runtime_indexes.sql");
    assert!(hot_path_migration.contains("CREATE INDEX CONCURRENTLY IF NOT EXISTS"));
    assert!(hot_path_migration.contains("sqlx migration history"));

    Ok(())
}

#[test]
fn test_fresh_init_declares_provisional_overlay_schema() {
    let init_migration = include_str!("../migrations/0001_init.sql");

    for table_name in [
        "degov_provisional_segment",
        "degov_provisional_contributor_power_overlay",
        "degov_provisional_delegate_power_overlay",
        "degov_provisional_proposal_overlay",
        "degov_provisional_timelock_operation_overlay",
    ] {
        assert!(
            init_migration.contains(&format!("CREATE TABLE IF NOT EXISTS {table_name}")),
            "expected provisional table {table_name}"
        );
    }

    for column_name in [
        "chain_name TEXT",
        "dataset_key TEXT NOT NULL",
        "selector TEXT NOT NULL",
        "range_start_block NUMERIC(78, 0) NOT NULL",
        "range_end_block NUMERIC(78, 0) NOT NULL",
        "segment_finality TEXT NOT NULL",
        "source TEXT NOT NULL",
        "status TEXT NOT NULL",
        "anchor_block_number NUMERIC(78, 0)",
        "anchor_block_hash TEXT",
        "anchor_parent_hash TEXT",
        "anchor_block_timestamp NUMERIC(78, 0)",
    ] {
        assert!(
            init_migration.contains(column_name),
            "expected provisional segment metadata column {column_name}"
        );
    }

    for constraint_name in [
        "degov_provisional_segment_scope_unique",
        "degov_provisional_contributor_power_overlay_scope_unique",
        "degov_provisional_delegate_power_overlay_scope_unique",
        "degov_provisional_proposal_overlay_scope_unique",
        "degov_provisional_timelock_operation_overlay_scope_unique",
    ] {
        assert!(
            init_migration.contains(constraint_name),
            "expected idempotent provisional uniqueness constraint {constraint_name}"
        );
    }

    for unique_target in [
        "account,\n    source",
        "delegator,\n    delegate,\n    source",
        "proposal_id,\n    source",
        "operation_id,\n    source",
    ] {
        assert!(
            init_migration.contains(unique_target),
            "expected provisional overlay unique target {unique_target}"
        );
    }
}

#[test]
fn test_fresh_init_declares_split_data_metric_counts() {
    let init_migration = include_str!("../migrations/0001_init.sql");

    for column_name in [
        "contributor_count INTEGER",
        "holders_count INTEGER",
        "member_count INTEGER",
    ] {
        assert!(
            init_migration.contains(column_name),
            "expected data_metric count column {column_name}"
        );
    }
}

#[test]
fn test_fresh_init_declares_onchain_refresh_ready_claim_index() {
    let init_migration = include_str!("../migrations/0001_init.sql");

    assert!(init_migration.contains("onchain_refresh_task_ready_claim_idx"));
    assert!(init_migration.contains("ON onchain_refresh_task (next_run_at, updated_at, id)"));
    assert!(init_migration.contains("WHERE status IN ('pending', 'failed')"));
}

async fn assert_table_exists(
    pool: &PgPool,
    schema: &str,
    table_name: &str,
) -> Result<(), Box<dyn Error>> {
    let exists: bool = sqlx::query_scalar(
        r#"
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = $1
            AND table_name = $2
        )
        "#,
    )
    .bind(schema)
    .bind(table_name)
    .fetch_one(pool)
    .await?;

    assert!(exists, "expected table {schema}.{table_name} to exist");

    Ok(())
}

async fn assert_index_exists(
    pool: &PgPool,
    schema: &str,
    index_name: &str,
) -> Result<(), Box<dyn Error>> {
    let exists: bool = sqlx::query_scalar(
        r#"
        SELECT EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = $1
            AND indexname = $2
        )
        "#,
    )
    .bind(schema)
    .bind(index_name)
    .fetch_one(pool)
    .await?;

    assert!(exists, "expected index {schema}.{index_name} to exist");

    Ok(())
}

async fn assert_removed_processor_status_table_absent(pool: &PgPool) -> Result<(), sqlx::Error> {
    let removed_table = "squid_processor".to_owned() + ".status";
    let table: Option<String> = sqlx::query_scalar("SELECT to_regclass($1)::TEXT")
        .bind(removed_table)
        .fetch_one(pool)
        .await?;

    assert_eq!(table, None);

    Ok(())
}

fn unique_schema_name() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_millis();
    let sequence = SCHEMA_COUNTER.fetch_add(1, Ordering::Relaxed);

    format!(
        "degov_migration_schema_test_{}_{}_{}",
        std::process::id(),
        millis,
        sequence
    )
}

fn database_url_with_search_path(database_url: &str, schema: &str) -> String {
    let separator = if database_url.contains('?') { '&' } else { '?' };

    format!("{database_url}{separator}options=-c%20search_path%3D{schema}")
}
