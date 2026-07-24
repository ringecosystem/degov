use std::{
    env,
    error::Error,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use degov_datalens_indexer::{
    BatchReadPlanConfig, ChainContracts, TimelockProjectionContext,
    runtime::{
        TimelockProposalLinkBackfillOptions, apply_migrations,
        repair_timelock_proposal_links_with_pool,
    },
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
async fn test_repair_timelock_links_backfills_queued_rows() -> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    apply_migrations(&database.pool).await?;
    seed_proposal_rows(&database.pool, "proposal:queued", "42", false).await?;

    let report = repair_timelock_proposal_links_with_pool(
        &database.pool,
        context(),
        TimelockProposalLinkBackfillOptions {
            batch_size: 10,
            max_batches: 1,
        },
    )
    .await?;

    assert_eq!(report.proposals_scanned, 1);
    assert_eq!(report.proposal_links_projected, 2);
    assert_eq!(report.timelock_operations_projected, 1);
    assert_eq!(report.timelock_calls_projected, 2);

    let operation = sqlx::query(
        "SELECT state, call_count, executed_call_count, ready_at::TEXT AS ready_at,
                queued_block_number::TEXT AS queued_block_number,
                queued_block_timestamp::TEXT AS queued_block_timestamp,
                queued_transaction_hash, executed_transaction_hash
         FROM timelock_operation
         WHERE proposal_ref = 'proposal:queued'",
    )
    .fetch_one(&database.pool)
    .await?;
    assert_eq!(operation.get::<String, _>("state"), "Queued");
    assert_eq!(operation.get::<i32, _>("call_count"), 2);
    assert_eq!(operation.get::<Option<i32>, _>("executed_call_count"), None);
    assert_eq!(operation.get::<String, _>("ready_at"), "1700000600");
    assert_eq!(operation.get::<String, _>("queued_block_number"), "100");
    assert_eq!(
        operation.get::<String, _>("queued_block_timestamp"),
        "1700000000"
    );
    assert_eq!(
        operation.get::<String, _>("queued_transaction_hash"),
        "0xqueue"
    );
    assert_eq!(
        operation.get::<Option<String>, _>("executed_transaction_hash"),
        None
    );

    let calls =
        sqlx::query("SELECT state FROM timelock_call WHERE proposal_ref = 'proposal:queued'")
            .fetch_all(&database.pool)
            .await?;
    assert_eq!(calls.len(), 2);
    assert!(
        calls
            .iter()
            .all(|row| row.get::<String, _>("state") == "Scheduled")
    );

    database.cleanup().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_repair_timelock_links_backfills_executed_rows() -> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    apply_migrations(&database.pool).await?;
    seed_proposal_rows(&database.pool, "proposal:executed", "43", true).await?;

    let report = repair_timelock_proposal_links_with_pool(
        &database.pool,
        context(),
        TimelockProposalLinkBackfillOptions {
            batch_size: 10,
            max_batches: 1,
        },
    )
    .await?;

    assert_eq!(report.proposals_scanned, 1);
    assert_eq!(report.proposal_links_projected, 2);
    assert_eq!(report.timelock_operations_projected, 1);
    assert_eq!(report.timelock_calls_projected, 2);

    let operation = sqlx::query(
        "SELECT state, call_count, executed_call_count,
                executed_block_number::TEXT AS executed_block_number,
                executed_block_timestamp::TEXT AS executed_block_timestamp,
                executed_transaction_hash
         FROM timelock_operation
         WHERE proposal_ref = 'proposal:executed'",
    )
    .fetch_one(&database.pool)
    .await?;
    assert_eq!(operation.get::<String, _>("state"), "Done");
    assert_eq!(operation.get::<i32, _>("call_count"), 2);
    assert_eq!(operation.get::<i32, _>("executed_call_count"), 2);
    assert_eq!(operation.get::<String, _>("executed_block_number"), "120");
    assert_eq!(
        operation.get::<String, _>("executed_block_timestamp"),
        "1700001200"
    );
    assert_eq!(
        operation.get::<String, _>("executed_transaction_hash"),
        "0xexecute"
    );

    let calls = sqlx::query(
        "SELECT state, executed_transaction_hash
         FROM timelock_call
         WHERE proposal_ref = 'proposal:executed'
         ORDER BY action_index",
    )
    .fetch_all(&database.pool)
    .await?;
    assert_eq!(calls.len(), 2);
    assert!(
        calls
            .iter()
            .all(|row| row.get::<String, _>("state") == "Done")
    );
    assert!(
        calls
            .iter()
            .all(|row| row.get::<String, _>("executed_transaction_hash") == "0xexecute")
    );

    database.cleanup().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_repair_timelock_links_skips_already_backfilled_rows() -> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    apply_migrations(&database.pool).await?;
    seed_proposal_rows(&database.pool, "proposal:rerun", "44", true).await?;

    let options = TimelockProposalLinkBackfillOptions {
        batch_size: 10,
        max_batches: 1,
    };
    let first_report =
        repair_timelock_proposal_links_with_pool(&database.pool, context(), options).await?;
    let second_report =
        repair_timelock_proposal_links_with_pool(&database.pool, context(), options).await?;

    assert_eq!(first_report.proposals_scanned, 1);
    assert_eq!(first_report.timelock_operations_projected, 1);
    assert_eq!(first_report.timelock_calls_projected, 2);
    assert_eq!(second_report.proposals_scanned, 0);
    assert_eq!(second_report.timelock_operations_projected, 0);
    assert_eq!(second_report.timelock_calls_projected, 0);

    let operation_count = sqlx::query(
        "SELECT COUNT(*)::BIGINT AS count
         FROM timelock_operation
         WHERE proposal_ref = 'proposal:rerun'",
    )
    .fetch_one(&database.pool)
    .await?
    .get::<i64, _>("count");
    let call_count = sqlx::query(
        "SELECT COUNT(*)::BIGINT AS count
         FROM timelock_call
         WHERE proposal_ref = 'proposal:rerun'",
    )
    .fetch_one(&database.pool)
    .await?
    .get::<i64, _>("count");
    assert_eq!(operation_count, 1);
    assert_eq!(call_count, 2);

    database.cleanup().await?;
    Ok(())
}

async fn seed_proposal_rows(
    pool: &PgPool,
    proposal_ref: &str,
    proposal_id: &str,
    executed: bool,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO proposal (
            id, contract_set_id, chain_id, dao_code, governor_address, contract_address,
            log_index, transaction_index, proposal_id, proposer, targets, values, signatures,
            calldatas, vote_start, vote_end, description, block_number, block_timestamp,
            transaction_hash, title, vote_start_timestamp, vote_end_timestamp, proposal_eta,
            clock_mode, quorum, decimals
         )
         VALUES (
            $1, 'scope', 1, 'demo-dao', '0xgovernor', '0xgovernor', 1, 0, $2,
            '0xproposer', ARRAY['0xtarget1', '0xtarget2'], ARRAY['0', '10'],
            ARRAY['', ''], ARRAY['0xabcdef', '0x123456'], '1', '2', 'Description',
            '10', '1699999000', '0xcreate', 'Proposal', '1699999100',
            '1699999200', '1700000600', 'blocknumber', '0', '18'
         )",
    )
    .bind(proposal_ref)
    .bind(proposal_id)
    .execute(pool)
    .await?;

    sqlx::query(
        "INSERT INTO proposal_queued (
            id, chain_id, dao_code, governor_address, contract_address, log_index,
            transaction_index, proposal_id, eta_seconds, block_number, block_timestamp,
            transaction_hash
         )
         VALUES (
            $1, 1, 'demo-dao', '0xgovernor', '0xgovernor', 7, 0, $2,
            '1700000600', '100', '1700000000', '0xqueue'
         )",
    )
    .bind(format!("{proposal_ref}:queued"))
    .bind(proposal_id)
    .execute(pool)
    .await?;

    if executed {
        sqlx::query(
            "INSERT INTO proposal_executed (
                id, chain_id, dao_code, governor_address, contract_address, log_index,
                transaction_index, proposal_id, block_number, block_timestamp, transaction_hash
             )
             VALUES (
                $1, 1, 'demo-dao', '0xgovernor', '0xgovernor', 9, 0, $2,
                '120', '1700001200', '0xexecute'
             )",
        )
        .bind(format!("{proposal_ref}:executed"))
        .bind(proposal_id)
        .execute(pool)
        .await?;
    }

    for (action_index, target, value, calldata) in [
        (0, "0xtarget1", "0", "0xabcdef"),
        (1, "0xtarget2", "10", "0x123456"),
    ] {
        sqlx::query(
            "INSERT INTO proposal_action (
                id, chain_id, dao_code, governor_address, contract_address,
                log_index, transaction_index, proposal_id, proposal_ref, action_index, target,
                value, signature, calldata, block_number, block_timestamp, transaction_hash
             )
             VALUES (
                $1, 1, 'demo-dao', '0xgovernor', '0xgovernor', 1, 0,
                $2, $3, $4, $5, $6, '', $7, '10', '1699999000', '0xcreate'
             )",
        )
        .bind(format!("{proposal_ref}:action:{action_index}"))
        .bind(proposal_id)
        .bind(proposal_ref)
        .bind(action_index)
        .bind(target)
        .bind(value)
        .bind(calldata)
        .execute(pool)
        .await?;
    }

    Ok(())
}

fn context() -> TimelockProjectionContext {
    TimelockProjectionContext {
        contract_set_id: "scope".to_owned(),
        dao_code: "demo-dao".to_owned(),
        governor_address: "0xgovernor".to_owned(),
        timelock_address: "0xtimelock".to_owned(),
        contracts: ChainContracts {
            governor: "0xgovernor".to_owned(),
            governor_token: "0xtoken".to_owned(),
            timelock: Some("0xtimelock".to_owned()),
        },
        read_plan_config: BatchReadPlanConfig::default().validated(),
    }
}

fn unique_schema_name() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time after UNIX epoch")
        .as_nanos();
    let counter = SCHEMA_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("degov_timelock_backfill_test_{now}_{counter}")
}

fn database_url_with_search_path(database_url: &str, schema: &str) -> String {
    let separator = if database_url.contains('?') { '&' } else { '?' };
    format!("{database_url}{separator}options=-c%20search_path%3D{schema},public,squid_processor")
}
