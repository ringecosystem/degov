use async_graphql::{ComplexObject, Context, Object, Result as GraphqlResult};
use sqlx::{Postgres, QueryBuilder};

use super::GraphqlState;
use super::filters::{push_event_where, push_vote_cast_group_where};
use super::order::{push_event_order, push_vote_cast_group_order};
use super::pagination::push_page;
use super::query::*;
use super::types::*;

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
        query_proposals(
            pool,
            scope(ctx)?,
            where_.as_ref(),
            order_by.as_deref(),
            offset,
            limit,
        )
        .await
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
            scope(ctx)?,
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
            scope(ctx)?,
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
        push_event_where(&mut query, scope(ctx)?, where_.as_ref());
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
            scope(ctx)?,
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
            scope(ctx)?,
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
            scope(ctx)?,
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
            scope(ctx)?,
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
            total_count: count_proposals(pool(ctx)?, scope(ctx)?, where_.as_ref()).await?,
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
            total_count: count_contributors(pool(ctx)?, scope(ctx)?, where_.as_ref()).await?,
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
            total_count: count_delegates(pool(ctx)?, scope(ctx)?, where_.as_ref()).await?,
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
            total_count: count_delegate_mappings(pool(ctx)?, scope(ctx)?, where_.as_ref()).await?,
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
            total_count: count_data_metrics(pool(ctx)?, scope(ctx)?, where_.as_ref()).await?,
        })
    }
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
            .push(" WHERE ((proposal_id = ")
            .push_bind(&self.id)
            .push(" AND contract_set_id = ")
            .push_bind(&self.contract_set_id)
            .push(") OR (ref_proposal_id = ")
            .push_bind(&self.proposal_id)
            .push(" AND contract_set_id = ")
            .push_bind(&self.contract_set_id);
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
        push_vote_cast_group_where(&mut query, &mut has_condition, scope(ctx)?, where_.as_ref());
        push_vote_cast_group_order(&mut query, order_by.as_deref());
        push_page(&mut query, offset, limit);

        Ok(query.build_query_as().fetch_all(pool).await?)
    }
}

fn pool<'a>(ctx: &'a Context<'_>) -> GraphqlResult<&'a sqlx::PgPool> {
    Ok(&ctx.data::<GraphqlState>()?.pool)
}

fn scope<'a>(ctx: &'a Context<'_>) -> GraphqlResult<&'a GraphqlScope> {
    Ok(ctx.data::<GraphqlScope>()?)
}
