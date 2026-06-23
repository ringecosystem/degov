use std::{
    env,
    error::Error,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use degov_datalens_indexer::{
    AdaptiveChunkSizingDecision, AdaptiveChunkSizingReason, BatchReadPlanConfig, ChainContracts,
    ChainReadMethod, ChainReadPlanBuilder, CheckpointRepository, DelegateChangedWrite,
    GovernanceTokenStandard, IndexerCheckpointIdentity, IndexerProjectionBatch, IndexerRunnerStore,
    IndexerRunnerTransaction, PostgresIndexerRunnerStore, PowerFreshnessState,
    PowerReconcileContext, PowerReconcileMetrics, PowerReconcilePlan, TokenEventCommon,
    TokenProjectionBatch, TokenProjectionOperation, TokenTransferWrite, plan_next_checkpoint_range,
    runtime::apply_migrations,
};
use sqlx::{PgPool, Row, postgres::PgPoolOptions};
use tokio::sync::{Mutex, MutexGuard};

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
        apply_migrations(&pool).await?;
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
        contract_set_id: "demo-scope".to_owned(),
        stream_id: "governor-and-token-logs".to_owned(),
        data_source_version: "datalens-v1".to_owned(),
    }
}

fn identity_with_scope(contract_set_id: &str) -> IndexerCheckpointIdentity {
    IndexerCheckpointIdentity {
        contract_set_id: contract_set_id.to_owned(),
        ..identity()
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
    assert_eq!(checkpoint.adaptive_chunk_size, None);
    assert_eq!(checkpoint.adaptive_chunk_reason, None);
    assert_eq!(checkpoint.adaptive_chunk_updated_at, None);
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
    assert_eq!(checkpoint.adaptive_chunk_size, None);
    assert_legacy_processor_status_table_absent(&database.pool).await?;

    let count: i64 = sqlx::query("SELECT count(*)::BIGINT FROM checkpoint_projection_fixture")
        .fetch_one(&database.pool)
        .await?
        .get(0);
    assert_eq!(count, 1);

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_checkpoint_commit_persists_adaptive_chunk_state() -> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    let repository = CheckpointRepository::new(database.pool.clone());
    let identity = identity();

    repository.read_or_create(&identity, 100).await?;

    let mut transaction = database.pool.begin().await?;
    repository
        .advance_after_projection(&mut transaction, &identity, 109, Some(120))
        .await?;
    repository
        .update_adaptive_chunk_state(
            &mut transaction,
            &identity,
            &AdaptiveChunkSizingDecision {
                previous_chunk_size: 10_000,
                current_chunk_size: 20_000,
                reason: AdaptiveChunkSizingReason::StableFullHit,
            },
        )
        .await?;
    transaction.commit().await?;

    let checkpoint = repository.read_or_create(&identity, 100).await?;
    assert_eq!(checkpoint.next_block, 110);
    assert_eq!(checkpoint.processed_height, Some(109));
    assert_eq!(checkpoint.adaptive_chunk_size, Some(20_000));
    assert_eq!(
        checkpoint.adaptive_chunk_reason.as_deref(),
        Some("stable_full_hit")
    );
    assert!(checkpoint.adaptive_chunk_updated_at.is_some());

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
    assert_legacy_processor_status_table_absent(&database.pool).await?;

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
    assert_legacy_processor_status_table_absent(&database.pool).await?;

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_checkpoint_contract_set_scope_keeps_same_chain_stream_rows_distinct()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    let repository = CheckpointRepository::new(database.pool.clone());
    let first = identity_with_scope("dao=demo-dao|chain=1|governor=0x1111|token=0x2222");
    let second = identity_with_scope("dao=demo-dao|chain=1|governor=0x3333|token=0x4444");

    repository.read_or_create(&first, 100).await?;
    repository.read_or_create(&second, 900).await?;

    let mut transaction = database.pool.begin().await?;
    repository
        .advance_after_projection(&mut transaction, &first, 109, Some(120))
        .await?;
    transaction.commit().await?;

    let first_checkpoint = repository.read_or_create(&first, 100).await?;
    let second_checkpoint = repository.read_or_create(&second, 900).await?;
    let row_count: i64 = sqlx::query(
        "SELECT count(*)::BIGINT
         FROM degov_indexer_checkpoint
         WHERE dao_code = $1
           AND chain_id = $2
           AND stream_id = $3
           AND data_source_version = $4",
    )
    .bind(&first.dao_code)
    .bind(first.chain_id)
    .bind(&first.stream_id)
    .bind(&first.data_source_version)
    .fetch_one(&database.pool)
    .await?
    .get(0);

    assert_eq!(row_count, 2);
    assert_eq!(first_checkpoint.next_block, 110);
    assert_eq!(first_checkpoint.processed_height, Some(109));
    assert_eq!(second_checkpoint.next_block, 900);
    assert_eq!(second_checkpoint.processed_height, None);

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_checkpoint_schema_primary_key_includes_contract_set_scope()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    let columns = sqlx::query(
        "SELECT a.attname
         FROM pg_index i
         JOIN pg_class c ON c.oid = i.indrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
         WHERE c.relname = 'degov_indexer_checkpoint'
           AND n.nspname = current_schema()
           AND i.indisprimary
         ORDER BY array_position(i.indkey, a.attnum)",
    )
    .fetch_all(&database.pool)
    .await?
    .into_iter()
    .map(|row| row.get::<String, _>("attname"))
    .collect::<Vec<_>>();

    assert_eq!(
        columns,
        vec![
            "dao_code",
            "chain_id",
            "contract_set_id",
            "stream_id",
            "data_source_version",
        ]
    );

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_checkpoint_schema_token_event_primary_keys_include_contract_set_scope()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;

    for table in [
        "delegate_changed",
        "delegate_votes_changed",
        "token_transfer",
    ] {
        let columns = primary_key_columns(&database.pool, table).await?;
        assert_eq!(columns, vec!["contract_set_id".to_owned(), "id".to_owned()]);
    }

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_postgres_token_state_keeps_overlapping_delegate_accounts_distinct()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    let mut store = PostgresIndexerRunnerStore::new(database.pool.clone());

    write_token_batch(&mut store, "demo-dao", GOVERNOR_ONE, TOKEN_ONE, 1).await?;
    write_token_batch(&mut store, "other-dao", GOVERNOR_TWO, TOKEN_TWO, 10).await?;

    let contributor_count: i64 = sqlx::query(
        "SELECT count(*)::BIGINT
         FROM contributor
         WHERE id = $1",
    )
    .bind(DELEGATE)
    .fetch_one(&database.pool)
    .await?
    .get(0);
    let delegate_count: i64 = sqlx::query(
        "SELECT count(*)::BIGINT
         FROM delegate
         WHERE from_delegate = $1 AND to_delegate = $2",
    )
    .bind(DELEGATOR)
    .bind(DELEGATE)
    .fetch_one(&database.pool)
    .await?
    .get(0);
    let mapping_count: i64 = sqlx::query(
        r#"SELECT count(*)::BIGINT
           FROM delegate_mapping
           WHERE "from" = $1 AND "to" = $2"#,
    )
    .bind(DELEGATOR)
    .bind(DELEGATE)
    .fetch_one(&database.pool)
    .await?
    .get(0);

    assert_eq!(contributor_count, 2);
    assert_eq!(delegate_count, 2);
    assert_eq!(mapping_count, 2);

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_postgres_token_state_uses_contract_set_scope_without_public_contributor_id_change()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    let mut store = PostgresIndexerRunnerStore::new(database.pool.clone());

    write_token_batch_with_scope(
        &mut store,
        "demo-dao",
        GOVERNOR_ONE,
        TOKEN_ONE,
        SCOPE_ONE,
        1,
        "shared-raw-log",
    )
    .await?;
    write_token_batch_with_scope(
        &mut store,
        "demo-dao",
        GOVERNOR_ONE,
        TOKEN_ONE,
        SCOPE_TWO,
        1,
        "shared-raw-log",
    )
    .await?;

    let contributors = sqlx::query(
        "SELECT id, contract_set_id, delegates_count_all, delegates_count_effective
         FROM contributor
         WHERE id = $1
         ORDER BY contract_set_id",
    )
    .bind(DELEGATE)
    .fetch_all(&database.pool)
    .await?;
    let delegate_count: i64 = sqlx::query(
        "SELECT count(*)::BIGINT
         FROM delegate
         WHERE from_delegate = $1 AND to_delegate = $2",
    )
    .bind(DELEGATOR)
    .bind(DELEGATE)
    .fetch_one(&database.pool)
    .await?
    .get(0);
    let mapping_count: i64 = sqlx::query(
        r#"SELECT count(*)::BIGINT
           FROM delegate_mapping
           WHERE id = $1 AND "from" = $1 AND "to" = $2"#,
    )
    .bind(DELEGATOR)
    .bind(DELEGATE)
    .fetch_one(&database.pool)
    .await?
    .get(0);

    assert_eq!(contributors.len(), 2);
    assert!(
        contributors
            .iter()
            .all(|row| row.get::<String, _>("id") == DELEGATE)
    );
    assert_eq!(
        contributors
            .iter()
            .map(|row| row.get::<String, _>("contract_set_id"))
            .collect::<Vec<_>>(),
        vec![SCOPE_ONE.to_owned(), SCOPE_TWO.to_owned()]
    );
    assert!(
        contributors
            .iter()
            .all(|row| row.get::<i32, _>("delegates_count_all") == 1)
    );
    assert!(
        contributors
            .iter()
            .all(|row| row.get::<i32, _>("delegates_count_effective") == 1)
    );
    assert_eq!(delegate_count, 2);
    assert_eq!(mapping_count, 2);

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
    assert_legacy_processor_status_table_absent(&database.pool).await?;

    let rows = sqlx::query("SELECT id, value FROM checkpoint_projection_fixture")
        .fetch_all(&database.pool)
        .await?;
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].get::<String, _>("value"), "first");

    database.cleanup().await?;

    Ok(())
}

