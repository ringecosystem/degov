use std::{
    collections::{BTreeMap, BTreeSet},
    env,
    error::Error,
    sync::atomic::{AtomicU64, Ordering},
};

use async_graphql::Request;
use degov_datalens_indexer::graphql;
use serde::Deserialize;
use serde_json::json;
use sqlx::{PgPool, postgres::PgPoolOptions};
use tokio::sync::{Mutex, MutexGuard};

const SCHEMA_SQL: &str = include_str!("../schema/postgres.sql");
const BASELINE_JSON: &str = include_str!("../fixtures/golden-baselines/lisk-dao.production.json");
static SCHEMA_COUNTER: AtomicU64 = AtomicU64::new(0);
static DATABASE_TEST_LOCK: Mutex<()> = Mutex::const_new(());

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Baseline {
    source: BaselineSource,
    scope: BaselineScope,
    counts: BaselineCounts,
    samples: BaselineSamples,
    query_shapes: BTreeMap<String, String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BaselineSource {
    graphql_endpoint: String,
    dao_config_endpoint: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BaselineScope {
    dao_code: String,
    chain_id: i32,
    start_block: i64,
    governor: String,
    token: TokenScope,
    timelock: String,
}

#[derive(Debug, Deserialize)]
struct TokenScope {
    address: String,
    standard: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BaselineCounts {
    proposals: i64,
    proposal_createds: i64,
    vote_casts: i64,
    delegate_changeds: i64,
    delegate_votes_changeds: i64,
    token_transfers: i64,
    contributors: i64,
    delegates: i64,
    delegate_mappings: i64,
    proposal_queueds: i64,
    proposal_executeds: i64,
    proposal_canceleds: i64,
    timelock_operations: i64,
    timelock_calls: i64,
    timelock_role_events: i64,
    timelock_min_delay_changes: i64,
    vote_power_checkpoints: i64,
    token_balance_checkpoints: i64,
    onchain_refresh_tasks: i64,
    data_metrics_connection_total_count: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BaselineSamples {
    latest_proposal: LatestProposalSample,
    top_contributor: TopContributorSample,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LatestProposalSample {
    proposal_id: String,
    title: String,
    block_number: String,
    metrics_votes_count: i32,
    votes_weight_for_sum: String,
    votes_weight_against_sum: String,
    votes_weight_abstain_sum: String,
    voter: ProposalVoterSample,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProposalVoterSample {
    voter: String,
    support: i32,
    weight: String,
    reason: String,
    params: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TopContributorSample {
    id: String,
    account: String,
    power: String,
}

struct TestDatabase {
    _guard: MutexGuard<'static, ()>,
    pool: PgPool,
    schema: String,
}

impl TestDatabase {
    async fn connect(baseline: &Baseline) -> Result<Self, Box<dyn Error>> {
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
        seed_baseline_rows(&pool, baseline).await?;

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
async fn test_lisk_dao_golden_baseline_matches_fixture_contract() -> Result<(), Box<dyn Error>> {
    let baseline: Baseline = serde_json::from_str(BASELINE_JSON)?;
    assert_eq!(
        baseline.source.graphql_endpoint,
        "https://indexer.degov.ai/lisk-dao/graphql"
    );
    assert_eq!(
        baseline.source.dao_config_endpoint,
        "https://api.degov.ai/dao/config/lisk-dao"
    );
    assert_eq!(baseline.scope.start_block, 568752);
    assert_eq!(baseline.scope.token.standard, "ERC20");
    assert_eq!(
        baseline.samples.top_contributor.account,
        baseline.samples.top_contributor.id
    );
    assert_query_shape_names(&baseline);

    let database = TestDatabase::connect(&baseline).await?;

    assert_table_count(&database.pool, "proposal", baseline.counts.proposals).await?;
    assert_table_count(
        &database.pool,
        "proposal_created",
        baseline.counts.proposal_createds,
    )
    .await?;
    assert_table_count(&database.pool, "vote_cast", baseline.counts.vote_casts).await?;
    assert_table_count(
        &database.pool,
        "delegate_changed",
        baseline.counts.delegate_changeds,
    )
    .await?;
    assert_table_count(
        &database.pool,
        "delegate_votes_changed",
        baseline.counts.delegate_votes_changeds,
    )
    .await?;
    assert_table_count(
        &database.pool,
        "token_transfer",
        baseline.counts.token_transfers,
    )
    .await?;
    assert_table_count(&database.pool, "contributor", baseline.counts.contributors).await?;
    assert_table_count(&database.pool, "delegate", baseline.counts.delegates).await?;
    assert_table_count(
        &database.pool,
        "delegate_mapping",
        baseline.counts.delegate_mappings,
    )
    .await?;
    assert_table_count(
        &database.pool,
        "proposal_queued",
        baseline.counts.proposal_queueds,
    )
    .await?;
    assert_table_count(
        &database.pool,
        "proposal_executed",
        baseline.counts.proposal_executeds,
    )
    .await?;
    assert_table_count(
        &database.pool,
        "proposal_canceled",
        baseline.counts.proposal_canceleds,
    )
    .await?;
    assert_table_count(
        &database.pool,
        "timelock_operation",
        baseline.counts.timelock_operations,
    )
    .await?;
    assert_table_count(
        &database.pool,
        "timelock_call",
        baseline.counts.timelock_calls,
    )
    .await?;
    assert_table_count(
        &database.pool,
        "timelock_role_event",
        baseline.counts.timelock_role_events,
    )
    .await?;
    assert_table_count(
        &database.pool,
        "timelock_min_delay_change",
        baseline.counts.timelock_min_delay_changes,
    )
    .await?;
    assert_table_count(
        &database.pool,
        "vote_power_checkpoint",
        baseline.counts.vote_power_checkpoints,
    )
    .await?;
    assert_table_count(
        &database.pool,
        "token_balance_checkpoint",
        baseline.counts.token_balance_checkpoints,
    )
    .await?;
    assert_table_count(
        &database.pool,
        "onchain_refresh_task",
        baseline.counts.onchain_refresh_tasks,
    )
    .await?;
    assert_table_count(
        &database.pool,
        "data_metric",
        baseline.counts.data_metrics_connection_total_count,
    )
    .await?;

    let schema = graphql::build_schema(database.pool.clone());
    let latest = &baseline.samples.latest_proposal;
    let top_contributor = &baseline.samples.top_contributor;
    let response = schema
        .execute(
            Request::new(
                r#"
                query GoldenBaseline(
                  $metricWhere: DataMetricWhereInput,
                  $proposalWhere: ProposalWhereInput,
                  $votedProposalWhere: ProposalWhereInput
                ) {
                  proposalsConnection(orderBy: [id_ASC]) { totalCount }
                  contributorsConnection(orderBy: id_ASC) { totalCount }
                  dataMetricsConnection(orderBy: id_ASC) { totalCount }
                  dataMetrics(where: $metricWhere) {
                    proposalsCount
                    votesCount
                    powerSum
                    memberCount
                  }
                  latestProposal: proposals(orderBy: [blockTimestamp_DESC_NULLS_LAST], limit: 1) {
                    proposalId
                    title
                    blockNumber
                    metricsVotesCount
                    metricsVotesWeightForSum
                    metricsVotesWeightAgainstSum
                    metricsVotesWeightAbstainSum
                  }
                  contributors(orderBy: [power_DESC], limit: 1) {
                    id
                    power
                  }
                  proposalWithVoters: proposals(where: $proposalWhere, limit: 1) {
                    proposalId
                    voters(orderBy: [blockTimestamp_ASC_NULLS_LAST], limit: 1) {
                      voter
                      support
                      weight
                      reason
                      params
                    }
                  }
                  proposalsByVoter: proposals(where: $votedProposalWhere, limit: 1) {
                    proposalId
                  }
                  proposalQueueds(orderBy: [id_ASC]) { proposalId etaSeconds }
                  proposalExecuteds(orderBy: [id_ASC]) { proposalId }
                  proposalCanceleds(orderBy: [id_ASC]) { proposalId }
                  delegatesConnection(orderBy: [id_ASC]) { totalCount }
                  delegateMappingsConnection(orderBy: [id_ASC]) { totalCount }
                }
                "#,
            )
            .variables(async_graphql::Variables::from_json(json!({
                "metricWhere": {
                    "id_eq": "global",
                    "chainId_eq": baseline.scope.chain_id,
                    "governorAddress_eq": baseline.scope.governor,
                    "daoCode_eq": baseline.scope.dao_code
                },
                "proposalWhere": {
                    "proposalId_eq": latest.proposal_id,
                    "chainId_eq": baseline.scope.chain_id,
                    "governorAddress_eq": baseline.scope.governor,
                    "daoCode_eq": baseline.scope.dao_code
                },
                "votedProposalWhere": {
                    "proposalId_eq": latest.proposal_id,
                    "chainId_eq": baseline.scope.chain_id,
                    "governorAddress_eq": baseline.scope.governor,
                    "daoCode_eq": baseline.scope.dao_code,
                    "voters_some": {
                        "voter_eq": latest.voter.voter,
                        "support_eq": latest.voter.support
                    }
                },
            }))),
        )
        .await;

    assert!(
        response.errors.is_empty(),
        "unexpected GraphQL errors: {:?}",
        response.errors
    );

    let data = response.data.into_json()?;

    assert_eq!(
        data["proposalsConnection"]["totalCount"],
        baseline.counts.proposals
    );
    assert_eq!(
        data["dataMetricsConnection"]["totalCount"],
        baseline.counts.data_metrics_connection_total_count
    );
    assert_eq!(
        data["dataMetrics"][0]["proposalsCount"],
        baseline.counts.proposals
    );
    assert_eq!(
        data["dataMetrics"][0]["votesCount"],
        baseline.counts.vote_casts
    );
    assert_eq!(data["dataMetrics"][0]["powerSum"], top_contributor.power);
    assert_eq!(
        data["dataMetrics"][0]["memberCount"],
        baseline.counts.contributors
    );
    assert_eq!(data["latestProposal"][0]["proposalId"], latest.proposal_id);
    assert_eq!(data["latestProposal"][0]["title"], latest.title);
    assert_eq!(
        data["latestProposal"][0]["blockNumber"],
        latest.block_number
    );
    assert_eq!(
        data["latestProposal"][0]["metricsVotesCount"],
        latest.metrics_votes_count
    );
    assert_eq!(
        data["latestProposal"][0]["metricsVotesWeightForSum"],
        latest.votes_weight_for_sum
    );
    assert_eq!(
        data["latestProposal"][0]["metricsVotesWeightAgainstSum"],
        latest.votes_weight_against_sum
    );
    assert_eq!(
        data["latestProposal"][0]["metricsVotesWeightAbstainSum"],
        latest.votes_weight_abstain_sum
    );
    assert_eq!(data["contributors"][0]["id"], top_contributor.id);
    assert_eq!(data["contributors"][0]["power"], top_contributor.power);
    assert_eq!(
        data["contributorsConnection"]["totalCount"],
        baseline.counts.contributors
    );
    assert_eq!(
        data["proposalWithVoters"][0]["proposalId"],
        latest.proposal_id
    );
    assert_eq!(
        data["proposalWithVoters"][0]["voters"][0]["voter"],
        latest.voter.voter
    );
    assert_eq!(
        data["proposalWithVoters"][0]["voters"][0]["support"],
        latest.voter.support
    );
    assert_eq!(
        data["proposalWithVoters"][0]["voters"][0]["weight"],
        latest.voter.weight
    );
    assert_eq!(
        data["proposalWithVoters"][0]["voters"][0]["reason"],
        latest.voter.reason
    );
    assert_eq!(
        data["proposalWithVoters"][0]["voters"][0]["params"],
        json!(latest.voter.params)
    );
    assert_eq!(
        data["proposalsByVoter"][0]["proposalId"],
        latest.proposal_id
    );
    assert_eq!(
        data["proposalQueueds"].as_array().map(Vec::len),
        Some(baseline.counts.proposal_queueds as usize)
    );
    assert_eq!(
        data["proposalExecuteds"].as_array().map(Vec::len),
        Some(baseline.counts.proposal_executeds as usize)
    );
    assert_eq!(
        data["proposalCanceleds"].as_array().map(Vec::len),
        Some(baseline.counts.proposal_canceleds as usize)
    );
    assert_eq!(
        data["delegatesConnection"]["totalCount"],
        baseline.counts.delegates
    );
    assert_eq!(
        data["delegateMappingsConnection"]["totalCount"],
        baseline.counts.delegate_mappings
    );

    assert_query_shapes_execute(&schema, &baseline).await?;

    database.cleanup().await?;

    Ok(())
}

fn assert_query_shape_names(baseline: &Baseline) {
    let expected = BTreeSet::from([
        "proposalTotal",
        "contributorsTotal",
        "dataMetricTotal",
        "globalDataMetric",
        "latestProposal",
        "topContributor",
        "proposalVoters",
        "proposalsByVoter",
        "proposalEvents",
        "delegateTotals",
    ]);
    let actual = baseline
        .query_shapes
        .keys()
        .map(String::as_str)
        .collect::<BTreeSet<_>>();

    assert_eq!(actual, expected, "unexpected fixture queryShapes keys");
}

async fn assert_query_shapes_execute(
    schema: &async_graphql::Schema<
        graphql::QueryRoot,
        async_graphql::EmptyMutation,
        async_graphql::EmptySubscription,
    >,
    baseline: &Baseline,
) -> Result<(), Box<dyn Error>> {
    for (name, query) in &baseline.query_shapes {
        let response = schema.execute(Request::new(query.clone())).await;
        assert!(
            response.errors.is_empty(),
            "fixture queryShapes.{name} failed: {:?}",
            response.errors
        );
        assert!(
            !response.data.into_json()?.is_null(),
            "fixture queryShapes.{name} returned null data"
        );
    }

    Ok(())
}

fn unique_schema_name() -> String {
    let id = SCHEMA_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("lisk_dao_golden_baseline_test_{id}")
}

async fn assert_table_count(
    pool: &PgPool,
    table: &'static str,
    expected: i64,
) -> Result<(), sqlx::Error> {
    let query = format!("SELECT COUNT(*)::int8 AS total FROM {table}");
    let (actual,): (i64,) = sqlx::query_as(&query).fetch_one(pool).await?;
    assert_eq!(actual, expected, "unexpected {table} count");

    Ok(())
}

async fn seed_baseline_rows(pool: &PgPool, baseline: &Baseline) -> Result<(), sqlx::Error> {
    // The frozen fixture stores production counts and representative samples.
    // Large tables are generated from those counts in Postgres so the test
    // asserts the baseline contract without checking in massive row fixtures.
    seed_proposals(pool, baseline).await?;
    seed_votes(pool, baseline).await?;
    seed_token_projection_rows(pool, baseline).await?;
    seed_timelock_rows(pool, baseline).await?;
    seed_data_metrics(pool, baseline).await?;
    seed_status(pool, baseline).await?;

    Ok(())
}

async fn seed_proposals(pool: &PgPool, baseline: &Baseline) -> Result<(), sqlx::Error> {
    let latest = &baseline.samples.latest_proposal;
    sqlx::query(
        r#"
        INSERT INTO proposal (
          id, chain_id, dao_code, governor_address, contract_address, log_index, transaction_index,
          proposal_id, proposer, targets, values, signatures, calldatas, vote_start, vote_end,
          description, block_number, block_timestamp, transaction_hash,
          metrics_votes_count, metrics_votes_with_params_count, metrics_votes_without_params_count,
          metrics_votes_weight_for_sum, metrics_votes_weight_against_sum, metrics_votes_weight_abstain_sum,
          title, vote_start_timestamp, vote_end_timestamp, clock_mode, quorum, decimals, timelock_address
        )
        SELECT
          format('proposal:%s:%s:%s', $1::int, lower($3), i),
          $1,
          $2,
          $3,
          $3,
          i,
          0,
          CASE WHEN i = 0 THEN $5 ELSE format('baseline-proposal-%s', i) END,
          format('0xproposer%040s', i),
          ARRAY[$7],
          ARRAY['0'],
          ARRAY[''],
          ARRAY['0x'],
          $4 + i,
          $4 + i + 1000,
          CASE WHEN i = 0 THEN $6 ELSE format('Generated lisk baseline proposal %s', i) END,
          CASE WHEN i = 0 THEN $8::numeric ELSE $4 + i END,
          CASE WHEN i = 0 THEN $8::numeric ELSE $4 + i END,
          format('0xproposal%064s', i),
          CASE WHEN i = 0 THEN $9 ELSE 0 END,
          0,
          CASE WHEN i = 0 THEN $9 ELSE 0 END,
          CASE WHEN i = 0 THEN $10::numeric ELSE 0 END,
          CASE WHEN i = 0 THEN $11::numeric ELSE 0 END,
          CASE WHEN i = 0 THEN $12::numeric ELSE 0 END,
          CASE WHEN i = 0 THEN $6 ELSE format('Generated lisk baseline proposal %s', i) END,
          $4 + i + 10,
          $4 + i + 1010,
          'mode=blocknumber&from=default',
          0,
          18,
          $13
        FROM generate_series(0, $14::int - 1) AS i
        "#,
    )
    .bind(baseline.scope.chain_id)
    .bind(&baseline.scope.dao_code)
    .bind(&baseline.scope.governor)
    .bind(baseline.scope.start_block)
    .bind(&latest.proposal_id)
    .bind(&latest.title)
    .bind(&baseline.scope.timelock)
    .bind(&latest.block_number)
    .bind(latest.metrics_votes_count)
    .bind(&latest.votes_weight_for_sum)
    .bind(&latest.votes_weight_against_sum)
    .bind(&latest.votes_weight_abstain_sum)
    .bind(&baseline.scope.timelock)
    .bind(baseline.counts.proposals)
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO proposal_created (
          id, chain_id, dao_code, governor_address, contract_address, log_index, transaction_index,
          proposal_id, proposer, targets, values, signatures, calldatas, vote_start, vote_end,
          description, block_number, block_timestamp, transaction_hash
        )
        SELECT
          format('proposal-created:%s', i),
          $1,
          $2,
          $3,
          $3,
          i,
          0,
          CASE WHEN i = 0 THEN $5 ELSE format('baseline-proposal-%s', i) END,
          format('0xproposer%040s', i),
          ARRAY[$6],
          ARRAY['0'],
          ARRAY[''],
          ARRAY['0x'],
          $4 + i,
          $4 + i + 1000,
          CASE WHEN i = 0 THEN $7 ELSE format('Generated lisk baseline proposal %s', i) END,
          CASE WHEN i = 0 THEN $8::numeric ELSE $4 + i END,
          CASE WHEN i = 0 THEN $8::numeric ELSE $4 + i END,
          format('0xproposalcreated%056s', i)
        FROM generate_series(0, $9::int - 1) AS i
        "#,
    )
    .bind(baseline.scope.chain_id)
    .bind(&baseline.scope.dao_code)
    .bind(&baseline.scope.governor)
    .bind(baseline.scope.start_block)
    .bind(&latest.proposal_id)
    .bind(&baseline.scope.timelock)
    .bind(&latest.title)
    .bind(&latest.block_number)
    .bind(baseline.counts.proposal_createds)
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO proposal_queued (id, chain_id, dao_code, governor_address, contract_address, log_index, transaction_index, proposal_id, eta_seconds, block_number, block_timestamp, transaction_hash)
        SELECT format('proposal-queued:%s', i), $1, $2, $3, $4, i, 0, format('baseline-proposal-%s', i), $5 + i, $5 + i, $5 + i, format('0xqueued%058s', i)
        FROM generate_series(0, $6::int - 1) AS i
        "#,
    )
    .bind(baseline.scope.chain_id)
    .bind(&baseline.scope.dao_code)
    .bind(&baseline.scope.governor)
    .bind(&baseline.scope.timelock)
    .bind(baseline.scope.start_block)
    .bind(baseline.counts.proposal_queueds)
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO proposal_executed (id, chain_id, dao_code, governor_address, contract_address, log_index, transaction_index, proposal_id, block_number, block_timestamp, transaction_hash)
        SELECT format('proposal-executed:%s', i), $1, $2, $3, $4, i, 0, format('baseline-proposal-%s', i), $5 + i, $5 + i, format('0xexecuted%056s', i)
        FROM generate_series(0, $6::int - 1) AS i
        "#,
    )
    .bind(baseline.scope.chain_id)
    .bind(&baseline.scope.dao_code)
    .bind(&baseline.scope.governor)
    .bind(&baseline.scope.timelock)
    .bind(baseline.scope.start_block)
    .bind(baseline.counts.proposal_executeds)
    .execute(pool)
    .await?;

    Ok(())
}

async fn seed_votes(pool: &PgPool, baseline: &Baseline) -> Result<(), sqlx::Error> {
    let latest = &baseline.samples.latest_proposal;
    sqlx::query(
        r#"
        INSERT INTO vote_cast (
          id, chain_id, dao_code, governor_address, contract_address, log_index, transaction_index,
          voter, proposal_id, support, weight, reason, block_number, block_timestamp, transaction_hash
        )
        SELECT
          format('vote-cast:%s', i),
          $1,
          $2,
          $3,
          $3,
          i,
          0,
          format('0xvoter%040s', i),
          format('baseline-proposal-%s', i % 13),
          (i % 3)::int,
          CASE WHEN i = 0 THEN $5::numeric ELSE 1 END,
          '',
          $4 + i,
          $4 + i,
          format('0xvote%062s', i)
        FROM generate_series(0, $6::int - 1) AS i
        "#,
    )
    .bind(baseline.scope.chain_id)
    .bind(&baseline.scope.dao_code)
    .bind(&baseline.scope.governor)
    .bind(baseline.scope.start_block)
    .bind(&baseline.samples.latest_proposal.votes_weight_for_sum)
    .bind(baseline.counts.vote_casts)
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO vote_cast_group (
          id, chain_id, dao_code, governor_address, contract_address, log_index, transaction_index,
          proposal_id, type, voter, ref_proposal_id, support, weight, reason, params,
          block_number, block_timestamp, transaction_hash
        ) VALUES (
          'vote-cast-group:latest-proposal-voter',
          $1,
          $2,
          $3,
          $3,
          0,
          0,
          format('proposal:%s:%s:%s', $1::int, lower($3), 0),
          'vote-cast',
          $4,
          $5,
          $6,
          $7::numeric,
          $8,
          $9,
          $10::numeric,
          $10::numeric,
          '0xvotecastgrouplatest'
        )
        "#,
    )
    .bind(baseline.scope.chain_id)
    .bind(&baseline.scope.dao_code)
    .bind(&baseline.scope.governor)
    .bind(&latest.voter.voter)
    .bind(&latest.proposal_id)
    .bind(latest.voter.support)
    .bind(&latest.voter.weight)
    .bind(&latest.voter.reason)
    .bind(&latest.voter.params)
    .bind(&latest.block_number)
    .execute(pool)
    .await?;

    Ok(())
}

async fn seed_token_projection_rows(pool: &PgPool, baseline: &Baseline) -> Result<(), sqlx::Error> {
    let top = &baseline.samples.top_contributor;
    sqlx::query(
        r#"
        INSERT INTO delegate_changed (
          id, chain_id, dao_code, governor_address, token_address, contract_address, log_index,
          transaction_index, delegator, from_delegate, to_delegate, block_number, block_timestamp,
          transaction_hash
        )
        SELECT format('delegate-changed:%s', i), $1, $2, $3, $4, $4, i, 0,
          format('0xdelegator%038s', i), format('0xfrom%043s', i), format('0xto%045s', i),
          $5 + i, $5 + i, format('0xdelegatechanged%049s', i)
        FROM generate_series(0, $6::int - 1) AS i
        "#,
    )
    .bind(baseline.scope.chain_id)
    .bind(&baseline.scope.dao_code)
    .bind(&baseline.scope.governor)
    .bind(&baseline.scope.token.address)
    .bind(baseline.scope.start_block)
    .bind(baseline.counts.delegate_changeds)
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO delegate_votes_changed (
          id, chain_id, dao_code, governor_address, token_address, contract_address, log_index,
          transaction_index, delegate, previous_votes, new_votes, block_number, block_timestamp,
          transaction_hash
        )
        SELECT format('delegate-votes-changed:%s', i), $1, $2, $3, $4, $4, i, 0,
          format('0xdelegate%039s', i), i, i + 1, $5 + i, $5 + i,
          format('0xdelegatevoteschanged%044s', i)
        FROM generate_series(0, $6::int - 1) AS i
        "#,
    )
    .bind(baseline.scope.chain_id)
    .bind(&baseline.scope.dao_code)
    .bind(&baseline.scope.governor)
    .bind(&baseline.scope.token.address)
    .bind(baseline.scope.start_block)
    .bind(baseline.counts.delegate_votes_changeds)
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO token_transfer (
          id, chain_id, dao_code, governor_address, token_address, contract_address, log_index,
          transaction_index, "from", "to", value, standard, block_number, block_timestamp,
          transaction_hash
        )
        SELECT format('token-transfer:%s', i), $1, $2, $3, $4, $4, i, 0,
          format('0xfrom%043s', i), format('0xto%045s', i), 1, $5, $6 + i, $6 + i,
          format('0xtokentransfer%050s', i)
        FROM generate_series(0, $7::int - 1) AS i
        "#,
    )
    .bind(baseline.scope.chain_id)
    .bind(&baseline.scope.dao_code)
    .bind(&baseline.scope.governor)
    .bind(&baseline.scope.token.address)
    .bind(&baseline.scope.token.standard)
    .bind(baseline.scope.start_block)
    .bind(baseline.counts.token_transfers)
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO contributor (
          id, chain_id, dao_code, governor_address, token_address, contract_address, log_index,
          transaction_index, block_number, block_timestamp, transaction_hash, last_vote_block_number,
          last_vote_timestamp, power, balance, delegates_count_all, delegates_count_effective
        )
        SELECT
          CASE WHEN i = 0 THEN $5 ELSE format('0xcontributor%037s', i) END,
          $1,
          $2,
          $3,
          $4,
          $4,
          i,
          0,
          $6 + i,
          $6 + i,
          format('0xcontributor%051s', i),
          $6 + i,
          $6 + i,
          CASE WHEN i = 0 THEN $7::numeric ELSE 1 END,
          CASE WHEN i = 0 THEN $7::numeric ELSE 1 END,
          0,
          0
        FROM generate_series(0, $8::int - 1) AS i
        "#,
    )
    .bind(baseline.scope.chain_id)
    .bind(&baseline.scope.dao_code)
    .bind(&baseline.scope.governor)
    .bind(&baseline.scope.token.address)
    .bind(&top.id)
    .bind(baseline.scope.start_block)
    .bind(&top.power)
    .bind(baseline.counts.contributors)
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO delegate (
          id, chain_id, dao_code, governor_address, token_address, contract_address, log_index,
          transaction_index, from_delegate, to_delegate, block_number, block_timestamp,
          transaction_hash, is_current, power
        )
        SELECT format('delegate:%s', i), $1, $2, $3, $4, $4, i, 0,
          format('0xfromdelegate%035s', i), format('0xtodelegate%037s', i),
          $5 + i, $5 + i, format('0xdelegate%054s', i), TRUE, 1
        FROM generate_series(0, $6::int - 1) AS i
        "#,
    )
    .bind(baseline.scope.chain_id)
    .bind(&baseline.scope.dao_code)
    .bind(&baseline.scope.governor)
    .bind(&baseline.scope.token.address)
    .bind(baseline.scope.start_block)
    .bind(baseline.counts.delegates)
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO delegate_mapping (
          id, chain_id, dao_code, governor_address, token_address, contract_address, log_index,
          transaction_index, "from", "to", power, block_number, block_timestamp, transaction_hash
        )
        SELECT format('delegate-mapping:%s', i), $1, $2, $3, $4, $4, i, 0,
          format('0xmappingfrom%036s', i), format('0xmappingto%038s', i),
          1, $5 + i, $5 + i, format('0xdelegatemapping%048s', i)
        FROM generate_series(0, $6::int - 1) AS i
        "#,
    )
    .bind(baseline.scope.chain_id)
    .bind(&baseline.scope.dao_code)
    .bind(&baseline.scope.governor)
    .bind(&baseline.scope.token.address)
    .bind(baseline.scope.start_block)
    .bind(baseline.counts.delegate_mappings)
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO vote_power_checkpoint (
          id, chain_id, dao_code, governor_address, token_address, contract_address, log_index,
          transaction_index, account, clock_mode, timepoint, previous_power, new_power, delta,
          source, cause, delegator, from_delegate, to_delegate, block_number, block_timestamp,
          transaction_hash
        )
        SELECT format('vote-power-checkpoint:%s', i), $1, $2, $3, $4, $4, i, 0,
          format('0xpower%042s', i), 'mode=blocknumber&from=default', $5 + i, i, i + 1, 1,
          'token-transfer', 'transfer', NULL, NULL, NULL, $5 + i, $5 + i,
          format('0xvotepowercheckpoint%044s', i)
        FROM generate_series(0, $6::int - 1) AS i
        "#,
    )
    .bind(baseline.scope.chain_id)
    .bind(&baseline.scope.dao_code)
    .bind(&baseline.scope.governor)
    .bind(&baseline.scope.token.address)
    .bind(baseline.scope.start_block)
    .bind(baseline.counts.vote_power_checkpoints)
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO token_balance_checkpoint (
          id, chain_id, dao_code, governor_address, token_address, contract_address, log_index,
          transaction_index, account, previous_balance, new_balance, delta, source, cause,
          block_number, block_timestamp, transaction_hash
        )
        SELECT format('token-balance-checkpoint:%s', i), $1, $2, $3, $4, $4, i, 0,
          format('0xbalance%040s', i), i, i + 1, 1, 'token-transfer', 'transfer',
          $5 + i, $5 + i, format('0xtokenbalancecheckpoint%042s', i)
        FROM generate_series(0, $6::int - 1) AS i
        "#,
    )
    .bind(baseline.scope.chain_id)
    .bind(&baseline.scope.dao_code)
    .bind(&baseline.scope.governor)
    .bind(&baseline.scope.token.address)
    .bind(baseline.scope.start_block)
    .bind(baseline.counts.token_balance_checkpoints)
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO onchain_refresh_task (
          id, chain_id, dao_code, governor_address, token_address, account, refresh_balance,
          refresh_power, reason, first_seen_block_number, last_seen_block_number,
          last_seen_block_timestamp, last_seen_transaction_hash, status, attempts, next_run_at,
          locked_at, locked_by, processed_at, error, pending_after_lock,
          pending_after_lock_block_number, pending_after_lock_block_timestamp,
          pending_after_lock_transaction_hash, created_at, updated_at
        )
        SELECT format('onchain-refresh-task:%s', i), $1, $2, $3, $4, format('0xrefresh%040s', i),
          TRUE, TRUE, 'baseline', $5 + i, $5 + i, $5 + i, format('0xonchainrefresh%049s', i),
          'pending', 0, $5 + i, NULL, NULL, NULL, NULL, FALSE, NULL, NULL, NULL, $5 + i, $5 + i
        FROM generate_series(0, $6::int - 1) AS i
        "#,
    )
    .bind(baseline.scope.chain_id)
    .bind(&baseline.scope.dao_code)
    .bind(&baseline.scope.governor)
    .bind(&baseline.scope.token.address)
    .bind(baseline.scope.start_block)
    .bind(baseline.counts.onchain_refresh_tasks)
    .execute(pool)
    .await?;

    Ok(())
}

