use anyhow as runtime_anyhow;
use runtime_anyhow::{Context, Result};
use sqlx::{PgConnection, PgPool, migrate::Migrator, postgres::PgPoolOptions};
use std::{env, time::Duration};

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

pub async fn repair_invalid_runtime_indexes() -> Result<()> {
    let database_url = required_env("DEGOV_INDEXER_DATABASE_URL")?;
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(&database_url)
        .await
        .context("connect to DeGov indexer Postgres")?;

    let mut connection = pool
        .acquire()
        .await
        .context("acquire DeGov indexer invalid index repair connection")?;

    acquire_runtime_migration_lock(&mut connection).await?;

    let result = repair_invalid_runtime_indexes_for_connection(&mut connection).await;

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

    log::info!("Datalens-native DeGov indexer invalid runtime indexes repaired");

    Ok(())
}

pub async fn apply_migrations(pool: &PgPool) -> Result<()> {
    let mut connection = pool
        .acquire()
        .await
        .context("acquire DeGov indexer migration connection")?;

    acquire_runtime_migration_lock(&mut connection).await?;

    let result: Result<()> = async {
        MIGRATOR
            .run(&mut *connection)
            .await
            .context("apply Datalens-native DeGov indexer init migration")?;
        drop_invalid_runtime_indexes_for_connection(&mut connection).await?;
        ensure_runtime_indexes(&mut connection).await?;
        repair_delegate_effective_counts_once(&mut connection).await?;
        repair_vote_timestamps_millis_once(&mut connection).await?;
        repair_token_timestamps_millis_once(&mut connection).await?;
        drop_obsolete_runtime_indexes_for_connection(&mut connection).await?;

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

async fn acquire_runtime_migration_lock(connection: &mut PgConnection) -> Result<()> {
    const MAX_ATTEMPTS: usize = 3;

    for attempt in 1..=MAX_ATTEMPTS {
        match sqlx::query("SELECT pg_advisory_lock(hashtext('degov_indexer_runtime_migration'))")
            .execute(&mut *connection)
            .await
        {
            Ok(_) => return Ok(()),
            Err(error)
                if attempt < MAX_ATTEMPTS && is_retryable_runtime_migration_lock_error(&error) =>
            {
                let delay = Duration::from_millis(100 * attempt as u64);
                log::warn!(
                    "DeGov indexer runtime migration lock retry scheduled attempt={} max_attempts={} delay_ms={} error={}",
                    attempt,
                    MAX_ATTEMPTS,
                    delay.as_millis(),
                    error
                );
                tokio::time::sleep(delay).await;
            }
            Err(error) => {
                return Err(error).context("acquire DeGov indexer runtime migration lock");
            }
        }
    }

    Ok(())
}

fn is_retryable_runtime_migration_lock_error(error: &sqlx::Error) -> bool {
    match error {
        sqlx::Error::Database(database_error) => database_error
            .code()
            .is_some_and(|code| matches!(code.as_ref(), "40P01" | "40001")),
        _ => false,
    }
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
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS onchain_refresh_task_pending_ready_claim_idx
         ON onchain_refresh_task (next_run_at, updated_at, id)
         WHERE status = 'pending'",
    )
    .execute(&mut *connection)
    .await
    .context("ensure pending onchain refresh ready claim index")?;

    execute_concurrent_runtime_index(
        connection,
        "onchain_refresh_task_pending_scope_claim_idx",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS onchain_refresh_task_pending_scope_claim_idx
         ON onchain_refresh_task (
            chain_id, contract_set_id, dao_code, next_run_at, updated_at, id
         )
         WHERE status = 'pending'",
    )
    .await
    .context("ensure scoped pending onchain refresh claim index")?;

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

    execute_concurrent_runtime_index(
        connection,
        "onchain_refresh_task_failed_scope_retry_idx",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS onchain_refresh_task_failed_scope_retry_idx
         ON onchain_refresh_task (
            chain_id, contract_set_id, dao_code, next_run_at, updated_at, id
         )
         INCLUDE (attempts)
         WHERE status = 'failed' AND attempts < 3",
    )
    .await
    .context("ensure scoped failed onchain refresh retry index")?;

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

    execute_concurrent_runtime_index(
        connection,
        "onchain_refresh_task_processing_scope_retry_idx",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS onchain_refresh_task_processing_scope_retry_idx
         ON onchain_refresh_task (
            chain_id, contract_set_id, dao_code, next_run_at, updated_at, id
         )
         INCLUDE (locked_at, attempts)
         WHERE status = 'processing' AND locked_at IS NOT NULL",
    )
    .await
    .context("ensure scoped processing onchain refresh retry index")?;

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
        "ALTER TABLE onchain_refresh_task SET (
            autovacuum_vacuum_scale_factor = 0.01,
            autovacuum_vacuum_threshold = 1000,
            autovacuum_analyze_scale_factor = 0.02,
            autovacuum_analyze_threshold = 1000
         )",
    )
    .execute(&mut *connection)
    .await
    .context("ensure onchain refresh task autovacuum settings")?;

    sqlx::query(
        "ALTER TABLE onchain_refresh_deferred_candidate SET (
            autovacuum_vacuum_scale_factor = 0.01,
            autovacuum_vacuum_threshold = 1000,
            autovacuum_analyze_scale_factor = 0.02,
            autovacuum_analyze_threshold = 1000
         )",
    )
    .execute(&mut *connection)
    .await
    .context("ensure onchain refresh deferred candidate autovacuum settings")?;

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

    sqlx::query(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS delegate_current_power_refresh_idx
         ON delegate (contract_set_id, chain_id, dao_code, governor_address, from_delegate)
         INCLUDE (id, token_address, to_delegate, power)
         WHERE is_current = TRUE",
    )
    .execute(&mut *connection)
    .await
    .context("ensure current delegate power refresh index")?;

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
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS delegate_mapping_positive_count_idx
         ON delegate_mapping (contract_set_id, \"to\") INCLUDE (id)
         WHERE power > 0",
    )
    .execute(&mut *connection)
    .await
    .context("ensure positive delegate mapping count index")?;

    sqlx::query(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS contributor_data_metric_scope_idx
         ON contributor (contract_set_id, chain_id, governor_address, dao_code)
         INCLUDE (power, balance)",
    )
    .execute(&mut *connection)
    .await
    .context("ensure contributor data metric scope index")?;

    execute_concurrent_runtime_index(
        connection,
        "contributor_onchain_refresh_coverage_scope_idx",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS contributor_onchain_refresh_coverage_scope_idx
         ON contributor (chain_id, contract_set_id, dao_code, block_number, id)
         INCLUDE (governor_address, token_address, block_timestamp, transaction_hash)
         WHERE dao_code IS NOT NULL",
    )
    .await
    .context("ensure contributor onchain refresh coverage index")?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS onchain_refresh_data_metric_task (
            id TEXT PRIMARY KEY,
            contract_set_id TEXT NOT NULL,
            chain_id INTEGER NOT NULL,
            dao_code TEXT,
            governor_address TEXT NOT NULL,
            token_address TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            created_at NUMERIC(78, 0) NOT NULL,
            updated_at NUMERIC(78, 0) NOT NULL
         )",
    )
    .execute(&mut *connection)
    .await
    .context("ensure onchain refresh data metric task table")?;

    sqlx::query(
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS onchain_refresh_data_metric_task_ready_idx
         ON onchain_refresh_data_metric_task (updated_at, id)",
    )
    .execute(&mut *connection)
    .await
    .context("ensure onchain refresh data metric task ready index")?;

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

