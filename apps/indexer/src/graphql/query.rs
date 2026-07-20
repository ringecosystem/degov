use async_graphql::Result as GraphqlResult;
use sqlx::{FromRow, PgPool, Postgres, QueryBuilder};

use super::filters::*;
use super::order::*;
use super::pagination::push_page;
use super::types::*;

const PROPOSAL_NUMERIC_INPUT_ERROR: &str =
    "must be a canonical non-negative base-10 integer with at most 78 digits";

fn validate_proposal_where(where_: Option<&ProposalWhereInput>) -> GraphqlResult<()> {
    let Some(where_) = where_ else {
        return Ok(());
    };

    for (field, value) in [
        ("blockNumber_eq", where_.block_number_eq.as_deref()),
        ("blockNumber_gt", where_.block_number_gt.as_deref()),
        (
            "voteEndTimestamp_gte",
            where_.vote_end_timestamp_gte.as_deref(),
        ),
        (
            "voteEndTimestamp_lt",
            where_.vote_end_timestamp_lt.as_deref(),
        ),
    ] {
        if value.is_some_and(|value| !is_canonical_numeric_78(value)) {
            return Err(async_graphql::Error::new(format!(
                "ProposalWhereInput.{field} {PROPOSAL_NUMERIC_INPUT_ERROR}"
            )));
        }
    }

    if let Some(or) = &where_.or {
        for filter in or {
            validate_proposal_where(Some(filter))?;
        }
    }

    Ok(())
}

fn is_canonical_numeric_78(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.is_empty() || bytes.len() > 78 {
        return false;
    }
    if bytes == b"0" {
        return true;
    }
    matches!(bytes[0], b'1'..=b'9') && bytes[1..].iter().all(u8::is_ascii_digit)
}

pub(super) async fn query_indexer_status(
    pool: &PgPool,
    implicit_scope: &GraphqlScope,
) -> GraphqlResult<Option<IndexerStatus>> {
    let mut query = indexer_status_query();
    push_indexer_status_where(&mut query, implicit_scope);
    push_indexer_status_order(&mut query);
    query.push(" LIMIT 1");

    Ok(query.build_query_as().fetch_optional(pool).await?)
}

pub(super) async fn query_indexer_statuses(
    pool: &PgPool,
    implicit_scope: &GraphqlScope,
) -> GraphqlResult<Vec<IndexerStatus>> {
    let mut query = indexer_status_query();
    push_indexer_status_where(&mut query, implicit_scope);
    push_indexer_status_order(&mut query);

    Ok(query.build_query_as().fetch_all(pool).await?)
}

