mod filters;
mod order;
mod pagination;
mod query;
mod router;
mod schema;
mod types;

pub use router::{IndexerGraphqlSchema, build_router, build_router_with_paths, build_schema};
pub use schema::QueryRoot;

#[derive(Clone)]
pub(super) struct GraphqlState {
    pub(super) pool: sqlx::PgPool,
}
