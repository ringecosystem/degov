use anyhow as runtime_anyhow;
use runtime_anyhow::{Context, Result};
use sqlx::{PgPool, migrate::Migrator, postgres::PgPoolOptions};

use crate::required_env;

static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

pub async fn migrate() -> Result<()> {
    let database_url = required_env("DEGOV_INDEXER_DATABASE_URL")?;
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(&database_url)
        .await
        .context("connect to DeGov indexer Postgres")?;

    apply_migrations(&pool).await?;

    log::info!("Datalens-native DeGov indexer schema applied");

    Ok(())
}

pub async fn apply_migrations(pool: &PgPool) -> Result<()> {
    MIGRATOR
        .run(pool)
        .await
        .context("apply Datalens-native DeGov indexer init migration")?;

    Ok(())
}