pub(super) async fn query_proposals(
    pool: &PgPool,
    implicit_scope: &GraphqlScope,
    where_: Option<&ProposalWhereInput>,
    order_by: Option<&[ProposalOrderByInput]>,
    offset: Option<i32>,
    limit: Option<i32>,
) -> GraphqlResult<Vec<Proposal>> {
    validate_proposal_where(where_)?;
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT id, contract_set_id, chain_id, dao_code, governor_address, proposal_id, proposer,
          targets, values, signatures, calldatas, vote_start::text AS vote_start,
          vote_end::text AS vote_end, description, block_number::text AS block_number,
          (CASE WHEN block_timestamp < 1000000000000 THEN block_timestamp * 1000 ELSE block_timestamp END)::text AS block_timestamp,
          transaction_hash, metrics_votes_count,
          metrics_votes_with_params_count, metrics_votes_without_params_count,
          metrics_votes_weight_for_sum::text AS metrics_votes_weight_for_sum,
          metrics_votes_weight_against_sum::text AS metrics_votes_weight_against_sum,
          metrics_votes_weight_abstain_sum::text AS metrics_votes_weight_abstain_sum,
          title,
          (CASE WHEN vote_start_timestamp < 1000000000000 THEN vote_start_timestamp * 1000 ELSE vote_start_timestamp END)::text AS vote_start_timestamp,
          (CASE WHEN vote_end_timestamp < 1000000000000 THEN vote_end_timestamp * 1000 ELSE vote_end_timestamp END)::text AS vote_end_timestamp,
          block_interval, description_hash, clock_mode,
          proposal_deadline::text AS proposal_deadline, proposal_eta::text AS proposal_eta,
          (CASE WHEN queue_ready_at IS NULL THEN NULL WHEN queue_ready_at < 1000000000000 THEN queue_ready_at * 1000 ELSE queue_ready_at END)::text AS queue_ready_at,
          (CASE WHEN queue_expires_at IS NULL THEN NULL WHEN queue_expires_at < 1000000000000 THEN queue_expires_at * 1000 ELSE queue_expires_at END)::text AS queue_expires_at,
          counting_mode, quorum::text AS quorum, decimals::text AS decimals, timelock_address,
          timelock_grace_period::text AS timelock_grace_period
        FROM (
          SELECT proposal.id, proposal.contract_set_id, proposal.chain_id, proposal.dao_code,
            proposal.governor_address, proposal.proposal_id,
            COALESCE(proposal_overlay.proposer, proposal.proposer) AS proposer,
            COALESCE(proposal_overlay.targets, proposal.targets) AS targets,
            COALESCE(proposal_overlay.values, proposal.values) AS values,
            COALESCE(proposal_overlay.signatures, proposal.signatures) AS signatures,
            COALESCE(proposal_overlay.calldatas, proposal.calldatas) AS calldatas,
            COALESCE(proposal_overlay.vote_start, proposal.vote_start) AS vote_start,
            COALESCE(proposal_overlay.vote_end, proposal.vote_end) AS vote_end,
            COALESCE(proposal_overlay.description, proposal.description) AS description,
            proposal.block_number, proposal.block_timestamp, proposal.transaction_hash,
            (COALESCE(proposal.metrics_votes_count, 0) + COALESCE(vote_overlay_totals.votes_count, 0))::INTEGER AS metrics_votes_count,
            (COALESCE(proposal.metrics_votes_with_params_count, 0) + COALESCE(vote_overlay_totals.votes_with_params_count, 0))::INTEGER AS metrics_votes_with_params_count,
            (COALESCE(proposal.metrics_votes_without_params_count, 0) + COALESCE(vote_overlay_totals.votes_without_params_count, 0))::INTEGER AS metrics_votes_without_params_count,
            (COALESCE(proposal.metrics_votes_weight_for_sum, 0) + COALESCE(vote_overlay_totals.votes_weight_for_sum, 0))::NUMERIC(78, 0) AS metrics_votes_weight_for_sum,
            (COALESCE(proposal.metrics_votes_weight_against_sum, 0) + COALESCE(vote_overlay_totals.votes_weight_against_sum, 0))::NUMERIC(78, 0) AS metrics_votes_weight_against_sum,
            (COALESCE(proposal.metrics_votes_weight_abstain_sum, 0) + COALESCE(vote_overlay_totals.votes_weight_abstain_sum, 0))::NUMERIC(78, 0) AS metrics_votes_weight_abstain_sum,
            COALESCE(proposal_overlay.title, proposal.title) AS title,
            COALESCE(proposal_overlay.vote_start_timestamp, proposal.vote_start_timestamp) AS vote_start_timestamp,
            COALESCE(proposal_overlay.vote_end_timestamp, proposal.vote_end_timestamp) AS vote_end_timestamp,
            proposal.block_interval,
            CASE
              WHEN proposal_overlay.description IS NOT NULL THEN proposal_overlay.description_hash
              ELSE proposal.description_hash
            END AS description_hash,
            COALESCE(proposal_overlay.clock_mode, proposal.clock_mode) AS clock_mode,
            COALESCE(proposal_overlay.proposal_deadline, proposal.proposal_deadline) AS proposal_deadline,
            COALESCE(proposal_overlay.proposal_eta, proposal.proposal_eta) AS proposal_eta,
            COALESCE(proposal_overlay.queue_ready_at, proposal.queue_ready_at) AS queue_ready_at,
            COALESCE(proposal_overlay.queue_expires_at, proposal.queue_expires_at) AS queue_expires_at,
            COALESCE(proposal_overlay.counting_mode, proposal.counting_mode) AS counting_mode,
            COALESCE(proposal_overlay.quorum, proposal.quorum) AS quorum,
            COALESCE(proposal_overlay.decimals, proposal.decimals) AS decimals,
            COALESCE(proposal_overlay.timelock_address, proposal.timelock_address) AS timelock_address,
            COALESCE(proposal_overlay.timelock_grace_period, proposal.timelock_grace_period) AS timelock_grace_period
          FROM proposal
          LEFT JOIN degov_provisional_proposal_overlay proposal_overlay
            ON proposal_overlay.contract_set_id = proposal.contract_set_id
           AND proposal_overlay.chain_id IS NOT DISTINCT FROM proposal.chain_id
           AND proposal_overlay.dao_code IS NOT DISTINCT FROM proposal.dao_code
           AND proposal_overlay.governor_address IS NOT DISTINCT FROM proposal.governor_address
           AND proposal_overlay.proposal_id = proposal.proposal_id
           AND proposal_overlay.source = 'live-onchain'
           AND proposal_overlay.status = 'available'
          LEFT JOIN LATERAL (
            SELECT
              count(*)::INTEGER AS votes_count,
              count(*) FILTER (WHERE vote_overlay.type = 'vote-cast-with-params')::INTEGER AS votes_with_params_count,
              count(*) FILTER (WHERE vote_overlay.type = 'vote-cast-without-params')::INTEGER AS votes_without_params_count,
              COALESCE(sum(CASE WHEN vote_overlay.support = 1 THEN vote_overlay.weight ELSE 0 END), 0)::NUMERIC(78, 0) AS votes_weight_for_sum,
              COALESCE(sum(CASE WHEN vote_overlay.support = 0 THEN vote_overlay.weight ELSE 0 END), 0)::NUMERIC(78, 0) AS votes_weight_against_sum,
              COALESCE(sum(CASE WHEN vote_overlay.support = 2 THEN vote_overlay.weight ELSE 0 END), 0)::NUMERIC(78, 0) AS votes_weight_abstain_sum
            FROM degov_provisional_vote_cast_group_overlay vote_overlay
            WHERE vote_overlay.status = 'available'
              AND vote_overlay.contract_set_id = proposal.contract_set_id
              AND vote_overlay.chain_id IS NOT DISTINCT FROM proposal.chain_id
              AND vote_overlay.dao_code IS NOT DISTINCT FROM proposal.dao_code
              AND vote_overlay.governor_address IS NOT DISTINCT FROM proposal.governor_address
              AND (
                vote_overlay.proposal_id = proposal.id
                OR vote_overlay.ref_proposal_id = proposal.proposal_id
              )
              AND NOT EXISTS (
                SELECT 1
                FROM vote_cast_group durable_vote
                WHERE durable_vote.contract_set_id = vote_overlay.contract_set_id
                  AND durable_vote.id = vote_overlay.id
              )
          ) vote_overlay_totals ON TRUE
          UNION ALL
          SELECT proposal_overlay.id, proposal_overlay.contract_set_id, proposal_overlay.chain_id,
            proposal_overlay.dao_code, proposal_overlay.governor_address, proposal_overlay.proposal_id,
            COALESCE(proposal_overlay.proposer, '') AS proposer,
            COALESCE(proposal_overlay.targets, ARRAY[]::TEXT[]) AS targets,
            COALESCE(proposal_overlay.values, ARRAY[]::TEXT[]) AS values,
            COALESCE(proposal_overlay.signatures, ARRAY[]::TEXT[]) AS signatures,
            COALESCE(proposal_overlay.calldatas, ARRAY[]::TEXT[]) AS calldatas,
            COALESCE(proposal_overlay.vote_start, 0) AS vote_start,
            COALESCE(proposal_overlay.vote_end, 0) AS vote_end,
            COALESCE(proposal_overlay.description, '') AS description,
            COALESCE(proposal_overlay.block_number, proposal_overlay.anchor_block_number, 0) AS block_number,
            COALESCE(proposal_overlay.block_timestamp, proposal_overlay.anchor_block_timestamp, 0) AS block_timestamp,
            COALESCE(proposal_overlay.transaction_hash, '') AS transaction_hash,
            COALESCE(vote_overlay_totals.votes_count, 0)::INTEGER AS metrics_votes_count,
            COALESCE(vote_overlay_totals.votes_with_params_count, 0)::INTEGER AS metrics_votes_with_params_count,
            COALESCE(vote_overlay_totals.votes_without_params_count, 0)::INTEGER AS metrics_votes_without_params_count,
            COALESCE(vote_overlay_totals.votes_weight_for_sum, 0)::NUMERIC(78, 0) AS metrics_votes_weight_for_sum,
            COALESCE(vote_overlay_totals.votes_weight_against_sum, 0)::NUMERIC(78, 0) AS metrics_votes_weight_against_sum,
            COALESCE(vote_overlay_totals.votes_weight_abstain_sum, 0)::NUMERIC(78, 0) AS metrics_votes_weight_abstain_sum,
            COALESCE(proposal_overlay.title, '') AS title,
            COALESCE(proposal_overlay.vote_start_timestamp, 0) AS vote_start_timestamp,
            COALESCE(proposal_overlay.vote_end_timestamp, 0) AS vote_end_timestamp,
            proposal_overlay.block_interval,
            proposal_overlay.description_hash,
            COALESCE(proposal_overlay.clock_mode, 'blocknumber') AS clock_mode,
            proposal_overlay.proposal_deadline,
            proposal_overlay.proposal_eta,
            proposal_overlay.queue_ready_at,
            proposal_overlay.queue_expires_at,
            proposal_overlay.counting_mode,
            COALESCE(proposal_overlay.quorum, 0) AS quorum,
            COALESCE(proposal_overlay.decimals, 0) AS decimals,
            proposal_overlay.timelock_address,
            proposal_overlay.timelock_grace_period
          FROM degov_provisional_proposal_overlay proposal_overlay
          LEFT JOIN LATERAL (
            SELECT
              count(*)::INTEGER AS votes_count,
              count(*) FILTER (WHERE vote_overlay.type = 'vote-cast-with-params')::INTEGER AS votes_with_params_count,
              count(*) FILTER (WHERE vote_overlay.type = 'vote-cast-without-params')::INTEGER AS votes_without_params_count,
              COALESCE(sum(CASE WHEN vote_overlay.support = 1 THEN vote_overlay.weight ELSE 0 END), 0)::NUMERIC(78, 0) AS votes_weight_for_sum,
              COALESCE(sum(CASE WHEN vote_overlay.support = 0 THEN vote_overlay.weight ELSE 0 END), 0)::NUMERIC(78, 0) AS votes_weight_against_sum,
              COALESCE(sum(CASE WHEN vote_overlay.support = 2 THEN vote_overlay.weight ELSE 0 END), 0)::NUMERIC(78, 0) AS votes_weight_abstain_sum
            FROM degov_provisional_vote_cast_group_overlay vote_overlay
            WHERE vote_overlay.status = 'available'
              AND vote_overlay.contract_set_id = proposal_overlay.contract_set_id
              AND vote_overlay.chain_id IS NOT DISTINCT FROM proposal_overlay.chain_id
              AND vote_overlay.dao_code IS NOT DISTINCT FROM proposal_overlay.dao_code
              AND vote_overlay.governor_address IS NOT DISTINCT FROM proposal_overlay.governor_address
              AND (
                vote_overlay.proposal_id = proposal_overlay.id
                OR vote_overlay.ref_proposal_id = proposal_overlay.proposal_id
              )
              AND NOT EXISTS (
                SELECT 1
                FROM vote_cast_group durable_vote
                WHERE durable_vote.contract_set_id = vote_overlay.contract_set_id
                  AND durable_vote.id = vote_overlay.id
              )
          ) vote_overlay_totals ON TRUE
          WHERE proposal_overlay.status = 'available'
            AND proposal_overlay.source <> 'live-onchain'
            AND NOT EXISTS (
              SELECT 1
              FROM proposal durable_proposal
              WHERE durable_proposal.contract_set_id = proposal_overlay.contract_set_id
                AND durable_proposal.chain_id IS NOT DISTINCT FROM proposal_overlay.chain_id
                AND durable_proposal.dao_code IS NOT DISTINCT FROM proposal_overlay.dao_code
                AND durable_proposal.governor_address IS NOT DISTINCT FROM proposal_overlay.governor_address
                AND durable_proposal.proposal_id = proposal_overlay.proposal_id
            )
        ) proposal
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
    validate_proposal_where(where_)?;
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT COUNT(*)::int8 AS total
        FROM (
          SELECT proposal.id, proposal.contract_set_id, proposal.chain_id,
            proposal.dao_code, proposal.governor_address, proposal.proposal_id,
            COALESCE(proposal_overlay.proposer, proposal.proposer) AS proposer,
            COALESCE(proposal_overlay.description, proposal.description) AS description,
            proposal.block_number,
            COALESCE(proposal_overlay.vote_end_timestamp, proposal.vote_end_timestamp) AS vote_end_timestamp
          FROM proposal
          LEFT JOIN degov_provisional_proposal_overlay proposal_overlay
            ON proposal_overlay.contract_set_id = proposal.contract_set_id
           AND proposal_overlay.chain_id IS NOT DISTINCT FROM proposal.chain_id
           AND proposal_overlay.dao_code IS NOT DISTINCT FROM proposal.dao_code
           AND proposal_overlay.governor_address IS NOT DISTINCT FROM proposal.governor_address
           AND proposal_overlay.proposal_id = proposal.proposal_id
           AND proposal_overlay.source = 'live-onchain'
           AND proposal_overlay.status = 'available'
          UNION ALL
          SELECT proposal_overlay.id, proposal_overlay.contract_set_id, proposal_overlay.chain_id,
            proposal_overlay.dao_code, proposal_overlay.governor_address, proposal_overlay.proposal_id,
            COALESCE(proposal_overlay.proposer, '') AS proposer,
            COALESCE(proposal_overlay.description, '') AS description,
            COALESCE(proposal_overlay.block_number, proposal_overlay.anchor_block_number, 0) AS block_number,
            COALESCE(proposal_overlay.vote_end_timestamp, 0) AS vote_end_timestamp
          FROM degov_provisional_proposal_overlay proposal_overlay
          WHERE proposal_overlay.status = 'available'
            AND proposal_overlay.source <> 'live-onchain'
            AND NOT EXISTS (
              SELECT 1
              FROM proposal durable_proposal
              WHERE durable_proposal.contract_set_id = proposal_overlay.contract_set_id
                AND durable_proposal.chain_id IS NOT DISTINCT FROM proposal_overlay.chain_id
                AND durable_proposal.dao_code IS NOT DISTINCT FROM proposal_overlay.dao_code
                AND durable_proposal.governor_address IS NOT DISTINCT FROM proposal_overlay.governor_address
                AND durable_proposal.proposal_id = proposal_overlay.proposal_id
            )
        ) proposal
        "#,
    );
    push_proposal_where(&mut query, implicit_scope, where_);
    let (total,): (i64,) = query.build_query_as().fetch_one(pool).await?;
    Ok(total)
}

