use async_graphql::Result as GraphqlResult;
use sqlx::{FromRow, PgPool, Postgres, QueryBuilder};

use super::filters::*;
use super::order::*;
use super::pagination::push_page;
use super::types::*;

pub(super) async fn query_proposals(
    pool: &PgPool,
    implicit_scope: &GraphqlScope,
    where_: Option<&ProposalWhereInput>,
    order_by: Option<&[ProposalOrderByInput]>,
    offset: Option<i32>,
    limit: Option<i32>,
) -> GraphqlResult<Vec<Proposal>> {
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT id, contract_set_id, chain_id, dao_code, governor_address, proposal_id, proposer,
          targets, values, signatures, calldatas, vote_start::text AS vote_start,
          vote_end::text AS vote_end, description, block_number::text AS block_number,
          block_timestamp::text AS block_timestamp, transaction_hash, metrics_votes_count,
          metrics_votes_with_params_count, metrics_votes_without_params_count,
          metrics_votes_weight_for_sum::text AS metrics_votes_weight_for_sum,
          metrics_votes_weight_against_sum::text AS metrics_votes_weight_against_sum,
          metrics_votes_weight_abstain_sum::text AS metrics_votes_weight_abstain_sum,
          title, vote_start_timestamp::text AS vote_start_timestamp,
          vote_end_timestamp::text AS vote_end_timestamp, block_interval, clock_mode,
          proposal_deadline::text AS proposal_deadline, proposal_eta::text AS proposal_eta,
          queue_ready_at::text AS queue_ready_at, queue_expires_at::text AS queue_expires_at,
          quorum::text AS quorum, decimals::text AS decimals, timelock_address,
          timelock_grace_period::text AS timelock_grace_period
        FROM proposal
        "#,
    );
    push_proposal_where(&mut query, implicit_scope, where_);
    push_proposal_order(&mut query, order_by);
    push_page(&mut query, offset, limit);

    Ok(query.build_query_as().fetch_all(pool).await?)
}

pub(super) async fn count_proposals(
    pool: &PgPool,
    implicit_scope: &GraphqlScope,
    where_: Option<&ProposalWhereInput>,
) -> GraphqlResult<i64> {
    let mut query = QueryBuilder::<Postgres>::new("SELECT COUNT(*)::int8 AS total FROM proposal");
    push_proposal_where(&mut query, implicit_scope, where_);
    let (total,): (i64,) = query.build_query_as().fetch_one(pool).await?;
    Ok(total)
}

pub(super) async fn query_events<T>(
    pool: &PgPool,
    implicit_scope: &GraphqlScope,
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
    push_event_where(&mut query, implicit_scope, where_);
    push_event_order(&mut query, table, order_by);
    push_page(&mut query, offset, limit);

    Ok(query.build_query_as().fetch_all(pool).await?)
}

pub(super) async fn query_data_metrics(
    pool: &PgPool,
    implicit_scope: &GraphqlScope,
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
    push_data_metric_where(&mut query, implicit_scope, where_);
    push_data_metric_order(&mut query, order_by);
    push_page(&mut query, offset, limit);

    Ok(query.build_query_as().fetch_all(pool).await?)
}

pub(super) async fn count_data_metrics(
    pool: &PgPool,
    implicit_scope: &GraphqlScope,
    where_: Option<&DataMetricWhereInput>,
) -> GraphqlResult<i64> {
    let mut query =
        QueryBuilder::<Postgres>::new("SELECT COUNT(*)::int8 AS total FROM data_metric");
    push_data_metric_where(&mut query, implicit_scope, where_);
    let (total,): (i64,) = query.build_query_as().fetch_one(pool).await?;
    Ok(total)
}

pub(super) async fn query_contributors(
    pool: &PgPool,
    implicit_scope: &GraphqlScope,
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
    push_contributor_where(&mut query, implicit_scope, where_);
    push_contributor_order(&mut query, order_by);
    push_page(&mut query, offset, limit);

    Ok(query.build_query_as().fetch_all(pool).await?)
}

pub(super) async fn query_delegates(
    pool: &PgPool,
    implicit_scope: &GraphqlScope,
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
    push_delegate_where(&mut query, implicit_scope, where_);
    push_delegate_order(&mut query, order_by);
    push_page(&mut query, offset, limit);

    Ok(query.build_query_as().fetch_all(pool).await?)
}

pub(super) async fn query_delegate_mappings(
    pool: &PgPool,
    implicit_scope: &GraphqlScope,
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
    push_delegate_mapping_where(&mut query, implicit_scope, where_);
    push_delegate_mapping_order(&mut query, order_by);
    push_page(&mut query, offset, limit);

    Ok(query.build_query_as().fetch_all(pool).await?)
}

pub(super) async fn count_contributors(
    pool: &PgPool,
    implicit_scope: &GraphqlScope,
    where_: Option<&ContributorWhereInput>,
) -> GraphqlResult<i64> {
    let mut query =
        QueryBuilder::<Postgres>::new("SELECT COUNT(*)::int8 AS total FROM contributor");
    push_contributor_where(&mut query, implicit_scope, where_);
    let (total,): (i64,) = query.build_query_as().fetch_one(pool).await?;
    Ok(total)
}

pub(super) async fn count_delegates(
    pool: &PgPool,
    implicit_scope: &GraphqlScope,
    where_: Option<&DelegateWhereInput>,
) -> GraphqlResult<i64> {
    let mut query = QueryBuilder::<Postgres>::new("SELECT COUNT(*)::int8 AS total FROM delegate");
    push_delegate_where(&mut query, implicit_scope, where_);
    let (total,): (i64,) = query.build_query_as().fetch_one(pool).await?;
    Ok(total)
}

pub(super) async fn count_delegate_mappings(
    pool: &PgPool,
    implicit_scope: &GraphqlScope,
    where_: Option<&DelegateMappingWhereInput>,
) -> GraphqlResult<i64> {
    let mut query =
        QueryBuilder::<Postgres>::new("SELECT COUNT(*)::int8 AS total FROM delegate_mapping");
    push_delegate_mapping_where(&mut query, implicit_scope, where_);
    let (total,): (i64,) = query.build_query_as().fetch_one(pool).await?;
    Ok(total)
}
