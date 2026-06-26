use anyhow as runtime_anyhow;
use runtime_anyhow::{Context, Result};
use sqlx::postgres::PgPoolOptions;

use crate::{GraphqlRuntimeConfig, MetricsRuntimeConfig, graphql, required_env};

use super::migrate::apply_migrations;

pub async fn run_graphql() -> Result<()> {
    let database_url = required_env("DEGOV_INDEXER_DATABASE_URL")?;
    let config = GraphqlRuntimeConfig::from_env()?;
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .context("connect to DeGov indexer Postgres")?;
    apply_migrations(&pool).await?;
    let _metrics_server = crate::metrics::spawn_metrics_server(
        pool.clone(),
        MetricsRuntimeConfig::from_env().context("load metrics runtime configuration")?,
    )
    .await
    .context("start DeGov indexer metrics service")?;

    let app = graphql::build_router_with_paths(graphql::build_schema(pool), config.paths.clone());
    let listener = tokio::net::TcpListener::bind(config.bind_address)
        .await
        .with_context(|| {
            format!(
                "bind DeGov indexer GraphQL endpoint {}",
                config.bind_address
            )
        })?;

    log::info!(
        "DeGov indexer GraphQL service listening public_endpoint={:?} bind_address={} paths={}",
        config.public_endpoint,
        config.bind_address,
        config.paths.join(",")
    );

    axum::serve(listener, app)
        .await
        .context("serve DeGov indexer GraphQL endpoint")
}
