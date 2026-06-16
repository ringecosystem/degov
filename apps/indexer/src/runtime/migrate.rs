use anyhow as runtime_anyhow;
use runtime_anyhow::{Context, Result};
use sqlx::{PgConnection, PgPool, migrate::Migrator, postgres::PgPoolOptions};

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
    let mut connection = pool
        .acquire()
        .await
        .context("acquire DeGov indexer migration connection")?;

    sqlx::query("SELECT pg_advisory_lock(hashtext('degov_indexer_runtime_migration'))")
        .execute(&mut *connection)
        .await
        .context("acquire DeGov indexer runtime migration lock")?;

    let result: Result<()> = async {
        MIGRATOR
            .run(&mut *connection)
            .await
            .context("apply Datalens-native DeGov indexer init migration")?;
        ensure_runtime_indexes(&mut connection).await?;

        Ok(())
    }
    .await;

    let unlock_result = sqlx::query_scalar::<_, bool>(
        "SELECT pg_advisory_unlock(hashtext('degov_indexer_runtime_migration'))",
    )
    .fetch_one(&mut *connection)
    .await
    .context("release DeGov indexer runtime migration lock")
    .and_then(|unlocked| {
        if unlocked {
            Ok(())
        } else {
            Err(runtime_anyhow::Error::msg(
                "DeGov indexer runtime migration lock was not held",
            ))
        }
    });

    result?;
    unlock_result?;

    Ok(())
}