fn indexer_status_query<'a>() -> QueryBuilder<'a, Postgres> {
    QueryBuilder::<Postgres>::new(
        r#"
        SELECT
          dao_code,
          chain_id,
          contract_set_id,
          processed_height::BIGINT AS processed_height,
          (
            SELECT MIN(selector_coverage.range_end_block)::BIGINT
            FROM (
              SELECT MAX(segment.range_end_block) AS range_end_block
              FROM degov_provisional_segment segment
              WHERE segment.status = 'available'
                AND segment.dao_code = degov_indexer_checkpoint.dao_code
                AND segment.chain_id IS NOT DISTINCT FROM degov_indexer_checkpoint.chain_id
                AND segment.contract_set_id = degov_indexer_checkpoint.contract_set_id
                AND segment.dataset_key = split_part(
                  split_part(degov_indexer_checkpoint.contract_set_id, 'dataset=', 2),
                  '|',
                  1
                )
              GROUP BY segment.source, segment.selector
            ) selector_coverage
          ) AS provisional_height,
          target_height::BIGINT AS target_height,
          CASE
            WHEN target_height IS NULL THEN NULL
            WHEN target_height <= 0 THEN 100.0::DOUBLE PRECISION
            WHEN processed_height IS NULL THEN 0.0::DOUBLE PRECISION
            ELSE LEAST(
              (processed_height::DOUBLE PRECISION / target_height::DOUBLE PRECISION) * 100.0,
              100.0
            )
          END AS synced_percentage,
          CASE
            WHEN processed_height IS NULL OR target_height IS NULL THEN FALSE
            ELSE processed_height >= target_height
          END AS is_synced,
          updated_at::TEXT AS updated_at,
          last_error
        FROM degov_indexer_checkpoint
        "#,
    )
}

fn push_indexer_status_where<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    implicit_scope: &'a GraphqlScope,
) {
    if implicit_scope.dao_code.is_some()
        || implicit_scope.chain_id.is_some()
        || implicit_scope.contract_set_id.is_some()
    {
        query.push(" WHERE ");
        let mut has_condition = false;
        if let Some(chain_id) = implicit_scope.chain_id {
            push_column_eq(query, &mut has_condition, "", "chain_id", chain_id);
        }
        if let Some(dao_code) = &implicit_scope.dao_code {
            push_column_eq(query, &mut has_condition, "", "dao_code", dao_code);
        }
        if let Some(contract_set_id) = &implicit_scope.contract_set_id {
            push_column_eq(
                query,
                &mut has_condition,
                "",
                "contract_set_id",
                contract_set_id,
            );
        }
    }
}

