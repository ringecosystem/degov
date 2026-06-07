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
    GovernanceTokenStandard, IndexerCheckpointIdentity, PostgresProvisionalCleanupStore,
    PostgresProvisionalPowerOverlayStore, PostgresProvisionalProposalOverlayStore,
    PostgresProvisionalSegmentStore, ProvisionalContributorPowerOverlayWrite,
    ProvisionalDelegatePowerOverlayWrite, ProvisionalProposalOverlayWrite,
    ProvisionalRollbackScope, ProvisionalSegmentCleanupCandidate,
    ProvisionalSegmentCleanupDecision, ProvisionalTimelockOperationOverlayWrite, ProvisionalWorker,
    ProvisionalWorkerOptions, QueryLimitConfig, SecretString, plan_provisional_segment_cleanup,
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

#[test]
fn test_provisional_cleanup_planner_finalizes_latest_segment_after_safe_checkpoint_covers_range() {
    let decision = plan_provisional_segment_cleanup(
        110,
        &ProvisionalSegmentCleanupCandidate {
            range_start_block: 100,
            range_end_block: 105,
            segment_finality: "latest".to_owned(),
            anchor_block_number: Some(105),
        },
    );

    assert_eq!(decision, ProvisionalSegmentCleanupDecision::Finalize);
}

