use async_graphql::{
    ComplexObject, Context, EmptyMutation, EmptySubscription, Enum, InputObject, Object,
    Result as GraphqlResult, Schema, SimpleObject,
    http::{GraphiQLSource, graphiql_plugin_explorer},
};
use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use axum::{
    Router,
    response::{Html, IntoResponse},
    routing::{get, post},
};
use sqlx::{FromRow, PgPool, Postgres, QueryBuilder};

pub type IndexerGraphqlSchema = Schema<QueryRoot, EmptyMutation, EmptySubscription>;

#[derive(Clone)]
struct GraphqlState {
    pool: PgPool,
}

pub fn build_schema(pool: PgPool) -> IndexerGraphqlSchema {
    Schema::build(QueryRoot, EmptyMutation, EmptySubscription)
        .data(GraphqlState { pool })
        .finish()
}

pub fn build_router(schema: IndexerGraphqlSchema) -> Router {
    build_router_with_paths(schema, ["/graphql".to_owned()])
}

pub fn build_router_with_paths<I, S>(schema: IndexerGraphqlSchema, paths: I) -> Router
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut router = Router::new();
    for path in paths {
        let graphql_path = path.as_ref().to_owned();
        let graphiql_path = graphiql_path_for_graphql_path(&graphql_path);
        router = router.route(&graphql_path, post(graphql_handler)).route(
            &graphiql_path,
            get({
                let endpoint = graphql_path.clone();
                move || graphql_graphiql(endpoint.clone())
            }),
        );
    }
    router.with_state(schema)
}

async fn graphql_handler(
    axum::extract::State(schema): axum::extract::State<IndexerGraphqlSchema>,
    request: GraphQLRequest,
) -> GraphQLResponse {
    schema.execute(request.into_inner()).await.into()
}

async fn graphql_graphiql(endpoint: String) -> impl IntoResponse {
    Html(
        GraphiQLSource::build()
            .endpoint(&endpoint)
            .title("DeGov Indexer GraphiQL")
            .plugins(&[graphiql_plugin_explorer()])
            .finish(),
    )
}

fn graphiql_path_for_graphql_path(path: &str) -> String {
    path.strip_suffix("/graphql")
        .map(|prefix| {
            if prefix.is_empty() {
                "/graphiql".to_owned()
            } else {
                format!("{prefix}/graphiql")
            }
        })
        .unwrap_or_else(|| format!("{path}/graphiql"))
}

#[derive(Default)]
pub struct QueryRoot;

#[Object(rename_fields = "camelCase")]
impl QueryRoot {
    async fn proposals(
        &self,
        ctx: &Context<'_>,
        where_: Option<ProposalWhereInput>,
        order_by: Option<Vec<ProposalOrderByInput>>,
        offset: Option<i32>,
        limit: Option<i32>,
    ) -> GraphqlResult<Vec<Proposal>> {
        let pool = pool(ctx)?;
        query_proposals(pool, where_.as_ref(), order_by.as_deref(), offset, limit).await
    }

    async fn proposal_canceleds(
        &self,
        ctx: &Context<'_>,
        where_: Option<ProposalCanceledWhereInput>,
        order_by: Option<Vec<EventOrderByInput>>,
        offset: Option<i32>,
        limit: Option<i32>,
    ) -> GraphqlResult<Vec<ProposalCanceled>> {
        query_events(
            pool(ctx)?,
            "proposal_canceled",
            where_.as_ref(),
            order_by.as_deref(),
            offset,
            limit,
        )
        .await
    }

    async fn proposal_executeds(
        &self,
        ctx: &Context<'_>,
        where_: Option<ProposalExecutedWhereInput>,
        order_by: Option<Vec<EventOrderByInput>>,
        offset: Option<i32>,
        limit: Option<i32>,
    ) -> GraphqlResult<Vec<ProposalExecuted>> {
        query_events(
            pool(ctx)?,
            "proposal_executed",
            where_.as_ref(),
            order_by.as_deref(),
            offset,
            limit,
        )
        .await
    }

    async fn proposal_queueds(
        &self,
        ctx: &Context<'_>,
        where_: Option<ProposalQueuedWhereInput>,
        order_by: Option<Vec<EventOrderByInput>>,
        offset: Option<i32>,
        limit: Option<i32>,
    ) -> GraphqlResult<Vec<ProposalQueued>> {
        let pool = pool(ctx)?;
        let mut query = QueryBuilder::<Postgres>::new(
            r#"
            SELECT id, proposal_id, eta_seconds::text AS eta_seconds,
              block_number::text AS block_number, block_timestamp::text AS block_timestamp,
              transaction_hash
            FROM proposal_queued
            "#,
        );
        push_event_where(&mut query, where_.as_ref());
        push_event_order(&mut query, "proposal_queued", order_by.as_deref());
        push_page(&mut query, offset, limit);

        Ok(query.build_query_as().fetch_all(pool).await?)
    }

    async fn data_metrics(
        &self,
        ctx: &Context<'_>,
        where_: Option<DataMetricWhereInput>,
        order_by: Option<Vec<DataMetricOrderByInput>>,
        offset: Option<i32>,
        limit: Option<i32>,
    ) -> GraphqlResult<Vec<DataMetric>> {
        query_data_metrics(
            pool(ctx)?,
            where_.as_ref(),
            order_by.as_deref(),
            offset,
            limit,
        )
        .await
    }

    async fn contributors(
        &self,
        ctx: &Context<'_>,
        where_: Option<ContributorWhereInput>,
        order_by: Option<Vec<ContributorOrderByInput>>,
        offset: Option<i32>,
        limit: Option<i32>,
    ) -> GraphqlResult<Vec<Contributor>> {
        query_contributors(
            pool(ctx)?,
            where_.as_ref(),
            order_by.as_deref(),
            offset,
            limit,
        )
        .await
    }

    async fn delegates(
        &self,
        ctx: &Context<'_>,
        where_: Option<DelegateWhereInput>,
        order_by: Option<Vec<DelegateOrderByInput>>,
        offset: Option<i32>,
        limit: Option<i32>,
    ) -> GraphqlResult<Vec<Delegate>> {
        query_delegates(
            pool(ctx)?,
            where_.as_ref(),
            order_by.as_deref(),
            offset,
            limit,
        )
        .await
    }