fn push_indexer_status_order(query: &mut QueryBuilder<'_, Postgres>) {
    query.push(" ORDER BY dao_code ASC, chain_id ASC, contract_set_id ASC");
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
          (CASE WHEN block_timestamp < 1000000000000 THEN block_timestamp * 1000 ELSE block_timestamp END)::text AS block_timestamp,
          transaction_hash
        FROM (
          SELECT id, chain_id, dao_code, governor_address, proposal_id, block_number,
            block_timestamp, transaction_hash
          FROM {table}
          UNION ALL
          SELECT event_overlay.id, event_overlay.chain_id, event_overlay.dao_code,
            event_overlay.governor_address, event_overlay.proposal_id, event_overlay.block_number,
            event_overlay.block_timestamp, event_overlay.transaction_hash
          FROM degov_provisional_proposal_event_overlay event_overlay
          WHERE event_overlay.status = 'available'
            AND event_overlay.event_type = '{table}'
            AND NOT EXISTS (
              SELECT 1
              FROM {table} durable_event
              WHERE durable_event.id = event_overlay.id
                AND durable_event.chain_id IS NOT DISTINCT FROM event_overlay.chain_id
                AND durable_event.dao_code IS NOT DISTINCT FROM event_overlay.dao_code
                AND durable_event.governor_address IS NOT DISTINCT FROM event_overlay.governor_address
            )
        ) {table}
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
        SELECT id, contract_set_id, chain_id, dao_code, governor_address, token_address, contract_address,
          log_index, transaction_index, proposals_count, votes_count, votes_with_params_count,
          votes_without_params_count, votes_weight_for_sum::text AS votes_weight_for_sum,
          votes_weight_against_sum::text AS votes_weight_against_sum,
          votes_weight_abstain_sum::text AS votes_weight_abstain_sum,
          power_sum::text AS power_sum,
          COALESCE(contributor_count, member_count) AS contributor_count,
          COALESCE(holders_count, member_count) AS holders_count,
          COALESCE(member_count, holders_count, contributor_count) AS member_count,
          delegate_profiles_count
        FROM (
          SELECT data_metric.id, data_metric.contract_set_id, data_metric.chain_id,
            data_metric.dao_code, data_metric.governor_address, data_metric.token_address,
            data_metric.contract_address, data_metric.log_index,
            data_metric.transaction_index,
            CASE
              WHEN data_metric.id = 'global'
                THEN COALESCE(data_metric.proposals_count, 0) + COALESCE(proposal_overlay_totals.proposals_count, 0)
              ELSE data_metric.proposals_count
            END AS proposals_count,
            CASE
              WHEN data_metric.id = 'global'
                THEN COALESCE(data_metric.votes_count, 0) + COALESCE(vote_overlay_totals.votes_count, 0)
              ELSE data_metric.votes_count
            END AS votes_count,
            CASE
              WHEN data_metric.id = 'global'
                THEN COALESCE(data_metric.votes_with_params_count, 0) + COALESCE(vote_overlay_totals.votes_with_params_count, 0)
              ELSE data_metric.votes_with_params_count
            END AS votes_with_params_count,
            CASE
              WHEN data_metric.id = 'global'
                THEN COALESCE(data_metric.votes_without_params_count, 0) + COALESCE(vote_overlay_totals.votes_without_params_count, 0)
              ELSE data_metric.votes_without_params_count
            END AS votes_without_params_count,
            CASE
              WHEN data_metric.id = 'global'
                THEN COALESCE(data_metric.votes_weight_for_sum, 0) + COALESCE(vote_overlay_totals.votes_weight_for_sum, 0)
              ELSE data_metric.votes_weight_for_sum
            END AS votes_weight_for_sum,
            CASE
              WHEN data_metric.id = 'global'
                THEN COALESCE(data_metric.votes_weight_against_sum, 0) + COALESCE(vote_overlay_totals.votes_weight_against_sum, 0)
              ELSE data_metric.votes_weight_against_sum
            END AS votes_weight_against_sum,
            CASE
              WHEN data_metric.id = 'global'
                THEN COALESCE(data_metric.votes_weight_abstain_sum, 0) + COALESCE(vote_overlay_totals.votes_weight_abstain_sum, 0)
              ELSE data_metric.votes_weight_abstain_sum
            END AS votes_weight_abstain_sum,
            data_metric.power_sum, data_metric.contributor_count, data_metric.holders_count,
            data_metric.member_count, data_metric.delegate_profiles_count
          FROM data_metric
          LEFT JOIN LATERAL (
            SELECT count(*)::INTEGER AS proposals_count
            FROM degov_provisional_proposal_overlay proposal_overlay
            WHERE proposal_overlay.status = 'available'
              AND proposal_overlay.chain_id IS NOT DISTINCT FROM data_metric.chain_id
              AND proposal_overlay.contract_set_id = data_metric.contract_set_id
              AND proposal_overlay.dao_code IS NOT DISTINCT FROM data_metric.dao_code
              AND proposal_overlay.governor_address IS NOT DISTINCT FROM data_metric.governor_address
              AND NOT EXISTS (
                SELECT 1
                FROM proposal durable_proposal
                WHERE durable_proposal.contract_set_id = proposal_overlay.contract_set_id
                  AND durable_proposal.chain_id IS NOT DISTINCT FROM proposal_overlay.chain_id
                  AND durable_proposal.dao_code IS NOT DISTINCT FROM proposal_overlay.dao_code
                  AND durable_proposal.governor_address IS NOT DISTINCT FROM proposal_overlay.governor_address
                  AND durable_proposal.proposal_id = proposal_overlay.proposal_id
              )
          ) proposal_overlay_totals ON data_metric.id = 'global'
          LEFT JOIN LATERAL (
            SELECT
              count(*)::INTEGER AS votes_count,
              count(*) FILTER (WHERE vote_overlay.type = 'vote-cast-with-params')::INTEGER AS votes_with_params_count,
              count(*) FILTER (WHERE vote_overlay.type = 'vote-cast-without-params')::INTEGER AS votes_without_params_count,
              COALESCE(sum(CASE WHEN vote_overlay.support = 1 THEN vote_overlay.weight ELSE 0 END), 0)::NUMERIC(78, 0) AS votes_weight_for_sum,
              COALESCE(sum(CASE WHEN vote_overlay.support = 0 THEN vote_overlay.weight ELSE 0 END), 0)::NUMERIC(78, 0) AS votes_weight_against_sum,
              COALESCE(sum(CASE WHEN vote_overlay.support = 2 THEN vote_overlay.weight ELSE 0 END), 0)::NUMERIC(78, 0) AS votes_weight_abstain_sum
            FROM degov_provisional_vote_cast_group_overlay vote_overlay
            WHERE vote_overlay.status = 'available'
              AND vote_overlay.chain_id IS NOT DISTINCT FROM data_metric.chain_id
              AND vote_overlay.contract_set_id = data_metric.contract_set_id
              AND vote_overlay.dao_code IS NOT DISTINCT FROM data_metric.dao_code
              AND vote_overlay.governor_address IS NOT DISTINCT FROM data_metric.governor_address
              AND NOT EXISTS (
                SELECT 1
                FROM vote_cast_group durable_vote
                WHERE durable_vote.contract_set_id = vote_overlay.contract_set_id
                  AND durable_vote.id = vote_overlay.id
              )
          ) vote_overlay_totals ON data_metric.id = 'global'
        ) data_metric
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
    if can_use_power_desc_candidate_query(where_, order_by, limit) {
        return query_contributors_by_power_desc_candidates(
            pool,
            implicit_scope,
            where_,
            offset,
            limit.expect("checked by can_use_power_desc_candidate_query"),
        )
        .await;
    }

    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT id, chain_id, dao_code, governor_address, block_number::text AS block_number,
          (CASE WHEN block_timestamp < 1000000000000 THEN block_timestamp * 1000 ELSE block_timestamp END)::text AS block_timestamp,
          transaction_hash,
          (CASE WHEN last_vote_timestamp IS NULL THEN NULL WHEN last_vote_timestamp < 1000000000000 THEN last_vote_timestamp * 1000 ELSE last_vote_timestamp END)::text AS last_vote_timestamp,
          power::text AS power,
          balance::text AS balance, delegates_count_all
        FROM (
          SELECT contributor.id, contributor.contract_set_id, contributor.chain_id,
            contributor.dao_code, contributor.governor_address, contributor.block_number,
            contributor.block_timestamp, contributor.transaction_hash,
            contributor.last_vote_timestamp,
            COALESCE(contributor_power_overlay.power, contributor.power) AS power,
            contributor.balance, contributor.delegates_count_all
          FROM contributor
          LEFT JOIN degov_provisional_contributor_power_overlay contributor_power_overlay
            ON contributor_power_overlay.contract_set_id = contributor.contract_set_id
           AND contributor_power_overlay.chain_id IS NOT DISTINCT FROM contributor.chain_id
           AND contributor_power_overlay.dao_code IS NOT DISTINCT FROM contributor.dao_code
           AND contributor_power_overlay.governor_address IS NOT DISTINCT FROM contributor.governor_address
           AND (
             contributor_power_overlay.token_address IS NOT DISTINCT FROM contributor.token_address
             OR contributor.token_address IS NULL
           )
           AND contributor_power_overlay.account = contributor.id
           AND contributor_power_overlay.source = 'live-onchain'
           AND contributor_power_overlay.status = 'available'
          UNION ALL
          SELECT contributor_power_overlay.account AS id,
            contributor_power_overlay.contract_set_id, contributor_power_overlay.chain_id,
            contributor_power_overlay.dao_code, contributor_power_overlay.governor_address,
            COALESCE(contributor_power_overlay.last_vote_block_number, contributor_power_overlay.anchor_block_number, 0) AS block_number,
            COALESCE(contributor_power_overlay.last_vote_timestamp, contributor_power_overlay.anchor_block_timestamp, 0) AS block_timestamp,
            '' AS transaction_hash,
            contributor_power_overlay.last_vote_timestamp,
            contributor_power_overlay.power,
            contributor_power_overlay.balance,
            contributor_power_overlay.delegates_count_all
          FROM degov_provisional_contributor_power_overlay contributor_power_overlay
          WHERE contributor_power_overlay.status = 'available'
            AND NOT EXISTS (
              SELECT 1
              FROM contributor durable_contributor
              WHERE durable_contributor.contract_set_id = contributor_power_overlay.contract_set_id
                AND durable_contributor.id = contributor_power_overlay.account
            )
        ) contributor
        "#,
    );
    push_contributor_where(&mut query, implicit_scope, where_);
    push_contributor_order(&mut query, order_by);
    push_page(&mut query, offset, limit);

    Ok(query.build_query_as().fetch_all(pool).await?)
}

async fn query_contributors_by_power_desc_candidates(
    pool: &PgPool,
    implicit_scope: &GraphqlScope,
    where_: Option<&ContributorWhereInput>,
    offset: Option<i32>,
    limit: i32,
) -> GraphqlResult<Vec<Contributor>> {
    let offset = offset.unwrap_or(0).max(0);
    let limit = limit.max(0);
    if limit == 0 {
        return Ok(Vec::new());
    }
    let mut candidate_limit = contributor_candidate_limit(offset, limit);
    for _ in 0..CONTRIBUTOR_CANDIDATE_MAX_ATTEMPTS {
        let rows = query_contributors_by_power_desc_candidate_limit(
            pool,
            implicit_scope,
            where_,
            offset,
            limit,
            candidate_limit,
        )
        .await?;
        if rows.first().is_none_or(|row| row.is_exact) {
            return Ok(rows
                .into_iter()
                .skip(offset as usize)
                .take(limit as usize)
                .map(Contributor::from)
                .collect());
        }
        if candidate_limit >= CONTRIBUTOR_CANDIDATE_MAX_LIMIT {
            break;
        }
        candidate_limit = candidate_limit
            .saturating_mul(2)
            .min(CONTRIBUTOR_CANDIDATE_MAX_LIMIT);
    }

    Err(async_graphql::Error::new(format!(
        "contributors power_DESC query could not prove exact pagination within {CONTRIBUTOR_CANDIDATE_MAX_LIMIT} candidates"
    )))
}

