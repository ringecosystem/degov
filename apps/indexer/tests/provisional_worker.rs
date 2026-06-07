use std::{
    env,
    error::Error,
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use datalens_sdk::native::QueryInput;
use degov_datalens_indexer::{
    ChainFamily, ChainIdentityConfig, DaoContractAddresses, DatalensConfig, DatalensError,
    DatalensFinality, DatalensProvisionalCacheSegment, DatalensProvisionalFinality,
    DatalensProvisionalLogQueryReader, DatalensProvisionalLogQueryResult,
    DatalensProvisionalSegmentStore, DatalensProvisionalSegmentWrite, DatasetKeyConfig,
    GovernanceTokenStandard, PostgresProvisionalPowerOverlayStore, PostgresProvisionalSegmentStore,
    ProvisionalContributorPowerOverlayWrite, ProvisionalDelegatePowerOverlayWrite,
    ProvisionalWorker, ProvisionalWorkerOptions, QueryLimitConfig, SecretString,
    runtime::apply_migrations,
};
use sqlx::{PgPool, Row, postgres::PgPoolOptions};
use tokio::sync::{Mutex, MutexGuard};

static SCHEMA_COUNTER: AtomicU64 = AtomicU64::new(0);
static DATABASE_TEST_LOCK: Mutex<()> = Mutex::const_new(());

#[test]
fn test_provisional_worker_writes_segments_without_final_checkpoint_boundary() {
    let config = datalens_config();
    let mut reader = MockProvisionalReader::new(vec![Ok(DatalensProvisionalLogQueryResult {
        rows: serde_json::json!([]),
        segments: vec![cache_segment("provider", "latest", 100, 105)],
    })]);
    let mut store = RecordingProvisionalStore::default();
    let mut worker = ProvisionalWorker::new(options(&config), &mut reader, &mut store);

    let report = worker.run_once().expect("worker runs once");

    assert_eq!(report.segments_written, 1);
    assert_eq!(reader.calls.len(), 1);
    assert_eq!(reader.calls[0].finality.as_deref(), Some("safe_to_latest"));
    assert_eq!(store.writes.len(), 1);
    assert_eq!(store.writes[0].segment_finality, "latest");
}

#[tokio::test(flavor = "multi_thread")]
async fn test_postgres_provisional_segment_upsert_is_idempotent_and_does_not_advance_checkpoint()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;

    apply_migrations(&database.pool).await?;
    insert_checkpoint(&database.pool).await?;
    let store = PostgresProvisionalSegmentStore::new(database.pool.clone());
    let write = segment_write("provider", "latest", 100, 105);

    store
        .write_provisional_segments(&[write.clone()])
        .await
        .expect("first write succeeds");
    store
        .write_provisional_segments(&[write])
        .await
        .expect("retry write succeeds");

    assert_eq!(
        table_count(&database.pool, "degov_provisional_segment").await?,
        1
    );
    assert_checkpoint(&database.pool).await?;
    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_postgres_live_power_overlay_upsert_is_idempotent_and_writes_no_final_tables()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;

    apply_migrations(&database.pool).await?;
    insert_checkpoint(&database.pool).await?;
    let store = PostgresProvisionalPowerOverlayStore::new(database.pool.clone());
    let contributor = contributor_power_write("0xabc", "19");
    let delegate = delegate_power_write("0xabc", "0xdef", "19");

    store
        .write_power_overlays(&[contributor.clone()], &[delegate.clone()])
        .await
        .expect("first write succeeds");
    store
        .write_power_overlays(&[contributor], &[delegate])
        .await
        .expect("retry write succeeds");

    assert_eq!(
        table_count(
            &database.pool,
            "degov_provisional_contributor_power_overlay"
        )
        .await?,
        1
    );
    assert_eq!(
        table_count(&database.pool, "degov_provisional_delegate_power_overlay").await?,
        1
    );
    assert_eq!(table_count(&database.pool, "contributor").await?, 0);
    assert_eq!(table_count(&database.pool, "delegate").await?, 0);
    assert_eq!(
        table_count(&database.pool, "vote_power_checkpoint").await?,
        0
    );
    assert_checkpoint(&database.pool).await?;
    database.cleanup().await?;

    Ok(())
}