async fn ensure_runtime_indexes(connection: &mut PgConnection) -> Result<()> {
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS onchain_refresh_task_claim_queue_idx
         ON onchain_refresh_task (status, next_run_at, updated_at, id)",
    )
    .execute(&mut *connection)
    .await
    .context("ensure onchain refresh claim queue index")?;

    sqlx::query(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS onchain_refresh_task_pending_status_claim_idx
         ON onchain_refresh_task (status, next_run_at, updated_at, id)
         WHERE status = 'pending'",
    )
    .execute(&mut *connection)
    .await
    .context("ensure pending onchain refresh status claim index")?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS onchain_refresh_task_scope_claim_queue_idx
         ON onchain_refresh_task (
            chain_id, contract_set_id, dao_code, status, next_run_at, updated_at, id
         )",
    )
    .execute(&mut *connection)
    .await
    .context("ensure scoped onchain refresh claim queue index")?;

    sqlx::query(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS onchain_refresh_task_failed_retry_idx
         ON onchain_refresh_task (next_run_at, updated_at, id)
         INCLUDE (attempts)
         WHERE status = 'failed'",
    )
    .execute(&mut *connection)
    .await
    .context("ensure failed onchain refresh retry index")?;

    sqlx::query(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS onchain_refresh_task_failed_attempt_retry_idx
         ON onchain_refresh_task (status, attempts, next_run_at, updated_at, id)",
    )
    .execute(&mut *connection)
    .await
    .context("ensure failed onchain refresh attempt retry index")?;

    sqlx::query(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS onchain_refresh_task_failed_ready_retry_idx
         ON onchain_refresh_task (next_run_at, updated_at, id)
         WHERE status = 'failed' AND attempts < 3",
    )
    .execute(&mut *connection)
    .await
    .context("ensure failed onchain refresh ready retry index")?;

    sqlx::query(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS onchain_refresh_task_failed_ready_status_retry_idx
         ON onchain_refresh_task (status, next_run_at, updated_at, id)
         WHERE status = 'failed' AND attempts < 3",
    )
    .execute(&mut *connection)
    .await
    .context("ensure failed onchain refresh ready status retry index")?;

    sqlx::query(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS onchain_refresh_task_processing_retry_idx
         ON onchain_refresh_task (next_run_at, updated_at, id)
         INCLUDE (locked_at, attempts)
         WHERE status = 'processing'",
    )
    .execute(&mut *connection)
    .await
    .context("ensure processing onchain refresh retry index")?;

    sqlx::query(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS onchain_refresh_task_processing_lock_retry_idx
         ON onchain_refresh_task (status, attempts, locked_at, next_run_at, updated_at, id)
         WHERE locked_at IS NOT NULL",
    )
    .execute(&mut *connection)
    .await
    .context("ensure processing onchain refresh lock retry index")?;

    sqlx::query(
        "CREATE INDEX IF NOT EXISTS onchain_refresh_deferred_candidate_scope_drain_idx
         ON onchain_refresh_deferred_candidate (
            chain_id, contract_set_id, dao_code, next_run_at, updated_at, id
         )",
    )
    .execute(&mut *connection)
    .await
    .context("ensure scoped onchain refresh deferred drain index")?;

    sqlx::query(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS delegate_rolling_metadata_preload_idx
         ON delegate_rolling (contract_set_id, transaction_hash, log_index DESC)
         INCLUDE (id, delegator, from_delegate, to_delegate, from_new_votes, to_new_votes)
         WHERE from_delegate <> to_delegate",
    )
    .execute(&mut *connection)
    .await
    .context("ensure delegate rolling metadata preload index")?;

    sqlx::query(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS delegate_current_from_scope_idx
         ON delegate (contract_set_id, chain_id, dao_code, governor_address, from_delegate)
         INCLUDE (token_address, to_delegate, is_current)
         WHERE is_current = TRUE",
    )
    .execute(&mut *connection)
    .await
    .context("ensure current delegate scope lookup index")?;

    drop_invalid_index_if_exists(connection, "delegate_mapping_to_lookup_idx").await?;

    sqlx::query(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS delegate_mapping_to_lookup_idx
         ON delegate_mapping (contract_set_id, \"to\") INCLUDE (id, power)",
    )
    .execute(&mut *connection)
    .await
    .context("ensure delegate mapping target lookup index")?;

    sqlx::query(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS delegate_mapping_effective_count_idx
         ON delegate_mapping (contract_set_id, \"to\", \"from\") INCLUDE (id, power)",
    )
    .execute(&mut *connection)
    .await
    .context("ensure delegate mapping effective count index")?;

    sqlx::query(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS contributor_data_metric_scope_idx
         ON contributor (contract_set_id, chain_id, governor_address, dao_code)
         INCLUDE (power, balance)",
    )
    .execute(&mut *connection)
    .await
    .context("ensure contributor data metric scope index")?;

    sqlx::query(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS contributor_graphql_scope_power_idx
         ON contributor (chain_id, governor_address, dao_code, power DESC, id)
         INCLUDE (
            contract_set_id, token_address, block_number, block_timestamp,
            transaction_hash, last_vote_timestamp, balance, delegates_count_all
         )",
    )
    .execute(&mut *connection)
    .await
    .context("ensure contributor GraphQL scope power index")?;

    sqlx::query(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS provisional_contributor_live_scope_power_idx
         ON degov_provisional_contributor_power_overlay (
            chain_id, governor_address, dao_code, power DESC, account,
            contract_set_id, token_address
         )
         WHERE source = 'live-onchain' AND status = 'available'",
    )
    .execute(&mut *connection)
    .await
    .context("ensure live contributor overlay scope power index")?;

    sqlx::query(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS provisional_contributor_live_account_lookup_idx
         ON degov_provisional_contributor_power_overlay (
            contract_set_id, account, chain_id, dao_code, governor_address, token_address
         )
         WHERE source = 'live-onchain' AND status = 'available'",
    )
    .execute(&mut *connection)
    .await
    .context("ensure live contributor overlay account lookup index")?;

    Ok(())
}

async fn drop_invalid_index_if_exists(
    connection: &mut PgConnection,
    index_name: &str,
) -> Result<()> {
    let invalid_index_exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (
            SELECT 1
            FROM pg_class index_class
            JOIN pg_index ON pg_index.indexrelid = index_class.oid
            JOIN pg_namespace ON pg_namespace.oid = index_class.relnamespace
            WHERE pg_namespace.nspname = current_schema()
              AND index_class.relname = $1
              AND pg_index.indisvalid = FALSE
         )",
    )
    .bind(index_name)
    .fetch_one(&mut *connection)
    .await
    .with_context(|| format!("check invalid runtime index {index_name}"))?;

    if invalid_index_exists {
        let query = format!("DROP INDEX CONCURRENTLY IF EXISTS \"{index_name}\"");
        sqlx::query(&query)
            .execute(&mut *connection)
            .await
            .with_context(|| format!("drop invalid runtime index {index_name}"))?;
    }

    Ok(())
}
