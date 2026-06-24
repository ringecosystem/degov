use std::{
    env,
    error::Error,
    sync::atomic::{AtomicU64, Ordering},
};

use std::time::Duration;

use async_graphql::Request;
use degov_datalens_indexer::{graphql, runtime::apply_migrations};
use reqwest::Client;
use serde_json::json;
use sqlx::{PgPool, postgres::PgPoolOptions};
use tokio::sync::{Mutex, MutexGuard};
use tokio::time::timeout;

const CONTRACT_SET_ID: &str = "dao=lisk-dao|chain=1135|datalens_chain=lisk|dataset=evm.logs|governor=0xgovernor|token=0xtoken|token_standard=erc20|timelock=0xtimelock";
const OTHER_CONTRACT_SET_ID: &str = "dao=ens-dao|chain=10|datalens_chain=ethereum|dataset=evm.logs|governor=0xensgovernor|token=0xenstoken|token_standard=erc20";
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
        apply_migrations(&pool).await?;
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
                voteStartTimestamp
                voteEndTimestamp
                blockInterval
                quorum
                decimals
                timelockAddress
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
                contributorCount
                holdersCount
                memberCount
              }
              dataMetricsPage(where: { votesCount_eq: 1 }, orderBy: id_ASC, limit: 0, offset: 2) {
                totalCount
                offset
                limit
                items { id }
              }
              contributors(where: { OR: [{ id_eq: "0xvoter1" }, { power_lt: 50 }] }, orderBy: [power_DESC]) {
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
              proposalsPage(where: $where, orderBy: id_ASC, limit: 1, offset: 0) {
                totalCount
                offset
                limit
                items { id }
              }
              contributorsPage(orderBy: id_ASC, limit: 1, offset: 1) {
                totalCount
                offset
                limit
                items { id }
              }
              contributorsWithDelegatorsPage: contributorsPage(
                where: { delegatesCountAll_gt: 0 }
                orderBy: id_ASC
                limit: 1
                offset: 0
              ) {
                totalCount
                offset
                limit
                items { id delegatesCountAll }
              }
              delegatesPage(where: { fromDelegate_eq: "0xdelegator" }, orderBy: [id_ASC], limit: 1, offset: 0) {
                totalCount
                offset
                limit
                items { id }
              }
              delegateProfilesCount
              delegateMappingsPage(where: { from_eq: "0xdelegator" }, orderBy: [id_ASC], limit: 1, offset: 0) {
                totalCount
                offset
                limit
                items { id to power }
              }
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
    assert_eq!(data["proposals"][0]["proposalId"], "0x65");
    assert_eq!(data["proposals"][0]["blockTimestamp"], "1700000100000");
    assert_eq!(data["proposals"][0]["voteStartTimestamp"], "1700001000000");
    assert_eq!(data["proposals"][0]["voteEndTimestamp"], "1700002000000");
    assert_eq!(data["proposals"][0]["blockInterval"], "12");
    assert_eq!(data["proposals"][0]["quorum"], "40");
    assert_eq!(data["proposals"][0]["decimals"], "18");
    assert_eq!(data["proposals"][0]["timelockAddress"], "0xtimelock");
    assert_eq!(data["proposals"][0]["metricsVotesWeightForSum"], "100");
    // PR #768 changes proposal id/FK semantics; keep this nested voter assertion
    // in the revalidation set after that branch lands.
    assert_eq!(data["proposals"][0]["voters"][0]["voter"], "0xvoter1");
    assert_eq!(data["proposals"][0]["voters"][0]["weight"], "100");
    assert_eq!(
        data["proposals"][0]["voters"][0]["blockTimestamp"],
        "1700000110000"
    );
    assert_eq!(data["proposalQueueds"][0]["etaSeconds"], "1700000200");
    assert_eq!(data["proposalCanceleds"][0]["proposalId"], "0x65");
    assert_eq!(
        data["proposalCanceleds"][0]["blockTimestamp"],
        "1700000130000"
    );
    assert_eq!(data["proposalExecuteds"][0]["proposalId"], "0x65");
    assert_eq!(data["dataMetrics"][0]["powerSum"], "150");
    assert_eq!(data["dataMetrics"][0]["contributorCount"], 3);
    assert_eq!(data["dataMetrics"][0]["holdersCount"], 2);
    assert_eq!(data["dataMetrics"][0]["memberCount"], 9);
    assert_eq!(data["dataMetricsPage"]["totalCount"], 1);
    assert_eq!(data["dataMetricsPage"]["offset"], 2);
    assert_eq!(data["dataMetricsPage"]["limit"], 0);
    assert_eq!(
        data["dataMetricsPage"]["items"]
            .as_array()
            .expect("items")
            .len(),
        0
    );
    assert_eq!(data["contributors"][0]["id"], "0xvoter1");
    assert_eq!(data["delegates"][0]["isCurrent"], true);
    assert_eq!(data["delegateMappings"][0]["to"], "0xdelegate");
    assert_eq!(data["proposalsPage"]["totalCount"], 1);
    assert_eq!(data["proposalsPage"]["offset"], 0);
    assert_eq!(data["proposalsPage"]["limit"], 1);
    assert_eq!(
        data["proposalsPage"]["items"]
            .as_array()
            .expect("items")
            .len(),
        1
    );
    assert_eq!(data["contributorsPage"]["totalCount"], 2);
    assert_eq!(data["contributorsPage"]["offset"], 1);
    assert_eq!(data["contributorsPage"]["limit"], 1);
    assert_eq!(
        data["contributorsPage"]["items"]
            .as_array()
            .expect("items")
            .len(),
        1
    );
    assert_eq!(data["contributorsWithDelegatorsPage"]["totalCount"], 1);
    assert_eq!(data["contributorsWithDelegatorsPage"]["offset"], 0);
    assert_eq!(data["contributorsWithDelegatorsPage"]["limit"], 1);
    assert_eq!(
        data["contributorsWithDelegatorsPage"]["items"][0]["id"],
        "0xvoter1"
    );
    assert_eq!(
        data["contributorsWithDelegatorsPage"]["items"][0]["delegatesCountAll"],
        1
    );
    assert_eq!(data["delegatesPage"]["totalCount"], 1);
    assert_eq!(data["delegatesPage"]["offset"], 0);
    assert_eq!(data["delegatesPage"]["limit"], 1);
    assert_eq!(data["delegateProfilesCount"], 2);
    assert_eq!(data["delegateMappingsPage"]["totalCount"], 1);
    assert_eq!(data["delegateMappingsPage"]["offset"], 0);
    assert_eq!(data["delegateMappingsPage"]["limit"], 1);
    assert_eq!(data["delegateMappingsPage"]["items"][0]["to"], "0xdelegate");

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_graphql_schema_rejects_removed_connection_fields() -> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    let schema = graphql::build_schema(database.pool.clone());

    let response = schema
        .execute(Request::new(
            r#"
            query RemovedConnections {
              proposalsConnection { totalCount }
            }
            "#,
        ))
        .await;

    assert!(
        !response.errors.is_empty(),
        "expected GraphQL error for removed proposalsConnection field"
    );

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
                "canceledWhere": { "proposalId_eq": "0x65" },
                "executedWhere": { "proposalId_eq": "0x65" },
                "queuedWhere": { "proposalId_eq": "0x65" }
            }))),
        )
        .await;

    assert!(
        response.errors.is_empty(),
        "unexpected GraphQL errors: {:?}",
        response.errors
    );

    let data = response.data.into_json()?;
    assert_eq!(data["proposalCanceleds"][0]["proposalId"], "0x65");
    assert_eq!(data["proposalExecuteds"][0]["proposalId"], "0x65");
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
                contributorCount
                holdersCount
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
                contributorCount
                holdersCount
                memberCount
                proposalsCount
                votesCount
              }
              dataMetricsPage(orderBy: id_ASC, limit: 0) { totalCount offset limit items { id } }
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
    assert_eq!(data["dataMetricsPage"]["totalCount"], 3);
    assert_eq!(data["dataMetricsPage"]["offset"], 0);
    assert_eq!(data["dataMetricsPage"]["limit"], 0);
    assert_eq!(
        data["dataMetricsPage"]["items"]
            .as_array()
            .expect("items")
            .len(),
        0
    );
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
    assert_eq!(data["globalMetric"][0]["contributorCount"], 3);
    assert_eq!(data["globalMetric"][0]["holdersCount"], 2);
    assert_eq!(data["globalMetric"][0]["memberCount"], 9);

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_graphql_data_metrics_returns_scoped_global_rows() -> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    sqlx::query(
        "INSERT INTO data_metric (
            id, contract_set_id, chain_id, dao_code, governor_address, proposals_count, votes_count,
            power_sum, contributor_count, holders_count, member_count
         )
         VALUES ('global', 'other-scope', 10, 'other-dao', '0xothergovernor', 7, 9, 700, 5, 3, 3)",
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
                    contributorCount
                    holdersCount
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
                    contributorCount
                    holdersCount
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
    assert_eq!(data["other"][0]["contributorCount"], 5);
    assert_eq!(data["other"][0]["holdersCount"], 3);
    assert_eq!(data["other"][0]["memberCount"], 3);

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
                "query": "query { indexerStatus { processedHeight targetHeight } }"
            }))
            .send(),
    )
    .await??
    .json()
    .await?;

    assert_eq!(response["data"]["indexerStatus"]["processedHeight"], 900);
    assert_eq!(response["data"]["indexerStatus"]["targetHeight"], 1000);

    server.abort();
    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_graphql_http_endpoint_serves_graphiql_on_dedicated_path() -> Result<(), Box<dyn Error>>
{
    let database = TestDatabase::connect().await?;
    let schema = graphql::build_schema(database.pool.clone());
    let app = graphql::build_router(schema);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let graphql_endpoint = format!("http://{}/graphql", listener.local_addr()?);
    let graphiql_endpoint = format!("http://{}/graphiql", listener.local_addr()?);
    let server = tokio::spawn(async move { axum::serve(listener, app).await });

    let response = timeout(
        Duration::from_secs(5),
        Client::new().get(graphql_endpoint).send(),
    )
    .await??;
    assert_eq!(response.status().as_u16(), 405);

    let response = timeout(
        Duration::from_secs(5),
        Client::new().get(graphiql_endpoint).send(),
    )
    .await??;
    assert!(response.status().is_success());
    let body = response.text().await?;
    assert!(body.contains("GraphiQL"));
    assert!(body.contains("/graphql"));
    assert!(body.contains("graphiql@3.9.0"));
    assert!(body.contains("@graphiql/plugin-explorer@3.0.0"));
    assert!(body.contains("GraphiQLPluginExplorer.explorerPlugin"));

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
async fn test_graphql_power_fields_prefer_provisional_overlay_and_fallback_to_final()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    seed_power_overlay_rows(&database.pool).await?;
    let schema = graphql::build_schema(database.pool.clone());

    let request = Request::new(
        r#"
            query LivePowerOverlay {
              contributors(where: { id_in: ["0xvoter1", "0xvoter2"] }, orderBy: [id_ASC]) {
                id
                power
              }
              delegates(where: { toDelegate_eq: "0xdelegate" }) {
                id
                power
              }
            }
            "#,
    );
    let response = schema.execute(request).await;

    assert!(
        response.errors.is_empty(),
        "unexpected GraphQL errors: {:?}",
        response.errors
    );

    let data = serde_json::to_value(response.data)?;
    assert_eq!(data["contributors"][0]["id"], "0xvoter1");
    assert_eq!(data["contributors"][0]["power"], "999");
    assert_eq!(data["contributors"][1]["id"], "0xvoter2");
    assert_eq!(data["contributors"][1]["power"], "25");
    assert_eq!(data["delegates"][0]["power"], "888");

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_graphql_contributors_power_desc_uses_live_overlay_with_stable_pagination()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    seed_power_overlay_rows(&database.pool).await?;
    seed_contributor_power_order_rows(&database.pool).await?;
    let schema = graphql::build_schema(database.pool.clone());

    let request = Request::new(
        r#"
            query ContributorPowerOrder {
              firstPage: contributors(
                where: {
                  chainId_eq: 1135
                  governorAddress_eq: "0xgovernor"
                  daoCode_eq: "lisk-dao"
                  id_not_eq: "0xbot"
                }
                orderBy: [power_DESC]
                limit: 3
              ) {
                id
                power
              }
              secondPage: contributors(
                where: {
                  chainId_eq: 1135
                  governorAddress_eq: "0xgovernor"
                  daoCode_eq: "lisk-dao"
                  id_not_eq: "0xbot"
                }
                orderBy: [power_DESC]
                limit: 2
                offset: 2
              ) {
                id
                power
              }
            }
            "#,
    );
    let response = schema.execute(request).await;

    assert!(
        response.errors.is_empty(),
        "unexpected GraphQL errors: {:?}",
        response.errors
    );

    let data = serde_json::to_value(response.data)?;
    assert_eq!(data["firstPage"][0]["id"], "0xoverlay-top");
    assert_eq!(data["firstPage"][0]["power"], "1000");
    assert_eq!(data["firstPage"][1]["id"], "0xvoter1");
    assert_eq!(data["firstPage"][1]["power"], "999");
    assert_eq!(data["firstPage"][2]["id"], "0xbase-top");
    assert_eq!(data["firstPage"][2]["power"], "900");
    assert_eq!(data["secondPage"][0]["id"], "0xbase-top");
    assert_eq!(data["secondPage"][1]["id"], "0xbase-tie-a");

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_graphql_contributors_power_desc_errors_when_cap_cannot_prove_pagination()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    seed_many_contributor_power_rows(&database.pool).await?;
    let schema = graphql::build_schema(database.pool.clone());

    let request = Request::new(
        r#"
            query ContributorPowerOrder {
              contributors(
                where: {
                  chainId_eq: 1135
                  governorAddress_eq: "0xgovernor"
                  daoCode_eq: "lisk-dao"
                }
                orderBy: [power_DESC]
                limit: 1
                offset: 20000
              ) {
                id
                power
              }
            }
            "#,
    );
    let response = schema.execute(request).await;

    assert_eq!(response.errors.len(), 1);
    assert!(
        response.errors[0]
            .message
            .contains("could not prove exact pagination"),
        "unexpected GraphQL errors: {:?}",
        response.errors
    );

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_graphql_proposal_fields_prefer_provisional_overlay_and_fallback_to_final()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    seed_proposal_overlay_rows(&database.pool).await?;
    let schema = graphql::build_schema(database.pool.clone());

    let request = Request::new(
        r#"
            query LiveProposalOverlay {
              proposals(orderBy: [id_ASC]) {
                proposalId
                title
                description
                descriptionHash
                proposalEta
                queueReadyAt
                queueExpiresAt
                timelockAddress
                timelockGracePeriod
              }
              liveDetail: proposals(where: { proposalId_eq: "101" }) {
                proposalId
                title
                proposalEta
              }
              fallbackDetail: proposals(where: { proposalId_eq: "102" }) {
                proposalId
                title
                proposalEta
              }
            }
            "#,
    );
    let response = schema.execute(request).await;

    assert!(
        response.errors.is_empty(),
        "unexpected GraphQL errors: {:?}",
        response.errors
    );

    let data = response.data.into_json()?;
    assert_eq!(data["proposals"][0]["proposalId"], "0x65");
    assert_eq!(data["proposals"][0]["title"], "Live launch title");
    assert_eq!(
        data["proposals"][0]["description"],
        "Live launch description"
    );
    assert!(data["proposals"][0]["descriptionHash"].is_null());
    assert_eq!(data["proposals"][0]["proposalEta"], "1700000300");
    assert_eq!(data["proposals"][0]["queueReadyAt"], "1700000300000");
    assert_eq!(data["proposals"][0]["queueExpiresAt"], "1700000900000");
    assert_eq!(data["proposals"][0]["timelockAddress"], "0xtimelock");
    assert_eq!(data["proposals"][0]["timelockGracePeriod"], "600");
    assert_eq!(data["proposals"][1]["proposalId"], "0x66");
    assert_eq!(data["proposals"][1]["title"], "Unrelated");
    assert_eq!(data["liveDetail"][0]["proposalEta"], "1700000300");
    assert_eq!(data["fallbackDetail"][0]["title"], "Unrelated");
    assert!(data["fallbackDetail"][0]["proposalEta"].is_null());

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_graphql_schema_applies_implicit_scope_to_queries_and_pages()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    seed_other_scope_rows(&database.pool).await?;
    let schema = graphql::build_schema_with_scope(
        database.pool.clone(),
        graphql::GraphqlScope {
            dao_code: Some("lisk-dao".to_owned()),
            chain_id: Some(1135),
            governor_address: Some("0xgovernor".to_owned()),
            contract_set_id: Some(CONTRACT_SET_ID.to_owned()),
        },
    );

    let response = schema
        .execute(Request::new(
            r#"
            query ScopedQueries {
              proposals(orderBy: [id_ASC]) {
                proposalId
                daoCode
                voters(orderBy: [id_ASC]) { voter }
              }
              proposalCanceleds(orderBy: [id_ASC]) { proposalId }
              proposalExecuteds(orderBy: [id_ASC]) { proposalId }
              proposalQueueds(orderBy: [id_ASC]) { proposalId etaSeconds }
              dataMetrics(orderBy: id_ASC) { id daoCode }
              contributors(orderBy: [id_ASC]) { id daoCode }
              delegates(orderBy: [id_ASC]) { id daoCode }
              delegateMappings(orderBy: [id_ASC]) { id daoCode }
              proposalsPage { totalCount offset limit items { id } }
              dataMetricsPage { totalCount offset limit items { id } }
              contributorsPage { totalCount offset limit items { id } }
              delegatesPage(where: { isCurrent_eq: true }) { totalCount offset limit items { id } }
              delegateMappingsPage { totalCount offset limit items { id } }
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
    assert_eq!(data["proposals"].as_array().expect("proposals").len(), 2);
    assert_eq!(data["proposals"][0]["daoCode"], "lisk-dao");
    assert_eq!(
        data["proposals"][0]["voters"]
            .as_array()
            .expect("voters")
            .len(),
        2
    );
    assert_eq!(
        data["proposalCanceleds"]
            .as_array()
            .expect("canceled")
            .len(),
        1
    );
    assert_eq!(
        data["proposalExecuteds"]
            .as_array()
            .expect("executed")
            .len(),
        1
    );
    assert_eq!(data["proposalQueueds"].as_array().expect("queued").len(), 1);
    assert_eq!(data["dataMetricsPage"]["totalCount"], 3);
    assert_eq!(data["contributorsPage"]["totalCount"], 2);
    assert_eq!(data["delegatesPage"]["totalCount"], 1);
    assert_eq!(data["delegateMappingsPage"]["totalCount"], 1);
    assert_eq!(data["proposalsPage"]["totalCount"], 2);
    assert_eq!(data["proposalsPage"]["offset"], 0);
    assert_eq!(data["proposalsPage"]["limit"], 20);
    assert_eq!(
        data["proposalsPage"]["items"]
            .as_array()
            .expect("items")
            .len(),
        2
    );
    assert_eq!(data["dataMetrics"][0]["daoCode"], "lisk-dao");
    assert_eq!(data["contributors"][0]["daoCode"], "lisk-dao");
    assert_eq!(data["delegates"][0]["daoCode"], "lisk-dao");
    assert_eq!(data["delegateMappings"][0]["daoCode"], "lisk-dao");

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_graphql_schema_exposes_checkpoint_statuses_with_implicit_scope()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    seed_other_scope_checkpoint(&database.pool).await?;

    let admin_schema = graphql::build_schema(database.pool.clone());
    let admin_response = admin_schema
        .execute(Request::new(
            r#"
            query AdminStatuses {
              indexerStatuses {
                daoCode
                chainId
                contractSetId
                processedHeight
                provisionalHeight
                targetHeight
                syncedPercentage
                isSynced
                updatedAt
                lastError
              }
            }
            "#,
        ))
        .await;

    assert!(
        admin_response.errors.is_empty(),
        "unexpected GraphQL errors: {:?}",
        admin_response.errors
    );

    let admin_data = admin_response.data.into_json()?;
    let statuses = admin_data["indexerStatuses"]
        .as_array()
        .expect("admin statuses");
    assert_eq!(statuses.len(), 2);
    assert_eq!(statuses[0]["daoCode"], "ens-dao");
    assert_eq!(statuses[0]["processedHeight"], 1200);
    assert_eq!(statuses[0]["provisionalHeight"], serde_json::Value::Null);
    assert_eq!(statuses[0]["targetHeight"], 1200);
    assert_eq!(statuses[0]["syncedPercentage"], 100.0);
    assert_eq!(statuses[0]["isSynced"], true);
    assert_eq!(statuses[0]["lastError"], "caught up after retry");
    assert_eq!(statuses[1]["daoCode"], "lisk-dao");
    assert_eq!(statuses[1]["processedHeight"], 900);
    assert_eq!(statuses[1]["provisionalHeight"], 1115);
    assert_eq!(statuses[1]["targetHeight"], 1000);
    assert_eq!(statuses[1]["syncedPercentage"], 90.0);
    assert_eq!(statuses[1]["isSynced"], false);
    assert_eq!(statuses[1]["lastError"], serde_json::Value::Null);

    let scoped_schema = graphql::build_schema_with_scope(
        database.pool.clone(),
        graphql::GraphqlScope {
            dao_code: Some("lisk-dao".to_owned()),
            chain_id: Some(1135),
            governor_address: Some("0xgovernor".to_owned()),
            contract_set_id: Some(CONTRACT_SET_ID.to_owned()),
        },
    );
    let scoped_response = scoped_schema
        .execute(Request::new(
            r#"
            query ScopedStatus {
              indexerStatus {
                daoCode
                chainId
                contractSetId
                processedHeight
                provisionalHeight
                targetHeight
                syncedPercentage
                isSynced
                updatedAt
                lastError
              }
              indexerStatuses {
                daoCode
                processedHeight
              }
            }
            "#,
        ))
        .await;

    assert!(
        scoped_response.errors.is_empty(),
        "unexpected GraphQL errors: {:?}",
        scoped_response.errors
    );

    let scoped_data = scoped_response.data.into_json()?;
    assert_eq!(scoped_data["indexerStatus"]["daoCode"], "lisk-dao");
    assert_eq!(scoped_data["indexerStatus"]["processedHeight"], 900);
    assert_eq!(scoped_data["indexerStatus"]["provisionalHeight"], 1115);
    assert_eq!(scoped_data["indexerStatus"]["targetHeight"], 1000);
    assert_eq!(scoped_data["indexerStatus"]["syncedPercentage"], 90.0);
    assert_eq!(scoped_data["indexerStatus"]["isSynced"], false);
    assert_eq!(
        scoped_data["indexerStatuses"]
            .as_array()
            .expect("scoped statuses")
            .len(),
        1
    );

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_graphql_schema_rejects_removed_squid_status_compatibility()
-> Result<(), Box<dyn Error>> {
    let pool = PgPoolOptions::new().connect_lazy("postgres://localhost/degov")?;
    let schema = graphql::build_schema(pool);
    let sdl = schema.sdl();
    let removed_field = "squid".to_owned() + "Status";
    let removed_type = "type ".to_owned() + "Squid" + "Status";

    assert!(
        !sdl.contains(&removed_field),
        "schema still exposes removed status field:\n{sdl}"
    );
    assert!(
        !sdl.contains(&removed_type),
        "schema still exposes removed status type:\n{sdl}"
    );

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_graphql_schema_exposes_provisional_indexer_status_height()
-> Result<(), Box<dyn Error>> {
    let pool = PgPoolOptions::new().connect_lazy("postgres://localhost/degov")?;
    let schema = graphql::build_schema(pool);
    let sdl = schema.sdl();

    assert!(
        sdl.contains("provisionalHeight: Int"),
        "schema does not expose provisionalHeight on indexer status:\n{sdl}"
    );

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_graphql_schema_scope_conflicts_return_no_rows() -> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    seed_other_scope_rows(&database.pool).await?;
    let schema = graphql::build_schema_with_scope(
        database.pool.clone(),
        graphql::GraphqlScope {
            dao_code: Some("lisk-dao".to_owned()),
            chain_id: Some(1135),
            governor_address: Some("0xgovernor".to_owned()),
            contract_set_id: Some(CONTRACT_SET_ID.to_owned()),
        },
    );

    let response = schema
        .execute(Request::new(
            r#"
            query ScopedConflicts {
              proposals(where: { daoCode_eq: "ens-dao" }) { id }
              proposalCanceleds(where: { daoCode_eq: "ens-dao" }) { id }
              proposalExecuteds(where: { daoCode_eq: "ens-dao" }) { id }
              proposalQueueds(where: { daoCode_eq: "ens-dao" }) { id }
              dataMetrics(where: { daoCode_eq: "ens-dao" }) { id }
              contributors(where: { daoCode_eq: "ens-dao" }) { id }
              delegates(where: { daoCode_eq: "ens-dao" }) { id }
              delegateMappings(where: { daoCode_eq: "ens-dao" }) { id }
              proposalsPage(where: { daoCode_eq: "ens-dao" }) { totalCount }
              dataMetricsPage(where: { daoCode_eq: "ens-dao" }) { totalCount }
              contributorsPage(where: { daoCode_eq: "ens-dao" }) { totalCount }
              delegatesPage(where: { daoCode_eq: "ens-dao" }) { totalCount }
              delegateMappingsPage(where: { daoCode_eq: "ens-dao" }) { totalCount }
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
    for field in [
        "proposals",
        "proposalCanceleds",
        "proposalExecuteds",
        "proposalQueueds",
        "dataMetrics",
        "contributors",
        "delegates",
        "delegateMappings",
    ] {
        assert_eq!(data[field].as_array().expect(field).len(), 0, "{field}");
    }
    for field in [
        "proposalsPage",
        "dataMetricsPage",
        "contributorsPage",
        "delegatesPage",
        "delegateMappingsPage",
    ] {
        assert_eq!(data[field]["totalCount"], 0, "{field}");
    }

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_graphql_http_dao_path_applies_path_scope_and_preserves_admin()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    seed_other_scope_rows(&database.pool).await?;
    let schema = graphql::build_schema(database.pool.clone());
    let app = graphql::build_router_with_paths(
        schema,
        ["/graphql".to_owned(), "/ens-dao/graphql".to_owned()],
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let admin_endpoint = format!("http://{}/graphql", listener.local_addr()?);
    let ens_endpoint = format!("http://{}/ens-dao/graphql", listener.local_addr()?);
    let server = tokio::spawn(async move { axum::serve(listener, app).await });

    let admin_response: serde_json::Value = timeout(
        Duration::from_secs(5),
        Client::new()
            .post(admin_endpoint)
            .json(&json!({
                "query": "query { contributorsPage { totalCount } contributors(orderBy: [id_ASC]) { daoCode } }"
            }))
            .send(),
    )
    .await??
    .json()
    .await?;
    let ens_response: serde_json::Value = timeout(
        Duration::from_secs(5),
        Client::new()
            .post(ens_endpoint)
            .json(&json!({
                "query": "query { contributorsPage { totalCount } contributors(orderBy: [id_ASC]) { daoCode } }"
            }))
            .send(),
    )
    .await??
    .json()
    .await?;

    assert_eq!(admin_response["data"]["contributorsPage"]["totalCount"], 3);
    assert_eq!(ens_response["data"]["contributorsPage"]["totalCount"], 1);
    assert_eq!(
        ens_response["data"]["contributors"][0]["daoCode"],
        "ens-dao"
    );

    server.abort();
    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_graphql_http_endpoint_serves_configured_dao_path() -> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    let schema = graphql::build_schema(database.pool.clone());
    let app = graphql::build_router_with_paths(schema, ["/lisk-dao/graphql".to_owned()]);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let endpoint = format!("http://{}/lisk-dao/graphql", listener.local_addr()?);
    let server = tokio::spawn(async move { axum::serve(listener, app).await });

    let response: serde_json::Value = timeout(
        Duration::from_secs(5),
        Client::new()
            .post(endpoint)
            .json(&json!({
                "query": "query { indexerStatus { processedHeight targetHeight } }"
            }))
            .send(),
    )
    .await??
    .json()
    .await?;

    assert_eq!(response["data"]["indexerStatus"]["processedHeight"], 900);
    assert_eq!(response["data"]["indexerStatus"]["targetHeight"], 1000);

    server.abort();
    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_graphql_http_endpoint_serves_cors_preflight_on_configured_dao_path()
-> Result<(), Box<dyn Error>> {
    let pool = PgPoolOptions::new().connect_lazy("postgres://localhost/degov")?;
    let schema = graphql::build_schema(pool);
    let app = graphql::build_router_with_paths(schema, ["/ens-dao/graphql".to_owned()]);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let endpoint = format!("http://{}/ens-dao/graphql", listener.local_addr()?);
    let server = tokio::spawn(async move { axum::serve(listener, app).await });

    let response = timeout(
        Duration::from_secs(5),
        Client::new()
            .request(reqwest::Method::OPTIONS, endpoint)
            .header("origin", "https://ens.next.degov.ai")
            .header("access-control-request-method", "POST")
            .header("access-control-request-headers", "content-type")
            .send(),
    )
    .await??;

    assert_eq!(response.status().as_u16(), 200);
    assert_eq!(
        response
            .headers()
            .get("access-control-allow-origin")
            .expect("allow origin")
            .to_str()?,
        "*"
    );
    assert_eq!(
        response
            .headers()
            .get("access-control-allow-methods")
            .expect("allow methods")
            .to_str()?,
        "GET,POST,OPTIONS"
    );
    assert_eq!(
        response
            .headers()
            .get("access-control-allow-headers")
            .expect("allow headers")
            .to_str()?,
        "*"
    );

    server.abort();

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_graphql_http_endpoint_adds_cors_header_to_configured_dao_post_response()
-> Result<(), Box<dyn Error>> {
    let pool = PgPoolOptions::new().connect_lazy("postgres://localhost/degov")?;
    let schema = graphql::build_schema(pool);
    let app = graphql::build_router_with_paths(schema, ["/ens-dao/graphql".to_owned()]);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let endpoint = format!("http://{}/ens-dao/graphql", listener.local_addr()?);
    let server = tokio::spawn(async move { axum::serve(listener, app).await });

    let response = timeout(
        Duration::from_secs(5),
        Client::new()
            .post(endpoint)
            .header("origin", "https://ens.next.degov.ai")
            .json(&json!({
                "query": "query { __typename }"
            }))
            .send(),
    )
    .await??;

    assert_eq!(response.status().as_u16(), 200);
    assert_eq!(
        response
            .headers()
            .get("access-control-allow-origin")
            .expect("allow origin")
            .to_str()?,
        "*"
    );
    let body: serde_json::Value = response.json().await?;
    assert_eq!(body["data"]["__typename"], "QueryRoot");

    server.abort();

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_graphql_http_endpoint_serves_configured_dao_graphiql_path()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    let schema = graphql::build_schema(database.pool.clone());
    let app = graphql::build_router_with_paths(schema, ["/degov-demo-dao/graphql".to_owned()]);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let graphql_endpoint = format!("http://{}/degov-demo-dao/graphql", listener.local_addr()?);
    let graphiql_endpoint = format!("http://{}/degov-demo-dao/graphiql", listener.local_addr()?);
    let server = tokio::spawn(async move { axum::serve(listener, app).await });

    let response = timeout(
        Duration::from_secs(5),
        Client::new().get(graphql_endpoint).send(),
    )
    .await??;
    assert_eq!(response.status().as_u16(), 405);

    let response = timeout(
        Duration::from_secs(5),
        Client::new().get(graphiql_endpoint).send(),
    )
    .await??;
    assert!(response.status().is_success());
    let body = response.text().await?;
    assert!(body.contains("GraphiQL"));
    assert!(body.contains("/degov-demo-dao/graphql"));
    assert!(body.contains("graphiql@3.9.0"));
    assert!(body.contains("@graphiql/plugin-explorer@3.0.0"));
    assert!(body.contains("GraphiQLPluginExplorer.explorerPlugin"));

    server.abort();
    database.cleanup().await?;

    Ok(())
}

fn unique_schema_name() -> String {
    let id = SCHEMA_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("graphql_service_test_{id}")
}

async fn seed_other_scope_checkpoint(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO degov_indexer_checkpoint (
          dao_code, chain_id, contract_set_id, stream_id, data_source_version,
          next_block, processed_height, target_height, updated_at, last_error
        ) VALUES (
          'ens-dao', 10, $1, 'evm.logs', 'datalens',
          1201, 1200, 1200, now(), 'caught up after retry'
        )
        "#,
    )
    .bind(OTHER_CONTRACT_SET_ID)
    .execute(pool)
    .await?;

    Ok(())
}

async fn seed_rows(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO proposal (
          id, contract_set_id, chain_id, dao_code, governor_address, contract_address, log_index, transaction_index,
          proposal_id, proposer, targets, values, signatures, calldatas, vote_start, vote_end,
          description, block_number, block_timestamp, transaction_hash,
          metrics_votes_count, metrics_votes_with_params_count, metrics_votes_without_params_count,
          metrics_votes_weight_for_sum, metrics_votes_weight_against_sum, metrics_votes_weight_abstain_sum,
          title, vote_start_timestamp, vote_end_timestamp, block_interval, timelock_address,
          clock_mode, quorum, decimals
        ) VALUES
        (
          'proposal:1135:0xgovernor:101', $1, 1135, 'lisk-dao', '0xgovernor', '0xgovernor', 1, 0,
          '101', '0xproposer', ARRAY['0xtarget'], ARRAY['0'], ARRAY['transfer(address,uint256)'], ARRAY['0x'],
          1000, 2000, 'Launch treasury program', 800, 1700000100, '0xproposal',
          2, 1, 1, 100, 25, 0, 'Launch treasury program', 1700001000, 1700002000,
          '12', '0xtimelock', 'mode=blocknumber&from=default', 40, 18
        ),
        (
          'proposal:1135:0xgovernor:102', $1, 1135, 'lisk-dao', '0xgovernor', '0xgovernor', 2, 0,
          '102', '0xother', ARRAY[]::TEXT[], ARRAY[]::TEXT[], ARRAY[]::TEXT[], ARRAY[]::TEXT[],
          1000, 2000, 'Unrelated', 801, 1700000200, '0xproposal2',
          0, 0, 0, 0, 0, 0, 'Unrelated', 1700001000, 1700002000,
          '12', '0xtimelock', 'mode=blocknumber&from=default', 40, 18
        )
        "#,
    )
    .bind(CONTRACT_SET_ID)
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
          votes_weight_abstain_sum, power_sum, contributor_count, holders_count, member_count, proposals_count
        ) VALUES
          ('global', $1, 1135, 'lisk-dao', '0xgovernor', 2, 1, 1, 100, 25, 0, 150, 3, 2, 9, 2),
          ('0000000800-proposal', $1, 1135, 'lisk-dao', '0xgovernor', 0, 0, 0, 0, 0, 0, 150, 3, 2, 9, 1),
          ('0000000805-vote', $1, 1135, 'lisk-dao', '0xgovernor', 1, 0, 1, 100, 0, 0, 150, 3, 2, 9, 0)
        "#,
    )
    .bind(CONTRACT_SET_ID)
    .execute(pool)
    .await?;
    sqlx::query(
        r#"
        UPDATE data_metric
        SET contract_address = '0xgovernor', log_index = 1, transaction_index = 0
        WHERE contract_set_id = $1 AND id = '0000000800-proposal'
        "#,
    )
    .bind(CONTRACT_SET_ID)
    .execute(pool)
    .await?;
    sqlx::query(
        r#"
        UPDATE data_metric
        SET contract_address = '0xgovernor', log_index = 3, transaction_index = 0
        WHERE contract_set_id = $1 AND id = '0000000805-vote'
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
        ) VALUES
          ('0xdelegator_0xdelegate', $1, 1135, 'lisk-dao', '0xgovernor', '0xdelegator', '0xdelegate', 807, 1700000125, '0xdelegate', TRUE, 75),
          ('0xolddelegator_0xformer', $1, 1135, 'lisk-dao', '0xgovernor', '0xolddelegator', '0xformer', 808, 1700000126, '0xformer', FALSE, 0),
          ('0xotherdelegator_0xformer', $1, 1135, 'lisk-dao', '0xgovernor', '0xotherdelegator', '0xformer', 809, 1700000127, '0xformer2', FALSE, 0)
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
    sqlx::query(
        r#"
        INSERT INTO degov_provisional_segment (
          id, contract_set_id, chain_id, dao_code, dataset_key, selector,
          selector_fingerprint, range_start_block, range_end_block,
          segment_finality, source, status, anchor_block_number,
          anchor_block_timestamp
        ) VALUES
          (
            'segment:available:old', $1, 1135, 'lisk-dao', 'evm.logs',
            'selector', 'selector', 901, 1100, 'safe_to_latest',
            'live-onchain', 'available', 1100, 1700000300
          ),
          (
            'segment:available:new', $1, 1135, 'lisk-dao', 'evm.logs',
            'selector', 'selector', 1101, 1120, 'safe_to_latest',
            'live-onchain', 'available', 1120, 1700000400
          ),
          (
            'segment:available:lagging-selector', $1, 1135, 'lisk-dao',
            'evm.logs', 'other-selector', 'other-selector', 901, 1115,
            'safe_to_latest', 'live-onchain', 'available', 1115, 1700000450
          ),
          (
            'segment:rolled-back', $1, 1135, 'lisk-dao', 'evm.logs',
            'selector', 'selector', 1121, 1200, 'safe_to_latest',
            'live-onchain', 'rolled_back', 1200, 1700000500
          )
        "#,
    )
    .bind(CONTRACT_SET_ID)
    .execute(pool)
    .await?;

    Ok(())
}

async fn seed_other_scope_rows(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO proposal (
          id, contract_set_id, chain_id, dao_code, governor_address, contract_address, log_index, transaction_index,
          proposal_id, proposer, targets, values, signatures, calldatas, vote_start, vote_end,
          description, block_number, block_timestamp, transaction_hash,
          metrics_votes_count, metrics_votes_with_params_count, metrics_votes_without_params_count,
          metrics_votes_weight_for_sum, metrics_votes_weight_against_sum, metrics_votes_weight_abstain_sum,
          title, vote_start_timestamp, vote_end_timestamp, clock_mode, quorum, decimals
        ) VALUES (
          'proposal:10:0xensgovernor:201', $1, 10, 'ens-dao', '0xensgovernor', '0xensgovernor', 1, 0,
          '201', '0xensproposer', ARRAY['0xenstarget'], ARRAY['0'], ARRAY['transfer(address,uint256)'], ARRAY['0x'],
          1000, 2000, 'ENS treasury program', 900, 1700001100, '0xensproposal',
          1, 0, 1, 50, 0, 0, 'ENS treasury program', 1700001000, 1700002000, 'mode=blocknumber&from=default', 40, 18
        )
        "#,
    )
    .bind(OTHER_CONTRACT_SET_ID)
    .execute(pool)
    .await?;
    sqlx::query(
        r#"
        INSERT INTO vote_cast_group (
          id, contract_set_id, chain_id, dao_code, governor_address, contract_address, log_index, transaction_index,
          proposal_id, type, voter, ref_proposal_id, support, weight, reason, params,
          block_number, block_timestamp, transaction_hash
        ) VALUES (
          'vote:201:1', $1, 10, 'ens-dao', '0xensgovernor', '0xensgovernor', 2, 0,
          'proposal:10:0xensgovernor:201', 'vote-cast', '0xensvoter', '201', 1, 50, 'yes', NULL,
          905, 1700001110, '0xensvote'
        )
        "#,
    )
    .bind(OTHER_CONTRACT_SET_ID)
    .execute(pool)
    .await?;
    sqlx::raw_sql(
        r#"
        INSERT INTO proposal_canceled (id, chain_id, dao_code, governor_address, proposal_id, block_number, block_timestamp, transaction_hash)
        VALUES ('cancel:201', 10, 'ens-dao', '0xensgovernor', '201', 910, 1700001130, '0xenscancel');
        INSERT INTO proposal_executed (id, chain_id, dao_code, governor_address, proposal_id, block_number, block_timestamp, transaction_hash)
        VALUES ('execute:201', 10, 'ens-dao', '0xensgovernor', '201', 920, 1700001140, '0xensexecute');
        INSERT INTO proposal_queued (id, chain_id, dao_code, governor_address, proposal_id, eta_seconds, block_number, block_timestamp, transaction_hash)
        VALUES ('queue:201', 10, 'ens-dao', '0xensgovernor', '201', 1700001200, 915, 1700001135, '0xensqueue');
        "#,
    )
    .execute(pool)
    .await?;
    sqlx::query(
        r#"
        INSERT INTO data_metric (
          id, contract_set_id, chain_id, dao_code, governor_address, votes_count, votes_with_params_count,
          votes_without_params_count, votes_weight_for_sum, votes_weight_against_sum,
          votes_weight_abstain_sum, power_sum, contributor_count, holders_count, member_count, proposals_count
        ) VALUES ('global', $1, 10, 'ens-dao', '0xensgovernor', 1, 0, 1, 50, 0, 0, 50, 1, 1, 1, 1)
        "#,
    )
    .bind(OTHER_CONTRACT_SET_ID)
    .execute(pool)
    .await?;
    sqlx::query(
        r#"
        INSERT INTO contributor (
          id, contract_set_id, chain_id, dao_code, governor_address, block_number, block_timestamp, transaction_hash,
          last_vote_block_number, last_vote_timestamp, power, balance, delegates_count_all, delegates_count_effective
        ) VALUES ('0xensvoter', $1, 10, 'ens-dao', '0xensgovernor', 905, 1700001110, '0xensvote', 905, 1700001110, 50, 5, 1, 1)
        "#,
    )
    .bind(OTHER_CONTRACT_SET_ID)
    .execute(pool)
    .await?;
    sqlx::query(
        r#"
        INSERT INTO delegate (
          id, contract_set_id, chain_id, dao_code, governor_address, from_delegate, to_delegate, block_number,
          block_timestamp, transaction_hash, is_current, power
        ) VALUES ('0xensdelegator_0xensdelegate', $1, 10, 'ens-dao', '0xensgovernor', '0xensdelegator', '0xensdelegate', 907, 1700001125, '0xensdelegate', TRUE, 50)
        "#,
    )
    .bind(OTHER_CONTRACT_SET_ID)
    .execute(pool)
    .await?;
    sqlx::query(
        r#"
        INSERT INTO delegate_mapping (
          id, contract_set_id, chain_id, dao_code, governor_address, "from", "to", power, block_number,
          block_timestamp, transaction_hash
        ) VALUES ('0xensdelegator', $1, 10, 'ens-dao', '0xensgovernor', '0xensdelegator', '0xensdelegate', 50, 907, 1700001125, '0xensmapping')
        "#,
    )
    .bind(OTHER_CONTRACT_SET_ID)
    .execute(pool)
    .await?;

    Ok(())
}

async fn seed_power_overlay_rows(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO degov_provisional_contributor_power_overlay (
          id, contract_set_id, chain_id, chain_name, dao_code, governor_address, token_address,
          account, power, delegates_count_all, delegates_count_effective, source, status,
          anchor_block_number, anchor_block_timestamp
        ) VALUES (
          'overlay:contributor:0xvoter1', $1, 1135, 'lisk', 'lisk-dao', '0xgovernor', '0xtoken',
          '0xvoter1', 999, 1, 1, 'live-onchain', 'available', 900, 1700000200
        )
        "#,
    )
    .bind(CONTRACT_SET_ID)
    .execute(pool)
    .await?;
    sqlx::query(
        r#"
        INSERT INTO degov_provisional_delegate_power_overlay (
          id, contract_set_id, chain_id, chain_name, dao_code, governor_address, token_address,
          delegator, delegate, power, is_current, source, status, anchor_block_number,
          anchor_block_timestamp
        ) VALUES (
          'overlay:delegate:0xdelegator:0xdelegate', $1, 1135, 'lisk', 'lisk-dao', '0xgovernor', '0xtoken',
          '0xdelegator', '0xdelegate', 888, TRUE, 'live-onchain', 'available', 900,
          1700000200
        )
        "#,
    )
    .bind(CONTRACT_SET_ID)
    .execute(pool)
    .await?;

    Ok(())
}

async fn seed_contributor_power_order_rows(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO contributor (
          id, contract_set_id, chain_id, dao_code, governor_address, block_number, block_timestamp, transaction_hash,
          last_vote_block_number, last_vote_timestamp, power, balance, delegates_count_all, delegates_count_effective
        )
        SELECT
          '0xdownranked-' || lpad(i::text, 3, '0'), $1, 1135, 'lisk-dao', '0xgovernor',
          700 + i, 1700000000 + i, '0xdownranked' || i, 700 + i, 1700000000 + i,
          5000 - i, 1, 0, 0
        FROM generate_series(1, 105) AS i
        "#,
    )
    .bind(CONTRACT_SET_ID)
    .execute(pool)
    .await?;
    sqlx::query(
        r#"
        INSERT INTO degov_provisional_contributor_power_overlay (
          id, contract_set_id, chain_id, chain_name, dao_code, governor_address, token_address,
          account, power, delegates_count_all, delegates_count_effective, source, status,
          anchor_block_number, anchor_block_timestamp
        )
        SELECT
          'overlay:contributor:0xdownranked-' || lpad(i::text, 3, '0'), $1, 1135, 'lisk', 'lisk-dao',
          '0xgovernor', '0xtoken', '0xdownranked-' || lpad(i::text, 3, '0'),
          1, 0, 0, 'live-onchain', 'available', 900, 1700000200
        FROM generate_series(1, 105) AS i
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
          ('0xoverlay-top', $1, 1135, 'lisk-dao', '0xgovernor', 810, 1700000210, '0xoverlaytop', 810, 1700000210, 10, 1, 0, 0),
          ('0xbase-top', $1, 1135, 'lisk-dao', '0xgovernor', 811, 1700000220, '0xbasetop', 811, 1700000220, 900, 1, 0, 0),
          ('0xbase-tie-b', $1, 1135, 'lisk-dao', '0xgovernor', 812, 1700000230, '0xbasetieb', 812, 1700000230, 800, 1, 0, 0),
          ('0xbase-tie-a', $1, 1135, 'lisk-dao', '0xgovernor', 813, 1700000240, '0xbasetiea', 813, 1700000240, 800, 1, 0, 0),
          ('0xbot', $1, 1135, 'lisk-dao', '0xgovernor', 814, 1700000250, '0xbotvote', 814, 1700000250, 2000, 1, 0, 0)
        "#,
    )
    .bind(CONTRACT_SET_ID)
    .execute(pool)
    .await?;
    sqlx::query(
        r#"
        INSERT INTO degov_provisional_contributor_power_overlay (
          id, contract_set_id, chain_id, chain_name, dao_code, governor_address, token_address,
          account, power, delegates_count_all, delegates_count_effective, source, status,
          anchor_block_number, anchor_block_timestamp
        ) VALUES (
          'overlay:contributor:0xoverlay-top', $1, 1135, 'lisk', 'lisk-dao', '0xgovernor', '0xtoken',
          '0xoverlay-top', 1000, 0, 0, 'live-onchain', 'available', 900, 1700000200
        )
        "#,
    )
    .bind(CONTRACT_SET_ID)
    .execute(pool)
    .await?;

    Ok(())
}

async fn seed_many_contributor_power_rows(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO contributor (
          id, contract_set_id, chain_id, dao_code, governor_address, block_number, block_timestamp, transaction_hash,
          last_vote_block_number, last_vote_timestamp, power, balance, delegates_count_all, delegates_count_effective
        )
        SELECT
          '0xcap-' || lpad(i::text, 5, '0'), $1, 1135, 'lisk-dao', '0xgovernor',
          100000 + i, 1700100000 + i, '0xcap' || i, 100000 + i, 1700100000 + i,
          200000 - i, 1, 0, 0
        FROM generate_series(1, 20001) AS i
        "#,
    )
    .bind(CONTRACT_SET_ID)
    .execute(pool)
    .await?;

    Ok(())
}

async fn seed_proposal_overlay_rows(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO degov_provisional_proposal_overlay (
          id, contract_set_id, chain_id, chain_name, dao_code, governor_address,
          contract_address, proposal_id, proposer, targets, values, signatures, calldatas,
          vote_start, vote_end, description, title, state, vote_start_timestamp,
          vote_end_timestamp, proposal_snapshot, proposal_deadline, proposal_eta,
          queue_ready_at, queue_expires_at, timelock_address, timelock_grace_period,
          clock_mode, quorum, decimals, source, status, anchor_block_number,
          anchor_block_timestamp
        ) VALUES (
          'overlay:proposal:101', $1, 1135, 'lisk', 'lisk-dao', '0xgovernor',
          '0xgovernor', '101', '0xproposer', ARRAY['0xtarget'], ARRAY['0'],
          ARRAY['transfer(address,uint256)'], ARRAY['0x'], 1000, 2000,
          'Live launch description', 'Live launch title', 'Queued', 1700001000,
          1700002000, 1000, 2000, 1700000300, 1700000300, 1700000900,
          '0xtimelock', 600, 'mode=blocknumber&from=default', 40, 18,
          'live-onchain', 'available', 900, 1700000200
        )
        "#,
    )
    .bind(CONTRACT_SET_ID)
    .execute(pool)
    .await?;

    Ok(())
}
