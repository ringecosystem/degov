use sqlx::{Postgres, QueryBuilder};

use super::types::*;

pub(super) fn push_proposal_where<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    implicit_scope: &'a GraphqlScope,
    where_: Option<&'a ProposalWhereInput>,
) {
    if !implicit_scope.is_empty() || where_.is_some() {
        query.push(" WHERE ");
        let mut has_condition = false;
        push_implicit_scope_filters(query, &mut has_condition, implicit_scope, "proposal", true);
        if let Some(where_) = where_ {
            push_proposal_filters(
                query,
                &mut has_condition,
                implicit_scope,
                where_,
                "proposal",
            );
        }
        if !has_condition {
            query.push("TRUE");
        }
    }
}

pub(super) fn push_proposal_filters<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    has_condition: &mut bool,
    implicit_scope: &'a GraphqlScope,
    where_: &'a ProposalWhereInput,
    table_alias: &str,
) {
    push_scope_filters(query, has_condition, &where_.scope, table_alias);
    if let Some(proposal_id) = &where_.proposal_id_eq {
        push_proposal_id_eq(query, has_condition, table_alias, proposal_id);
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
        query.push(
            r#"EXISTS (
              SELECT 1
              FROM (
                SELECT id, contract_set_id, chain_id, dao_code, governor_address, proposal_id,
                  ref_proposal_id, voter, support
                FROM vote_cast_group
                UNION ALL
                SELECT vote_overlay.id, vote_overlay.contract_set_id, vote_overlay.chain_id,
                  vote_overlay.dao_code, vote_overlay.governor_address, vote_overlay.proposal_id,
                  vote_overlay.ref_proposal_id, vote_overlay.voter, vote_overlay.support
                FROM degov_provisional_vote_cast_group_overlay vote_overlay
                WHERE vote_overlay.status = 'available'
                  AND NOT EXISTS (
                    SELECT 1
                    FROM vote_cast_group durable_vote
                    WHERE durable_vote.contract_set_id = vote_overlay.contract_set_id
                      AND durable_vote.id = vote_overlay.id
                  )
              ) v
              WHERE (
                v.proposal_id = proposal.id
                OR (
                  v.ref_proposal_id = proposal.proposal_id
                  AND v.contract_set_id = proposal.contract_set_id
                  AND v.chain_id IS NOT DISTINCT FROM proposal.chain_id
                  AND v.dao_code IS NOT DISTINCT FROM proposal.dao_code
                  AND v.governor_address IS NOT DISTINCT FROM proposal.governor_address
                )
              )"#,
        );
        let mut nested_has_condition = true;
        push_implicit_scope_filters(query, &mut nested_has_condition, implicit_scope, "v", true);
        push_vote_cast_group_filters(query, &mut nested_has_condition, voters_some, "v");
        query.push(")");
    }
    if let Some(or) = &where_.or {
        push_or_group(query, has_condition, or, |query, has_condition, filter| {
            push_proposal_filters(query, has_condition, implicit_scope, filter, table_alias);
        });
    }
}

pub(super) fn push_vote_cast_group_where<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    has_condition: &mut bool,
    implicit_scope: &'a GraphqlScope,
    where_: Option<&'a VoteCastGroupWhereInput>,
) {
    push_implicit_scope_filters(query, has_condition, implicit_scope, "", true);
    if let Some(where_) = where_ {
        push_vote_cast_group_filters(query, has_condition, where_, "");
    }
}

pub(super) fn push_vote_cast_group_filters<'a>(
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

pub(super) fn push_event_where<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    implicit_scope: &'a GraphqlScope,
    where_: Option<&'a impl ProposalEventWhere>,
) {
    if !implicit_scope.is_empty() || where_.is_some() {
        query.push(" WHERE ");
        let mut has_condition = false;
        push_implicit_event_scope_filters(query, &mut has_condition, implicit_scope, "");
        if let Some(where_) = where_ {
            push_scope_filters(query, &mut has_condition, where_.scope(), "");
            if let Some(proposal_id) = where_.proposal_id_eq() {
                push_proposal_id_eq(query, &mut has_condition, "", proposal_id);
            }
        }
        if !has_condition {
            query.push("TRUE");
        }
    }
}

pub(super) fn push_data_metric_where<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    implicit_scope: &'a GraphqlScope,
    where_: Option<&'a DataMetricWhereInput>,
) {
    if !implicit_scope.is_empty() || where_.is_some() {
        query.push(" WHERE ");
        let mut has_condition = false;
        push_implicit_scope_filters(query, &mut has_condition, implicit_scope, "", true);
        if let Some(where_) = where_ {
            push_data_metric_filters(query, &mut has_condition, where_, "");
        }
        if !has_condition {
            query.push("TRUE");
        }
    }
}

pub(super) fn push_data_metric_filters<'a>(
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

pub(super) fn push_contributor_where<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    implicit_scope: &'a GraphqlScope,
    where_: Option<&'a ContributorWhereInput>,
) {
    if !implicit_scope.is_empty() || where_.is_some() {
        query.push(" WHERE ");
        let mut has_condition = false;
        push_implicit_scope_filters(query, &mut has_condition, implicit_scope, "", true);
        if let Some(where_) = where_ {
            push_contributor_filters(query, &mut has_condition, where_, "");
        }
        if !has_condition {
            query.push("TRUE");
        }
    }
}