    async fn delegate_mappings(
        &self,
        ctx: &Context<'_>,
        where_: Option<DelegateMappingWhereInput>,
        order_by: Option<Vec<DelegateMappingOrderByInput>>,
        offset: Option<i32>,
        limit: Option<i32>,
    ) -> GraphqlResult<Vec<DelegateMapping>> {
        query_delegate_mappings(
            pool(ctx)?,
            where_.as_ref(),
            order_by.as_deref(),
            offset,
            limit,
        )
        .await
    }

    async fn squid_status(&self, ctx: &Context<'_>) -> GraphqlResult<SquidStatus> {
        let pool = pool(ctx)?;
        let status = sqlx::query_as::<_, SquidStatus>(
            r#"
            SELECT
              COALESCE(MAX(processed_height), 0)::int8 AS finalized_height,
              COALESCE(MAX(processed_height), 0)::int8 AS height,
              (SELECT hash FROM squid_processor.status WHERE id = 0) AS hash,
              (SELECT hash FROM squid_processor.status WHERE id = 0) AS finalized_hash
            FROM degov_indexer_checkpoint
            "#,
        )
        .fetch_one(pool)
        .await?;

        Ok(status)
    }

    async fn proposals_connection(
        &self,
        ctx: &Context<'_>,
        where_: Option<ProposalWhereInput>,
        order_by: Option<Vec<ProposalOrderByInput>>,
    ) -> GraphqlResult<Connection> {
        let _ = order_by;
        Ok(Connection {
            total_count: count_proposals(pool(ctx)?, where_.as_ref()).await?,
        })
    }

    async fn contributors_connection(
        &self,
        ctx: &Context<'_>,
        where_: Option<ContributorWhereInput>,
        order_by: Option<Vec<ContributorOrderByInput>>,
    ) -> GraphqlResult<Connection> {
        let _ = order_by;
        Ok(Connection {
            total_count: count_contributors(pool(ctx)?, where_.as_ref()).await?,
        })
    }

    async fn delegates_connection(
        &self,
        ctx: &Context<'_>,
        where_: Option<DelegateWhereInput>,
        order_by: Option<Vec<DelegateOrderByInput>>,
    ) -> GraphqlResult<Connection> {
        let _ = order_by;
        Ok(Connection {
            total_count: count_delegates(pool(ctx)?, where_.as_ref()).await?,
        })
    }

    async fn delegate_mappings_connection(
        &self,
        ctx: &Context<'_>,
        where_: Option<DelegateMappingWhereInput>,
        order_by: Option<Vec<DelegateMappingOrderByInput>>,
    ) -> GraphqlResult<Connection> {
        let _ = order_by;
        Ok(Connection {
            total_count: count_delegate_mappings(pool(ctx)?, where_.as_ref()).await?,
        })
    }

    async fn data_metrics_connection(
        &self,
        ctx: &Context<'_>,
        where_: Option<DataMetricWhereInput>,
        order_by: Option<Vec<DataMetricOrderByInput>>,
    ) -> GraphqlResult<Connection> {
        let _ = order_by;
        Ok(Connection {
            total_count: count_data_metrics(pool(ctx)?, where_.as_ref()).await?,
        })
    }
}

#[derive(Clone, Debug, FromRow, SimpleObject)]
#[graphql(rename_fields = "camelCase", complex)]
pub struct Proposal {
    id: String,
    chain_id: Option<i32>,
    dao_code: Option<String>,
    governor_address: Option<String>,
    proposal_id: String,
    proposer: String,
    targets: Vec<String>,
    values: Vec<String>,
    signatures: Vec<String>,
    calldatas: Vec<String>,
    vote_start: String,
    vote_end: String,
    description: String,
    block_number: String,
    block_timestamp: String,
    transaction_hash: String,
    metrics_votes_count: Option<i32>,
    metrics_votes_with_params_count: Option<i32>,
    metrics_votes_without_params_count: Option<i32>,
    metrics_votes_weight_for_sum: Option<String>,
    metrics_votes_weight_against_sum: Option<String>,
    metrics_votes_weight_abstain_sum: Option<String>,
    title: String,
    vote_start_timestamp: String,
    vote_end_timestamp: String,
    block_interval: Option<String>,
    clock_mode: String,
    proposal_deadline: Option<String>,
    proposal_eta: Option<String>,
    queue_ready_at: Option<String>,
    queue_expires_at: Option<String>,
    quorum: String,
    decimals: String,
    timelock_address: Option<String>,
    timelock_grace_period: Option<String>,
}

#[ComplexObject(rename_fields = "camelCase")]
impl Proposal {
    async fn voters(
        &self,
        ctx: &Context<'_>,
        where_: Option<VoteCastGroupWhereInput>,
        order_by: Option<Vec<VoteCastGroupOrderByInput>>,
        offset: Option<i32>,
        limit: Option<i32>,
    ) -> GraphqlResult<Vec<VoteCastGroup>> {
        let pool = pool(ctx)?;
        let mut query = QueryBuilder::<Postgres>::new(
            r#"
            SELECT id, type, params, voter, support, weight::text AS weight, reason,
              block_number::text AS block_number, block_timestamp::text AS block_timestamp,
              transaction_hash
            FROM vote_cast_group
            "#,
        );
        query
            .push(" WHERE (proposal_id = ")
            .push_bind(&self.id)
            .push(" OR (ref_proposal_id = ")
            .push_bind(&self.proposal_id);
        if let Some(chain_id) = self.chain_id {
            query.push(" AND chain_id = ").push_bind(chain_id);
        }
        if let Some(governor_address) = &self.governor_address {
            query
                .push(" AND governor_address = ")
                .push_bind(governor_address);
        }
        if let Some(dao_code) = &self.dao_code {
            query.push(" AND dao_code = ").push_bind(dao_code);
        }
        query.push("))");
        let mut has_condition = true;
        push_vote_cast_group_where(&mut query, &mut has_condition, where_.as_ref());
        push_vote_cast_group_order(&mut query, order_by.as_deref());
        push_page(&mut query, offset, limit);

        Ok(query.build_query_as().fetch_all(pool).await?)
    }
}