async fn query_contributors_by_power_desc_candidate_limit(
    pool: &PgPool,
    implicit_scope: &GraphqlScope,
    where_: Option<&ContributorWhereInput>,
    offset: i32,
    limit: i32,
    candidate_limit: i32,
) -> GraphqlResult<Vec<ContributorCandidateRow>> {
    let requested_end = offset.saturating_add(limit);
    let stream_limit = candidate_limit.saturating_add(1);
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        WITH overlay_stream AS (
          SELECT contributor_power_overlay.contract_set_id,
            contributor_power_overlay.account AS id,
            contributor_power_overlay.power
          FROM degov_provisional_contributor_power_overlay contributor_power_overlay
        "#,
    );
    push_contributor_candidate_where(
        &mut query,
        implicit_scope,
        where_,
        ContributorCandidateSource::Overlay,
    );
    query.push(
        r#"
          ORDER BY contributor_power_overlay.power DESC, contributor_power_overlay.account ASC
          LIMIT "#,
    );
    query.push_bind(stream_limit);
    query.push(
        r#"
        ),
        overlay_top AS (
          SELECT contract_set_id, id
          FROM overlay_stream
          ORDER BY power DESC, id ASC
          LIMIT "#,
    );
    query.push_bind(candidate_limit);
    query.push(
        r#"
        ),
        overlay_next AS (
          SELECT power, id
          FROM overlay_stream
          ORDER BY power DESC, id ASC
          OFFSET "#,
    );
    query.push_bind(candidate_limit);
    query.push(
        r#"
          LIMIT 1
        ),
        base_stream AS (
          SELECT contributor.contract_set_id, contributor.id, contributor.power
          FROM contributor
        "#,
    );
    push_contributor_candidate_where(
        &mut query,
        implicit_scope,
        where_,
        ContributorCandidateSource::Base,
    );
    query.push(
        r#"
          ORDER BY contributor.power DESC, contributor.id ASC
          LIMIT "#,
    );
    query.push_bind(stream_limit);
    query.push(
        r#"
        ),
        base_top AS (
          SELECT contract_set_id, id
          FROM base_stream
          ORDER BY power DESC, id ASC
          LIMIT "#,
    );
    query.push_bind(candidate_limit);
    query.push(
        r#"
        ),
        base_next AS (
          SELECT power, id
          FROM base_stream
          ORDER BY power DESC, id ASC
          OFFSET "#,
    );
    query.push_bind(candidate_limit);
    query.push(
        r#"
          LIMIT 1
        ),
        contributor_candidates AS (
          SELECT contract_set_id, id FROM overlay_top
          UNION
          SELECT contract_set_id, id FROM base_top
        ),
        candidate_rows AS (
          SELECT contributor_candidates.id,
            contributor_candidates.contract_set_id,
            COALESCE(contributor.chain_id, contributor_power_overlay.chain_id) AS chain_id,
            COALESCE(contributor.dao_code, contributor_power_overlay.dao_code) AS dao_code,
            COALESCE(contributor.governor_address, contributor_power_overlay.governor_address) AS governor_address,
            COALESCE(contributor.block_number, contributor_power_overlay.last_vote_block_number, contributor_power_overlay.anchor_block_number, 0) AS block_number,
            COALESCE(contributor.block_timestamp, contributor_power_overlay.last_vote_timestamp, contributor_power_overlay.anchor_block_timestamp, 0) AS block_timestamp,
            COALESCE(contributor.transaction_hash, '') AS transaction_hash,
            COALESCE(contributor_power_overlay.last_vote_timestamp, contributor.last_vote_timestamp) AS last_vote_timestamp,
            COALESCE(contributor_power_overlay.power, contributor.power) AS power,
            COALESCE(contributor_power_overlay.balance, contributor.balance) AS balance,
            COALESCE(contributor_power_overlay.delegates_count_all, contributor.delegates_count_all) AS delegates_count_all
          FROM contributor_candidates
          LEFT JOIN contributor
            ON contributor.contract_set_id = contributor_candidates.contract_set_id
           AND contributor.id = contributor_candidates.id
          LEFT JOIN degov_provisional_contributor_power_overlay contributor_power_overlay
            ON contributor_power_overlay.contract_set_id = contributor_candidates.contract_set_id
           AND contributor_power_overlay.account = contributor_candidates.id
           AND contributor_power_overlay.chain_id IS NOT DISTINCT FROM COALESCE(contributor.chain_id, contributor_power_overlay.chain_id)
           AND contributor_power_overlay.dao_code IS NOT DISTINCT FROM COALESCE(contributor.dao_code, contributor_power_overlay.dao_code)
           AND contributor_power_overlay.governor_address IS NOT DISTINCT FROM COALESCE(contributor.governor_address, contributor_power_overlay.governor_address)
           AND (
             contributor_power_overlay.token_address IS NOT DISTINCT FROM contributor.token_address
             OR contributor.token_address IS NULL
           )
           AND contributor_power_overlay.source = 'live-onchain'
           AND contributor_power_overlay.status = 'available'
          WHERE contributor.id IS NOT NULL
             OR contributor_power_overlay.account IS NOT NULL
        ),
        sorted_candidate_rows AS (
          SELECT id, chain_id, dao_code, governor_address, block_number, block_timestamp,
            transaction_hash, last_vote_timestamp, power, balance, delegates_count_all,
            ROW_NUMBER() OVER (ORDER BY power DESC, id ASC) AS row_number,
            COUNT(*) OVER () AS candidate_count
          FROM candidate_rows
        ),
        boundary AS (
          SELECT power, id
          FROM sorted_candidate_rows
          WHERE row_number = "#,
    );
    query.push_bind(requested_end);
    query.push(
        r#"
        ),
        next_rows AS (
          SELECT power, id FROM overlay_next
          UNION ALL
          SELECT power, id FROM base_next
        ),
        exact AS (
          SELECT CASE
            WHEN COALESCE((SELECT MAX(candidate_count) FROM sorted_candidate_rows), 0) < "#,
    );
    query.push_bind(requested_end);
    query.push(
        r#"
              THEN NOT EXISTS (SELECT 1 FROM next_rows)
            ELSE NOT EXISTS (
              SELECT 1
              FROM next_rows
              CROSS JOIN boundary
              WHERE next_rows.power > boundary.power
                 OR (next_rows.power = boundary.power AND next_rows.id < boundary.id)
            )
          END AS is_exact
        )
        SELECT id, chain_id, dao_code, governor_address, block_number::text AS block_number,
          (CASE WHEN block_timestamp < 1000000000000 THEN block_timestamp * 1000 ELSE block_timestamp END)::text AS block_timestamp,
          transaction_hash,
          (CASE WHEN last_vote_timestamp IS NULL THEN NULL WHEN last_vote_timestamp < 1000000000000 THEN last_vote_timestamp * 1000 ELSE last_vote_timestamp END)::text AS last_vote_timestamp,
          power::text AS power,
          balance::text AS balance, delegates_count_all,
          exact.is_exact
        FROM sorted_candidate_rows
        CROSS JOIN exact
        WHERE row_number <= "#,
    );
    query.push_bind(requested_end);
    query.push(" ORDER BY row_number ASC");

    Ok(query.build_query_as().fetch_all(pool).await?)
}

const CONTRIBUTOR_CANDIDATE_MAX_ATTEMPTS: usize = 8;
const CONTRIBUTOR_CANDIDATE_MAX_LIMIT: i32 = 20_000;

#[derive(FromRow)]
struct ContributorCandidateRow {
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
    is_exact: bool,
}

impl From<ContributorCandidateRow> for Contributor {
    fn from(row: ContributorCandidateRow) -> Self {
        Self {
            id: row.id,
            chain_id: row.chain_id,
            dao_code: row.dao_code,
            governor_address: row.governor_address,
            block_number: row.block_number,
            block_timestamp: row.block_timestamp,
            transaction_hash: row.transaction_hash,
            last_vote_timestamp: row.last_vote_timestamp,
            power: row.power,
            balance: row.balance,
            delegates_count_all: row.delegates_count_all,
        }
    }
}

#[derive(Copy, Clone)]
enum ContributorCandidateSource {
    Base,
    Overlay,
}

