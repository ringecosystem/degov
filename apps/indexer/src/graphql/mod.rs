mod filters;
mod order;
mod pagination;
mod query;
mod router;
mod schema;
mod types;

pub use router::{
    IndexerGraphqlSchema, build_router, build_router_with_paths, build_router_with_scoped_paths,
    build_schema, build_schema_with_scope,
};
pub use schema::QueryRoot;
pub use types::GraphqlScope;

#[derive(Clone)]
pub(super) struct GraphqlState {
    pub(super) pool: sqlx::PgPool,
}
