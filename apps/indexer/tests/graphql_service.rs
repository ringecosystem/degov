use std::{
    env,
    error::Error,
    sync::atomic::{AtomicU64, Ordering},
};

use std::time::Duration;

use async_graphql::Request;
use degov_datalens_indexer::graphql;
use reqwest::Client;
use serde_json::json;
use sqlx::{PgPool, postgres::PgPoolOptions};
use tokio::sync::{Mutex, MutexGuard};
use tokio::time::timeout;

const SCHEMA_SQL: &str = include_str!("../schema/postgres.sql");
const CONTRACT_SET_ID: &str = "dao=lisk-dao|chain=1135|datalens_chain=lisk|dataset=evm.logs|governor=0xgovernor|token=0xtoken|token_standard=erc20|timelock=0xtimelock";
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
            query Compatibility(
              $where: ProposalWhereInput
              $voter: String
              $canceledWhere: ProposalCanceledWhereInput
              $executedWhere: ProposalExecutedWhereInput
              $queuedWhere: ProposalQueuedWhereInput
            ) {
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
              proposalCanceleds(where: $canceledWhere) { proposalId blockTimestamp }
              proposalExecuteds(where: $executedWhere) { proposalId blockTimestamp }
              proposalQueueds(where: $queuedWhere) { proposalId etaSeconds }
              dataMetrics(where: { id_eq: "global" }) {
                proposalsCount
                votesCount
                votesWeightForSum
                powerSum
                memberCount
              }
              dataMetricsConnection(where: { votesCount_eq: 1 }, orderBy: id_ASC) { totalCount }
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
              proposalsConnection(where: $where, orderBy: id_ASC) { totalCount }
              contributorsConnection(orderBy: id_ASC) { totalCount }
              delegatesConnection(where: { fromDelegate_eq: "0xdelegator" }, orderBy: [id_ASC]) { totalCount }
              delegateMappingsConnection(where: { from_eq: "0xdelegator" }, orderBy: [id_ASC]) { totalCount }
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
            "canceledWhere": { "proposalId_eq": "101" },
            "executedWhere": { "proposalId_eq": "101" },
            "queuedWhere": { "proposalId_eq": "101" },
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
    // PR #768 changes proposal id/FK semantics; keep this nested voter assertion
    // in the revalidation set after that branch lands.
    assert_eq!(data["proposals"][0]["voters"][0]["voter"], "0xvoter1");
    assert_eq!(data["proposals"][0]["voters"][0]["weight"], "100");
    assert_eq!(data["proposalQueueds"][0]["etaSeconds"], "1700000200");
    assert_eq!(data["dataMetrics"][0]["powerSum"], "150");
    assert_eq!(data["dataMetricsConnection"]["totalCount"], 1);
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

#[tokio::test(flavor = "multi_thread")]
async fn test_graphql_schema_accepts_current_web_event_where_type_names()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    let schema = graphql::build_schema(database.pool.clone());

    let response = schema
        .execute(
            Request::new(
                r#"
                query EventWhereTypes(
                  $canceledWhere: ProposalCanceledWhereInput
                  $executedWhere: ProposalExecutedWhereInput
                  $queuedWhere: ProposalQueuedWhereInput
                ) {
                  proposalCanceleds(where: $canceledWhere) { proposalId }
                  proposalExecuteds(where: $executedWhere) { proposalId }
                  proposalQueueds(where: $queuedWhere) { proposalId etaSeconds }
                }
                "#,
            )
            .variables(async_graphql::Variables::from_json(json!({
                "canceledWhere": { "proposalId_eq": "101" },
                "executedWhere": { "proposalId_eq": "101" },
                "queuedWhere": { "proposalId_eq": "101" }
            }))),
        )
        .await;

    assert!(
        response.errors.is_empty(),
        "unexpected GraphQL errors: {:?}",
        response.errors
    );

    let data = response.data.into_json()?;
    assert_eq!(data["proposalCanceleds"][0]["proposalId"], "101");
    assert_eq!(data["proposalExecuteds"][0]["proposalId"], "101");
    assert_eq!(data["proposalQueueds"][0]["etaSeconds"], "1700000200");

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_graphql_data_metrics_parity_fields_filters_and_ordering() -> Result<(), Box<dyn Error>>
{
    let database = TestDatabase::connect().await?;
    let schema = graphql::build_schema(database.pool.clone());

    let response = schema
        .execute(Request::new(
            r#"
            query MetricParity {
              dataMetrics(orderBy: id_ASC, limit: 3) {
                id
                chainId
                daoCode
                governorAddress
                tokenAddress
                contractAddress
                logIndex
                transactionIndex
                proposalsCount
                votesCount
                votesWithParamsCount
                votesWithoutParamsCount
                votesWeightForSum
                votesWeightAgainstSum
                votesWeightAbstainSum
                powerSum
                memberCount
              }
              proposalMetrics: dataMetrics(where: { proposalsCount_eq: 1 }, orderBy: id_ASC) {
                id
                proposalsCount
                votesCount
              }
              voteMetrics: dataMetrics(where: { votesCount_eq: 1 }, orderBy: id_ASC) {
                id
                votesCount
                votesWithoutParamsCount
              }
              globalMetric: dataMetrics(where: { id_eq: "global" }) {
                id
                powerSum
                memberCount
                proposalsCount
                votesCount
              }
              dataMetricsConnection(orderBy: id_ASC) { totalCount }
            }
            "#,
        ))
        .await;

    assert!(
        response.errors.is_empty(),
        "unexpected GraphQL errors: {:?}",
        response.errors
    );

    let data = response.data.into_json()?;
    assert_eq!(data["dataMetricsConnection"]["totalCount"], 3);
    assert_eq!(data["dataMetrics"][0]["id"], "0000000800-proposal");
    assert_eq!(data["dataMetrics"][1]["id"], "0000000805-vote");
    assert_eq!(data["dataMetrics"][2]["id"], "global");
    assert_eq!(data["dataMetrics"][0]["contractAddress"], "0xgovernor");
    assert_eq!(data["dataMetrics"][0]["logIndex"], 1);
    assert_eq!(data["dataMetrics"][0]["transactionIndex"], 0);
    assert_eq!(data["proposalMetrics"][0]["id"], "0000000800-proposal");
    assert_eq!(data["proposalMetrics"][0]["votesCount"], 0);
    assert_eq!(data["voteMetrics"][0]["id"], "0000000805-vote");
    assert_eq!(data["voteMetrics"][0]["votesWithoutParamsCount"], 1);
    assert_eq!(data["globalMetric"][0]["id"], "global");
    assert_eq!(data["globalMetric"][0]["powerSum"], "150");

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_graphql_data_metrics_returns_scoped_global_rows() -> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    sqlx::query(
        "INSERT INTO data_metric (
            id, contract_set_id, chain_id, dao_code, governor_address, proposals_count, votes_count,
            power_sum, member_count
         )
         VALUES ('global', 'other-scope', 10, 'other-dao', '0xothergovernor', 7, 9, 700, 3)",
    )
    .execute(&database.pool)
    .await?;
    let schema = graphql::build_schema(database.pool.clone());

    let response = schema
        .execute(
            Request::new(
                r#"
                query ScopedGlobals($lisk: DataMetricWhereInput, $other: DataMetricWhereInput) {
                  lisk: dataMetrics(where: $lisk) {
                    id
                    chainId
                    daoCode
                    governorAddress
                    proposalsCount
                    votesCount
                    powerSum
                    memberCount
                  }
                  other: dataMetrics(where: $other) {
                    id
                    chainId
                    daoCode
                    governorAddress
                    proposalsCount
                    votesCount
                    powerSum
                    memberCount
                  }
                }
                "#,
            )
            .variables(async_graphql::Variables::from_json(json!({
                "lisk": {
                    "id_eq": "global",
                    "chainId_eq": 1135,
                    "governorAddress_eq": "0xgovernor",
                    "daoCode_eq": "lisk-dao"
                },
                "other": {
                    "id_eq": "global",
                    "chainId_eq": 10,
                    "governorAddress_eq": "0xothergovernor",
                    "daoCode_eq": "other-dao"
                }
            }))),
        )
        .await;

    assert!(
        response.errors.is_empty(),
        "unexpected GraphQL errors: {:?}",
        response.errors
    );

    let data = response.data.into_json()?;
    assert_eq!(data["lisk"].as_array().expect("lisk rows").len(), 1);
    assert_eq!(data["other"].as_array().expect("other rows").len(), 1);
    assert_eq!(data["lisk"][0]["daoCode"], "lisk-dao");
    assert_eq!(data["lisk"][0]["proposalsCount"], 2);
    assert_eq!(data["other"][0]["daoCode"], "other-dao");
    assert_eq!(data["other"][0]["proposalsCount"], 7);
    assert_eq!(data["other"][0]["powerSum"], "700");

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_graphql_http_endpoint_serves_post_requests() -> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    let schema = graphql::build_schema(database.pool.clone());
    let app = graphql::build_router(schema);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let endpoint = format!("http://{}/graphql", listener.local_addr()?);
    let server = tokio::spawn(async move { axum::serve(listener, app).await });

    let response: serde_json::Value = timeout(
        Duration::from_secs(5),
        Client::new()
            .post(endpoint)
            .json(&json!({
                "query": "query { squidStatus { height finalizedHeight hash finalizedHash } }"
            }))
            .send(),
    )
    .await??
    .json()
    .await?;

    assert_eq!(response["data"]["squidStatus"]["height"], 900);
    assert_eq!(response["data"]["squidStatus"]["finalizedHeight"], 900);

    server.abort();
    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_graphql_schema_serves_indexer_accuracy_audit_queries() -> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    let schema = graphql::build_schema(database.pool.clone());

    let request = Request::new(
        r#"
            query AccuracyAudit($limit: Int!, $offset: Int!) {
              contributors(limit: $limit, offset: $offset, orderBy: [power_DESC]) {
                id
                power
                balance
                delegatesCountAll
                lastVoteTimestamp
                blockNumber
              }
              delegates(limit: $limit, offset: $offset, orderBy: [power_ASC], where: { power_lt: 0 }) {
                id
                fromDelegate
                toDelegate
                power
              }
              negativeDelegateMatches: delegates(
                limit: $limit
                orderBy: [power_ASC]
                where: { OR: [{ toDelegate_eq: "0xdelegate", power_lt: 0 }, { fromDelegate_eq: "0xdelegator", power_lt: 0 }] }
              ) {
                id
                power
              }
            }
            "#,
    )
    .variables(async_graphql::Variables::from_json(json!({
        "limit": 100,
        "offset": 0
    })));
    let response = schema.execute(request).await;

    assert!(
        response.errors.is_empty(),
        "unexpected GraphQL errors: {:?}",
        response.errors
    );

    let data = response.data.into_json()?;
    assert_eq!(data["contributors"][0]["id"], "0xvoter1");
    assert_eq!(data["contributors"][0]["balance"], "10");
    assert_eq!(data["delegates"].as_array().unwrap().len(), 0);
    assert_eq!(data["negativeDelegateMatches"].as_array().unwrap().len(), 0);

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_graphql_http_endpoint_serves_configured_dao_path() -> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    let schema = graphql::build_schema(database.pool.clone());
    let app = graphql::build_router_with_paths(schema, ["/degov-demo-dao/graphql".to_owned()]);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let endpoint = format!("http://{}/degov-demo-dao/graphql", listener.local_addr()?);
    let server = tokio::spawn(async move { axum::serve(listener, app).await });

    let response: serde_json::Value = timeout(
        Duration::from_secs(5),
        Client::new()
            .post(endpoint)
            .json(&json!({
                "query": "query { squidStatus { height finalizedHeight hash finalizedHash } }"
            }))
            .send(),
    )
    .await??
    .json()
    .await?;

    assert_eq!(response["data"]["squidStatus"]["height"], 900);

    server.abort();
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
          id, contract_set_id, chain_id, dao_code, governor_address, contract_address, log_index, transaction_index,
          proposal_id, type, voter, ref_proposal_id, support, weight, reason, params,
          block_number, block_timestamp, transaction_hash
        ) VALUES
        (
          'vote:101:1', $1, 1135, 'lisk-dao', '0xgovernor', '0xgovernor', 3, 0,
          'proposal:1135:0xgovernor:101', 'vote-cast', '0xvoter1', '101', 1, 100, 'yes', NULL,
          805, 1700000110, '0xvote1'
        ),
        (
          'vote:101:2', $1, 1135, 'lisk-dao', '0xgovernor', '0xgovernor', 4, 0,
          'proposal:1135:0xgovernor:101', 'vote-cast-with-params', '0xvoter2', '101', 0, 25, 'no', '0x1234',
          806, 1700000120, '0xvote2'
        )
        "#,
    )
    .bind(CONTRACT_SET_ID)
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
    sqlx::query(
        r#"
        INSERT INTO data_metric (
          id, contract_set_id, chain_id, dao_code, governor_address, votes_count, votes_with_params_count,
          votes_without_params_count, votes_weight_for_sum, votes_weight_against_sum,
          votes_weight_abstain_sum, power_sum, member_count, proposals_count
        ) VALUES
          ('global', $1, 1135, 'lisk-dao', '0xgovernor', 2, 1, 1, 100, 25, 0, 150, 2, 2),
          ('0000000800-proposal', $1, 1135, 'lisk-dao', '0xgovernor', 0, 0, 0, 0, 0, 0, 150, 2, 1),
          ('0000000805-vote', $1, 1135, 'lisk-dao', '0xgovernor', 1, 0, 1, 100, 0, 0, 150, 2, 0);
        UPDATE data_metric
        SET contract_address = '0xgovernor', log_index = 1, transaction_index = 0
        WHERE contract_set_id = $1 AND id = '0000000800-proposal';
        UPDATE data_metric
        SET contract_address = '0xgovernor', log_index = 3, transaction_index = 0
        WHERE contract_set_id = $1 AND id = '0000000805-vote';
        "#,
    )
    .bind(CONTRACT_SET_ID)
    .execute(pool)
    .await?;
    sqlx::query(
        r#"
        INSERT INTO contributor (
          id, contract_set_id, chain_id, dao_code, governor_address, block_number, block_timestamp, transaction_hash,
          last_vote_block_number, last_vote_timestamp, power, balance, delegates_count_all, delegates_count_effective
        ) VALUES
          ('0xvoter1', $1, 1135, 'lisk-dao', '0xgovernor', 805, 1700000110, '0xvote1', 805, 1700000110, 100, 10, 1, 1),
          ('0xvoter2', $1, 1135, 'lisk-dao', '0xgovernor', 806, 1700000120, '0xvote2', 806, 1700000120, 25, 5, 0, 0)
        "#,
    )
    .bind(CONTRACT_SET_ID)
    .execute(pool)
    .await?;
    sqlx::query(
        r#"
        INSERT INTO delegate (
          id, contract_set_id, chain_id, dao_code, governor_address, from_delegate, to_delegate, block_number,
          block_timestamp, transaction_hash, is_current, power
        ) VALUES ('0xdelegator_0xdelegate', $1, 1135, 'lisk-dao', '0xgovernor', '0xdelegator', '0xdelegate', 807, 1700000125, '0xdelegate', TRUE, 75)
        "#,
    )
    .bind(CONTRACT_SET_ID)
    .execute(pool)
    .await?;
    sqlx::query(
        r#"
        INSERT INTO delegate_mapping (
          id, contract_set_id, chain_id, dao_code, governor_address, "from", "to", power, block_number,
          block_timestamp, transaction_hash
        ) VALUES ('0xdelegator', $1, 1135, 'lisk-dao', '0xgovernor', '0xdelegator', '0xdelegate', 75, 807, 1700000125, '0xmapping')
        "#,
    )
    .bind(CONTRACT_SET_ID)
    .execute(pool)
    .await?;
    sqlx::query(
        r#"
        INSERT INTO degov_indexer_checkpoint (
          dao_code, chain_id, contract_set_id, stream_id, data_source_version, next_block, processed_height, target_height, updated_at
        ) VALUES ('lisk-dao', 1135, $1, 'evm.logs', 'datalens', 901, 900, 1000, now())
        "#,
    )
    .bind(CONTRACT_SET_ID)
    .execute(pool)
    .await?;
    sqlx::raw_sql(
        r#"
        INSERT INTO squid_processor.status (id, height, hash)
        VALUES (0, 900, '0xstatus');
        "#,
    )
    .execute(pool)
    .await?;

    Ok(())
}