fn can_use_power_desc_candidate_query(
    where_: Option<&ContributorWhereInput>,
    order_by: Option<&[ContributorOrderByInput]>,
    limit: Option<i32>,
) -> bool {
    if limit.is_none() {
        return false;
    }
    let order_by = order_by.unwrap_or(&[ContributorOrderByInput::IdAsc]);
    let power_desc_order = matches!(order_by, [ContributorOrderByInput::PowerDesc])
        || matches!(
            order_by,
            [
                ContributorOrderByInput::PowerDesc,
                ContributorOrderByInput::IdAsc
            ]
        );
    power_desc_order
        && where_.is_none_or(|where_| {
            where_.or.is_none()
                && where_.power_lt.is_none()
                && where_.delegates_count_all_gt.is_none()
        })
}

fn contributor_candidate_limit(offset: i32, limit: i32) -> i32 {
    let requested_end = offset.saturating_add(limit).max(0);
    requested_end
        .saturating_mul(2)
        .saturating_add(60)
        .max(100)
        .min(CONTRIBUTOR_CANDIDATE_MAX_LIMIT)
}

fn push_contributor_candidate_where<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    implicit_scope: &'a GraphqlScope,
    where_: Option<&'a ContributorWhereInput>,
    source: ContributorCandidateSource,
) {
    query.push(" WHERE ");
    let mut has_condition = false;
    match source {
        ContributorCandidateSource::Base => {
            push_implicit_scope_filters(
                query,
                &mut has_condition,
                implicit_scope,
                "contributor",
                true,
            );
            if let Some(where_) = where_ {
                push_contributor_candidate_filters(query, &mut has_condition, where_, source);
            }
        }
        ContributorCandidateSource::Overlay => {
            push_column_eq(
                query,
                &mut has_condition,
                "contributor_power_overlay",
                "source",
                "live-onchain",
            );
            push_column_eq(
                query,
                &mut has_condition,
                "contributor_power_overlay",
                "status",
                "available",
            );
            push_implicit_scope_filters(
                query,
                &mut has_condition,
                implicit_scope,
                "contributor_power_overlay",
                true,
            );
            if let Some(where_) = where_ {
                push_contributor_candidate_filters(query, &mut has_condition, where_, source);
            }
        }
    }
    if !has_condition {
        query.push("TRUE");
    }
}

fn push_contributor_candidate_filters<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    has_condition: &mut bool,
    where_: &'a ContributorWhereInput,
    source: ContributorCandidateSource,
) {
    let table_alias = match source {
        ContributorCandidateSource::Base => "contributor",
        ContributorCandidateSource::Overlay => "contributor_power_overlay",
    };
    push_scope_filters(query, has_condition, &where_.scope, table_alias);
    if let Some(id) = &where_.id_eq {
        push_contributor_candidate_id_eq(query, has_condition, source, id);
    }
    if let Some(ids) = &where_.id_in {
        push_and(query, has_condition);
        push_contributor_candidate_id_column(query, source);
        query.push(" = ANY(").push_bind(ids).push(")");
    }
    if let Some(id) = &where_.id_not_eq {
        push_and(query, has_condition);
        push_contributor_candidate_id_column(query, source);
        query.push(" <> ").push_bind(id);
    }
    if let Some(power) = where_.power_lt {
        push_and(query, has_condition);
        push_qualified_column(query, table_alias, "power");
        query.push(" < ").push_bind(power).push("::numeric");
    }
}

fn push_contributor_candidate_id_eq<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    has_condition: &mut bool,
    source: ContributorCandidateSource,
    id: &'a str,
) {
    push_and(query, has_condition);
    push_contributor_candidate_id_column(query, source);
    query.push(" = ").push_bind(id);
}

fn push_contributor_candidate_id_column(
    query: &mut QueryBuilder<'_, Postgres>,
    source: ContributorCandidateSource,
) {
    match source {
        ContributorCandidateSource::Base => push_qualified_column(query, "contributor", "id"),
        ContributorCandidateSource::Overlay => {
            push_qualified_column(query, "contributor_power_overlay", "account")
        }
    }
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
          block_number::text AS block_number,
          (CASE WHEN block_timestamp < 1000000000000 THEN block_timestamp * 1000 ELSE block_timestamp END)::text AS block_timestamp,
          transaction_hash, is_current, power::text AS power
        FROM (
          SELECT delegate.id, delegate.contract_set_id, delegate.chain_id,
            delegate.dao_code, delegate.governor_address, delegate.from_delegate,
            delegate.to_delegate, delegate.block_number, delegate.block_timestamp,
            delegate.transaction_hash, delegate.is_current,
            COALESCE(delegate_power_overlay.power, delegate.power) AS power
          FROM delegate
          LEFT JOIN degov_provisional_delegate_power_overlay delegate_power_overlay
            ON delegate_power_overlay.contract_set_id = delegate.contract_set_id
           AND delegate_power_overlay.chain_id IS NOT DISTINCT FROM delegate.chain_id
           AND delegate_power_overlay.dao_code IS NOT DISTINCT FROM delegate.dao_code
           AND delegate_power_overlay.governor_address IS NOT DISTINCT FROM delegate.governor_address
           AND (
             delegate_power_overlay.token_address IS NOT DISTINCT FROM delegate.token_address
             OR delegate.token_address IS NULL
           )
           AND delegate_power_overlay.delegator = delegate.from_delegate
           AND delegate_power_overlay.delegate = delegate.to_delegate
           AND delegate_power_overlay.source = 'live-onchain'
           AND delegate_power_overlay.status = 'available'
          UNION ALL
          SELECT delegate_power_overlay.id,
            delegate_power_overlay.contract_set_id, delegate_power_overlay.chain_id,
            delegate_power_overlay.dao_code, delegate_power_overlay.governor_address,
            delegate_power_overlay.delegator AS from_delegate,
            delegate_power_overlay.delegate AS to_delegate,
            COALESCE(delegate_power_overlay.anchor_block_number, 0) AS block_number,
            COALESCE(delegate_power_overlay.anchor_block_timestamp, 0) AS block_timestamp,
            '' AS transaction_hash,
            delegate_power_overlay.is_current,
            delegate_power_overlay.power
          FROM degov_provisional_delegate_power_overlay delegate_power_overlay
          WHERE delegate_power_overlay.status = 'available'
            AND NOT EXISTS (
              SELECT 1
              FROM delegate durable_delegate
              WHERE durable_delegate.contract_set_id = delegate_power_overlay.contract_set_id
                AND durable_delegate.from_delegate = delegate_power_overlay.delegator
                AND durable_delegate.to_delegate = delegate_power_overlay.delegate
            )
        ) delegate
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
          block_number::text AS block_number,
          (CASE WHEN block_timestamp < 1000000000000 THEN block_timestamp * 1000 ELSE block_timestamp END)::text AS block_timestamp,
          transaction_hash
        FROM (
          SELECT delegate_mapping.id, delegate_mapping.contract_set_id, delegate_mapping.chain_id,
            delegate_mapping.dao_code, delegate_mapping.governor_address, delegate_mapping."from",
            delegate_mapping."to", delegate_mapping.power, delegate_mapping.block_number,
            delegate_mapping.block_timestamp, delegate_mapping.transaction_hash
          FROM delegate_mapping
          WHERE NOT EXISTS (
            SELECT 1
            FROM degov_provisional_delegate_power_overlay delegate_power_overlay
            WHERE delegate_power_overlay.status = 'available'
              AND delegate_power_overlay.contract_set_id = delegate_mapping.contract_set_id
              AND delegate_power_overlay.chain_id IS NOT DISTINCT FROM delegate_mapping.chain_id
              AND delegate_power_overlay.dao_code IS NOT DISTINCT FROM delegate_mapping.dao_code
              AND delegate_power_overlay.governor_address IS NOT DISTINCT FROM delegate_mapping.governor_address
              AND delegate_power_overlay.delegator = delegate_mapping."from"
          )
          UNION ALL
          SELECT delegate_power_overlay.id, delegate_power_overlay.contract_set_id,
            delegate_power_overlay.chain_id, delegate_power_overlay.dao_code,
            delegate_power_overlay.governor_address, delegate_power_overlay.delegator AS "from",
            delegate_power_overlay.delegate AS "to", delegate_power_overlay.power,
            COALESCE(delegate_power_overlay.anchor_block_number, 0) AS block_number,
            COALESCE(delegate_power_overlay.anchor_block_timestamp, 0) AS block_timestamp,
            '' AS transaction_hash
          FROM degov_provisional_delegate_power_overlay delegate_power_overlay
          WHERE delegate_power_overlay.status = 'available'
            AND delegate_power_overlay.is_current = TRUE
        ) delegate_mapping
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
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT COUNT(*)::int8 AS total
        FROM (
          SELECT contributor.id, contributor.contract_set_id, contributor.chain_id,
            contributor.dao_code, contributor.governor_address,
            COALESCE(contributor_power_overlay.power, contributor.power) AS power,
            contributor.last_vote_timestamp, contributor.delegates_count_all
          FROM contributor
          LEFT JOIN degov_provisional_contributor_power_overlay contributor_power_overlay
            ON contributor_power_overlay.contract_set_id = contributor.contract_set_id
           AND contributor_power_overlay.chain_id IS NOT DISTINCT FROM contributor.chain_id
           AND contributor_power_overlay.dao_code IS NOT DISTINCT FROM contributor.dao_code
           AND contributor_power_overlay.governor_address IS NOT DISTINCT FROM contributor.governor_address
           AND (
             contributor_power_overlay.token_address IS NOT DISTINCT FROM contributor.token_address
             OR contributor.token_address IS NULL
           )
           AND contributor_power_overlay.account = contributor.id
           AND contributor_power_overlay.source = 'live-onchain'
           AND contributor_power_overlay.status = 'available'
          UNION ALL
          SELECT contributor_power_overlay.account AS id,
            contributor_power_overlay.contract_set_id, contributor_power_overlay.chain_id,
            contributor_power_overlay.dao_code, contributor_power_overlay.governor_address,
            contributor_power_overlay.power,
            contributor_power_overlay.last_vote_timestamp,
            contributor_power_overlay.delegates_count_all
          FROM degov_provisional_contributor_power_overlay contributor_power_overlay
          WHERE contributor_power_overlay.status = 'available'
            AND NOT EXISTS (
              SELECT 1
              FROM contributor durable_contributor
              WHERE durable_contributor.contract_set_id = contributor_power_overlay.contract_set_id
                AND durable_contributor.id = contributor_power_overlay.account
            )
        ) contributor
        "#,
    );
    push_contributor_where(&mut query, implicit_scope, where_);
    let (total,): (i64,) = query.build_query_as().fetch_one(pool).await?;
    Ok(total)
}