async fn primary_key_columns(pool: &PgPool, table: &str) -> Result<Vec<String>, sqlx::Error> {
    let columns = sqlx::query(
        "SELECT a.attname
         FROM pg_index i
         JOIN pg_class c ON c.oid = i.indrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
         WHERE c.relname = $1
           AND n.nspname = current_schema()
           AND i.indisprimary
         ORDER BY array_position(i.indkey, a.attnum)",
    )
    .bind(table)
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|row| row.get::<String, _>("attname"))
    .collect();

    Ok(columns)
}

async fn assert_legacy_processor_status_table_absent(pool: &PgPool) -> Result<(), sqlx::Error> {
    let removed_table = "squid_processor".to_owned() + ".status";
    let table: Option<String> = sqlx::query_scalar("SELECT to_regclass($1)::TEXT")
        .bind(removed_table)
        .fetch_one(pool)
        .await?;

    assert_eq!(table, None);

    Ok(())
}

async fn write_token_batch(
    store: &mut PostgresIndexerRunnerStore,
    dao_code: &str,
    governor: &str,
    token: &str,
    block_number: u64,
) -> Result<(), Box<dyn Error>> {
    write_token_batch_with_scope(
        store,
        dao_code,
        governor,
        token,
        dao_code,
        block_number,
        &format!("raw-log-{block_number}"),
    )
    .await
}