#[test]
fn test_provisional_cleanup_planner_keeps_segment_until_safe_checkpoint_covers_range() {
    let decision = plan_provisional_segment_cleanup(
        102,
        &ProvisionalSegmentCleanupCandidate {
            range_start_block: 100,
            range_end_block: 105,
            segment_finality: "latest".to_owned(),
            anchor_block_number: Some(105),
        },
    );

    assert_eq!(decision, ProvisionalSegmentCleanupDecision::Keep);
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

#[tokio::test(flavor = "multi_thread")]
async fn test_postgres_live_proposal_timelock_overlay_upsert_is_idempotent_and_writes_no_final_tables()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;

    apply_migrations(&database.pool).await?;
    insert_checkpoint(&database.pool).await?;
    let store = PostgresProvisionalProposalOverlayStore::new(database.pool.clone());
    let proposal = proposal_overlay_write("42", "Queued");
    let timelock = timelock_overlay_write("42", "0xoperation", "Ready");

    store
        .write_proposal_overlays(&[proposal.clone()], &[timelock.clone()])
        .await
        .expect("first write succeeds");
    store
        .write_proposal_overlays(&[proposal], &[timelock])
        .await
        .expect("retry write succeeds");

    assert_eq!(
        table_count(&database.pool, "degov_provisional_proposal_overlay").await?,
        1
    );
    assert_eq!(
        table_count(
            &database.pool,
            "degov_provisional_timelock_operation_overlay"
        )
        .await?,
        1
    );
    assert_eq!(table_count(&database.pool, "proposal").await?, 0);
    assert_eq!(
        table_count(&database.pool, "proposal_state_epoch").await?,
        0
    );
    assert_eq!(table_count(&database.pool, "timelock_operation").await?, 0);
    assert_checkpoint(&database.pool).await?;
    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_postgres_cleanup_after_finalized_checkpoint_hides_all_overlay_types_without_mutating_final_rows()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;

    apply_migrations(&database.pool).await?;
    insert_checkpoint_at(&database.pool, 110).await?;
    insert_final_rows(&database.pool).await?;
    insert_available_provisional_rows(&database.pool, "demo-dao", "demo-set", 1).await?;
    let cleanup_store = PostgresProvisionalCleanupStore::new(database.pool.clone());

    let report = cleanup_store
        .cleanup_finalized_provisional_overlays(
            &checkpoint_identity("demo-dao", "demo-set", 1),
            None,
        )
        .await
        .expect("cleanup succeeds");

    assert_eq!(report.segments_marked_finalized, 1);
    assert_eq!(report.contributor_overlays_marked_finalized, 1);
    assert_eq!(report.delegate_overlays_marked_finalized, 1);
    assert_eq!(report.proposal_overlays_marked_finalized, 1);
    assert_eq!(report.timelock_overlays_marked_finalized, 1);
    assert_eq!(
        active_provisional_count(&database.pool, "degov_provisional_segment").await?,
        0
    );
    assert_eq!(
        active_provisional_count(
            &database.pool,
            "degov_provisional_contributor_power_overlay"
        )
        .await?,
        0
    );
    assert_eq!(
        active_provisional_count(&database.pool, "degov_provisional_delegate_power_overlay")
            .await?,
        0
    );
    assert_eq!(
        active_provisional_count(&database.pool, "degov_provisional_proposal_overlay").await?,
        0
    );
    assert_eq!(
        active_provisional_count(
            &database.pool,
            "degov_provisional_timelock_operation_overlay"
        )
        .await?,
        0
    );
    assert_final_rows(&database.pool).await?;
    assert_checkpoint_at(&database.pool, 110).await?;
    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_postgres_cleanup_keeps_live_onchain_overlays_without_segment_id()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;

    apply_migrations(&database.pool).await?;
    insert_checkpoint_at(&database.pool, 110).await?;
    insert_available_live_onchain_overlay_rows(&database.pool, "demo-dao", "demo-set", 1).await?;
    let cleanup_store = PostgresProvisionalCleanupStore::new(database.pool.clone());

    let report = cleanup_store
        .cleanup_finalized_provisional_overlays(
            &checkpoint_identity("demo-dao", "demo-set", 1),
            None,
        )
        .await
        .expect("cleanup succeeds");

    assert_eq!(report.segments_marked_finalized, 0);
    assert_eq!(report.contributor_overlays_marked_finalized, 0);
    assert_eq!(report.delegate_overlays_marked_finalized, 0);
    assert_eq!(report.proposal_overlays_marked_finalized, 0);
    assert_eq!(report.timelock_overlays_marked_finalized, 0);
    assert_eq!(
        active_provisional_count(
            &database.pool,
            "degov_provisional_contributor_power_overlay"
        )
        .await?,
        1
    );
    assert_eq!(
        active_provisional_count(&database.pool, "degov_provisional_delegate_power_overlay")
            .await?,
        1
    );
    assert_eq!(
        active_provisional_count(&database.pool, "degov_provisional_proposal_overlay").await?,
        1
    );
    assert_eq!(
        active_provisional_count(
            &database.pool,
            "degov_provisional_timelock_operation_overlay"
        )
        .await?,
        1
    );
    assert_checkpoint_at(&database.pool, 110).await?;
    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_postgres_rollback_invalidates_provisional_overlays_without_mutating_final_rows()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;

    apply_migrations(&database.pool).await?;
    insert_checkpoint_at(&database.pool, 10).await?;
    insert_final_rows(&database.pool).await?;
    insert_available_provisional_rows(&database.pool, "demo-dao", "demo-set", 1).await?;
    let cleanup_store = PostgresProvisionalCleanupStore::new(database.pool.clone());

    let report = cleanup_store
        .rollback_provisional_overlays(
            &ProvisionalRollbackScope {
                dao_code: "demo-dao".to_owned(),
                contract_set_id: "demo-set".to_owned(),
                chain_id: 1,
                source: None,
            },
            "test invalidation",
        )
        .await
        .expect("rollback succeeds");

    assert_eq!(report.segments_marked_invalid, 1);
    assert_eq!(report.contributor_overlays_marked_invalid, 1);
    assert_eq!(report.delegate_overlays_marked_invalid, 1);
    assert_eq!(report.proposal_overlays_marked_invalid, 1);
    assert_eq!(report.timelock_overlays_marked_invalid, 1);
    assert_eq!(
        active_provisional_count(&database.pool, "degov_provisional_segment").await?,
        0
    );
    assert_eq!(
        provisional_status(&database.pool, "degov_provisional_segment").await?,
        "invalid"
    );
    assert_final_rows(&database.pool).await?;
    assert_checkpoint_at(&database.pool, 10).await?;
    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_postgres_rollback_invalidates_live_onchain_overlays_without_segment_id()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;

    apply_migrations(&database.pool).await?;
    insert_checkpoint_at(&database.pool, 10).await?;
    insert_available_live_onchain_overlay_rows(&database.pool, "demo-dao", "demo-set", 1).await?;
    let cleanup_store = PostgresProvisionalCleanupStore::new(database.pool.clone());

    let report = cleanup_store
        .rollback_provisional_overlays(
            &ProvisionalRollbackScope {
                dao_code: "demo-dao".to_owned(),
                contract_set_id: "demo-set".to_owned(),
                chain_id: 1,
                source: Some("live-onchain".to_owned()),
            },
            "test invalidation",
        )
        .await
        .expect("rollback succeeds");

    assert_eq!(report.segments_marked_invalid, 0);
    assert_eq!(report.contributor_overlays_marked_invalid, 1);
    assert_eq!(report.delegate_overlays_marked_invalid, 1);
    assert_eq!(report.proposal_overlays_marked_invalid, 1);
    assert_eq!(report.timelock_overlays_marked_invalid, 1);
    assert_eq!(
        active_provisional_count(
            &database.pool,
            "degov_provisional_contributor_power_overlay"
        )
        .await?,
        0
    );
    assert_checkpoint_at(&database.pool, 10).await?;
    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_postgres_cleanup_scopes_by_contract_set_chain_and_dao() -> Result<(), Box<dyn Error>>
{
    let database = TestDatabase::connect().await?;

    apply_migrations(&database.pool).await?;
    insert_checkpoint_at(&database.pool, 110).await?;
    insert_checkpoint_for(&database.pool, "other-dao", "other-set", 2, 110).await?;
    insert_available_provisional_rows(&database.pool, "demo-dao", "demo-set", 1).await?;
    insert_available_provisional_rows(&database.pool, "other-dao", "other-set", 2).await?;
    let cleanup_store = PostgresProvisionalCleanupStore::new(database.pool.clone());

    cleanup_store
        .cleanup_finalized_provisional_overlays(
            &checkpoint_identity("demo-dao", "demo-set", 1),
            None,
        )
        .await
        .expect("cleanup succeeds");

    assert_eq!(
        active_provisional_count_for(&database.pool, "degov_provisional_segment", "demo-dao", 1)
            .await?,
        0
    );
    assert_eq!(
        active_provisional_count_for(&database.pool, "degov_provisional_segment", "other-dao", 2)
            .await?,
        1
    );
    assert_eq!(
        active_provisional_count_for(
            &database.pool,
            "degov_provisional_proposal_overlay",
            "other-dao",
            2
        )
        .await?,
        1
    );
    assert_checkpoint_at(&database.pool, 110).await?;
    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_postgres_cleanup_is_idempotent() -> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;

    apply_migrations(&database.pool).await?;
    insert_checkpoint_at(&database.pool, 110).await?;
    insert_available_provisional_rows(&database.pool, "demo-dao", "demo-set", 1).await?;
    let cleanup_store = PostgresProvisionalCleanupStore::new(database.pool.clone());
    let identity = checkpoint_identity("demo-dao", "demo-set", 1);

    cleanup_store
        .cleanup_finalized_provisional_overlays(&identity, None)
        .await
        .expect("first cleanup succeeds");
    let retry_report = cleanup_store
        .cleanup_finalized_provisional_overlays(&identity, None)
        .await
        .expect("retry cleanup succeeds");

    assert_eq!(retry_report.segments_marked_finalized, 0);
    assert_eq!(retry_report.contributor_overlays_marked_finalized, 0);
    assert_eq!(retry_report.delegate_overlays_marked_finalized, 0);
    assert_eq!(retry_report.proposal_overlays_marked_finalized, 0);
    assert_eq!(retry_report.timelock_overlays_marked_finalized, 0);
    assert_eq!(
        active_provisional_count(&database.pool, "degov_provisional_segment").await?,
        0
    );
    assert_checkpoint_at(&database.pool, 110).await?;
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

fn proposal_overlay_write(proposal_id: &str, state: &str) -> ProvisionalProposalOverlayWrite {
    ProvisionalProposalOverlayWrite {
        id: format!("demo-set:1:demo-dao:0xgovernor:{proposal_id}:live-onchain"),
        segment_id: None,
        dao_code: Some("demo-dao".to_owned()),
        contract_set_id: "demo-set".to_owned(),
        chain_id: Some(1),
        chain_name: Some("ethereum".to_owned()),
        governor_address: Some("0xgovernor".to_owned()),
        contract_address: Some("0xgovernor".to_owned()),
        proposal_id: proposal_id.to_owned(),
        proposer: Some("0xproposer".to_owned()),
        targets: Some(vec!["0xtarget".to_owned()]),
        values: Some(vec!["0".to_owned()]),
        signatures: Some(vec!["transfer(address,uint256)".to_owned()]),
        calldatas: Some(vec!["0x".to_owned()]),
        vote_start: Some("1000".to_owned()),
        vote_end: Some("2000".to_owned()),
        description: Some("Live proposal body".to_owned()),
        title: Some("Live proposal title".to_owned()),
        state: Some(state.to_owned()),
        vote_start_timestamp: Some("1700001000".to_owned()),
        vote_end_timestamp: Some("1700002000".to_owned()),
        description_hash: None,
        proposal_snapshot: Some("1000".to_owned()),
        proposal_deadline: Some("2000".to_owned()),
        proposal_eta: Some("1700000300".to_owned()),
        queue_ready_at: Some("1700000300".to_owned()),
        queue_expires_at: Some("1700000900".to_owned()),
        counting_mode: None,
        timelock_address: Some("0xtimelock".to_owned()),
        timelock_grace_period: Some("600".to_owned()),
        clock_mode: Some("mode=blocknumber&from=default".to_owned()),
        quorum: Some("40".to_owned()),
        decimals: Some("18".to_owned()),
        source: "live-onchain".to_owned(),
        status: "available".to_owned(),
        anchor_block_number: Some("105".to_owned()),
        anchor_block_hash: None,
        anchor_parent_hash: None,
        anchor_block_timestamp: Some("1700000000".to_owned()),
    }
}

fn timelock_overlay_write(
    proposal_id: &str,
    operation_id: &str,
    state: &str,
) -> ProvisionalTimelockOperationOverlayWrite {
    ProvisionalTimelockOperationOverlayWrite {
        id: format!("demo-set:1:demo-dao:0xtimelock:{proposal_id}:{operation_id}:live-onchain"),
        segment_id: None,
        dao_code: Some("demo-dao".to_owned()),
        contract_set_id: "demo-set".to_owned(),
        chain_id: Some(1),
        chain_name: Some("ethereum".to_owned()),
        governor_address: Some("0xgovernor".to_owned()),
        timelock_address: "0xtimelock".to_owned(),
        proposal_id: Some(proposal_id.to_owned()),
        operation_id: operation_id.to_owned(),
        timelock_type: Some("single".to_owned()),
        predecessor: None,
        salt: None,
        state: state.to_owned(),
        call_count: Some(1),
        executed_call_count: Some(0),
        delay_seconds: Some("600".to_owned()),
        ready_at: Some("1700000300".to_owned()),
        expires_at: Some("1700000900".to_owned()),
        queued_block_number: Some("105".to_owned()),
        queued_block_timestamp: Some("1700000000".to_owned()),
        queued_transaction_hash: Some("0xqueue".to_owned()),
        cancelled_block_number: None,
        cancelled_block_timestamp: None,
        cancelled_transaction_hash: None,
        executed_block_number: None,
        executed_block_timestamp: None,
        executed_transaction_hash: None,
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
    insert_checkpoint_at(pool, 10).await
}

async fn insert_checkpoint_at(pool: &PgPool, processed_height: i64) -> Result<(), sqlx::Error> {
    insert_checkpoint_for(pool, "demo-dao", "demo-set", 1, processed_height).await
}

async fn insert_checkpoint_for(
    pool: &PgPool,
    dao_code: &str,
    contract_set_id: &str,
    chain_id: i32,
    processed_height: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO degov_indexer_checkpoint (
             dao_code, chain_id, contract_set_id, stream_id, data_source_version,
             next_block, processed_height, target_height
         )
         VALUES ($1, $2, $3, 'datalens-native', 'datalens-v1',
                 ($4 + 1)::NUMERIC(78, 0), $4::NUMERIC(78, 0), $4::NUMERIC(78, 0))",
    )
    .bind(dao_code)
    .bind(chain_id)
    .bind(contract_set_id)
    .bind(processed_height)
    .execute(pool)
    .await?;

    Ok(())
}

async fn assert_checkpoint(pool: &PgPool) -> Result<(), sqlx::Error> {
    assert_checkpoint_at(pool, 10).await
}

async fn assert_checkpoint_at(pool: &PgPool, processed_height: i64) -> Result<(), sqlx::Error> {
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

    assert_eq!(row.get::<i64, _>("next_block"), processed_height + 1);
    assert_eq!(
        row.get::<Option<i64>, _>("processed_height"),
        Some(processed_height)
    );
    assert_eq!(
        row.get::<Option<i64>, _>("target_height"),
        Some(processed_height)
    );

    Ok(())
}

fn checkpoint_identity(
    dao_code: &str,
    contract_set_id: &str,
    chain_id: i32,
) -> IndexerCheckpointIdentity {
    IndexerCheckpointIdentity {
        dao_code: dao_code.to_owned(),
        chain_id,
        contract_set_id: contract_set_id.to_owned(),
        stream_id: "datalens-native".to_owned(),
        data_source_version: "datalens-v1".to_owned(),
    }
}

async fn insert_available_provisional_rows(
    pool: &PgPool,
    dao_code: &str,
    contract_set_id: &str,
    chain_id: i32,
) -> Result<(), Box<dyn Error>> {
    let segment_id = format!("{dao_code}:{contract_set_id}:{chain_id}:segment");
    sqlx::query(
        "INSERT INTO degov_provisional_segment (
             id, dao_code, contract_set_id, chain_id, chain_name, dataset_key, selector,
             range_start_block, range_end_block, segment_finality, source, status,
             anchor_block_number, anchor_block_timestamp
         )
         VALUES (
             $1, $2, $3, $4, 'ethereum', 'evm.logs', 'selector',
             100, 105, 'latest', 'provider', 'available', 105, 1700000000
         )",
    )
    .bind(&segment_id)
    .bind(dao_code)
    .bind(contract_set_id)
    .bind(chain_id)
    .execute(pool)
    .await?;

    let power_store = PostgresProvisionalPowerOverlayStore::new(pool.clone());
    let proposal_store = PostgresProvisionalProposalOverlayStore::new(pool.clone());
    let mut contributor = contributor_power_write("0xabc", "19");
    set_overlay_scope(
        &mut contributor.id,
        &mut contributor.dao_code,
        &mut contributor.contract_set_id,
        &mut contributor.chain_id,
        dao_code,
        contract_set_id,
        chain_id,
    );
    contributor.segment_id = Some(segment_id.clone());
    let mut delegate = delegate_power_write("0xabc", "0xdef", "19");
    set_overlay_scope(
        &mut delegate.id,
        &mut delegate.dao_code,
        &mut delegate.contract_set_id,
        &mut delegate.chain_id,
        dao_code,
        contract_set_id,
        chain_id,
    );
    delegate.segment_id = Some(segment_id.clone());
    let mut proposal = proposal_overlay_write("42", "Queued");
    set_overlay_scope(
        &mut proposal.id,
        &mut proposal.dao_code,
        &mut proposal.contract_set_id,
        &mut proposal.chain_id,
        dao_code,
        contract_set_id,
        chain_id,
    );
    proposal.segment_id = Some(segment_id.clone());
    let mut timelock = timelock_overlay_write("42", "0xoperation", "Ready");
    set_overlay_scope(
        &mut timelock.id,
        &mut timelock.dao_code,
        &mut timelock.contract_set_id,
        &mut timelock.chain_id,
        dao_code,
        contract_set_id,
        chain_id,
    );
    timelock.segment_id = Some(segment_id);

    power_store
        .write_power_overlays(&[contributor], &[delegate])
        .await?;
    proposal_store
        .write_proposal_overlays(&[proposal], &[timelock])
        .await?;

    Ok(())
}

async fn insert_available_live_onchain_overlay_rows(
    pool: &PgPool,
    dao_code: &str,
    contract_set_id: &str,
    chain_id: i32,
) -> Result<(), Box<dyn Error>> {
    let power_store = PostgresProvisionalPowerOverlayStore::new(pool.clone());
    let proposal_store = PostgresProvisionalProposalOverlayStore::new(pool.clone());
    let mut contributor = contributor_power_write("0xliveabc", "29");
    set_overlay_scope(
        &mut contributor.id,
        &mut contributor.dao_code,
        &mut contributor.contract_set_id,
        &mut contributor.chain_id,
        dao_code,
        contract_set_id,
        chain_id,
    );
    let mut delegate = delegate_power_write("0xliveabc", "0xlivedef", "29");
    set_overlay_scope(
        &mut delegate.id,
        &mut delegate.dao_code,
        &mut delegate.contract_set_id,
        &mut delegate.chain_id,
        dao_code,
        contract_set_id,
        chain_id,
    );
    let mut proposal = proposal_overlay_write("84", "Queued");
    set_overlay_scope(
        &mut proposal.id,
        &mut proposal.dao_code,
        &mut proposal.contract_set_id,
        &mut proposal.chain_id,
        dao_code,
        contract_set_id,
        chain_id,
    );
    let mut timelock = timelock_overlay_write("84", "0xliveoperation", "Ready");
    set_overlay_scope(
        &mut timelock.id,
        &mut timelock.dao_code,
        &mut timelock.contract_set_id,
        &mut timelock.chain_id,
        dao_code,
        contract_set_id,
        chain_id,
    );

    power_store
        .write_power_overlays(&[contributor], &[delegate])
        .await?;
    proposal_store
        .write_proposal_overlays(&[proposal], &[timelock])
        .await?;

    Ok(())
}

fn set_overlay_scope(
    id: &mut String,
    dao_code: &mut Option<String>,
    contract_set_id: &mut String,
    chain_id: &mut Option<i32>,
    new_dao_code: &str,
    new_contract_set_id: &str,
    new_chain_id: i32,
) {
    *id = id
        .replace("demo-dao", new_dao_code)
        .replace("demo-set", new_contract_set_id)
        .replace(":1:", &format!(":{new_chain_id}:"));
    *dao_code = Some(new_dao_code.to_owned());
    *contract_set_id = new_contract_set_id.to_owned();
    *chain_id = Some(new_chain_id);
}

async fn insert_final_rows(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO contributor (
             id, contract_set_id, chain_id, dao_code, governor_address, token_address,
             block_number, block_timestamp, transaction_hash, power, delegates_count_all,
             delegates_count_effective
         )
         VALUES (
             '0xabc', 'demo-set', 1, 'demo-dao', '0xgovernor', '0xtoken',
             10, 1700000010, '0xfinalcontributor', 5, 0, 0
         )",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "INSERT INTO delegate (
             id, contract_set_id, chain_id, dao_code, governor_address, token_address,
             from_delegate, to_delegate, block_number, block_timestamp, transaction_hash,
             is_current, power
         )
         VALUES (
             'delegate-final', 'demo-set', 1, 'demo-dao', '0xgovernor', '0xtoken',
             '0xabc', '0xdef', 10, 1700000010, '0xfinaldelegate', TRUE, 5
         )",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "INSERT INTO proposal (
             id, contract_set_id, chain_id, dao_code, governor_address, contract_address,
             proposal_id, proposer, targets, values, signatures, calldatas, vote_start,
             vote_end, description, block_number, block_timestamp, transaction_hash, title,
             vote_start_timestamp, vote_end_timestamp, clock_mode, quorum, decimals
         )
         VALUES (
             'proposal-final', 'demo-set', 1, 'demo-dao', '0xgovernor', '0xgovernor',
             '42', '0xproposer', ARRAY['0xtarget'], ARRAY['0'], ARRAY['transfer(address,uint256)'],
             ARRAY['0x'], 1000, 2000, 'Final proposal body', 10, 1700000010,
             '0xfinalproposal', 'Final proposal title', 1700001000, 1700002000,
             'mode=blocknumber&from=default', 40, 18
         )",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "INSERT INTO timelock_operation (
             id, contract_set_id, chain_id, dao_code, governor_address, timelock_address,
             proposal_ref, proposal_id, operation_id, timelock_type, state
         )
         VALUES (
             'timelock-final', 'demo-set', 1, 'demo-dao', '0xgovernor', '0xtimelock',
             'proposal-final', '42', '0xoperation', 'single', 'Pending'
         )",
    )
    .execute(pool)
    .await?;

    Ok(())
}