pub(super) async fn count_delegates(
    pool: &PgPool,
    implicit_scope: &GraphqlScope,
    where_: Option<&DelegateWhereInput>,
) -> GraphqlResult<i64> {
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT COUNT(*)::int8 AS total
        FROM (
          SELECT delegate.id, delegate.contract_set_id, delegate.chain_id,
            delegate.dao_code, delegate.governor_address, delegate.from_delegate,
            delegate.to_delegate, delegate.is_current,
            COALESCE(delegate_power_overlay.power, delegate.power) AS power
          FROM delegate
          LEFT JOIN degov_provisional_delegate_power_overlay delegate_power_overlay
            ON delegate_power_overlay.contract_set_id = delegate.contract_set_id
           AND delegate_power_overlay.chain_id IS NOT DISTINCT FROM delegate.chain_id
           AND delegate_power_overlay.dao_code IS NOT DISTINCT FROM delegate.dao_code
           AND delegate_power_overlay.governor_address IS NOT DISTINCT FROM delegate.governor_address
           AND (
             delegate_power_overlay.token_address IS NOT DISTINCT FROM delegate.token_address
             OR delegate.token_address IS NULL
           )
           AND delegate_power_overlay.delegator = delegate.from_delegate
           AND delegate_power_overlay.delegate = delegate.to_delegate
           AND delegate_power_overlay.source = 'live-onchain'
           AND delegate_power_overlay.status = 'available'
          UNION ALL
          SELECT delegate_power_overlay.id,
            delegate_power_overlay.contract_set_id, delegate_power_overlay.chain_id,
            delegate_power_overlay.dao_code, delegate_power_overlay.governor_address,
            delegate_power_overlay.delegator AS from_delegate,
            delegate_power_overlay.delegate AS to_delegate,
            delegate_power_overlay.is_current,
            delegate_power_overlay.power
          FROM degov_provisional_delegate_power_overlay delegate_power_overlay
          WHERE delegate_power_overlay.status = 'available'
            AND NOT EXISTS (
              SELECT 1
              FROM delegate durable_delegate
              WHERE durable_delegate.contract_set_id = delegate_power_overlay.contract_set_id
                AND durable_delegate.from_delegate = delegate_power_overlay.delegator
                AND durable_delegate.to_delegate = delegate_power_overlay.delegate
            )
        ) delegate
        "#,
    );
    push_delegate_where(&mut query, implicit_scope, where_);
    let (total,): (i64,) = query.build_query_as().fetch_one(pool).await?;
    Ok(total)
}

async fn count_realtime_delegate_profiles(
    pool: &PgPool,
    implicit_scope: &GraphqlScope,
    where_: Option<&DelegateWhereInput>,
) -> GraphqlResult<i64> {
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT COUNT(DISTINCT lower(to_delegate))::int8 AS total
        FROM (
          SELECT delegate.id, delegate.contract_set_id, delegate.chain_id,
            delegate.dao_code, delegate.governor_address, delegate.from_delegate,
            delegate.to_delegate, delegate.is_current,
            COALESCE(delegate_power_overlay.power, delegate.power) AS power
          FROM delegate
          LEFT JOIN degov_provisional_delegate_power_overlay delegate_power_overlay
            ON delegate_power_overlay.contract_set_id = delegate.contract_set_id
           AND delegate_power_overlay.chain_id IS NOT DISTINCT FROM delegate.chain_id
           AND delegate_power_overlay.dao_code IS NOT DISTINCT FROM delegate.dao_code
           AND delegate_power_overlay.governor_address IS NOT DISTINCT FROM delegate.governor_address
           AND (
             delegate_power_overlay.token_address IS NOT DISTINCT FROM delegate.token_address
             OR delegate.token_address IS NULL
           )
           AND delegate_power_overlay.delegator = delegate.from_delegate
           AND delegate_power_overlay.delegate = delegate.to_delegate
           AND delegate_power_overlay.source = 'live-onchain'
           AND delegate_power_overlay.status = 'available'
          UNION ALL
          SELECT delegate_power_overlay.id,
            delegate_power_overlay.contract_set_id, delegate_power_overlay.chain_id,
            delegate_power_overlay.dao_code, delegate_power_overlay.governor_address,
            delegate_power_overlay.delegator AS from_delegate,
            delegate_power_overlay.delegate AS to_delegate,
            delegate_power_overlay.is_current,
            delegate_power_overlay.power
          FROM degov_provisional_delegate_power_overlay delegate_power_overlay
          WHERE delegate_power_overlay.status = 'available'
            AND NOT EXISTS (
              SELECT 1
              FROM delegate durable_delegate
              WHERE durable_delegate.contract_set_id = delegate_power_overlay.contract_set_id
                AND durable_delegate.from_delegate = delegate_power_overlay.delegator
                AND durable_delegate.to_delegate = delegate_power_overlay.delegate
            )
        ) delegate
        "#,
    );
    push_delegate_profile_where(&mut query, implicit_scope, where_);
    if !implicit_scope.is_empty() || where_.is_some() {
        query.push(" AND ");
    } else {
        query.push(" WHERE ");
    }
    query.push("lower(to_delegate) <> '0x0000000000000000000000000000000000000000'");
    let (total,): (i64,) = query.build_query_as().fetch_one(pool).await?;
    Ok(total)
}

#[derive(Copy, Clone, Debug)]
struct DelegateProfileScope<'a> {
    chain_id: i32,
    dao_code: &'a str,
    governor_address: &'a str,
}

fn materialized_delegate_profile_scope<'a>(
    implicit_scope: &GraphqlScope,
    where_: Option<&'a DelegateWhereInput>,
) -> Option<DelegateProfileScope<'a>> {
    if implicit_scope.contract_set_id.is_some() {
        return None;
    }

    let DelegateWhereInput {
        scope,
        from_delegate_eq,
        to_delegate_eq,
        is_current_eq,
        power_lt,
        or,
    } = where_?;
    if from_delegate_eq.is_some()
        || to_delegate_eq.is_some()
        || is_current_eq.is_some()
        || power_lt.is_some()
        || or.is_some()
    {
        return None;
    }

    let ScopeWhereInput {
        chain_id_eq,
        governor_address_eq,
        dao_code_eq,
    } = scope;
    let chain_id = (*chain_id_eq)?;
    let dao_code = dao_code_eq.as_deref().filter(|value| !value.is_empty())?;
    let governor_address = governor_address_eq
        .as_deref()
        .filter(|value| !value.is_empty())?;

    if implicit_scope
        .chain_id
        .is_some_and(|implicit| implicit != chain_id)
        || implicit_scope
            .dao_code
            .as_deref()
            .is_some_and(|implicit| implicit != dao_code)
        || implicit_scope
            .governor_address
            .as_deref()
            .is_some_and(|implicit| !implicit.eq_ignore_ascii_case(governor_address))
    {
        return None;
    }

    Some(DelegateProfileScope {
        chain_id,
        dao_code,
        governor_address,
    })
}

