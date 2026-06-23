use std::{
    env,
    error::Error,
    fs,
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use degov_datalens_indexer::runtime::{apply_migrations, repair_invalid_runtime_indexes};
use sqlx::{PgPool, Row, postgres::PgPoolOptions};
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
    database_url: String,
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

        let database_url = database_url_with_search_path(&database_url, &schema);
        let pool = PgPoolOptions::new()
            .max_connections(1)
            .connect(&database_url)
            .await?;

        Ok(Self {
            _guard: guard,
            pool,
            schema,
            database_url,
        })
    }

    fn database_url(&self) -> &str {
        &self.database_url
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
        "delegate_mapping_positive_count_idx",
    )
    .await?;
    assert_index_definition_contains(
        &database.pool,
        &database.schema,
        "delegate_mapping_positive_count_idx",
        &[
            "USING btree (contract_set_id, \"to\")",
            "INCLUDE (id)",
            "WHERE (power >",
        ],
    )
    .await?;
    assert_index_exists(
        &database.pool,
        &database.schema,
        "delegate_mapping_effective_count_idx",
    )
    .await?;
    assert_index_exists(
        &database.pool,
        &database.schema,
        "contributor_data_metric_scope_idx",
    )
    .await?;
    assert_index_exists(
        &database.pool,
        &database.schema,
        "onchain_refresh_data_metric_task_ready_idx",
    )
    .await?;
    assert_index_exists(
        &database.pool,
        &database.schema,
        "onchain_refresh_task_failed_retry_idx",
    )
    .await?;
    assert_index_exists(
        &database.pool,
        &database.schema,
        "onchain_refresh_task_processing_retry_idx",
    )
    .await?;
    assert_index_exists(
        &database.pool,
        &database.schema,
        "onchain_refresh_task_failed_attempt_retry_idx",
    )
    .await?;
    assert_index_exists(
        &database.pool,
        &database.schema,
        "onchain_refresh_task_pending_status_claim_idx",
    )
    .await?;
    assert_index_exists(
        &database.pool,
        &database.schema,
        "onchain_refresh_task_pending_ready_claim_idx",
    )
    .await?;
    assert_index_definition_contains(
        &database.pool,
        &database.schema,
        "onchain_refresh_task_pending_ready_claim_idx",
        &[
            "USING btree (next_run_at, updated_at, id)",
            "WHERE (status = 'pending'::text)",
        ],
    )
    .await?;
    assert_index_absent(
        &database.pool,
        &database.schema,
        "onchain_refresh_task_status_idx",
    )
    .await?;
    assert_index_exists(
        &database.pool,
        &database.schema,
        "onchain_refresh_task_failed_ready_retry_idx",
    )
    .await?;
    assert_index_exists(
        &database.pool,
        &database.schema,
        "onchain_refresh_task_failed_ready_status_retry_idx",
    )
    .await?;
    assert_index_exists(
        &database.pool,
        &database.schema,
        "onchain_refresh_task_processing_lock_retry_idx",
    )
    .await?;
    assert_index_exists(
        &database.pool,
        &database.schema,
        "delegate_current_from_scope_idx",
    )
    .await?;
    assert_index_exists(
        &database.pool,
        &database.schema,
        "delegate_current_power_refresh_idx",
    )
    .await?;
    assert_table_reloptions_contains(
        &database.pool,
        &database.schema,
        "onchain_refresh_task",
        &[
            "autovacuum_vacuum_scale_factor=0.01",
            "autovacuum_vacuum_threshold=1000",
            "autovacuum_analyze_scale_factor=0.02",
            "autovacuum_analyze_threshold=1000",
        ],
    )
    .await?;
    assert_table_reloptions_contains(
        &database.pool,
        &database.schema,
        "onchain_refresh_deferred_candidate",
        &[
            "autovacuum_vacuum_scale_factor=0.01",
            "autovacuum_vacuum_threshold=1000",
            "autovacuum_analyze_scale_factor=0.02",
            "autovacuum_analyze_threshold=1000",
        ],
    )
    .await?;
    assert_removed_processor_status_table_absent(&database.pool).await?;
    assert_checkpoint_adaptive_columns(&database.pool, &database.schema).await?;
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