#[derive(Default)]
struct RecordingProvisionalStore {
    writes: Vec<DatalensProvisionalSegmentWrite>,
}

impl DatalensProvisionalSegmentStore for RecordingProvisionalStore {
    type Error = String;

    fn write_provisional_segments(
        &mut self,
        segments: &[DatalensProvisionalSegmentWrite],
    ) -> Result<(), Self::Error> {
        self.writes.extend_from_slice(segments);
        Ok(())
    }
}

struct MockProvisionalReader {
    calls: Vec<QueryInput>,
    results: Vec<Result<DatalensProvisionalLogQueryResult, DatalensError>>,
}

impl MockProvisionalReader {
    fn new(results: Vec<Result<DatalensProvisionalLogQueryResult, DatalensError>>) -> Self {
        Self {
            calls: Vec::new(),
            results,
        }
    }
}

impl DatalensProvisionalLogQueryReader for MockProvisionalReader {
    fn query_provisional_logs(
        &mut self,
        input: QueryInput,
    ) -> Result<DatalensProvisionalLogQueryResult, DatalensError> {
        self.calls.push(input);
        self.results.remove(0)
    }
}

fn cache_segment(
    source: &str,
    finality: &str,
    range_start: i64,
    range_end: i64,
) -> DatalensProvisionalCacheSegment {
    DatalensProvisionalCacheSegment {
        source: source.to_owned(),
        finality: finality.to_owned(),
        range_start_block: range_start,
        range_end_block: range_end,
        anchor_block_number: Some(range_end),
        anchor_block_hash: Some("0xabc".to_owned()),
        anchor_parent_hash: Some("0xdef".to_owned()),
        anchor_block_timestamp: Some(1_700_000_000),
    }
}

fn segment_write(
    source: &str,
    finality: &str,
    range_start: i64,
    range_end: i64,
) -> DatalensProvisionalSegmentWrite {
    DatalensProvisionalSegmentWrite {
        id: "demo-dao:ethereum:demo-set:evm.logs:selector:100:105:safe_to_latest:provider"
            .to_owned(),
        dao_code: Some("demo-dao".to_owned()),
        contract_set_id: "demo-set".to_owned(),
        chain_id: Some(1),
        chain_name: Some("ethereum".to_owned()),
        dataset_key: "evm.logs".to_owned(),
        selector: "selector".to_owned(),
        selector_fingerprint: Some("selector-fingerprint".to_owned()),
        range_start_block: range_start,
        range_end_block: range_end,
        segment_finality: finality.to_owned(),
        source: source.to_owned(),
        anchor_block_number: Some(range_end),
        anchor_block_hash: Some("0xabc".to_owned()),
        anchor_parent_hash: Some("0xdef".to_owned()),
        anchor_block_timestamp: Some(1_700_000_000),
        error: None,
    }
}

fn contributor_power_write(account: &str, power: &str) -> ProvisionalContributorPowerOverlayWrite {
    ProvisionalContributorPowerOverlayWrite {
        id: format!("demo-set:1:demo-dao:0xgovernor:0xtoken:{account}:live-onchain"),
        segment_id: None,
        dao_code: Some("demo-dao".to_owned()),
        contract_set_id: "demo-set".to_owned(),
        chain_id: Some(1),
        chain_name: Some("ethereum".to_owned()),
        governor_address: Some("0xgovernor".to_owned()),
        token_address: Some("0xtoken".to_owned()),
        account: account.to_owned(),
        power: power.to_owned(),
        balance: None,
        delegates_count_all: 0,
        delegates_count_effective: 0,
        last_vote_block_number: None,
        last_vote_timestamp: None,
        source: "live-onchain".to_owned(),
        status: "available".to_owned(),
        anchor_block_number: Some("105".to_owned()),
        anchor_block_hash: None,
        anchor_parent_hash: None,
        anchor_block_timestamp: Some("1700000000".to_owned()),
    }
}