#[derive(Clone, Debug, FromRow, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct VoteCastGroup {
    id: String,
    r#type: String,
    params: Option<String>,
    voter: String,
    support: i32,
    weight: String,
    reason: String,
    block_number: String,
    block_timestamp: String,
    transaction_hash: String,
}

#[derive(Clone, Debug, FromRow, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct ProposalCanceled {
    id: String,
    proposal_id: String,
    block_number: String,
    block_timestamp: String,
    transaction_hash: String,
}

#[derive(Clone, Debug, FromRow, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct ProposalExecuted {
    id: String,
    proposal_id: String,
    block_number: String,
    block_timestamp: String,
    transaction_hash: String,
}

#[derive(Clone, Debug, FromRow, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct ProposalQueued {
    id: String,
    proposal_id: String,
    eta_seconds: String,
    block_number: String,
    block_timestamp: String,
    transaction_hash: String,
}

#[derive(Clone, Debug, FromRow, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct DataMetric {
    id: String,
    chain_id: Option<i32>,
    dao_code: Option<String>,
    governor_address: Option<String>,
    token_address: Option<String>,
    contract_address: Option<String>,
    log_index: Option<i32>,
    transaction_index: Option<i32>,
    proposals_count: Option<i32>,
    votes_count: Option<i32>,
    votes_with_params_count: Option<i32>,
    votes_without_params_count: Option<i32>,
    votes_weight_for_sum: Option<String>,
    votes_weight_against_sum: Option<String>,
    votes_weight_abstain_sum: Option<String>,
    power_sum: Option<String>,
    member_count: Option<i32>,
}

#[derive(Clone, Debug, FromRow, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct Contributor {
    id: String,
    chain_id: Option<i32>,
    dao_code: Option<String>,
    governor_address: Option<String>,
    block_number: String,
    block_timestamp: String,
    transaction_hash: String,
    last_vote_timestamp: Option<String>,
    power: String,
    balance: Option<String>,
    delegates_count_all: i32,
}

#[derive(Clone, Debug, FromRow, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct Delegate {
    id: String,
    chain_id: Option<i32>,
    dao_code: Option<String>,
    governor_address: Option<String>,
    from_delegate: String,
    to_delegate: String,
    block_number: String,
    block_timestamp: String,
    transaction_hash: String,
    is_current: bool,
    power: String,
}

#[derive(Clone, Debug, FromRow, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct DelegateMapping {
    id: String,
    chain_id: Option<i32>,
    dao_code: Option<String>,
    governor_address: Option<String>,
    from: String,
    to: String,
    power: String,
    block_number: String,
    block_timestamp: String,
    transaction_hash: String,
}

#[derive(Clone, Debug, FromRow, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct SquidStatus {
    height: i64,
    finalized_height: i64,
    hash: Option<String>,
    finalized_hash: Option<String>,
}

#[derive(Clone, Debug, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct Connection {
    total_count: i64,
}

#[derive(Clone, Debug, Default, InputObject)]
#[graphql(rename_fields = "camelCase")]
pub struct ScopeWhereInput {
    #[graphql(name = "chainId_eq")]
    chain_id_eq: Option<i32>,
    #[graphql(name = "governorAddress_eq")]
    governor_address_eq: Option<String>,
    #[graphql(name = "daoCode_eq")]
    dao_code_eq: Option<String>,
}

#[derive(Clone, Debug, Default, InputObject)]
#[graphql(rename_fields = "camelCase")]
pub struct ProposalWhereInput {
    #[graphql(flatten)]
    scope: ScopeWhereInput,
    #[graphql(name = "proposalId_eq")]
    proposal_id_eq: Option<String>,
    #[graphql(name = "proposer_eq")]
    proposer_eq: Option<String>,
    #[graphql(name = "description_containsInsensitive")]
    description_contains_insensitive: Option<String>,
    #[graphql(name = "voters_some")]
    voters_some: Option<VoteCastGroupWhereInput>,
    #[graphql(name = "OR")]
    or: Option<Vec<ProposalWhereInput>>,
}

#[derive(Clone, Debug, Default, InputObject)]
#[graphql(rename_fields = "camelCase")]
pub struct VoteCastGroupWhereInput {
    #[graphql(name = "voter_eq")]
    voter_eq: Option<String>,
    #[graphql(name = "support_eq")]
    support_eq: Option<i32>,
    #[graphql(name = "OR")]
    or: Option<Vec<VoteCastGroupWhereInput>>,
}

macro_rules! proposal_event_where_input {
    ($name:ident, $graphql_name:literal) => {
        #[derive(Clone, Debug, Default, InputObject)]
        #[graphql(name = $graphql_name, rename_fields = "camelCase")]
        pub struct $name {
            #[graphql(flatten)]
            scope: ScopeWhereInput,
            #[graphql(name = "proposalId_eq")]
            proposal_id_eq: Option<String>,
        }

        impl ProposalEventWhere for $name {
            fn scope(&self) -> &ScopeWhereInput {
                &self.scope
            }

            fn proposal_id_eq(&self) -> Option<&String> {
                self.proposal_id_eq.as_ref()
            }
        }
    };
}

proposal_event_where_input!(ProposalCanceledWhereInput, "ProposalCanceledWhereInput");
proposal_event_where_input!(ProposalExecutedWhereInput, "ProposalExecutedWhereInput");
proposal_event_where_input!(ProposalQueuedWhereInput, "ProposalQueuedWhereInput");

trait ProposalEventWhere {
    fn scope(&self) -> &ScopeWhereInput;
    fn proposal_id_eq(&self) -> Option<&String>;
}

