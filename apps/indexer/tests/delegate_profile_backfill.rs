use std::{
    env,
    error::Error,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use degov_datalens_indexer::runtime::{
    DelegateProfileBackfillError, DelegateProfileBackfillOptions, DelegateProfileBackfillSelection,
    DelegateProfileScope, apply_migrations, apply_schema_migrations,
    repair_delegate_profiles_with_pool,
};
use sqlx::{PgPool, Row, postgres::PgPoolOptions};
use tokio::sync::{Mutex, MutexGuard};

const ZERO_ADDRESS: &str = "0x0000000000000000000000000000000000000000";
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
        let schema = unique_schema_name();
        let setup_pool = PgPoolOptions::new()
            .max_connections(1)
            .connect(&database_url)
            .await?;
        sqlx::query(&format!(r#"CREATE SCHEMA "{schema}""#))
            .execute(&setup_pool)
            .await?;
        setup_pool.close().await;

        let database_url = database_url_with_search_path(&database_url, &schema);
        let pool = PgPoolOptions::new()
            .max_connections(2)
            .connect(&database_url)
            .await?;

        Ok(Self {
            _guard: guard,
            pool,
            schema,
        })
    }

    async fn cleanup(&self) -> Result<(), sqlx::Error> {
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
                    let _ = sqlx::query(&format!(r#"DROP SCHEMA IF EXISTS "{schema}" CASCADE"#))
                        .execute(&pool)
                        .await;
                });
            });
        }
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn test_invalid_options_and_dry_run_do_not_apply_pending_schema() -> Result<(), Box<dyn Error>>
{
    let database = TestDatabase::connect().await?;
    let invalid = repair_delegate_profiles_with_pool(
        &database.pool,
        DelegateProfileBackfillOptions {
            selection: DelegateProfileBackfillSelection::AllScopes,
            dry_run: true,
            max_scopes: Some(0),
        },
    )
    .await
    .expect_err("zero max scopes is rejected before preflight");
    assert!(invalid.to_string().contains("max_scopes"));

    let preflight = repair_delegate_profiles_with_pool(
        &database.pool,
        DelegateProfileBackfillOptions {
            selection: DelegateProfileBackfillSelection::AllScopes,
            dry_run: true,
            max_scopes: Some(1),
        },
    )
    .await
    .expect_err("dry run does not apply pending schema");
    assert!(preflight.to_string().contains("preflight"));
    let data_metric_exists: bool =
        sqlx::query_scalar("SELECT to_regclass('data_metric') IS NOT NULL")
            .fetch_one(&database.pool)
            .await?;
    assert!(!data_metric_exists);

    database.cleanup().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_backfill_preflight_rejects_missing_runtime_index() -> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    apply_schema_migrations(&database.pool).await?;

    let error = repair_delegate_profiles_with_pool(
        &database.pool,
        DelegateProfileBackfillOptions {
            selection: DelegateProfileBackfillSelection::AllScopes,
            dry_run: true,
            max_scopes: Some(1),
        },
    )
    .await
    .expect_err("backfill requires its runtime index");

    assert!(
        error
            .to_string()
            .contains("delegate_profile_backfill_scope_target_idx")
    );
    database.cleanup().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_backfill_preflight_rejects_wrong_runtime_index_definition()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    apply_schema_migrations(&database.pool).await?;
    sqlx::query(
        "CREATE INDEX delegate_profile_backfill_scope_target_idx
         ON delegate (chain_id)",
    )
    .execute(&database.pool)
    .await?;

    let error = repair_delegate_profiles_with_pool(
        &database.pool,
        DelegateProfileBackfillOptions {
            selection: DelegateProfileBackfillSelection::AllScopes,
            dry_run: true,
            max_scopes: Some(1),
        },
    )
    .await
    .expect_err("backfill rejects a valid index with the wrong definition");

    assert!(
        error
            .to_string()
            .contains("delegate_profile_backfill_scope_target_idx")
    );
    database.cleanup().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_scoped_backfill_deduplicates_and_repairs_metric_drift() -> Result<(), Box<dyn Error>>
{
    let database = TestDatabase::connect().await?;
    apply_migrations(&database.pool).await?;
    seed_global_metric(&database.pool, "scope-a-v1", 1, "dao-a", "0xGovernorA").await?;
    seed_global_metric(&database.pool, "scope-a-v2", 1, "dao-a", "0xgovernora").await?;
    seed_global_metric(&database.pool, "scope-b", 1, "dao-b", "0xgovernorb").await?;
    seed_delegate(
        &database.pool,
        "scope-a-v1",
        "delegate-1",
        1,
        "dao-a",
        "0xGovernorA",
        "0xDELEGATE1",
    )
    .await?;
    seed_delegate(
        &database.pool,
        "scope-a-v2",
        "delegate-2",
        1,
        "dao-a",
        "0xgovernora",
        "0xdelegate1",
    )
    .await?;
    seed_delegate(
        &database.pool,
        "scope-a-v2",
        "delegate-3",
        1,
        "dao-a",
        "0xgovernora",
        "0xDelegate2",
    )
    .await?;
    seed_delegate(
        &database.pool,
        "scope-a-v1",
        "delegate-zero",
        1,
        "dao-a",
        "0xGovernorA",
        ZERO_ADDRESS,
    )
    .await?;
    seed_delegate(
        &database.pool,
        "scope-b",
        "delegate-other",
        1,
        "dao-b",
        "0xgovernorb",
        "0xdelegate3",
    )
    .await?;
    let options = DelegateProfileBackfillOptions {
        selection: DelegateProfileBackfillSelection::Scope(DelegateProfileScope::new(
            1,
            "dao-a",
            "0xGOVERNORA",
        )?),
        dry_run: false,
        max_scopes: None,
    };
    let first = repair_delegate_profiles_with_pool(&database.pool, options.clone()).await?;

    assert_eq!(first.scopes_processed, 1);
    assert_eq!(first.profiles_inserted, 2);
    assert_eq!(first.metric_rows_updated, 2);
    assert_eq!(
        profile_delegates(&database.pool, "dao-a").await?,
        vec!["0xdelegate1", "0xdelegate2"]
    );
    assert_eq!(
        metric_counts(&database.pool, "dao-a").await?,
        vec![Some(2), Some(2)]
    );
    assert_eq!(metric_counts(&database.pool, "dao-b").await?, vec![None]);

    sqlx::query("UPDATE data_metric SET delegate_profiles_count = 99 WHERE dao_code = 'dao-a'")
        .execute(&database.pool)
        .await?;
    let second = repair_delegate_profiles_with_pool(&database.pool, options).await?;

    assert_eq!(second.profiles_inserted, 0);
    assert_eq!(second.metric_rows_updated, 2);
    assert_eq!(
        metric_counts(&database.pool, "dao-a").await?,
        vec![Some(2), Some(2)]
    );

    database.cleanup().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_all_scopes_dry_run_rolls_back_each_scope() -> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    apply_migrations(&database.pool).await?;
    seed_global_metric(&database.pool, "scope-a", 1, "dao-a", "0xgovernora").await?;
    seed_global_metric(&database.pool, "scope-b", 2, "dao-b", "0xgovernorb").await?;
    seed_delegate(
        &database.pool,
        "scope-a",
        "delegate-a",
        1,
        "dao-a",
        "0xgovernora",
        "0xdelegate1",
    )
    .await?;
    seed_delegate(
        &database.pool,
        "scope-b",
        "delegate-b",
        2,
        "dao-b",
        "0xgovernorb",
        "0xdelegate2",
    )
    .await?;
    seed_delegate(
        &database.pool,
        "scope-c",
        "delegate-c",
        3,
        "dao-c",
        "0xgovernorc",
        "0xdelegate3",
    )
    .await?;

    let report = repair_delegate_profiles_with_pool(
        &database.pool,
        DelegateProfileBackfillOptions {
            selection: DelegateProfileBackfillSelection::AllScopes,
            dry_run: true,
            max_scopes: None,
        },
    )
    .await?;

    assert_eq!(report.scopes_processed, 3);
    assert_eq!(report.profiles_inserted, 0);
    assert_eq!(report.metric_rows_updated, 0);
    assert_eq!(report.profiles_would_insert, 3);
    assert_eq!(report.metric_rows_would_update, 2);
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM delegate_profile")
            .fetch_one(&database.pool)
            .await?,
        0
    );
    assert_eq!(metric_counts(&database.pool, "dao-a").await?, vec![None]);
    assert_eq!(metric_counts(&database.pool, "dao-b").await?, vec![None]);

    database.cleanup().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_backfill_detects_registry_corruption_without_updating_metric()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    apply_migrations(&database.pool).await?;
    seed_global_metric(&database.pool, "scope-a", 1, "dao-a", "0xgovernora").await?;
    seed_delegate(
        &database.pool,
        "scope-a",
        "delegate-a",
        1,
        "dao-a",
        "0xgovernora",
        "0xdelegate1",
    )
    .await?;
    sqlx::query(
        "INSERT INTO delegate_profile (chain_id, dao_code, governor_address, delegate)
         VALUES (1, 'dao-a', '0xgovernora', '0xcorrupt')",
    )
    .execute(&database.pool)
    .await?;
    sqlx::query("UPDATE data_metric SET delegate_profiles_count = 99 WHERE dao_code = 'dao-a'")
        .execute(&database.pool)
        .await?;

    let error = repair_delegate_profiles_with_pool(
        &database.pool,
        DelegateProfileBackfillOptions {
            selection: DelegateProfileBackfillSelection::Scope(DelegateProfileScope::new(
                1,
                "dao-a",
                "0xgovernora",
            )?),
            dry_run: false,
            max_scopes: None,
        },
    )
    .await
    .expect_err("registry corruption fails verification");

    assert!(error.to_string().contains("verification failed"));
    assert_eq!(
        metric_counts(&database.pool, "dao-a").await?,
        vec![Some(99)]
    );
    database.cleanup().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_backfill_verifies_actual_registry_after_insert_before_publishing_metric()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    apply_migrations(&database.pool).await?;
    seed_global_metric(&database.pool, "scope-a", 1, "dao-a", "0xgovernora").await?;
    seed_delegate(
        &database.pool,
        "scope-a",
        "delegate-a",
        1,
        "dao-a",
        "0xgovernora",
        "0xdelegate1",
    )
    .await?;
    sqlx::query("UPDATE data_metric SET delegate_profiles_count = 99 WHERE dao_code = 'dao-a'")
        .execute(&database.pool)
        .await?;
    sqlx::query(
        "CREATE FUNCTION inject_delegate_profile_corruption() RETURNS trigger
         LANGUAGE plpgsql AS $$
         BEGIN
           IF NEW.delegate <> '0x0000000000000000000000000000000000000bad' THEN
             INSERT INTO delegate_profile (chain_id, dao_code, governor_address, delegate)
             VALUES (
               NEW.chain_id,
               NEW.dao_code,
               NEW.governor_address,
               '0x0000000000000000000000000000000000000bad'
             );
           END IF;
           RETURN NEW;
         END
         $$",
    )
    .execute(&database.pool)
    .await?;
    sqlx::query(
        "CREATE TRIGGER inject_delegate_profile_corruption
         AFTER INSERT ON delegate_profile
         FOR EACH ROW EXECUTE FUNCTION inject_delegate_profile_corruption()",
    )
    .execute(&database.pool)
    .await?;

    let error = repair_delegate_profiles_with_pool(
        &database.pool,
        DelegateProfileBackfillOptions {
            selection: DelegateProfileBackfillSelection::Scope(DelegateProfileScope::new(
                1,
                "dao-a",
                "0xgovernora",
            )?),
            dry_run: false,
            max_scopes: None,
        },
    )
    .await
    .expect_err("post-write registry corruption fails verification");

    assert!(matches!(
        error,
        DelegateProfileBackfillError::Verification {
            registry_count: 2,
            historical_count: 1,
            ..
        }
    ));
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM delegate_profile")
            .fetch_one(&database.pool)
            .await?,
        0
    );
    assert_eq!(
        metric_counts(&database.pool, "dao-a").await?,
        vec![Some(99)]
    );

    database.cleanup().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_backfill_rejects_uniform_post_update_metric_drift() -> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    apply_migrations(&database.pool).await?;
    seed_global_metric(&database.pool, "scope-a-v1", 1, "dao-a", "0xgovernora").await?;
    seed_global_metric(&database.pool, "scope-a-v2", 1, "dao-a", "0xgovernora").await?;
    seed_delegate(
        &database.pool,
        "scope-a-v1",
        "delegate-a",
        1,
        "dao-a",
        "0xgovernora",
        "0xdelegate1",
    )
    .await?;
    sqlx::query(
        "CREATE FUNCTION corrupt_delegate_profile_metric() RETURNS trigger
         LANGUAGE plpgsql AS $$
         BEGIN
           NEW.delegate_profiles_count := 99;
           RETURN NEW;
         END
         $$",
    )
    .execute(&database.pool)
    .await?;
    sqlx::query(
        "CREATE TRIGGER corrupt_delegate_profile_metric
         BEFORE UPDATE OF delegate_profiles_count ON data_metric
         FOR EACH ROW EXECUTE FUNCTION corrupt_delegate_profile_metric()",
    )
    .execute(&database.pool)
    .await?;

    let error = repair_delegate_profiles_with_pool(
        &database.pool,
        DelegateProfileBackfillOptions {
            selection: DelegateProfileBackfillSelection::Scope(DelegateProfileScope::new(
                1,
                "dao-a",
                "0xgovernora",
            )?),
            dry_run: false,
            max_scopes: None,
        },
    )
    .await
    .expect_err("post-update metric drift fails verification");

    assert!(error.to_string().contains("metric verification failed"));
    assert_eq!(
        metric_counts(&database.pool, "dao-a").await?,
        vec![None, None]
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM delegate_profile")
            .fetch_one(&database.pool)
            .await?,
        0
    );
    database.cleanup().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_backfill_rejects_replica_introduced_during_metric_update()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    apply_migrations(&database.pool).await?;
    seed_global_metric(&database.pool, "scope-a-v1", 1, "dao-a", "0xgovernora").await?;
    seed_delegate(
        &database.pool,
        "scope-a-v1",
        "delegate-a",
        1,
        "dao-a",
        "0xgovernora",
        "0xdelegate1",
    )
    .await?;
    sqlx::query(
        "CREATE FUNCTION introduce_delegate_profile_metric_replica() RETURNS trigger
         LANGUAGE plpgsql AS $$
         BEGIN
           INSERT INTO data_metric (
             id, contract_set_id, chain_id, dao_code, governor_address, delegate_profiles_count
           ) VALUES ('global', 'scope-a-v2', 1, 'dao-a', '0xgovernora', NULL)
           ON CONFLICT DO NOTHING;
           RETURN NULL;
         END
         $$",
    )
    .execute(&database.pool)
    .await?;
    sqlx::query(
        "CREATE TRIGGER introduce_delegate_profile_metric_replica
         AFTER UPDATE OF delegate_profiles_count ON data_metric
         FOR EACH STATEMENT EXECUTE FUNCTION introduce_delegate_profile_metric_replica()",
    )
    .execute(&database.pool)
    .await?;

    let error = repair_delegate_profiles_with_pool(
        &database.pool,
        DelegateProfileBackfillOptions {
            selection: DelegateProfileBackfillSelection::Scope(DelegateProfileScope::new(
                1,
                "dao-a",
                "0xgovernora",
            )?),
            dry_run: false,
            max_scopes: None,
        },
    )
    .await
    .expect_err("a metric replica introduced during update fails verification");

    assert!(error.to_string().contains("metric verification failed"));
    assert_eq!(metric_counts(&database.pool, "dao-a").await?, vec![None]);
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM delegate_profile")
            .fetch_one(&database.pool)
            .await?,
        0
    );
    database.cleanup().await?;
    Ok(())
}