#[tokio::test(flavor = "multi_thread")]
async fn test_migration_repairs_invalid_runtime_index() -> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;

    apply_migrations(&database.pool).await?;
    sqlx::query("DROP INDEX contributor_data_metric_scope_idx")
        .execute(&database.pool)
        .await?;
    sqlx::query(
        "CREATE INDEX contributor_data_metric_scope_idx
         ON contributor (id)",
    )
    .execute(&database.pool)
    .await?;
    sqlx::query(
        "UPDATE pg_index
         SET indisvalid = false
         WHERE indexrelid = 'contributor_data_metric_scope_idx'::regclass",
    )
    .execute(&database.pool)
    .await?;

    apply_migrations(&database.pool).await?;
    assert_index_is_valid(
        &database.pool,
        &database.schema,
        "contributor_data_metric_scope_idx",
    )
    .await?;

    let previous_database_url = env::var("DEGOV_INDEXER_DATABASE_URL").ok();
    // These migration tests are serialized by DATABASE_TEST_LOCK.
    unsafe {
        env::set_var("DEGOV_INDEXER_DATABASE_URL", database.database_url());
    }
    let repair_result = repair_invalid_runtime_indexes().await;
    unsafe {
        match previous_database_url {
            Some(value) => env::set_var("DEGOV_INDEXER_DATABASE_URL", value),
            None => env::remove_var("DEGOV_INDEXER_DATABASE_URL"),
        }
    }
    repair_result?;

    assert_index_is_valid(
        &database.pool,
        &database.schema,
        "contributor_data_metric_scope_idx",
    )
    .await?;

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
        [
            "0001_init.sql",
            "0002_hot_path_runtime_indexes.sql",
            "0003_onchain_refresh_runtime_indexes.sql",
            "0004_onchain_refresh_claim_retry_indexes.sql",
            "0005_onchain_refresh_failed_ready_retry_index.sql",
            "0006_onchain_refresh_pending_ready_claim_index.sql",
            "0007_checkpoint_adaptive_chunk_state.sql"
        ]
    );

    let init_migration = include_str!("../migrations/0001_init.sql");
    assert!(init_migration.contains("fresh index initialization"));
    assert!(init_migration.contains("No historical in-place migration"));
    assert!(init_migration.contains("reset or recreate"));
    assert!(!init_migration.contains("onchain_refresh_data_metric_task"));

    let hot_path_migration = include_str!("../migrations/0002_hot_path_runtime_indexes.sql");
    assert!(hot_path_migration.contains("CREATE INDEX CONCURRENTLY IF NOT EXISTS"));
    assert!(hot_path_migration.contains("sqlx migration history"));

    let adaptive_chunk_migration =
        include_str!("../migrations/0007_checkpoint_adaptive_chunk_state.sql");
    assert!(adaptive_chunk_migration.contains("adaptive_chunk_size BIGINT"));
    assert!(!adaptive_chunk_migration.contains("adaptive_chunk_size INTEGER"));

    let runtime_migration = include_str!("../src/runtime/migrate.rs");
    assert!(runtime_migration.contains("delegate_mapping_effective_count_idx"));
    assert!(runtime_migration.contains("delegate_mapping_positive_count_idx"));
    assert!(runtime_migration.contains("WHERE power > 0"));
    assert!(runtime_migration.contains("degov_runtime_repair_marker"));
    assert!(runtime_migration.contains("delegate_effective_counts_v1"));
    assert!(runtime_migration.contains("repair_delegate_effective_counts_once"));
    assert!(runtime_migration.contains("onchain_refresh_data_metric_task"));
    assert!(runtime_migration.contains("onchain_refresh_task_pending_ready_claim_idx"));
    assert!(runtime_migration.contains("ON onchain_refresh_task (next_run_at, updated_at, id)"));
    assert!(runtime_migration.contains("WHERE status = 'pending'"));
    assert!(
        runtime_migration
            .contains("DROP INDEX CONCURRENTLY IF EXISTS token_transfer_transaction_hash_idx")
    );
    assert!(
        runtime_migration
            .contains("DROP INDEX CONCURRENTLY IF EXISTS token_transfer_chain_governor_token_idx")
    );

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

async fn assert_checkpoint_adaptive_columns(
    pool: &PgPool,
    schema: &str,
) -> Result<(), sqlx::Error> {
    for (column_name, data_type) in [
        ("adaptive_chunk_size", "bigint"),
        ("adaptive_chunk_reason", "text"),
        ("adaptive_chunk_updated_at", "timestamp with time zone"),
    ] {
        let actual: Option<String> = sqlx::query_scalar(
            "SELECT data_type
             FROM information_schema.columns
             WHERE table_schema = $1
               AND table_name = 'degov_indexer_checkpoint'
               AND column_name = $2",
        )
        .bind(schema)
        .bind(column_name)
        .fetch_optional(pool)
        .await?;

        assert_eq!(
            actual.as_deref(),
            Some(data_type),
            "unexpected type for checkpoint column {column_name}"
        );
    }

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

async fn assert_index_absent(
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

    assert!(!exists, "expected index {schema}.{index_name} to be absent");

    Ok(())
}

async fn assert_index_definition_contains(
    pool: &PgPool,
    schema: &str,
    index_name: &str,
    expected_fragments: &[&str],
) -> Result<(), Box<dyn Error>> {
    let indexdef: String = sqlx::query_scalar(
        r#"
        SELECT indexdef
        FROM pg_indexes
        WHERE schemaname = $1
          AND indexname = $2
        "#,
    )
    .bind(schema)
    .bind(index_name)
    .fetch_one(pool)
    .await?;

    for fragment in expected_fragments {
        assert!(
            indexdef.contains(fragment),
            "expected index {schema}.{index_name} definition to contain {fragment:?}; got {indexdef}"
        );
    }

    Ok(())
}

async fn assert_index_is_valid(
    pool: &PgPool,
    schema: &str,
    index_name: &str,
) -> Result<(), Box<dyn Error>> {
    let is_valid: bool = sqlx::query_scalar(
        r#"
        SELECT pg_index.indisvalid
        FROM pg_class index_class
        JOIN pg_namespace index_namespace ON index_namespace.oid = index_class.relnamespace
        JOIN pg_index ON pg_index.indexrelid = index_class.oid
        WHERE index_namespace.nspname = $1
          AND index_class.relname = $2
        "#,
    )
    .bind(schema)
    .bind(index_name)
    .fetch_one(pool)
    .await?;

    assert!(is_valid, "expected index {schema}.{index_name} to be valid");

    Ok(())
}

async fn assert_table_reloptions_contains(
    pool: &PgPool,
    schema: &str,
    table_name: &str,
    expected_options: &[&str],
) -> Result<(), sqlx::Error> {
    let row = sqlx::query(
        "SELECT COALESCE(c.reloptions, ARRAY[]::TEXT[]) AS reloptions
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = $1 AND c.relname = $2",
    )
    .bind(schema)
    .bind(table_name)
    .fetch_one(pool)
    .await?;
    let reloptions: Vec<String> = row.get("reloptions");

    for expected_option in expected_options {
        assert!(
            reloptions
                .iter()
                .any(|reloption| reloption == expected_option),
            "expected table {table_name} reloptions to contain {expected_option}, got {reloptions:?}"
        );
    }

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