async fn seed_timelock_rows(pool: &PgPool, baseline: &Baseline) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO timelock_operation (
          id, chain_id, dao_code, governor_address, timelock_address, contract_address, log_index,
          transaction_index, proposal_id, operation_id, timelock_type, predecessor, salt, state,
          call_count, executed_call_count, delay_seconds, ready_at, expires_at, queued_block_number,
          queued_block_timestamp, queued_transaction_hash, executed_block_number,
          executed_block_timestamp, executed_transaction_hash
        )
        SELECT format('timelock-operation:%s', i), $1, $2, $3, $4, $4, i, 0,
          format('baseline-proposal-%s', i), format('operation-%s', i), 'single', NULL, NULL,
          'executed', 1, 1, 0, $5 + i, $5 + i + 1000, $5 + i, $5 + i,
          format('0xtimelockqueued%048s', i), $5 + i, $5 + i,
          format('0xtimelockexecuted%046s', i)
        FROM generate_series(0, $6::int - 1) AS i
        "#,
    )
    .bind(baseline.scope.chain_id)
    .bind(&baseline.scope.dao_code)
    .bind(&baseline.scope.governor)
    .bind(&baseline.scope.timelock)
    .bind(baseline.scope.start_block)
    .bind(baseline.counts.timelock_operations)
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO timelock_call (
          id, chain_id, dao_code, governor_address, timelock_address, contract_address, log_index,
          transaction_index, operation_id, operation_ref, proposal_id, action_index, target, value,
          data, predecessor, delay_seconds, state, scheduled_block_number, scheduled_block_timestamp,
          scheduled_transaction_hash, executed_block_number, executed_block_timestamp,
          executed_transaction_hash
        )
        SELECT format('timelock-call:%s', i), $1, $2, $3, $4, $4, i, 0,
          format('operation-%s', i), format('timelock-operation:%s', i),
          format('baseline-proposal-%s', i), 0, $4, '0', '0x', NULL, 0, 'executed',
          $5 + i, $5 + i, format('0xtimelockcallscheduled%041s', i),
          $5 + i, $5 + i, format('0xtimelockcallexecuted%042s', i)
        FROM generate_series(0, $6::int - 1) AS i
        "#,
    )
    .bind(baseline.scope.chain_id)
    .bind(&baseline.scope.dao_code)
    .bind(&baseline.scope.governor)
    .bind(&baseline.scope.timelock)
    .bind(baseline.scope.start_block)
    .bind(baseline.counts.timelock_calls)
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO timelock_role_event (
          id, chain_id, dao_code, governor_address, timelock_address, contract_address, log_index,
          transaction_index, event_name, role, role_label, account, sender, block_number,
          block_timestamp, transaction_hash
        )
        SELECT format('timelock-role-event:%s', i), $1, $2, $3, $4, $4, i, 0,
          'RoleGranted', format('role-%s', i), format('role-%s', i),
          format('0xaccount%040s', i), $3, $5 + i, $5 + i,
          format('0xtimelockroleevent%045s', i)
        FROM generate_series(0, $6::int - 1) AS i
        "#,
    )
    .bind(baseline.scope.chain_id)
    .bind(&baseline.scope.dao_code)
    .bind(&baseline.scope.governor)
    .bind(&baseline.scope.timelock)
    .bind(baseline.scope.start_block)
    .bind(baseline.counts.timelock_role_events)
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO timelock_min_delay_change (
          id, chain_id, dao_code, governor_address, timelock_address, contract_address, log_index,
          transaction_index, old_duration, new_duration, block_number, block_timestamp,
          transaction_hash
        )
        SELECT format('timelock-min-delay-change:%s', i), $1, $2, $3, $4, $4, i, 0,
          0, 0, $5 + i, $5 + i, format('0xtimelockmindelay%047s', i)
        FROM generate_series(0, $6::int - 1) AS i
        "#,
    )
    .bind(baseline.scope.chain_id)
    .bind(&baseline.scope.dao_code)
    .bind(&baseline.scope.governor)
    .bind(&baseline.scope.timelock)
    .bind(baseline.scope.start_block)
    .bind(baseline.counts.timelock_min_delay_changes)
    .execute(pool)
    .await?;

    Ok(())
}