#[derive(Clone, Debug, Default, InputObject)]
#[graphql(rename_fields = "camelCase")]
pub struct DataMetricWhereInput {
    #[graphql(flatten)]
    scope: ScopeWhereInput,
    #[graphql(name = "id_eq")]
    id_eq: Option<String>,
    #[graphql(name = "proposalsCount_eq")]
    proposals_count_eq: Option<i32>,
    #[graphql(name = "votesCount_eq")]
    votes_count_eq: Option<i32>,
    #[graphql(name = "votesWithParamsCount_eq")]
    votes_with_params_count_eq: Option<i32>,
    #[graphql(name = "votesWithoutParamsCount_eq")]
    votes_without_params_count_eq: Option<i32>,
    #[graphql(name = "votesWeightForSum_eq")]
    votes_weight_for_sum_eq: Option<String>,
    #[graphql(name = "votesWeightAgainstSum_eq")]
    votes_weight_against_sum_eq: Option<String>,
    #[graphql(name = "votesWeightAbstainSum_eq")]
    votes_weight_abstain_sum_eq: Option<String>,
    #[graphql(name = "OR")]
    or: Option<Vec<DataMetricWhereInput>>,
}

#[derive(Clone, Debug, Default, InputObject)]
#[graphql(rename_fields = "camelCase")]
pub struct ContributorWhereInput {
    #[graphql(flatten)]
    scope: ScopeWhereInput,
    #[graphql(name = "id_eq")]
    id_eq: Option<String>,
    #[graphql(name = "id_in")]
    id_in: Option<Vec<String>>,
    #[graphql(name = "id_not_eq")]
    id_not_eq: Option<String>,
    #[graphql(name = "power_lt")]
    power_lt: Option<i64>,
    #[graphql(name = "OR")]
    or: Option<Vec<ContributorWhereInput>>,
}

#[derive(Clone, Debug, Default, InputObject)]
#[graphql(rename_fields = "camelCase")]
pub struct DelegateWhereInput {
    #[graphql(flatten)]
    scope: ScopeWhereInput,
    #[graphql(name = "fromDelegate_eq")]
    from_delegate_eq: Option<String>,
    #[graphql(name = "toDelegate_eq")]
    to_delegate_eq: Option<String>,
    #[graphql(name = "isCurrent_eq")]
    is_current_eq: Option<bool>,
    #[graphql(name = "power_lt")]
    power_lt: Option<i64>,
    #[graphql(name = "OR")]
    or: Option<Vec<DelegateWhereInput>>,
}

#[derive(Clone, Debug, Default, InputObject)]
#[graphql(rename_fields = "camelCase")]
pub struct DelegateMappingWhereInput {
    #[graphql(flatten)]
    scope: ScopeWhereInput,
    #[graphql(name = "from_eq")]
    from_eq: Option<String>,
    #[graphql(name = "to_eq")]
    to_eq: Option<String>,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, Enum)]
#[graphql(rename_items = "camelCase")]
pub enum ProposalOrderByInput {
    #[graphql(name = "blockTimestamp_DESC_NULLS_LAST")]
    BlockTimestampDescNullsLast,
    #[graphql(name = "id_ASC")]
    IdAsc,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, Enum)]
pub enum VoteCastGroupOrderByInput {
    #[graphql(name = "blockTimestamp_ASC_NULLS_LAST")]
    BlockTimestampAscNullsLast,
    #[graphql(name = "blockTimestamp_DESC_NULLS_LAST")]
    BlockTimestampDescNullsLast,
    #[graphql(name = "id_ASC")]
    IdAsc,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, Enum)]
pub enum EventOrderByInput {
    #[graphql(name = "blockTimestamp_ASC_NULLS_LAST")]
    BlockTimestampAscNullsLast,
    #[graphql(name = "blockTimestamp_DESC_NULLS_LAST")]
    BlockTimestampDescNullsLast,
    #[graphql(name = "id_ASC")]
    IdAsc,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, Enum)]
pub enum DataMetricOrderByInput {
    #[graphql(name = "id_ASC")]
    IdAsc,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, Enum)]
pub enum ContributorOrderByInput {
    #[graphql(name = "power_DESC")]
    PowerDesc,
    #[graphql(name = "power_ASC")]
    PowerAsc,
    #[graphql(name = "lastVoteTimestamp_ASC_NULLS_LAST")]
    LastVoteTimestampAscNullsLast,
    #[graphql(name = "lastVoteTimestamp_DESC_NULLS_LAST")]
    LastVoteTimestampDescNullsLast,
    #[graphql(name = "delegatesCountAll_ASC")]
    DelegatesCountAllAsc,
    #[graphql(name = "delegatesCountAll_DESC")]
    DelegatesCountAllDesc,
    #[graphql(name = "id_ASC")]
    IdAsc,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, Enum)]
pub enum DelegateOrderByInput {
    #[graphql(name = "blockTimestamp_ASC_NULLS_LAST")]
    BlockTimestampAscNullsLast,
    #[graphql(name = "blockTimestamp_DESC_NULLS_LAST")]
    BlockTimestampDescNullsLast,
    #[graphql(name = "power_ASC")]
    PowerAsc,
    #[graphql(name = "power_DESC")]
    PowerDesc,
    #[graphql(name = "id_ASC")]
    IdAsc,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, Enum)]
pub enum DelegateMappingOrderByInput {
    #[graphql(name = "id_ASC")]
    IdAsc,
    #[graphql(name = "power_DESC")]
    PowerDesc,
    #[graphql(name = "blockNumber_DESC")]
    BlockNumberDesc,
}

async fn query_proposals(
    pool: &PgPool,
    where_: Option<&ProposalWhereInput>,
    order_by: Option<&[ProposalOrderByInput]>,
    offset: Option<i32>,
    limit: Option<i32>,
) -> GraphqlResult<Vec<Proposal>> {
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT id, chain_id, dao_code, governor_address, proposal_id, proposer, targets, values,
          signatures, calldatas, vote_start::text AS vote_start, vote_end::text AS vote_end,
          description, block_number::text AS block_number, block_timestamp::text AS block_timestamp,
          transaction_hash, metrics_votes_count, metrics_votes_with_params_count,
          metrics_votes_without_params_count, metrics_votes_weight_for_sum::text AS metrics_votes_weight_for_sum,
          metrics_votes_weight_against_sum::text AS metrics_votes_weight_against_sum,
          metrics_votes_weight_abstain_sum::text AS metrics_votes_weight_abstain_sum, title,
          vote_start_timestamp::text AS vote_start_timestamp, vote_end_timestamp::text AS vote_end_timestamp,
          block_interval, clock_mode, proposal_deadline::text AS proposal_deadline,
          proposal_eta::text AS proposal_eta, queue_ready_at::text AS queue_ready_at,
          queue_expires_at::text AS queue_expires_at, quorum::text AS quorum, decimals::text AS decimals,
          timelock_address, timelock_grace_period::text AS timelock_grace_period
        FROM proposal
        "#,
    );
    push_proposal_where(&mut query, where_);
    push_proposal_order(&mut query, order_by);
    push_page(&mut query, offset, limit);

    Ok(query.build_query_as().fetch_all(pool).await?)
}