async fn write_token_batch_with_scope(
    store: &mut PostgresIndexerRunnerStore,
    dao_code: &str,
    governor: &str,
    token: &str,
    contract_set_id: &str,
    block_number: u64,
    raw_log_id: &str,
) -> Result<(), Box<dyn Error>> {
    let common = TokenEventCommon {
        contract_set_id: contract_set_id.to_owned(),
        chain_id: 1,
        dao_code: dao_code.to_owned(),
        governor_address: governor.to_owned(),
        token_address: token.to_owned(),
        contract_address: token.to_owned(),
        log_index: block_number,
        transaction_index: 0,
        block_number: block_number.to_string(),
        block_timestamp: Some((block_number * 1000).to_string()),
        transaction_hash: format!("0xtx{block_number}"),
    };
    let delegate_changed_id = format!("{raw_log_id}-delegate-changed");
    let transfer_id = format!("{raw_log_id}-transfer");
    let token = TokenProjectionBatch {
        event_order: Vec::new(),
        delegate_changed: vec![DelegateChangedWrite {
            id: delegate_changed_id.clone(),
            common: common.clone(),
            delegator: DELEGATOR.to_owned(),
            from_delegate: ZERO_ADDRESS.to_owned(),
            to_delegate: DELEGATE.to_owned(),
        }],
        delegate_votes_changed: Vec::new(),
        token_transfers: vec![TokenTransferWrite {
            id: transfer_id.clone(),
            common: common.clone(),
            from: ZERO_ADDRESS.to_owned(),
            to: DELEGATOR.to_owned(),
            value: "75".to_owned(),
            standard: "erc20".to_owned(),
        }],
        delegate_rollings: Vec::new(),
        operations: vec![
            TokenProjectionOperation::DelegateChanged {
                id: delegate_changed_id,
                common: common.clone(),
                delegator: DELEGATOR.to_owned(),
                from_delegate: ZERO_ADDRESS.to_owned(),
                to_delegate: DELEGATE.to_owned(),
            },
            TokenProjectionOperation::Transfer {
                id: transfer_id,
                common,
                from: ZERO_ADDRESS.to_owned(),
                to: DELEGATOR.to_owned(),
                value: "75".to_owned(),
                standard: GovernanceTokenStandard::Erc20,
            },
        ],
        reconcile_plan: empty_reconcile_plan(contract_set_id, dao_code, governor, token),
    };
    let batch = IndexerProjectionBatch {
        proposal: None,
        vote: None,
        token: Some(token),
        timelock: None,
    };

    let mut transaction = store.begin_transaction()?;
    transaction.apply_projection_batch(&batch)?;
    transaction.commit()?;

    Ok(())
}