async fn assert_final_rows(pool: &PgPool) -> Result<(), sqlx::Error> {
    assert_eq!(table_count(pool, "contributor").await?, 1);
    assert_eq!(table_count(pool, "delegate").await?, 1);
    assert_eq!(table_count(pool, "proposal").await?, 1);
    assert_eq!(table_count(pool, "timelock_operation").await?, 1);

    let contributor_power: i64 =
        sqlx::query_scalar("SELECT power::BIGINT FROM contributor WHERE id = '0xabc'")
            .fetch_one(pool)
            .await?;
    let proposal_title: String =
        sqlx::query_scalar("SELECT title FROM proposal WHERE id = 'proposal-final'")
            .fetch_one(pool)
            .await?;
    assert_eq!(contributor_power, 5);
    assert_eq!(proposal_title, "Final proposal title");

    Ok(())
}

async fn active_provisional_count(pool: &PgPool, table: &str) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(&format!(
        "SELECT count(*)::BIGINT FROM {table} WHERE status = 'available'"
    ))
    .fetch_one(pool)
    .await
}

async fn active_provisional_count_for(
    pool: &PgPool,
    table: &str,
    dao_code: &str,
    chain_id: i32,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(&format!(
        "SELECT count(*)::BIGINT FROM {table}
         WHERE status = 'available'
           AND dao_code = $1
           AND chain_id = $2"
    ))
    .bind(dao_code)
    .bind(chain_id)
    .fetch_one(pool)
    .await
}

async fn provisional_status(pool: &PgPool, table: &str) -> Result<String, sqlx::Error> {
    sqlx::query_scalar(&format!("SELECT status FROM {table} LIMIT 1"))
        .fetch_one(pool)
        .await
}

async fn table_count(pool: &PgPool, table: &str) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(&format!("SELECT count(*)::BIGINT FROM {table}"))
        .fetch_one(pool)
        .await
}
