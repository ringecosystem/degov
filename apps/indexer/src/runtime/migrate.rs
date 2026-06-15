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
    ensure_runtime_indexes(pool).await?;

    Ok(())
}

async fn ensure_runtime_indexes(pool: &PgPool) -> Result<()> {
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS onchain_refresh_task_claim_queue_idx
         ON onchain_refresh_task (status, next_run_at, updated_at, id)",
    )
    .execute(pool)
    .await
    .context("ensure onchain refresh claim queue index")?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS onchain_refresh_task_scope_claim_queue_idx
         ON onchain_refresh_task (
            chain_id, contract_set_id, dao_code, status, next_run_at, updated_at, id
         )",
    )
    .execute(pool)
    .await
    .context("ensure scoped onchain refresh claim queue index")?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS onchain_refresh_deferred_candidate_scope_drain_idx
         ON onchain_refresh_deferred_candidate (
            chain_id, contract_set_id, dao_code, next_run_at, updated_at, id
         )",
    )
    .execute(pool)
    .await
    .context("ensure scoped onchain refresh deferred drain index")?;

    sqlx::query(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS delegate_rolling_metadata_preload_idx
         ON delegate_rolling (contract_set_id, transaction_hash, log_index DESC)
         INCLUDE (id, delegator, from_delegate, to_delegate, from_new_votes, to_new_votes)
         WHERE from_delegate <> to_delegate",
    )
    .execute(pool)
    .await
    .context("ensure delegate rolling metadata preload index")?;

    sqlx::query(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS contributor_data_metric_scope_idx
         ON contributor (contract_set_id, chain_id, governor_address, dao_code)
         INCLUDE (power, balance)",
    )
    .execute(pool)
    .await
    .context("ensure contributor data metric scope index")?;

    Ok(())
}