async fn count_proposals(pool: &PgPool, where_: Option<&ProposalWhereInput>) -> GraphqlResult<i64> {
    let mut query = QueryBuilder::<Postgres>::new("SELECT COUNT(*)::int8 AS total FROM proposal");
    push_proposal_where(&mut query, where_);
    let (total,): (i64,) = query.build_query_as().fetch_one(pool).await?;
    Ok(total)
}

async fn query_events<T>(
    pool: &PgPool,
    table: &'static str,
    where_: Option<&impl ProposalEventWhere>,
    order_by: Option<&[EventOrderByInput]>,
    offset: Option<i32>,
    limit: Option<i32>,
) -> GraphqlResult<Vec<T>>
where
    T: for<'r> FromRow<'r, sqlx::postgres::PgRow> + Send + Unpin,
{
    let mut query = QueryBuilder::<Postgres>::new(format!(
        r#"
        SELECT id, proposal_id, block_number::text AS block_number,
          block_timestamp::text AS block_timestamp, transaction_hash
        FROM {table}
        "#
    ));
    push_event_where(&mut query, where_);
    push_event_order(&mut query, table, order_by);
    push_page(&mut query, offset, limit);

    Ok(query.build_query_as().fetch_all(pool).await?)
}

async fn query_data_metrics(
    pool: &PgPool,
    where_: Option<&DataMetricWhereInput>,
    order_by: Option<&[DataMetricOrderByInput]>,
    offset: Option<i32>,
    limit: Option<i32>,
) -> GraphqlResult<Vec<DataMetric>> {
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT id, chain_id, dao_code, governor_address, token_address, contract_address,
          log_index, transaction_index, proposals_count, votes_count, votes_with_params_count,
          votes_without_params_count, votes_weight_for_sum::text AS votes_weight_for_sum,
          votes_weight_against_sum::text AS votes_weight_against_sum,
          votes_weight_abstain_sum::text AS votes_weight_abstain_sum,
          power_sum::text AS power_sum, member_count
        FROM data_metric
        "#,
    );
    push_data_metric_where(&mut query, where_);
    push_data_metric_order(&mut query, order_by);
    push_page(&mut query, offset, limit);

    Ok(query.build_query_as().fetch_all(pool).await?)
}

async fn count_data_metrics(
    pool: &PgPool,
    where_: Option<&DataMetricWhereInput>,
) -> GraphqlResult<i64> {
    let mut query =
        QueryBuilder::<Postgres>::new("SELECT COUNT(*)::int8 AS total FROM data_metric");
    push_data_metric_where(&mut query, where_);
    let (total,): (i64,) = query.build_query_as().fetch_one(pool).await?;
    Ok(total)
}

async fn query_contributors(
    pool: &PgPool,
    where_: Option<&ContributorWhereInput>,
    order_by: Option<&[ContributorOrderByInput]>,
    offset: Option<i32>,
    limit: Option<i32>,
) -> GraphqlResult<Vec<Contributor>> {
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT id, chain_id, dao_code, governor_address, block_number::text AS block_number,
          block_timestamp::text AS block_timestamp, transaction_hash,
          last_vote_timestamp::text AS last_vote_timestamp, power::text AS power,
          balance::text AS balance, delegates_count_all
        FROM contributor
        "#,
    );
    push_contributor_where(&mut query, where_);
    push_contributor_order(&mut query, order_by);
    push_page(&mut query, offset, limit);

    Ok(query.build_query_as().fetch_all(pool).await?)
}

async fn query_delegates(
    pool: &PgPool,
    where_: Option<&DelegateWhereInput>,
    order_by: Option<&[DelegateOrderByInput]>,
    offset: Option<i32>,
    limit: Option<i32>,
) -> GraphqlResult<Vec<Delegate>> {
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT id, chain_id, dao_code, governor_address, from_delegate, to_delegate,
          block_number::text AS block_number, block_timestamp::text AS block_timestamp,
          transaction_hash, is_current, power::text AS power
        FROM delegate
        "#,
    );
    push_delegate_where(&mut query, where_);
    push_delegate_order(&mut query, order_by);
    push_page(&mut query, offset, limit);

    Ok(query.build_query_as().fetch_all(pool).await?)
}

async fn query_delegate_mappings(
    pool: &PgPool,
    where_: Option<&DelegateMappingWhereInput>,
    order_by: Option<&[DelegateMappingOrderByInput]>,
    offset: Option<i32>,
    limit: Option<i32>,
) -> GraphqlResult<Vec<DelegateMapping>> {
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT id, chain_id, dao_code, governor_address, "from", "to", power::text AS power,
          block_number::text AS block_number, block_timestamp::text AS block_timestamp,
          transaction_hash
        FROM delegate_mapping
        "#,
    );
    push_delegate_mapping_where(&mut query, where_);
    push_delegate_mapping_order(&mut query, order_by);
    push_page(&mut query, offset, limit);

    Ok(query.build_query_as().fetch_all(pool).await?)
}

async fn count_contributors(
    pool: &PgPool,
    where_: Option<&ContributorWhereInput>,
) -> GraphqlResult<i64> {
    let mut query =
        QueryBuilder::<Postgres>::new("SELECT COUNT(*)::int8 AS total FROM contributor");
    push_contributor_where(&mut query, where_);
    let (total,): (i64,) = query.build_query_as().fetch_one(pool).await?;
    Ok(total)
}

