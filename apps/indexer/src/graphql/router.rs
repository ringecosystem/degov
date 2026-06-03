use async_graphql::http::{GraphiQLPlugin, GraphiQLSource};
use async_graphql::{EmptyMutation, EmptySubscription, Schema};
use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use axum::{
    Router,
    response::{Html, IntoResponse},
    routing::{get, post},
};

use super::{GraphqlState, QueryRoot};

pub type IndexerGraphqlSchema = Schema<QueryRoot, EmptyMutation, EmptySubscription>;

pub fn build_schema(pool: sqlx::PgPool) -> IndexerGraphqlSchema {
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
            .version("3.9.0")
            .title("DeGov Indexer GraphiQL")
            .plugins(&[graphiql_explorer_plugin()])
            .finish(),
    )
}

fn graphiql_explorer_plugin<'a>() -> GraphiQLPlugin<'a> {
    GraphiQLPlugin {
        name: "GraphiQLPluginExplorer",
        constructor: "GraphiQLPluginExplorer.explorerPlugin",
        head_assets: Some(
            r#"<link rel="stylesheet" href="https://unpkg.com/@graphiql/plugin-explorer@3.0.0/dist/style.css" />"#,
        ),
        body_assets: Some(
            r#"<script
      src="https://unpkg.com/@graphiql/plugin-explorer@3.0.0/dist/index.umd.js"
      crossorigin
    ></script>"#,
        ),
        ..Default::default()
    }
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