async fn repair_invalid_runtime_indexes_for_connection(
    connection: &mut PgConnection,
) -> Result<()> {
    drop_invalid_runtime_indexes_for_connection(connection).await?;
    ensure_runtime_indexes(connection).await?;
    repair_delegate_effective_counts_once(connection).await?;
    repair_vote_timestamps_millis_once(connection).await?;
    repair_token_timestamps_millis_once(connection).await?;
    drop_obsolete_runtime_indexes_for_connection(connection).await?;

    Ok(())
}

async fn ensure_runtime_repair_marker_table(connection: &mut PgConnection) -> Result<()> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS degov_runtime_repair_marker (
            id TEXT PRIMARY KEY,
            applied_at NUMERIC(78, 0) NOT NULL
         )",
    )
    .execute(&mut *connection)
    .await
    .context("ensure DeGov runtime repair marker table")?;

    Ok(())
}

async fn repair_delegate_effective_counts_once(connection: &mut PgConnection) -> Result<()> {
    ensure_runtime_repair_marker_table(connection).await?;

    let already_applied = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (
            SELECT 1
            FROM degov_runtime_repair_marker
            WHERE id = 'delegate_effective_counts_v1'
         )",
    )
    .fetch_one(&mut *connection)
    .await
    .context("check delegate effective count runtime repair marker")?;

    if already_applied {
        return Ok(());
    }

    let row = sqlx::query_as::<_, (i64, i64)>(
        "WITH positive_counts AS MATERIALIZED (
            SELECT
                contract_set_id,
                \"to\" AS contributor_id,
                COUNT(id)::INT AS positive_count
            FROM delegate_mapping
            WHERE power > 0
            GROUP BY contract_set_id, \"to\"
         ),
         updated_positive AS (
            UPDATE contributor
            SET delegates_count_effective = positive_counts.positive_count
            FROM positive_counts
            WHERE contributor.contract_set_id = positive_counts.contract_set_id
              AND contributor.id = positive_counts.contributor_id
              AND contributor.delegates_count_effective IS DISTINCT FROM positive_counts.positive_count
            RETURNING contributor.id
         ),
         updated_zero AS (
            UPDATE contributor
            SET delegates_count_effective = 0
            WHERE contributor.delegates_count_effective IS DISTINCT FROM 0
              AND NOT EXISTS (
                SELECT 1
                FROM positive_counts
                WHERE positive_counts.contract_set_id = contributor.contract_set_id
                  AND positive_counts.contributor_id = contributor.id
              )
            RETURNING contributor.id
         )
         SELECT
            (SELECT COUNT(*)::BIGINT FROM updated_positive) AS positive_updates,
            (SELECT COUNT(*)::BIGINT FROM updated_zero) AS zero_updates",
    )
    .fetch_one(&mut *connection)
    .await
    .context("repair delegate effective counts")?;

    log::info!(
        "DeGov delegate effective counts repaired positive_updates={} zero_updates={}",
        row.0,
        row.1
    );

    sqlx::query(
        "INSERT INTO degov_runtime_repair_marker (id, applied_at)
         VALUES (
            'delegate_effective_counts_v1',
            FLOOR(EXTRACT(EPOCH FROM now()) * 1000)::NUMERIC(78, 0)
         )
         ON CONFLICT (id) DO NOTHING",
    )
    .execute(&mut *connection)
    .await
    .context("mark delegate effective count runtime repair complete")?;

    Ok(())
}