async fn count_delegates(pool: &PgPool, where_: Option<&DelegateWhereInput>) -> GraphqlResult<i64> {
    let mut query = QueryBuilder::<Postgres>::new("SELECT COUNT(*)::int8 AS total FROM delegate");
    push_delegate_where(&mut query, where_);
    let (total,): (i64,) = query.build_query_as().fetch_one(pool).await?;
    Ok(total)
}

async fn count_delegate_mappings(
    pool: &PgPool,
    where_: Option<&DelegateMappingWhereInput>,
) -> GraphqlResult<i64> {
    let mut query =
        QueryBuilder::<Postgres>::new("SELECT COUNT(*)::int8 AS total FROM delegate_mapping");
    push_delegate_mapping_where(&mut query, where_);
    let (total,): (i64,) = query.build_query_as().fetch_one(pool).await?;
    Ok(total)
}

fn push_proposal_where<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    where_: Option<&'a ProposalWhereInput>,
) {
    if let Some(where_) = where_ {
        query.push(" WHERE ");
        let mut has_condition = false;
        push_proposal_filters(query, &mut has_condition, where_, "proposal");
        if !has_condition {
            query.push("TRUE");
        }
    }
}

fn push_proposal_filters<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    has_condition: &mut bool,
    where_: &'a ProposalWhereInput,
    table_alias: &str,
) {
    push_scope_filters(query, has_condition, &where_.scope, table_alias);
    if let Some(proposal_id) = &where_.proposal_id_eq {
        push_column_eq(
            query,
            has_condition,
            table_alias,
            "proposal_id",
            proposal_id,
        );
    }
    if let Some(proposer) = &where_.proposer_eq {
        push_column_eq(query, has_condition, table_alias, "proposer", proposer);
    }
    if let Some(description) = &where_.description_contains_insensitive {
        push_and(query, has_condition);
        push_qualified_column(query, table_alias, "description");
        query
            .push(" ILIKE '%' || ")
            .push_bind(description)
            .push(" || '%'");
    }
    if let Some(voters_some) = &where_.voters_some {
        push_and(query, has_condition);
        query.push("EXISTS (SELECT 1 FROM vote_cast_group v WHERE v.proposal_id = proposal.id");
        let mut nested_has_condition = true;
        push_vote_cast_group_filters(query, &mut nested_has_condition, voters_some, "v");
        query.push(")");
    }
    if let Some(or) = &where_.or {
        push_or_group(query, has_condition, or, |query, has_condition, filter| {
            push_proposal_filters(query, has_condition, filter, table_alias);
        });
    }
}

fn push_vote_cast_group_where<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    has_condition: &mut bool,
    where_: Option<&'a VoteCastGroupWhereInput>,
) {
    if let Some(where_) = where_ {
        push_vote_cast_group_filters(query, has_condition, where_, "");
    }
}

fn push_vote_cast_group_filters<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    has_condition: &mut bool,
    where_: &'a VoteCastGroupWhereInput,
    table_alias: &str,
) {
    if let Some(voter) = &where_.voter_eq {
        push_column_eq(query, has_condition, table_alias, "voter", voter);
    }
    if let Some(support) = where_.support_eq {
        push_column_eq(query, has_condition, table_alias, "support", support);
    }
    if let Some(or) = &where_.or {
        push_or_group(query, has_condition, or, |query, has_condition, filter| {
            push_vote_cast_group_filters(query, has_condition, filter, table_alias);
        });
    }
}

fn push_event_where<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    where_: Option<&'a impl ProposalEventWhere>,
) {
    if let Some(where_) = where_ {
        query.push(" WHERE ");
        let mut has_condition = false;
        push_scope_filters(query, &mut has_condition, where_.scope(), "");
        if let Some(proposal_id) = where_.proposal_id_eq() {
            push_column_eq(query, &mut has_condition, "", "proposal_id", proposal_id);
        }
        if !has_condition {
            query.push("TRUE");
        }
    }
}

fn push_data_metric_where<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    where_: Option<&'a DataMetricWhereInput>,
) {
    if let Some(where_) = where_ {
        query.push(" WHERE ");
        let mut has_condition = false;
        push_data_metric_filters(query, &mut has_condition, where_, "");
        if !has_condition {
            query.push("TRUE");
        }
    }
}

fn push_data_metric_filters<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    has_condition: &mut bool,
    where_: &'a DataMetricWhereInput,
    table_alias: &str,
) {
    push_scope_filters(query, has_condition, &where_.scope, table_alias);
    if let Some(id) = &where_.id_eq {
        push_column_eq(query, has_condition, table_alias, "id", id);
    }
    if let Some(proposals_count) = where_.proposals_count_eq {
        push_column_eq(
            query,
            has_condition,
            table_alias,
            "proposals_count",
            proposals_count,
        );
    }
    if let Some(votes_count) = where_.votes_count_eq {
        push_column_eq(
            query,
            has_condition,
            table_alias,
            "votes_count",
            votes_count,
        );
    }
    if let Some(votes_with_params_count) = where_.votes_with_params_count_eq {
        push_column_eq(
            query,
            has_condition,
            table_alias,
            "votes_with_params_count",
            votes_with_params_count,
        );
    }
    if let Some(votes_without_params_count) = where_.votes_without_params_count_eq {
        push_column_eq(
            query,
            has_condition,
            table_alias,
            "votes_without_params_count",
            votes_without_params_count,
        );
    }
    if let Some(votes_weight_for_sum) = &where_.votes_weight_for_sum_eq {
        push_numeric_column_eq(
            query,
            has_condition,
            table_alias,
            "votes_weight_for_sum",
            votes_weight_for_sum,
        );
    }
    if let Some(votes_weight_against_sum) = &where_.votes_weight_against_sum_eq {
        push_numeric_column_eq(
            query,
            has_condition,
            table_alias,
            "votes_weight_against_sum",
            votes_weight_against_sum,
        );
    }
    if let Some(votes_weight_abstain_sum) = &where_.votes_weight_abstain_sum_eq {
        push_numeric_column_eq(
            query,
            has_condition,
            table_alias,
            "votes_weight_abstain_sum",
            votes_weight_abstain_sum,
        );
    }
    if let Some(or) = &where_.or {
        push_or_group(query, has_condition, or, |query, has_condition, filter| {
            push_data_metric_filters(query, has_condition, filter, table_alias);
        });
    }
}