fn delegate_power_write(
    delegator: &str,
    delegate: &str,
    power: &str,
) -> ProvisionalDelegatePowerOverlayWrite {
    ProvisionalDelegatePowerOverlayWrite {
        id: format!("demo-set:1:demo-dao:0xgovernor:0xtoken:{delegator}:{delegate}:live-onchain"),
        segment_id: None,
        dao_code: Some("demo-dao".to_owned()),
        contract_set_id: "demo-set".to_owned(),
        chain_id: Some(1),
        chain_name: Some("ethereum".to_owned()),
        governor_address: Some("0xgovernor".to_owned()),
        token_address: Some("0xtoken".to_owned()),
        delegator: delegator.to_owned(),
        delegate: delegate.to_owned(),
        power: power.to_owned(),
        is_current: true,
        source: "live-onchain".to_owned(),
        status: "available".to_owned(),
        anchor_block_number: Some("105".to_owned()),
        anchor_block_hash: None,
        anchor_parent_hash: None,
        anchor_block_timestamp: Some("1700000000".to_owned()),
    }
}

fn options(config: &DatalensConfig) -> ProvisionalWorkerOptions {
    ProvisionalWorkerOptions {
        datalens_config: config.clone(),
        addresses: addresses(),
        dao_code: "demo-dao".to_owned(),
        contract_set_id: "demo-set".to_owned(),
        chain_id: 1,
        chain_name: "ethereum".to_owned(),
        finality: DatalensProvisionalFinality::SafeToLatest,
        from_block: 100,
        to_block: 105,
    }
}

fn datalens_config() -> DatalensConfig {
    DatalensConfig {
        endpoint: "https://datalens.ringdao.com".to_owned(),
        application: "degov-test".to_owned(),
        bearer_token: SecretString::new("redacted"),
        timeout: Duration::from_secs(60),
        finality: DatalensFinality::DurableOnly,
        chain: ChainIdentityConfig {
            family: ChainFamily::Evm,
            configured_name: "ethereum".to_owned(),
            network_id: Some(1),
        },
        dataset: DatasetKeyConfig {
            family: "evm".to_owned(),
            name: "logs".to_owned(),
        },
        query_limits: QueryLimitConfig {
            block_range_limit: 1_000,
        },
        warmup: Default::default(),
        dao_contracts: None,
        chains: Vec::new(),
    }
}

fn addresses() -> DaoContractAddresses {
    DaoContractAddresses {
        governor: "0x1111111111111111111111111111111111111111".to_owned(),
        governor_token: "0x2222222222222222222222222222222222222222".to_owned(),
        governor_token_standard: GovernanceTokenStandard::Erc20,
        timelock: "0x3333333333333333333333333333333333333333".to_owned(),
    }
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

fn unique_schema_name() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time after epoch")
        .as_millis();
    let counter = SCHEMA_COUNTER.fetch_add(1, Ordering::SeqCst);

    format!("degov_test_provisional_worker_{millis}_{counter}")
}

fn database_url_with_search_path(database_url: &str, schema: &str) -> String {
    let separator = if database_url.contains('?') { '&' } else { '?' };
    format!("{database_url}{separator}options=-csearch_path%3D{schema}")
}

async fn insert_checkpoint(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO degov_indexer_checkpoint (
             dao_code, chain_id, contract_set_id, stream_id, data_source_version,
             next_block, processed_height, target_height
         )
         VALUES ('demo-dao', 1, 'demo-set', 'datalens-native', 'datalens-v1', 11, 10, 10)",
    )
    .execute(pool)
    .await?;

    Ok(())
}

async fn assert_checkpoint(pool: &PgPool) -> Result<(), sqlx::Error> {
    let row = sqlx::query(
        "SELECT
           next_block::BIGINT AS next_block,
           processed_height::BIGINT AS processed_height,
           target_height::BIGINT AS target_height
         FROM degov_indexer_checkpoint
         WHERE dao_code = 'demo-dao'
           AND chain_id = 1
           AND contract_set_id = 'demo-set'
           AND stream_id = 'datalens-native'
           AND data_source_version = 'datalens-v1'",
    )
    .fetch_one(pool)
    .await?;

    assert_eq!(row.get::<i64, _>("next_block"), 11);
    assert_eq!(row.get::<Option<i64>, _>("processed_height"), Some(10));
    assert_eq!(row.get::<Option<i64>, _>("target_height"), Some(10));

    Ok(())
}

async fn table_count(pool: &PgPool, table: &str) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(&format!("SELECT count(*)::BIGINT FROM {table}"))
        .fetch_one(pool)
        .await
}
