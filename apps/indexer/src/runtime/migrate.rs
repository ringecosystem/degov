use anyhow as runtime_anyhow;
use runtime_anyhow::{Context, Result};
use sqlx::{Executor, postgres::PgPoolOptions};

use crate::{postgres_schema_statements, required_env};

const POSTGRES_SCHEMA_SQL: &str = include_str!("../../schema/postgres.sql");

pub async fn migrate() -> Result<()> {
    let database_url = required_env("DEGOV_INDEXER_DATABASE_URL")?;
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(&database_url)
        .await
        .context("connect to DeGov indexer Postgres")?;

    for statement in postgres_schema_statements(POSTGRES_SCHEMA_SQL) {
        pool.execute(statement).await.with_context(|| {
            format!("apply Datalens-native DeGov indexer schema statement: {statement}")
        })?;
    }

    log::info!("Datalens-native DeGov indexer schema applied");

    Ok(())
}