#[derive(Debug, FromRow)]
struct MaterializedDelegateProfileStats {
    metric_row_count: i64,
    metric_non_null_count: i64,
    metric_min: Option<i32>,
    metric_max: Option<i32>,
    provisional_delta: i64,
}

impl MaterializedDelegateProfileStats {
    fn validated_count(&self) -> Option<i32> {
        let materialized_count = self.metric_min?;
        (self.metric_row_count > 0
            && self.metric_non_null_count == self.metric_row_count
            && self.metric_max == Some(materialized_count)
            && materialized_count >= 0)
            .then_some(materialized_count)
    }
}

const MATERIALIZED_DELEGATE_PROFILES_SQL: &str = "WITH metric_stats AS (
       SELECT COUNT(*)::int8 AS metric_row_count,
         COUNT(delegate_profiles_count)::int8 AS metric_non_null_count,
         MIN(delegate_profiles_count) AS metric_min,
         MAX(delegate_profiles_count) AS metric_max
       FROM data_metric
       WHERE id = 'global'
         AND chain_id = $1
         AND dao_code = $2
         AND lower(governor_address) = lower($3)
     ),
     provisional_stats AS (
       SELECT COUNT(DISTINCT lower(delegate_overlay.delegate))::int8 AS provisional_delta
       FROM degov_provisional_delegate_power_overlay delegate_overlay
       WHERE delegate_overlay.status = 'available'
         AND delegate_overlay.chain_id = $1
         AND delegate_overlay.dao_code = $2
         AND lower(delegate_overlay.governor_address) = lower($3)
         AND lower(delegate_overlay.delegate) <> '0x0000000000000000000000000000000000000000'
         AND NOT EXISTS (
           SELECT 1
           FROM delegate_profile durable_profile
           WHERE durable_profile.chain_id = $1
             AND durable_profile.dao_code = $2
             AND durable_profile.governor_address = lower($3)
             AND durable_profile.delegate = lower(delegate_overlay.delegate)
         )
     )
     SELECT metric_stats.metric_row_count, metric_stats.metric_non_null_count,
       metric_stats.metric_min, metric_stats.metric_max,
       provisional_stats.provisional_delta
     FROM metric_stats
     CROSS JOIN provisional_stats";

async fn count_materialized_delegate_profiles(
    pool: &PgPool,
    scope: DelegateProfileScope<'_>,
) -> GraphqlResult<Option<i64>> {
    let stats: MaterializedDelegateProfileStats =
        sqlx::query_as(MATERIALIZED_DELEGATE_PROFILES_SQL)
            .bind(scope.chain_id)
            .bind(scope.dao_code)
            .bind(scope.governor_address)
            .fetch_one(pool)
            .await?;
    let Some(materialized_count) = stats.validated_count() else {
        return Ok(None);
    };

    let provisional_delta = i32::try_from(stats.provisional_delta).map_err(|_| {
        async_graphql::Error::new("delegateProfilesCount provisional delta exceeds GraphQL Int")
    })?;
    let total = materialized_count
        .checked_add(provisional_delta)
        .ok_or_else(|| async_graphql::Error::new("delegateProfilesCount exceeds GraphQL Int"))?;

    Ok(Some(i64::from(total)))
}

pub(super) async fn count_delegate_profiles(
    pool: &PgPool,
    implicit_scope: &GraphqlScope,
    where_: Option<&DelegateWhereInput>,
) -> GraphqlResult<i64> {
    if let Some(scope) = materialized_delegate_profile_scope(implicit_scope, where_)
        && let Some(total) = count_materialized_delegate_profiles(pool, scope).await?
    {
        return Ok(total);
    }

    count_realtime_delegate_profiles(pool, implicit_scope, where_).await
}

pub(super) async fn count_delegate_mappings(
    pool: &PgPool,
    implicit_scope: &GraphqlScope,
    where_: Option<&DelegateMappingWhereInput>,
) -> GraphqlResult<i64> {
    let mut query = QueryBuilder::<Postgres>::new(
        r#"
        SELECT COUNT(*)::int8 AS total
        FROM (
          SELECT delegate_mapping.id, delegate_mapping.contract_set_id, delegate_mapping.chain_id,
            delegate_mapping.dao_code, delegate_mapping.governor_address, delegate_mapping."from",
            delegate_mapping."to", delegate_mapping.power
          FROM delegate_mapping
          WHERE NOT EXISTS (
            SELECT 1
            FROM degov_provisional_delegate_power_overlay delegate_power_overlay
            WHERE delegate_power_overlay.status = 'available'
              AND delegate_power_overlay.contract_set_id = delegate_mapping.contract_set_id
              AND delegate_power_overlay.chain_id IS NOT DISTINCT FROM delegate_mapping.chain_id
              AND delegate_power_overlay.dao_code IS NOT DISTINCT FROM delegate_mapping.dao_code
              AND delegate_power_overlay.governor_address IS NOT DISTINCT FROM delegate_mapping.governor_address
              AND delegate_power_overlay.delegator = delegate_mapping."from"
          )
          UNION ALL
          SELECT delegate_power_overlay.id, delegate_power_overlay.contract_set_id,
            delegate_power_overlay.chain_id, delegate_power_overlay.dao_code,
            delegate_power_overlay.governor_address, delegate_power_overlay.delegator AS "from",
            delegate_power_overlay.delegate AS "to", delegate_power_overlay.power
          FROM degov_provisional_delegate_power_overlay delegate_power_overlay
          WHERE delegate_power_overlay.status = 'available'
            AND delegate_power_overlay.is_current = TRUE
        ) delegate_mapping
        "#,
    );
    push_delegate_mapping_where(&mut query, implicit_scope, where_);
    let (total,): (i64,) = query.build_query_as().fetch_one(pool).await?;
    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_materialized_delegate_profile_sql_is_one_snapshot_without_durable_delegate_scan() {
        let normalized = MATERIALIZED_DELEGATE_PROFILES_SQL
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .to_ascii_lowercase();

        assert!(!normalized.contains(';'));
        assert!(normalized.contains("with metric_stats as"));
        assert!(normalized.contains("provisional_stats as"));
        assert!(normalized.contains("delegate_overlay.status = 'available'"));
        assert!(!normalized.contains(" from delegate "));
        assert!(!normalized.contains(" join delegate "));
        assert!(!normalized.contains("count(distinct lower(to_delegate))"));
    }

    #[test]
    fn test_materialized_delegate_profile_stats_fail_closed() {
        let stats = |metric_row_count, metric_non_null_count, metric_min, metric_max| {
            MaterializedDelegateProfileStats {
                metric_row_count,
                metric_non_null_count,
                metric_min,
                metric_max,
                provisional_delta: 0,
            }
        };

        assert_eq!(stats(0, 0, None, None).validated_count(), None);
        assert_eq!(stats(2, 0, None, None).validated_count(), None);
        assert_eq!(stats(2, 1, Some(7), Some(7)).validated_count(), None);
        assert_eq!(stats(2, 2, Some(4), Some(7)).validated_count(), None);
        assert_eq!(stats(2, 2, Some(-1), Some(-1)).validated_count(), None);
        assert_eq!(stats(2, 2, Some(7), Some(7)).validated_count(), Some(7));
    }

    #[test]
    fn test_indexer_status_provisional_height_matches_contract_dataset_key() {
        let query = indexer_status_query();
        let sql = query.sql();

        assert!(sql.contains("segment.dataset_key = split_part"));
        assert!(
            sql.contains("split_part(degov_indexer_checkpoint.contract_set_id, 'dataset=', 2)")
        );
    }

    #[test]
    fn test_canonical_numeric_78_accepts_boundaries_and_rejects_other_forms() {
        assert!(is_canonical_numeric_78("0"));
        assert!(is_canonical_numeric_78("9223372036854775808"));
        assert!(is_canonical_numeric_78(&"9".repeat(78)));

        for invalid in [
            "",
            "not-a-number",
            "NaN",
            "1.5",
            "1e3",
            "-1",
            "+1",
            " 1",
            "1 ",
            "01",
            &"9".repeat(79),
        ] {
            assert!(!is_canonical_numeric_78(invalid), "accepted {invalid:?}");
        }
    }
}