async fn repair_vote_timestamps_millis_once(connection: &mut PgConnection) -> Result<()> {
    ensure_runtime_repair_marker_table(connection).await?;

    let already_applied = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (
            SELECT 1
            FROM degov_runtime_repair_marker
            WHERE id = 'vote_timestamps_millis_v1'
         )",
    )
    .fetch_one(&mut *connection)
    .await
    .context("check vote timestamp millis runtime repair marker")?;

    if already_applied {
        return Ok(());
    }

    let row = sqlx::query_as::<_, (i64, i64, i64, i64)>(
        "WITH updated_vote_cast AS (
            UPDATE vote_cast
            SET block_timestamp = block_timestamp * 1000
            WHERE block_timestamp IS NOT NULL
              AND block_timestamp < 1000000000000
            RETURNING id
         ),
         updated_vote_cast_with_params AS (
            UPDATE vote_cast_with_params
            SET block_timestamp = block_timestamp * 1000
            WHERE block_timestamp IS NOT NULL
              AND block_timestamp < 1000000000000
            RETURNING id
         ),
         updated_vote_cast_group AS (
            UPDATE vote_cast_group
            SET block_timestamp = block_timestamp * 1000
            WHERE block_timestamp IS NOT NULL
              AND block_timestamp < 1000000000000
            RETURNING id
         ),
         updated_contributor AS (
            UPDATE contributor
            SET last_vote_timestamp = last_vote_timestamp * 1000
            WHERE last_vote_timestamp IS NOT NULL
              AND last_vote_timestamp < 1000000000000
            RETURNING id
         )
         SELECT
            (SELECT COUNT(*)::BIGINT FROM updated_vote_cast) AS vote_cast_updates,
            (SELECT COUNT(*)::BIGINT FROM updated_vote_cast_with_params) AS vote_cast_with_params_updates,
            (SELECT COUNT(*)::BIGINT FROM updated_vote_cast_group) AS vote_cast_group_updates,
            (SELECT COUNT(*)::BIGINT FROM updated_contributor) AS contributor_updates",
    )
    .fetch_one(&mut *connection)
    .await
    .context("repair vote timestamps to milliseconds")?;

    log::info!(
        "DeGov vote timestamps repaired to milliseconds vote_cast_updates={} vote_cast_with_params_updates={} vote_cast_group_updates={} contributor_updates={}",
        row.0,
        row.1,
        row.2,
        row.3
    );

    sqlx::query(
        "INSERT INTO degov_runtime_repair_marker (id, applied_at)
         VALUES (
            'vote_timestamps_millis_v1',
            FLOOR(EXTRACT(EPOCH FROM now()) * 1000)::NUMERIC(78, 0)
         )
         ON CONFLICT (id) DO NOTHING",
    )
    .execute(&mut *connection)
    .await
    .context("mark vote timestamp millis runtime repair complete")?;

    Ok(())
}

