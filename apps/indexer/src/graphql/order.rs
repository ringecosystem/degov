use sqlx::{Postgres, QueryBuilder};

use super::types::*;

pub(super) fn push_data_metric_order(
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

pub(super) fn push_proposal_order(
    query: &mut QueryBuilder<'_, Postgres>,
    order_by: Option<&[ProposalOrderByInput]>,
) {
    push_order(
        query,
        order_by.unwrap_or(&[ProposalOrderByInput::IdAsc]),
        |order| match order {
            ProposalOrderByInput::BlockNumberAscNullsFirst => {
                "proposal.block_number ASC NULLS FIRST"
            }
            ProposalOrderByInput::BlockTimestampAscNullsFirst => {
                "proposal.block_timestamp ASC NULLS FIRST"
            }
            ProposalOrderByInput::BlockTimestampDescNullsLast => {
                "proposal.block_timestamp DESC NULLS LAST"
            }
            ProposalOrderByInput::IdAsc => "proposal.id ASC",
        },
    );
}

pub(super) fn push_vote_cast_group_order(
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

pub(super) fn push_event_order(
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

pub(super) fn push_contributor_order(
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

pub(super) fn push_delegate_order(
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

pub(super) fn push_delegate_mapping_order(
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

pub(super) fn push_order<T>(
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_push_proposal_order_uses_qualified_compatibility_fragments() {
        let mut query = QueryBuilder::<Postgres>::new("SELECT * FROM proposal");

        push_proposal_order(
            &mut query,
            Some(&[
                ProposalOrderByInput::BlockNumberAscNullsFirst,
                ProposalOrderByInput::BlockTimestampAscNullsFirst,
                ProposalOrderByInput::IdAsc,
            ]),
        );

        assert_eq!(
            query.sql(),
            "SELECT * FROM proposal ORDER BY proposal.block_number ASC NULLS FIRST, proposal.block_timestamp ASC NULLS FIRST, proposal.id ASC"
        );
    }
}