async fn seed_data_metrics(pool: &PgPool, baseline: &Baseline) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO data_metric (
          id, chain_id, dao_code, governor_address, token_address, proposals_count,
          votes_count, votes_with_params_count, votes_without_params_count,
          votes_weight_for_sum, votes_weight_against_sum, votes_weight_abstain_sum,
          power_sum, member_count
        )
        VALUES (
          'global', $1, $2, $3, $4, $5, $6, 0, $6, $7::numeric, $8::numeric, $9::numeric,
          $10::numeric, $11
        )
        "#,
    )
    .bind(baseline.scope.chain_id)
    .bind(&baseline.scope.dao_code)
    .bind(&baseline.scope.governor)
    .bind(&baseline.scope.token.address)
    .bind(baseline.counts.proposals as i32)
    .bind(baseline.counts.vote_casts as i32)
    .bind(&baseline.samples.latest_proposal.votes_weight_for_sum)
    .bind(&baseline.samples.latest_proposal.votes_weight_against_sum)
    .bind(&baseline.samples.latest_proposal.votes_weight_abstain_sum)
    .bind(&baseline.samples.top_contributor.power)
    .bind(baseline.counts.contributors as i32)
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO data_metric (
          id, chain_id, dao_code, governor_address, token_address, contract_address, log_index,
          transaction_index, proposals_count, votes_count, votes_with_params_count,
          votes_without_params_count, votes_weight_for_sum, votes_weight_against_sum,
          votes_weight_abstain_sum, power_sum, member_count
        )
        SELECT format('baseline-metric:%s', i), $1, $2, $3, $4, $3, i, 0,
          0, 0, 0, 0, 0, 0, 0, 0, 0
        FROM generate_series(0, $5::int - 2) AS i
        "#,
    )
    .bind(baseline.scope.chain_id)
    .bind(&baseline.scope.dao_code)
    .bind(&baseline.scope.governor)
    .bind(&baseline.scope.token.address)
    .bind(baseline.counts.data_metrics_connection_total_count)
    .execute(pool)
    .await?;

    Ok(())
}

async fn seed_status(pool: &PgPool, baseline: &Baseline) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO degov_indexer_checkpoint (
          dao_code, chain_id, stream_id, data_source_version, next_block, processed_height,
          target_height, updated_at
        )
        VALUES ($1, $2, 'evm.logs', 'datalens', $3 + 1, $3, $3, now())
        "#,
    )
    .bind(&baseline.scope.dao_code)
    .bind(baseline.scope.chain_id)
    .bind(
        baseline
            .samples
            .latest_proposal
            .block_number
            .parse::<i64>()
            .unwrap(),
    )
    .execute(pool)
    .await?;

    sqlx::query("INSERT INTO squid_processor.status (id, height, hash) VALUES (0, $1, '0xstatus')")
        .bind(
            baseline
                .samples
                .latest_proposal
                .block_number
                .parse::<i64>()
                .unwrap(),
        )
        .execute(pool)
        .await?;

    Ok(())
}