async fn repair_token_timestamps_millis_once(connection: &mut PgConnection) -> Result<()> {
    const MARKER_ID: &str = "token_timestamps_millis_v1";
    const MILLIS_THRESHOLD: i64 = 1_000_000_000_000;
    const DEFAULT_BATCH_SIZE: i64 = 50_000;
    const TARGETS: &[(&str, &str)] = &[
        ("delegate_changed", "block_timestamp"),
        ("delegate_votes_changed", "block_timestamp"),
        ("token_transfer", "block_timestamp"),
        ("delegate_rolling", "block_timestamp"),
        ("delegate_mapping", "block_timestamp"),
        ("delegate", "block_timestamp"),
        ("contributor", "block_timestamp"),
        ("token_balance_checkpoint", "block_timestamp"),
        ("vote_power_checkpoint", "block_timestamp"),
        ("onchain_refresh_task", "last_seen_block_timestamp"),
        ("onchain_refresh_task", "pending_after_lock_block_timestamp"),
        (
            "onchain_refresh_deferred_candidate",
            "last_seen_block_timestamp",
        ),
    ];

    ensure_runtime_repair_marker_table(connection).await?;

    let already_applied = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (
            SELECT 1
            FROM degov_runtime_repair_marker
            WHERE id = $1
         )",
    )
    .bind(MARKER_ID)
    .fetch_one(&mut *connection)
    .await
    .context("check token timestamp millis runtime repair marker")?;

    if already_applied {
        return Ok(());
    }

    let batch_size = positive_env_i64(
        "DEGOV_INDEXER_TOKEN_TIMESTAMP_REPAIR_BATCH_SIZE",
        DEFAULT_BATCH_SIZE,
    );

    for (table_name, column_name) in TARGETS {
        let mut target_updates = 0u64;

        loop {
            let updated = repair_timestamp_millis_batch(
                connection,
                table_name,
                column_name,
                batch_size,
                MILLIS_THRESHOLD,
            )
            .await
            .with_context(|| {
                format!("repair {table_name}.{column_name} timestamps to milliseconds")
            })?;

            if updated == 0 {
                break;
            }

            target_updates += updated;
        }

        let target_complete = !timestamp_millis_repair_has_remaining(
            connection,
            table_name,
            column_name,
            MILLIS_THRESHOLD,
        )
        .await
        .with_context(|| format!("check remaining {table_name}.{column_name} second timestamps"))?;

        log::info!(
            "DeGov token timestamp repair batch table={} column={} updates={} complete={}",
            table_name,
            column_name,
            target_updates,
            target_complete
        );

        if !target_complete {
            return Err(runtime_anyhow::Error::msg(format!(
                "DeGov token timestamp repair did not complete for {table_name}.{column_name}"
            )));
        }
    }

    sqlx::query(
        "INSERT INTO degov_runtime_repair_marker (id, applied_at)
         VALUES (
            $1,
            FLOOR(EXTRACT(EPOCH FROM now()) * 1000)::NUMERIC(78, 0)
         )
         ON CONFLICT (id) DO NOTHING",
    )
    .bind(MARKER_ID)
    .execute(&mut *connection)
    .await
    .context("mark token timestamp millis runtime repair complete")?;

    log::info!("DeGov token timestamps repaired to milliseconds");

    Ok(())
}

