use async_graphql::http::{GraphiQLPlugin, GraphiQLSource};
use async_graphql::{EmptyMutation, EmptySubscription, Schema};
use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use axum::{
    Router,
    body::Body,
    extract::State,
    http::{HeaderValue, Request, StatusCode, header},
    middleware::{self, Next},
    response::{Html, IntoResponse, Response},
    routing::{get, post},
};

use super::{GraphqlScope, GraphqlState, QueryRoot};

pub type IndexerGraphqlSchema = Schema<QueryRoot, EmptyMutation, EmptySubscription>;

pub fn build_schema(pool: sqlx::PgPool) -> IndexerGraphqlSchema {
    build_schema_with_scope(pool, GraphqlScope::default())
}

pub fn build_schema_with_scope(pool: sqlx::PgPool, scope: GraphqlScope) -> IndexerGraphqlSchema {
    Schema::build(QueryRoot, EmptyMutation, EmptySubscription)
        .data(GraphqlState { pool })
        .data(scope)
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
    build_router_with_scoped_paths(
        schema,
        paths.into_iter().map(|path| {
            let path = path.as_ref().to_owned();
            let scope = GraphqlScope::from_graphql_path(&path);
            (path, scope)
        }),
    )
}

pub fn build_router_with_scoped_paths<I, S>(schema: IndexerGraphqlSchema, paths: I) -> Router
where
    I: IntoIterator<Item = (S, GraphqlScope)>,
    S: AsRef<str>,
{
    let mut router = Router::new();
    for (path, scope) in paths {
        let graphql_path = path.as_ref().to_owned();
        let graphiql_path = graphiql_path_for_graphql_path(&graphql_path);
        router = router
            .route(
                &graphql_path,
                post({
                    let scope = scope.clone();
                    move |State(schema): State<IndexerGraphqlSchema>, request: GraphQLRequest| {
                        let scope = scope.clone();
                        async move { graphql_handler(schema, request, scope).await }
                    }
                })
                .options(cors_preflight),
            )
            .route(
                &graphiql_path,
                get({
                    let endpoint = graphql_path.clone();
                    move || graphql_graphiql(endpoint.clone())
                }),
            );
    }
    router
        .layer(middleware::from_fn(add_cors_headers))
        .with_state(schema)
}

async fn graphql_handler(
    schema: IndexerGraphqlSchema,
    request: GraphQLRequest,
    scope: GraphqlScope,
) -> GraphQLResponse {
    schema
        .execute(request.into_inner().data(scope))
        .await
        .into()
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

async fn cors_preflight() -> StatusCode {
    StatusCode::OK
}

async fn add_cors_headers(request: Request<Body>, next: Next) -> Response {
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_METHODS,
        HeaderValue::from_static("GET,POST,OPTIONS"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_HEADERS,
        HeaderValue::from_static("*"),
    );
    response
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