fn push_contributor_where<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    where_: Option<&'a ContributorWhereInput>,
) {
    if let Some(where_) = where_ {
        query.push(" WHERE ");
        let mut has_condition = false;
        push_contributor_filters(query, &mut has_condition, where_, "");
        if !has_condition {
            query.push("TRUE");
        }
    }
}

fn push_contributor_filters<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    has_condition: &mut bool,
    where_: &'a ContributorWhereInput,
    table_alias: &str,
) {
    push_scope_filters(query, has_condition, &where_.scope, table_alias);
    if let Some(id) = &where_.id_eq {
        push_column_eq(query, has_condition, table_alias, "id", id);
    }
    if let Some(ids) = &where_.id_in {
        push_and(query, has_condition);
        push_qualified_column(query, table_alias, "id");
        query.push(" = ANY(").push_bind(ids).push(")");
    }
    if let Some(id) = &where_.id_not_eq {
        push_and(query, has_condition);
        push_qualified_column(query, table_alias, "id");
        query.push(" <> ").push_bind(id);
    }
    if let Some(power) = where_.power_lt {
        push_and(query, has_condition);
        push_qualified_column(query, table_alias, "power");
        query.push(" < ").push_bind(power).push("::numeric");
    }
    if let Some(or) = &where_.or {
        push_or_group(query, has_condition, or, |query, has_condition, filter| {
            push_contributor_filters(query, has_condition, filter, table_alias);
        });
    }
}

fn push_delegate_where<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    where_: Option<&'a DelegateWhereInput>,
) {
    if let Some(where_) = where_ {
        query.push(" WHERE ");
        let mut has_condition = false;
        push_delegate_filters(query, &mut has_condition, where_, "");
        if !has_condition {
            query.push("TRUE");
        }
    }
}

fn push_delegate_filters<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    has_condition: &mut bool,
    where_: &'a DelegateWhereInput,
    table_alias: &str,
) {
    push_scope_filters(query, has_condition, &where_.scope, table_alias);
    if let Some(from_delegate) = &where_.from_delegate_eq {
        push_column_eq(
            query,
            has_condition,
            table_alias,
            "from_delegate",
            from_delegate,
        );
    }
    if let Some(to_delegate) = &where_.to_delegate_eq {
        push_column_eq(
            query,
            has_condition,
            table_alias,
            "to_delegate",
            to_delegate,
        );
    }
    if let Some(is_current) = where_.is_current_eq {
        push_column_eq(query, has_condition, table_alias, "is_current", is_current);
    }
    if let Some(power) = where_.power_lt {
        push_and(query, has_condition);
        push_qualified_column(query, table_alias, "power");
        query.push(" < ").push_bind(power).push("::numeric");
    }
    if let Some(or) = &where_.or {
        push_or_group(query, has_condition, or, |query, has_condition, filter| {
            push_delegate_filters(query, has_condition, filter, table_alias);
        });
    }
}

fn push_delegate_mapping_where<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    where_: Option<&'a DelegateMappingWhereInput>,
) {
    if let Some(where_) = where_ {
        query.push(" WHERE ");
        let mut has_condition = false;
        push_scope_filters(query, &mut has_condition, &where_.scope, "");
        if let Some(from) = &where_.from_eq {
            push_column_eq(query, &mut has_condition, "", r#""from""#, from);
        }
        if let Some(to) = &where_.to_eq {
            push_column_eq(query, &mut has_condition, "", r#""to""#, to);
        }
        if !has_condition {
            query.push("TRUE");
        }
    }
}

fn push_scope_filters<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    has_condition: &mut bool,
    scope: &'a ScopeWhereInput,
    table_alias: &str,
) {
    if let Some(chain_id) = scope.chain_id_eq {
        push_column_eq(query, has_condition, table_alias, "chain_id", chain_id);
    }
    if let Some(governor_address) = &scope.governor_address_eq {
        push_column_eq(
            query,
            has_condition,
            table_alias,
            "governor_address",
            governor_address,
        );
    }
    if let Some(dao_code) = &scope.dao_code_eq {
        push_column_eq(query, has_condition, table_alias, "dao_code", dao_code);
    }
}

fn push_or_group<'a, T, F>(
    query: &mut QueryBuilder<'a, Postgres>,
    has_condition: &mut bool,
    filters: &'a [T],
    mut push_filter: F,
) where
    F: FnMut(&mut QueryBuilder<'a, Postgres>, &mut bool, &'a T),
{
    if filters.is_empty() {
        return;
    }
    push_and(query, has_condition);
    query.push("(");
    for (index, filter) in filters.iter().enumerate() {
        if index > 0 {
            query.push(" OR ");
        }
        query.push("(");
        let mut nested_has_condition = false;
        push_filter(query, &mut nested_has_condition, filter);
        if !nested_has_condition {
            query.push("TRUE");
        }
        query.push(")");
    }
    query.push(")");
}

fn push_column_eq<'a, T>(
    query: &mut QueryBuilder<'a, Postgres>,
    has_condition: &mut bool,
    table_alias: &str,
    column: &str,
    value: T,
) where
    T: 'a + sqlx::Encode<'a, Postgres> + sqlx::Type<Postgres>,
{
    push_and(query, has_condition);
    push_qualified_column(query, table_alias, column);
    query.push(" = ").push_bind(value);
}

fn push_numeric_column_eq<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    has_condition: &mut bool,
    table_alias: &str,
    column: &str,
    value: &'a str,
) {
    push_and(query, has_condition);
    push_qualified_column(query, table_alias, column);
    query.push(" = ").push_bind(value).push("::numeric");
}

fn push_qualified_column(query: &mut QueryBuilder<'_, Postgres>, table_alias: &str, column: &str) {
    if table_alias.is_empty() {
        query.push(column);
    } else {
        query.push(table_alias).push(".").push(column);
    }
}