fn positive_env_i64(name: &str, default_value: i64) -> i64 {
    env::var(name)
        .ok()
        .and_then(|value| value.parse::<i64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default_value)
}

async fn repair_timestamp_millis_batch(
    connection: &mut PgConnection,
    table_name: &str,
    column_name: &str,
    batch_size: i64,
    millis_threshold: i64,
) -> Result<u64, sqlx::Error> {
    let sql = format!(
        "WITH candidate AS (
            SELECT ctid
            FROM {table_name}
            WHERE {column_name} IS NOT NULL
              AND {column_name} < $2
            LIMIT $1
         )
         UPDATE {table_name}
         SET {column_name} = {column_name} * 1000
         FROM candidate
         WHERE {table_name}.ctid = candidate.ctid"
    );

    let result = sqlx::query(&sql)
        .bind(batch_size)
        .bind(millis_threshold)
        .execute(&mut *connection)
        .await?;

    Ok(result.rows_affected())
}

async fn timestamp_millis_repair_has_remaining(
    connection: &mut PgConnection,
    table_name: &str,
    column_name: &str,
    millis_threshold: i64,
) -> Result<bool, sqlx::Error> {
    let sql = format!(
        "SELECT EXISTS (
            SELECT 1
            FROM {table_name}
            WHERE {column_name} IS NOT NULL
              AND {column_name} < $1
         )"
    );

    sqlx::query_scalar::<_, bool>(&sql)
        .bind(millis_threshold)
        .fetch_one(&mut *connection)
        .await
}

async fn drop_obsolete_runtime_indexes_for_connection(connection: &mut PgConnection) -> Result<()> {
    sqlx::query("DROP INDEX CONCURRENTLY IF EXISTS onchain_refresh_task_status_idx")
        .execute(&mut *connection)
        .await
        .context("drop obsolete onchain refresh status index")?;
    sqlx::query("DROP INDEX CONCURRENTLY IF EXISTS token_transfer_transaction_hash_idx")
        .execute(&mut *connection)
        .await
        .context("drop obsolete token transfer transaction hash index")?;
    sqlx::query("DROP INDEX CONCURRENTLY IF EXISTS token_transfer_chain_governor_token_idx")
        .execute(&mut *connection)
        .await
        .context("drop obsolete token transfer chain governor token index")?;

    Ok(())
}

