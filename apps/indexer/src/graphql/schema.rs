use async_graphql::{ComplexObject, Context, Object, Result as GraphqlResult};
use sqlx::{Postgres, QueryBuilder};

use super::GraphqlState;
use super::filters::{push_event_where, push_vote_cast_group_where};
use super::order::{push_event_order, push_vote_cast_group_order};
use super::pagination::push_page;
use super::query::*;
use super::types::*;

const DEFAULT_PAGE_LIMIT: i32 = 20;

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
              block_number::text AS block_number,
              (CASE WHEN block_timestamp < 1000000000000 THEN block_timestamp * 1000 ELSE block_timestamp END)::text AS block_timestamp,
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

    async fn indexer_status(&self, ctx: &Context<'_>) -> GraphqlResult<Option<IndexerStatus>> {
        query_indexer_status(pool(ctx)?, scope(ctx)?).await
    }

    async fn indexer_statuses(&self, ctx: &Context<'_>) -> GraphqlResult<Vec<IndexerStatus>> {
        query_indexer_statuses(pool(ctx)?, scope(ctx)?).await
    }

    async fn proposals_page(
        &self,
        ctx: &Context<'_>,
        where_: Option<ProposalWhereInput>,
        order_by: Option<Vec<ProposalOrderByInput>>,
        offset: Option<i32>,
        limit: Option<i32>,
    ) -> GraphqlResult<ProposalPage> {
        let pool = pool(ctx)?;
        let scope = scope(ctx)?;
        let (offset, limit) = page_args(offset, limit);
        let total_count = count_proposals(pool, scope, where_.as_ref()).await?;
        let items = if limit == 0 {
            Vec::new()
        } else {
            query_proposals(
                pool,
                scope,
                where_.as_ref(),
                order_by.as_deref(),
                Some(offset),
                Some(limit),
            )
            .await?
        };
        Ok(ProposalPage {
            total_count,
            offset,
            limit,
            items,
        })
    }

    async fn contributors_page(
        &self,
        ctx: &Context<'_>,
        where_: Option<ContributorWhereInput>,
        order_by: Option<Vec<ContributorOrderByInput>>,
        offset: Option<i32>,
        limit: Option<i32>,
    ) -> GraphqlResult<ContributorPage> {
        let pool = pool(ctx)?;
        let scope = scope(ctx)?;
        let (offset, limit) = page_args(offset, limit);
        let total_count = count_contributors(pool, scope, where_.as_ref()).await?;
        let items = if limit == 0 {
            Vec::new()
        } else {
            query_contributors(
                pool,
                scope,
                where_.as_ref(),
                order_by.as_deref(),
                Some(offset),
                Some(limit),
            )
            .await?
        };
        Ok(ContributorPage {
            total_count,
            offset,
            limit,
            items,
        })
    }

    async fn delegates_page(
        &self,
        ctx: &Context<'_>,
        where_: Option<DelegateWhereInput>,
        order_by: Option<Vec<DelegateOrderByInput>>,
        offset: Option<i32>,
        limit: Option<i32>,
    ) -> GraphqlResult<DelegatePage> {
        let pool = pool(ctx)?;
        let scope = scope(ctx)?;
        let (offset, limit) = page_args(offset, limit);
        let total_count = count_delegates(pool, scope, where_.as_ref()).await?;
        let items = if limit == 0 {
            Vec::new()
        } else {
            query_delegates(
                pool,
                scope,
                where_.as_ref(),
                order_by.as_deref(),
                Some(offset),
                Some(limit),
            )
            .await?
        };
        Ok(DelegatePage {
            total_count,
            offset,
            limit,
            items,
        })
    }

    async fn delegate_mappings_page(
        &self,
        ctx: &Context<'_>,
        where_: Option<DelegateMappingWhereInput>,
        order_by: Option<Vec<DelegateMappingOrderByInput>>,
        offset: Option<i32>,
        limit: Option<i32>,
    ) -> GraphqlResult<DelegateMappingPage> {
        let pool = pool(ctx)?;
        let scope = scope(ctx)?;
        let (offset, limit) = page_args(offset, limit);
        let total_count = count_delegate_mappings(pool, scope, where_.as_ref()).await?;
        let items = if limit == 0 {
            Vec::new()
        } else {
            query_delegate_mappings(
                pool,
                scope,
                where_.as_ref(),
                order_by.as_deref(),
                Some(offset),
                Some(limit),
            )
            .await?
        };
        Ok(DelegateMappingPage {
            total_count,
            offset,
            limit,
            items,
        })
    }

    async fn data_metrics_page(
        &self,
        ctx: &Context<'_>,
        where_: Option<DataMetricWhereInput>,
        order_by: Option<Vec<DataMetricOrderByInput>>,
        offset: Option<i32>,
        limit: Option<i32>,
    ) -> GraphqlResult<DataMetricPage> {
        let pool = pool(ctx)?;
        let scope = scope(ctx)?;
        let (offset, limit) = page_args(offset, limit);
        let total_count = count_data_metrics(pool, scope, where_.as_ref()).await?;
        let items = if limit == 0 {
            Vec::new()
        } else {
            query_data_metrics(
                pool,
                scope,
                where_.as_ref(),
                order_by.as_deref(),
                Some(offset),
                Some(limit),
            )
            .await?
        };
        Ok(DataMetricPage {
            total_count,
            offset,
            limit,
            items,
        })
    }
}

#[ComplexObject(rename_fields = "camelCase")]
impl Proposal {
    async fn proposal_id(&self) -> String {
        graphql_proposal_id(&self.proposal_id)
    }

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
              block_number::text AS block_number,
              (CASE WHEN block_timestamp < 1000000000000 THEN block_timestamp * 1000 ELSE block_timestamp END)::text AS block_timestamp,
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

fn page_args(offset: Option<i32>, limit: Option<i32>) -> (i32, i32) {
    (
        offset.unwrap_or(0).max(0),
        limit.unwrap_or(DEFAULT_PAGE_LIMIT).max(0),
    )
}