fn empty_reconcile_plan(
    contract_set_id: &str,
    dao_code: &str,
    governor: &str,
    token: &str,
) -> PowerReconcilePlan {
    let contracts = ChainContracts {
        governor: governor.to_owned(),
        governor_token: token.to_owned(),
        timelock: Some(TIMELOCK.to_owned()),
    };
    let context = PowerReconcileContext {
        contract_set_id: contract_set_id.to_owned(),
        dao_code: dao_code.to_owned(),
        chain_id: 1,
        contracts: contracts.clone(),
        from_block: 0,
        to_block: 0,
        target_height: None,
        read_plan_config: BatchReadPlanConfig::default().validated(),
        current_power_method: ChainReadMethod::GetVotes,
    };
    let chain_read_plan =
        ChainReadPlanBuilder::new(1, contracts, BatchReadPlanConfig::default().validated()).build();

    PowerReconcilePlan {
        context,
        candidates: Vec::new(),
        chain_read_plan,
        freshness_state: PowerFreshnessState::Fresh,
        metrics: PowerReconcileMetrics::default(),
    }
}

const GOVERNOR_ONE: &str = "0x1111111111111111111111111111111111111111";
const GOVERNOR_TWO: &str = "0x3333333333333333333333333333333333333333";
const TOKEN_ONE: &str = "0x2222222222222222222222222222222222222222";
const TOKEN_TWO: &str = "0x4444444444444444444444444444444444444444";
const TIMELOCK: &str = "0x5555555555555555555555555555555555555555";
const SCOPE_ONE: &str = "scope:timelock-a:erc20:dataset-a";
const SCOPE_TWO: &str = "scope:timelock-b:erc721:dataset-b";
const DELEGATOR: &str = "0x0000000000000000000000000000000000000001";
const DELEGATE: &str = "0x0000000000000000000000000000000000000002";
const ZERO_ADDRESS: &str = "0x0000000000000000000000000000000000000000";