fn push_and(query: &mut QueryBuilder<'_, Postgres>, has_condition: &mut bool) {
    if *has_condition {
        query.push(" AND ");
    } else {
        *has_condition = true;
    }
}

fn push_data_metric_order(
    query: &mut QueryBuilder<'_, Postgres>,
    order_by: Option<&[DataMetricOrderByInput]>,
) {
    push_order(
        query,
        order_by.unwrap_or(&[DataMetricOrderByInput::IdAsc]),
        |order| match order {
            DataMetricOrderByInput::IdAsc => "data_metric.id ASC",
        },
    );
}

fn push_proposal_order(
    query: &mut QueryBuilder<'_, Postgres>,
    order_by: Option<&[ProposalOrderByInput]>,
) {
    push_order(
        query,
        order_by.unwrap_or(&[ProposalOrderByInput::IdAsc]),
        |order| match order {
            ProposalOrderByInput::BlockTimestampDescNullsLast => {
                "proposal.block_timestamp DESC NULLS LAST"
            }
            ProposalOrderByInput::IdAsc => "proposal.id ASC",
        },
    );
}

fn push_vote_cast_group_order(
    query: &mut QueryBuilder<'_, Postgres>,
    order_by: Option<&[VoteCastGroupOrderByInput]>,
) {
    push_order(
        query,
        order_by.unwrap_or(&[VoteCastGroupOrderByInput::IdAsc]),
        |order| match order {
            VoteCastGroupOrderByInput::BlockTimestampAscNullsLast => {
                "vote_cast_group.block_timestamp ASC NULLS LAST"
            }
            VoteCastGroupOrderByInput::BlockTimestampDescNullsLast => {
                "vote_cast_group.block_timestamp DESC NULLS LAST"
            }
            VoteCastGroupOrderByInput::IdAsc => "vote_cast_group.id ASC",
        },
    );
}

fn push_event_order(
    query: &mut QueryBuilder<'_, Postgres>,
    table: &'static str,
    order_by: Option<&[EventOrderByInput]>,
) {
    let order_by = order_by.unwrap_or(&[EventOrderByInput::IdAsc]);
    if order_by.is_empty() {
        return;
    }
    query.push(" ORDER BY ");
    let mut separated = query.separated(", ");
    for order in order_by {
        match order {
            EventOrderByInput::BlockTimestampAscNullsLast => {
                separated
                    .push(table)
                    .push_unseparated(".block_timestamp ASC NULLS LAST");
            }
            EventOrderByInput::BlockTimestampDescNullsLast => {
                separated
                    .push(table)
                    .push_unseparated(".block_timestamp DESC NULLS LAST");
            }
            EventOrderByInput::IdAsc => {
                separated.push(table).push_unseparated(".id ASC");
            }
        }
    }
}

fn push_contributor_order(
    query: &mut QueryBuilder<'_, Postgres>,
    order_by: Option<&[ContributorOrderByInput]>,
) {
    push_order(
        query,
        order_by.unwrap_or(&[ContributorOrderByInput::IdAsc]),
        |order| match order {
            ContributorOrderByInput::PowerDesc => "contributor.power DESC",
            ContributorOrderByInput::PowerAsc => "contributor.power ASC",
            ContributorOrderByInput::LastVoteTimestampAscNullsLast => {
                "contributor.last_vote_timestamp ASC NULLS LAST"
            }
            ContributorOrderByInput::LastVoteTimestampDescNullsLast => {
                "contributor.last_vote_timestamp DESC NULLS LAST"
            }
            ContributorOrderByInput::DelegatesCountAllAsc => "contributor.delegates_count_all ASC",
            ContributorOrderByInput::DelegatesCountAllDesc => {
                "contributor.delegates_count_all DESC"
            }
            ContributorOrderByInput::IdAsc => "contributor.id ASC",
        },
    );
}

fn push_delegate_order(
    query: &mut QueryBuilder<'_, Postgres>,
    order_by: Option<&[DelegateOrderByInput]>,
) {
    push_order(
        query,
        order_by.unwrap_or(&[DelegateOrderByInput::IdAsc]),
        |order| match order {
            DelegateOrderByInput::BlockTimestampAscNullsLast => {
                "delegate.block_timestamp ASC NULLS LAST"
            }
            DelegateOrderByInput::BlockTimestampDescNullsLast => {
                "delegate.block_timestamp DESC NULLS LAST"
            }
            DelegateOrderByInput::PowerAsc => "delegate.power ASC",
            DelegateOrderByInput::PowerDesc => "delegate.power DESC",
            DelegateOrderByInput::IdAsc => "delegate.id ASC",
        },
    );
}

fn push_delegate_mapping_order(
    query: &mut QueryBuilder<'_, Postgres>,
    order_by: Option<&[DelegateMappingOrderByInput]>,
) {
    push_order(
        query,
        order_by.unwrap_or(&[DelegateMappingOrderByInput::IdAsc]),
        |order| match order {
            DelegateMappingOrderByInput::IdAsc => "delegate_mapping.id ASC",
            DelegateMappingOrderByInput::PowerDesc => "delegate_mapping.power DESC",
            DelegateMappingOrderByInput::BlockNumberDesc => "delegate_mapping.block_number DESC",
        },
    );
}

fn push_order<T>(
    query: &mut QueryBuilder<'_, Postgres>,
    order_by: &[T],
    to_sql: fn(&T) -> &'static str,
) {
    if order_by.is_empty() {
        return;
    }
    query.push(" ORDER BY ");
    let mut separated = query.separated(", ");
    for order in order_by {
        separated.push(to_sql(order));
    }
}

fn push_page(query: &mut QueryBuilder<'_, Postgres>, offset: Option<i32>, limit: Option<i32>) {
    if let Some(limit) = limit {
        query.push(" LIMIT ").push_bind(limit.max(0));
    }
    if let Some(offset) = offset {
        query.push(" OFFSET ").push_bind(offset.max(0));
    }
}

fn pool<'a>(ctx: &'a Context<'_>) -> GraphqlResult<&'a PgPool> {
    Ok(&ctx.data::<GraphqlState>()?.pool)
}
