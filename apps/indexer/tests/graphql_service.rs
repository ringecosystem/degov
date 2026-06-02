use std::{
    env,
    error::Error,
    sync::atomic::{AtomicU64, Ordering},
};

use async_graphql::Request;
use degov_datalens_indexer::graphql;
use serde_json::json;
use sqlx::{PgPool, postgres::PgPoolOptions};
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
        sqlx::query(&format!(r#"DROP SCHEMA IF EXISTS "{schema}" CASCADE"#))
            .execute(&pool)
            .await?;
        sqlx::query(&format!(r#"CREATE SCHEMA "{schema}""#))
            .execute(&pool)
            .await?;
        sqlx::query(&format!(r#"SET search_path TO "{schema}""#))
            .execute(&pool)
            .await?;
        sqlx::raw_sql(SCHEMA_SQL).execute(&pool).await?;
        seed_rows(&pool).await?;

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
async fn test_graphql_schema_serves_current_web_compatibility_queries() -> Result<(), Box<dyn Error>>
{
    let database = TestDatabase::connect().await?;
    let schema = graphql::build_schema(database.pool.clone());

    let request = Request::new(
        r#"
            query Compatibility($where: ProposalWhereInput, $voter: String) {
              proposals(where: $where, orderBy: [blockTimestamp_DESC_NULLS_LAST], limit: 5) {
                id
                proposalId
                title
                proposer
                blockTimestamp
                chainId
                daoCode
                governorAddress
                metricsVotesWeightForSum
                metricsVotesWeightAgainstSum
                metricsVotesWeightAbstainSum
                metricsVotesCount
                voters(where: { voter_eq: $voter }, orderBy: [blockTimestamp_ASC_NULLS_LAST]) {
                  id
                  type
                  params
                  voter
                  support
                  weight
                  reason
                  blockNumber
                  blockTimestamp
                  transactionHash
                }
              }
              proposalCanceleds(where: { proposalId_eq: "101" }) { proposalId blockTimestamp }
              proposalExecuteds(where: { proposalId_eq: "101" }) { proposalId blockTimestamp }
              proposalQueueds(where: { proposalId_eq: "101" }) { proposalId etaSeconds }
              dataMetrics(where: { id_eq: "metric:lisk-dao" }) {
                proposalsCount
                votesCount
                votesWeightForSum
                powerSum
                memberCount
              }
              contributors(where: { OR: [{ id_eq: "0xvoter1" }, { power_lt: "50" }] }, orderBy: [power_DESC]) {
                id
                power
                lastVoteTimestamp
                delegatesCountAll
              }
              delegates(where: { fromDelegate_eq: "0xdelegator", isCurrent_eq: true }) {
                fromDelegate
                toDelegate
                isCurrent
                power
              }
              delegateMappings(where: { from_eq: "0xdelegator" }, orderBy: [power_DESC]) {
                from
                to
                power
              }
              squidStatus { height finalizedHeight hash finalizedHash }
              proposalsConnection(where: $where) { totalCount }
              contributorsConnection { totalCount }
              delegatesConnection { totalCount }
              delegateMappingsConnection { totalCount }
            }
            "#,
    )
    .variables(async_graphql::Variables::from_json(json!({
            "where": {
                "chainId_eq": 1135,
                "governorAddress_eq": "0xgovernor",
                "description_containsInsensitive": "launch",
                "voters_some": { "support_eq": 1 }
            },
            "voter": "0xvoter1"
    })));
    let response = schema.execute(request).await;

    assert!(
        response.errors.is_empty(),
        "unexpected GraphQL errors: {:?}",
        response.errors
    );

    let data = response.data.into_json()?;
    assert_eq!(data["proposals"][0]["proposalId"], "101");
    assert_eq!(data["proposals"][0]["blockTimestamp"], "1700000100");
    assert_eq!(data["proposals"][0]["metricsVotesWeightForSum"], "100");
    assert_eq!(data["proposals"][0]["voters"][0]["voter"], "0xvoter1");
    assert_eq!(data["proposals"][0]["voters"][0]["weight"], "100");
    assert_eq!(data["proposalQueueds"][0]["etaSeconds"], "1700000200");
    assert_eq!(data["dataMetrics"][0]["powerSum"], "150");
    assert_eq!(data["contributors"][0]["id"], "0xvoter1");
    assert_eq!(data["delegates"][0]["isCurrent"], true);
    assert_eq!(data["delegateMappings"][0]["to"], "0xdelegate");
    assert_eq!(data["squidStatus"]["height"], 900);
    assert_eq!(data["squidStatus"]["finalizedHeight"], 900);
    assert_eq!(data["proposalsConnection"]["totalCount"], 1);
    assert_eq!(data["contributorsConnection"]["totalCount"], 2);
    assert_eq!(data["delegatesConnection"]["totalCount"], 1);
    assert_eq!(data["delegateMappingsConnection"]["totalCount"], 1);

    database.cleanup().await?;

    Ok(())
}

fn unique_schema_name() -> String {
    let id = SCHEMA_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("graphql_service_test_{id}")
}

async fn seed_rows(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO proposal (
          id, chain_id, dao_code, governor_address, contract_address, log_index, transaction_index,
          proposal_id, proposer, targets, values, signatures, calldatas, vote_start, vote_end,
          description, block_number, block_timestamp, transaction_hash,
          metrics_votes_count, metrics_votes_with_params_count, metrics_votes_without_params_count,
          metrics_votes_weight_for_sum, metrics_votes_weight_against_sum, metrics_votes_weight_abstain_sum,
          title, vote_start_timestamp, vote_end_timestamp, clock_mode, quorum, decimals
        ) VALUES
        (
          'proposal:1135:0xgovernor:101', 1135, 'lisk-dao', '0xgovernor', '0xgovernor', 1, 0,
          '101', '0xproposer', ARRAY['0xtarget'], ARRAY['0'], ARRAY['transfer(address,uint256)'], ARRAY['0x'],
          1000, 2000, 'Launch treasury program', 800, 1700000100, '0xproposal',
          2, 1, 1, 100, 25, 0, 'Launch treasury program', 1700001000, 1700002000, 'mode=blocknumber&from=default', 40, 18
        ),
        (
          'proposal:1135:0xgovernor:102', 1135, 'lisk-dao', '0xgovernor', '0xgovernor', 2, 0,
          '102', '0xother', ARRAY[]::TEXT[], ARRAY[]::TEXT[], ARRAY[]::TEXT[], ARRAY[]::TEXT[],
          1000, 2000, 'Unrelated', 801, 1700000200, '0xproposal2',
          0, 0, 0, 0, 0, 0, 'Unrelated', 1700001000, 1700002000, 'mode=blocknumber&from=default', 40, 18
        )
        "#,
    )
    .execute(pool)
    .await?;
    sqlx::query(
        r#"
        INSERT INTO vote_cast_group (
          id, chain_id, dao_code, governor_address, contract_address, log_index, transaction_index,
          proposal_id, type, voter, ref_proposal_id, support, weight, reason, params,
          block_number, block_timestamp, transaction_hash
        ) VALUES
        (
          'vote:101:1', 1135, 'lisk-dao', '0xgovernor', '0xgovernor', 3, 0,
          'proposal:1135:0xgovernor:101', 'vote-cast', '0xvoter1', '101', 1, 100, 'yes', NULL,
          805, 1700000110, '0xvote1'
        ),
        (
          'vote:101:2', 1135, 'lisk-dao', '0xgovernor', '0xgovernor', 4, 0,
          'proposal:1135:0xgovernor:101', 'vote-cast-with-params', '0xvoter2', '101', 0, 25, 'no', '0x1234',
          806, 1700000120, '0xvote2'
        )
        "#,
    )
    .execute(pool)
    .await?;
    sqlx::raw_sql(
        r#"
        INSERT INTO proposal_canceled (id, chain_id, dao_code, governor_address, proposal_id, block_number, block_timestamp, transaction_hash)
        VALUES ('cancel:101', 1135, 'lisk-dao', '0xgovernor', '101', 810, 1700000130, '0xcancel');
        INSERT INTO proposal_executed (id, chain_id, dao_code, governor_address, proposal_id, block_number, block_timestamp, transaction_hash)
        VALUES ('execute:101', 1135, 'lisk-dao', '0xgovernor', '101', 820, 1700000140, '0xexecute');
        INSERT INTO proposal_queued (id, chain_id, dao_code, governor_address, proposal_id, eta_seconds, block_number, block_timestamp, transaction_hash)
        VALUES ('queue:101', 1135, 'lisk-dao', '0xgovernor', '101', 1700000200, 815, 1700000135, '0xqueue');
        "#,
    )
    .execute(pool)
    .await?;
    sqlx::raw_sql(
        r#"
        INSERT INTO data_metric (
          id, chain_id, dao_code, governor_address, votes_count, votes_with_params_count,
          votes_without_params_count, votes_weight_for_sum, votes_weight_against_sum,
          votes_weight_abstain_sum, power_sum, member_count, proposals_count
        ) VALUES ('metric:lisk-dao', 1135, 'lisk-dao', '0xgovernor', 2, 1, 1, 100, 25, 0, 150, 2, 2);
        INSERT INTO contributor (
          id, chain_id, dao_code, governor_address, block_number, block_timestamp, transaction_hash,
          last_vote_block_number, last_vote_timestamp, power, delegates_count_all, delegates_count_effective
        ) VALUES
          ('0xvoter1', 1135, 'lisk-dao', '0xgovernor', 805, 1700000110, '0xvote1', 805, 1700000110, 100, 1, 1),
          ('0xvoter2', 1135, 'lisk-dao', '0xgovernor', 806, 1700000120, '0xvote2', 806, 1700000120, 25, 0, 0);
        INSERT INTO delegate (
          id, chain_id, dao_code, governor_address, from_delegate, to_delegate, block_number,
          block_timestamp, transaction_hash, is_current, power
        ) VALUES ('0xdelegator_0xdelegate', 1135, 'lisk-dao', '0xgovernor', '0xdelegator', '0xdelegate', 807, 1700000125, '0xdelegate', TRUE, 75);
        INSERT INTO delegate_mapping (
          id, chain_id, dao_code, governor_address, "from", "to", power, block_number,
          block_timestamp, transaction_hash
        ) VALUES ('0xdelegator', 1135, 'lisk-dao', '0xgovernor', '0xdelegator', '0xdelegate', 75, 807, 1700000125, '0xmapping');
        "#,
    )
    .execute(pool)
    .await?;
    sqlx::raw_sql(
        r#"
        INSERT INTO degov_indexer_checkpoint (
          dao_code, chain_id, stream_id, data_source_version, next_block, processed_height, target_height, updated_at
        ) VALUES ('lisk-dao', 1135, 'evm.logs', 'datalens', 901, 900, 1000, now());
        INSERT INTO squid_processor.status (id, height, hash)
        VALUES (0, 900, '0xstatus');
        "#,
    )
    .execute(pool)
    .await?;

    Ok(())
}