async fn seed_global_metric(
    pool: &PgPool,
    contract_set_id: &str,
    chain_id: i32,
    dao_code: &str,
    governor_address: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO data_metric (id, contract_set_id, chain_id, dao_code, governor_address)
         VALUES ('global', $1, $2, $3, $4)",
    )
    .bind(contract_set_id)
    .bind(chain_id)
    .bind(dao_code)
    .bind(governor_address)
    .execute(pool)
    .await?;
    Ok(())
}

async fn seed_delegate(
    pool: &PgPool,
    contract_set_id: &str,
    id: &str,
    chain_id: i32,
    dao_code: &str,
    governor_address: &str,
    to_delegate: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO delegate (
           id, contract_set_id, chain_id, dao_code, governor_address, from_delegate, to_delegate,
           block_number, block_timestamp, transaction_hash, is_current, power
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 1, $1, true, 0)",
    )
    .bind(id)
    .bind(contract_set_id)
    .bind(chain_id)
    .bind(dao_code)
    .bind(governor_address)
    .bind(format!("0xfrom{id}"))
    .bind(to_delegate)
    .execute(pool)
    .await?;
    Ok(())
}

async fn profile_delegates(pool: &PgPool, dao_code: &str) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT delegate FROM delegate_profile WHERE dao_code = $1 ORDER BY delegate",
    )
    .bind(dao_code)
    .fetch_all(pool)
    .await
}

async fn metric_counts(pool: &PgPool, dao_code: &str) -> Result<Vec<Option<i32>>, sqlx::Error> {
    sqlx::query("SELECT delegate_profiles_count FROM data_metric WHERE dao_code = $1 ORDER BY contract_set_id")
        .bind(dao_code)
        .fetch_all(pool)
        .await
        .map(|rows| rows.into_iter().map(|row| row.get("delegate_profiles_count")).collect())
}

fn unique_schema_name() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time after unix epoch")
        .as_millis();
    let counter = SCHEMA_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!(
        "degov_delegate_profile_test_{}_{}_{}",
        std::process::id(),
        now,
        counter
    )
}

fn database_url_with_search_path(database_url: &str, schema: &str) -> String {
    let separator = if database_url.contains('?') { '&' } else { '?' };
    format!("{database_url}{separator}options=-csearch_path%3D{schema}")
}
