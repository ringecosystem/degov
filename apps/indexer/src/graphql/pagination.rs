use sqlx::{Postgres, QueryBuilder};

pub(super) fn push_page(
    query: &mut QueryBuilder<'_, Postgres>,
    offset: Option<i32>,
    limit: Option<i32>,
) {
    if let Some(limit) = limit {
        query.push(" LIMIT ").push_bind(limit.max(0));
    }
    if let Some(offset) = offset {
        query.push(" OFFSET ").push_bind(offset.max(0));
    }
}