async fn drop_invalid_runtime_indexes_for_connection(connection: &mut PgConnection) -> Result<()> {
    drop_invalid_runtime_index(connection, "onchain_refresh_task_pending_status_claim_idx").await?;
    drop_invalid_runtime_index(connection, "onchain_refresh_task_pending_ready_claim_idx").await?;
    drop_invalid_runtime_index(connection, "onchain_refresh_task_failed_retry_idx").await?;
    drop_invalid_runtime_index(connection, "onchain_refresh_task_failed_attempt_retry_idx").await?;
    drop_invalid_runtime_index(connection, "onchain_refresh_task_failed_ready_retry_idx").await?;
    drop_invalid_runtime_index(
        connection,
        "onchain_refresh_task_failed_ready_status_retry_idx",
    )
    .await?;
    drop_invalid_runtime_index(connection, "onchain_refresh_task_processing_retry_idx").await?;
    drop_invalid_runtime_index(connection, "onchain_refresh_task_processing_lock_retry_idx")
        .await?;
    drop_invalid_runtime_index(connection, "onchain_refresh_task_pending_scope_claim_idx").await?;
    drop_invalid_runtime_index(connection, "onchain_refresh_task_failed_scope_retry_idx").await?;
    drop_invalid_runtime_index(
        connection,
        "onchain_refresh_task_processing_scope_retry_idx",
    )
    .await?;
    drop_invalid_runtime_index(connection, "delegate_rolling_metadata_preload_idx").await?;
    drop_invalid_runtime_index(connection, "delegate_current_from_scope_idx").await?;
    drop_invalid_runtime_index(connection, "delegate_current_power_refresh_idx").await?;
    drop_invalid_runtime_index(connection, "delegate_mapping_to_lookup_idx").await?;
    drop_invalid_runtime_index(connection, "delegate_mapping_effective_count_idx").await?;
    drop_invalid_runtime_index(connection, "delegate_mapping_positive_count_idx").await?;
    drop_invalid_runtime_index(connection, "contributor_data_metric_scope_idx").await?;
    drop_invalid_runtime_index(connection, "contributor_onchain_refresh_coverage_scope_idx")
        .await?;
    drop_invalid_runtime_index(connection, "onchain_refresh_data_metric_task_ready_idx").await?;
    drop_invalid_runtime_index(connection, "contributor_graphql_scope_power_idx").await?;
    drop_invalid_runtime_index(connection, "provisional_contributor_live_scope_power_idx").await?;
    drop_invalid_runtime_index(
        connection,
        "provisional_contributor_live_account_lookup_idx",
    )
    .await?;

    Ok(())
}

async fn drop_invalid_runtime_index(connection: &mut PgConnection, index_name: &str) -> Result<()> {
    let invalid_exists: bool = sqlx::query_scalar(
        "SELECT EXISTS (
            SELECT 1
            FROM pg_class index_class
            JOIN pg_namespace index_namespace ON index_namespace.oid = index_class.relnamespace
            JOIN pg_index ON pg_index.indexrelid = index_class.oid
            WHERE index_namespace.nspname = current_schema()
              AND index_class.relname = $1
              AND pg_index.indisvalid = FALSE
         )",
    )
    .bind(index_name)
    .fetch_one(&mut *connection)
    .await
    .with_context(|| format!("check invalid runtime index {index_name}"))?;

    if invalid_exists {
        sqlx::query(&format!(
            r#"DROP INDEX CONCURRENTLY IF EXISTS "{index_name}""#
        ))
        .execute(connection)
        .await
        .with_context(|| format!("drop invalid runtime index {index_name}"))?;
    }

    Ok(())
}

async fn execute_concurrent_runtime_index(
    connection: &mut PgConnection,
    index_name: &str,
    statement: &str,
) -> Result<()> {
    const MAX_ATTEMPTS: usize = 3;

    for attempt in 1..=MAX_ATTEMPTS {
        match sqlx::query(statement).execute(&mut *connection).await {
            Ok(_) => return Ok(()),
            Err(error) if attempt < MAX_ATTEMPTS && is_retryable_runtime_index_error(&error) => {
                let delay = Duration::from_millis(250 * attempt as u64);
                log::warn!(
                    "DeGov runtime index retry scheduled index_name={} attempt={} max_attempts={} delay_ms={} error={}",
                    index_name,
                    attempt,
                    MAX_ATTEMPTS,
                    delay.as_millis(),
                    error
                );
                drop_invalid_runtime_index(connection, index_name).await?;
                tokio::time::sleep(delay).await;
            }
            Err(error) => return Err(error).with_context(|| format!("create {index_name}")),
        }
    }

    Ok(())
}

fn is_retryable_runtime_index_error(error: &sqlx::Error) -> bool {
    match error {
        sqlx::Error::Database(database_error) => database_error
            .code()
            .is_some_and(|code| matches!(code.as_ref(), "40P01" | "40001")),
        _ => false,
    }
}