pub(super) fn push_contributor_filters<'a>(
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
    if let Some(count) = where_.delegates_count_all_gt {
        push_and(query, has_condition);
        push_qualified_column(query, table_alias, "delegates_count_all");
        query.push(" > ").push_bind(count);
    }
    if let Some(or) = &where_.or {
        push_or_group(query, has_condition, or, |query, has_condition, filter| {
            push_contributor_filters(query, has_condition, filter, table_alias);
        });
    }
}

pub(super) fn push_delegate_where<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    implicit_scope: &'a GraphqlScope,
    where_: Option<&'a DelegateWhereInput>,
) {
    if !implicit_scope.is_empty() || where_.is_some() {
        query.push(" WHERE ");
        let mut has_condition = false;
        push_implicit_scope_filters(query, &mut has_condition, implicit_scope, "", true);
        if let Some(where_) = where_ {
            push_delegate_filters(query, &mut has_condition, where_, "");
        }
        if !has_condition {
            query.push("TRUE");
        }
    }
}

pub(super) fn push_delegate_filters<'a>(
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

pub(super) fn push_delegate_mapping_where<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    implicit_scope: &'a GraphqlScope,
    where_: Option<&'a DelegateMappingWhereInput>,
) {
    if !implicit_scope.is_empty() || where_.is_some() {
        query.push(" WHERE ");
        let mut has_condition = false;
        push_implicit_scope_filters(query, &mut has_condition, implicit_scope, "", true);
        if let Some(where_) = where_ {
            push_scope_filters(query, &mut has_condition, &where_.scope, "");
            if let Some(from) = &where_.from_eq {
                push_column_eq(query, &mut has_condition, "", r#""from""#, from);
            }
            if let Some(to) = &where_.to_eq {
                push_column_eq(query, &mut has_condition, "", r#""to""#, to);
            }
        }
        if !has_condition {
            query.push("TRUE");
        }
    }
}

pub(super) fn push_scope_filters<'a>(
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

pub(super) fn push_implicit_scope_filters<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    has_condition: &mut bool,
    scope: &'a GraphqlScope,
    table_alias: &str,
    include_contract_set_id: bool,
) {
    if let Some(chain_id) = scope.chain_id {
        push_column_eq(query, has_condition, table_alias, "chain_id", chain_id);
    }
    if let Some(governor_address) = &scope.governor_address {
        push_column_eq(
            query,
            has_condition,
            table_alias,
            "governor_address",
            governor_address,
        );
    }
    if let Some(dao_code) = &scope.dao_code {
        push_column_eq(query, has_condition, table_alias, "dao_code", dao_code);
    }
    if include_contract_set_id {
        if let Some(contract_set_id) = &scope.contract_set_id {
            push_column_eq(
                query,
                has_condition,
                table_alias,
                "contract_set_id",
                contract_set_id,
            );
        }
    }
}

pub(super) fn push_implicit_event_scope_filters<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    has_condition: &mut bool,
    scope: &'a GraphqlScope,
    table_alias: &str,
) {
    push_implicit_scope_filters(query, has_condition, scope, table_alias, false);
    if let Some(contract_set_id) = &scope.contract_set_id {
        push_and(query, has_condition);
        query.push("EXISTS (SELECT 1 FROM proposal p WHERE p.contract_set_id = ");
        query.push_bind(contract_set_id);
        query.push(" AND p.proposal_id = ");
        push_qualified_column(query, table_alias, "proposal_id");
        query.push(" AND p.chain_id IS NOT DISTINCT FROM ");
        push_qualified_column(query, table_alias, "chain_id");
        query.push(" AND p.governor_address IS NOT DISTINCT FROM ");
        push_qualified_column(query, table_alias, "governor_address");
        query.push(")");
    }
}

pub(super) fn push_or_group<'a, T, F>(
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

pub(super) fn push_column_eq<'a, T>(
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

pub(super) fn push_numeric_column_eq<'a>(
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

fn push_proposal_id_eq<'a>(
    query: &mut QueryBuilder<'a, Postgres>,
    has_condition: &mut bool,
    table_alias: &str,
    proposal_id: &'a str,
) {
    let values = proposal_id_compat_values(proposal_id);
    if values.len() == 1 {
        push_column_eq(
            query,
            has_condition,
            table_alias,
            "proposal_id",
            proposal_id,
        );
        return;
    }

    push_and(query, has_condition);
    query.push("(");
    for (index, value) in values.iter().enumerate() {
        if index > 0 {
            query.push(" OR ");
        }
        push_qualified_column(query, table_alias, "proposal_id");
        query.push(" = ").push_bind(value.clone());
    }
    query.push(")");
}

pub(super) fn push_qualified_column(
    query: &mut QueryBuilder<'_, Postgres>,
    table_alias: &str,
    column: &str,
) {
    if table_alias.is_empty() {
        query.push(column);
    } else {
        query.push(table_alias).push(".").push(column);
    }
}

pub(super) fn push_and(query: &mut QueryBuilder<'_, Postgres>, has_condition: &mut bool) {
    if *has_condition {
        query.push(" AND ");
    } else {
        *has_condition = true;
    }
}
