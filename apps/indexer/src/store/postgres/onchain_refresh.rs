// Onchain refresh task persistence.
const MAX_ONCHAIN_REFRESH_TASK_UPSERT_ROWS: usize = 200;
pub const DEFAULT_ONCHAIN_REFRESH_DEFERRED_DRAIN_ROWS: usize = 100;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct OnchainRefreshEnqueuePlan {
    inline_upsert_count: usize,
    deferred_candidate_count: usize,
    ready_drain_count: usize,
}

fn plan_onchain_refresh_enqueue_with_drain_budget(
    deduped_count: usize,
    debounce: Duration,
    deferred_drain_batch_size: usize,
) -> OnchainRefreshEnqueuePlan {
    let ready_drain_count = if debounce.is_zero() {
        deduped_count.min(deferred_drain_batch_size)
    } else {
        0
    };

    OnchainRefreshEnqueuePlan {
        inline_upsert_count: 0,
        deferred_candidate_count: deduped_count,
        ready_drain_count,
    }
}

#[cfg(test)]
fn should_update_deferred_candidate_conflict(
    existing_next_run_at: i64,
    now_ms: i64,
    existing_refresh_balance: bool,
    incoming_refresh_balance: bool,
    existing_refresh_power: bool,
    incoming_refresh_power: bool,
    existing_first_seen_block_number: u64,
    incoming_first_seen_block_number: u64,
    existing_last_seen_block_number: u64,
    incoming_last_seen_block_number: u64,
) -> bool {
    existing_next_run_at > now_ms
        || (incoming_refresh_balance && !existing_refresh_balance)
        || (incoming_refresh_power && !existing_refresh_power)
        || existing_first_seen_block_number > incoming_first_seen_block_number
        || existing_last_seen_block_number < incoming_last_seen_block_number
}

async fn upsert_onchain_refresh_tasks(
    transaction: &mut Transaction<'_, Postgres>,
    rows: &[PowerReconcileCandidate],
    debounce: Duration,
    deferred_drain_batch_size: usize,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    let total_started_at = std::time::Instant::now();
    let original_count = rows.len();
    let dedupe_started_at = std::time::Instant::now();
    let mut rows = dedupe_onchain_refresh_tasks(rows)
        .into_iter()
        .map(OnchainRefreshTaskWrite::from)
        .collect::<Vec<_>>();
    let dedupe_duration = dedupe_started_at.elapsed();
    let now_ms = unix_time_millis();
    let next_run_at = now_ms.saturating_add(duration_millis_i64(debounce));
    for row in &mut rows {
        row.next_run_at = next_run_at.to_string();
    }

    let plan =
        plan_onchain_refresh_enqueue_with_drain_budget(rows.len(), debounce, deferred_drain_batch_size);
    let mut deferred_candidate_write_count = 0;
    let deferred_upsert_started_at = std::time::Instant::now();
    for chunk in rows.chunks(MAX_ONCHAIN_REFRESH_TASK_UPSERT_ROWS) {
        deferred_candidate_write_count +=
            upsert_deferred_onchain_refresh_candidate_chunk(transaction, chunk, now_ms, next_run_at)
                .await?;
    }
    let deferred_upsert_duration = deferred_upsert_started_at.elapsed();
    let reschedule_started_at = std::time::Instant::now();
    let rescheduled_count =
        reschedule_materialized_onchain_refresh_tasks(transaction, &rows, next_run_at, now_ms)
            .await?;
    let reschedule_duration = reschedule_started_at.elapsed();
    let ready_drain_started_at = std::time::Instant::now();
    let drained_count = drain_deferred_onchain_refresh_tasks_in_transaction(
        transaction,
        plan.ready_drain_count,
        now_ms,
        None,
    )
    .await?;
    let ready_drain_duration = ready_drain_started_at.elapsed();

    log::info!(
        "onchain refresh enqueue planned original_candidate_count={} deduped_unique_count={} deduped_duplicate_count={} inline_upsert_count={} deferred_count={} deferred_chunk_size={} deferred_chunk_count={} deferred_candidate_write_count={} rescheduled_materialized_count={} ready_drain_batch_size={} ready_drain_count={} materialized_count={} dedupe_duration_ms={} deferred_upsert_duration_ms={} reschedule_duration_ms={} ready_drain_duration_ms={} total_duration_ms={}",
        original_count,
        rows.len(),
        original_count.saturating_sub(rows.len()),
        plan.inline_upsert_count,
        plan.deferred_candidate_count,
        MAX_ONCHAIN_REFRESH_TASK_UPSERT_ROWS,
        chunk_count(rows.len(), MAX_ONCHAIN_REFRESH_TASK_UPSERT_ROWS),
        deferred_candidate_write_count,
        rescheduled_count,
        deferred_drain_batch_size,
        plan.ready_drain_count,
        drained_count,
        dedupe_duration.as_millis(),
        deferred_upsert_duration.as_millis(),
        reschedule_duration.as_millis(),
        ready_drain_duration.as_millis(),
        total_started_at.elapsed().as_millis()
    );

    Ok(())
}

pub async fn drain_deferred_onchain_refresh_tasks(
    pool: &PgPool,
    max_rows: usize,
) -> Result<usize, PostgresIndexerRunnerStoreError> {
    drain_deferred_onchain_refresh_tasks_with_scope(pool, max_rows, None).await
}

pub async fn drain_deferred_onchain_refresh_tasks_for_scope(
    pool: &PgPool,
    max_rows: usize,
    scope: &crate::OnchainRefreshTaskScope,
) -> Result<usize, PostgresIndexerRunnerStoreError> {
    drain_deferred_onchain_refresh_tasks_with_scope(pool, max_rows, Some(scope)).await
}

pub async fn repair_missing_onchain_refresh_contributor_coverage(
    pool: &PgPool,
    max_rows: usize,
) -> Result<usize, PostgresIndexerRunnerStoreError> {
    repair_missing_onchain_refresh_contributor_coverage_with_scope(pool, max_rows, None).await
}

pub async fn repair_missing_onchain_refresh_contributor_coverage_for_scope(
    pool: &PgPool,
    max_rows: usize,
    scope: &crate::OnchainRefreshTaskScope,
) -> Result<usize, PostgresIndexerRunnerStoreError> {
    repair_missing_onchain_refresh_contributor_coverage_with_scope(pool, max_rows, Some(scope))
        .await
}

async fn repair_missing_onchain_refresh_contributor_coverage_with_scope(
    pool: &PgPool,
    max_rows: usize,
    scope: Option<&crate::OnchainRefreshTaskScope>,
) -> Result<usize, PostgresIndexerRunnerStoreError> {
    if max_rows == 0 {
        return Ok(0);
    }

    let max_rows = i64::try_from(max_rows).map_err(|_| {
        PostgresIndexerRunnerStoreError::new("contributor coverage repair batch size exceeds i64")
    })?;
    let now_ms = unix_time_millis();
    let mut query = QueryBuilder::<Postgres>::new(
        "WITH candidates AS (
            SELECT contributor.contract_set_id,
                   contributor.chain_id,
                   COALESCE(contributor.dao_code, '') AS dao_code,
                   contributor.governor_address,
                   contributor.token_address,
                   contributor.id AS account,
                   contributor.block_number,
                   contributor.block_timestamp,
                   contributor.transaction_hash
            FROM contributor
            WHERE contributor.dao_code IS NOT NULL
            AND NOT EXISTS (
                SELECT 1
                FROM degov_provisional_contributor_power_overlay overlay
                WHERE overlay.contract_set_id = contributor.contract_set_id
                  AND overlay.chain_id IS NOT DISTINCT FROM contributor.chain_id
                  AND overlay.dao_code IS NOT DISTINCT FROM contributor.dao_code
                  AND overlay.governor_address IS NOT DISTINCT FROM contributor.governor_address
                  AND overlay.token_address IS NOT DISTINCT FROM contributor.token_address
                  AND overlay.account = contributor.id
                  AND overlay.source = 'live-onchain'
                  AND overlay.status = 'available'
                  AND overlay.power IS NOT NULL
                  AND overlay.balance IS NOT NULL
            )
            AND NOT EXISTS (
                SELECT 1
                FROM onchain_refresh_task task
                WHERE task.contract_set_id = contributor.contract_set_id
                  AND task.chain_id = contributor.chain_id
                  AND task.dao_code IS NOT DISTINCT FROM contributor.dao_code
                  AND task.governor_address = contributor.governor_address
                  AND task.token_address = contributor.token_address
                  AND task.account = contributor.id
                  AND task.status IN ('pending', 'processing', 'failed')
            )
            AND NOT EXISTS (
                SELECT 1
                FROM onchain_refresh_deferred_candidate deferred
                WHERE deferred.contract_set_id = contributor.contract_set_id
                  AND deferred.chain_id = contributor.chain_id
                  AND deferred.dao_code IS NOT DISTINCT FROM contributor.dao_code
                  AND deferred.governor_address = contributor.governor_address
                  AND deferred.token_address = contributor.token_address
                  AND deferred.account = contributor.id
            )",
    );
    push_contributor_coverage_repair_scope_filter(&mut query, scope);
    query
        .push(
            "
            ORDER BY contributor.block_number ASC, contributor.id ASC
            LIMIT ",
        )
        .push_bind(max_rows)
        .push(
            "
        )
        INSERT INTO onchain_refresh_deferred_candidate (
            id, contract_set_id, chain_id, dao_code, governor_address, token_address, account,
            refresh_balance, refresh_power, reason, first_seen_block_number,
            last_seen_block_number, last_seen_block_timestamp, last_seen_transaction_hash,
            next_run_at, created_at, updated_at
        )
        SELECT
            candidates.contract_set_id || ':' || candidates.dao_code || ':' ||
                candidates.chain_id::TEXT || ':' || candidates.governor_address || ':' ||
                candidates.token_address || ':' || candidates.account,
            candidates.contract_set_id,
            candidates.chain_id,
            candidates.dao_code,
            candidates.governor_address,
            candidates.token_address,
            candidates.account,
            TRUE,
            TRUE,
            'contributor-coverage',
            candidates.block_number,
            candidates.block_number,
            candidates.block_timestamp,
            candidates.transaction_hash,
            0::NUMERIC(78, 0),
            ",
        )
        .push_bind(now_ms.to_string())
        .push(
            "::NUMERIC(78, 0),
            ",
        )
        .push_bind(now_ms.to_string())
        .push(
            "::NUMERIC(78, 0)
        FROM candidates
        ON CONFLICT ON CONSTRAINT onchain_refresh_deferred_candidate_account_unique DO NOTHING",
        );

    let result = query.build().execute(pool).await?;

    Ok(result.rows_affected().try_into().unwrap_or_default())
}

async fn drain_deferred_onchain_refresh_tasks_with_scope(
    pool: &PgPool,
    max_rows: usize,
    scope: Option<&crate::OnchainRefreshTaskScope>,
) -> Result<usize, PostgresIndexerRunnerStoreError> {
    if max_rows == 0 {
        return Ok(0);
    }

    let started_at = std::time::Instant::now();
    let mut transaction = pool.begin().await?;
    let now_ms = unix_time_millis();
    let drained_count =
        drain_deferred_onchain_refresh_tasks_in_transaction(
            &mut transaction,
            max_rows,
            now_ms,
            scope,
        )
        .await?;
    transaction.commit().await?;

    if drained_count > 0 {
        log::info!(
            "onchain refresh deferred drain completed dao_code={} chain_id={} contract_set_id={} deferred_drain_count={} deferred_drain_batch_size={} deferred_drain_duration_ms={}",
            scope
                .map(|scope| scope.dao_code.as_str())
                .unwrap_or("global"),
            scope
                .map(|scope| scope.chain_id.to_string())
                .unwrap_or_else(|| "global".to_owned()),
            scope
                .map(|scope| scope.contract_set_id.as_str())
                .unwrap_or("global"),
            drained_count,
            max_rows,
            started_at.elapsed().as_millis()
        );
    }

    Ok(drained_count)
}

async fn reschedule_materialized_onchain_refresh_tasks(
    transaction: &mut Transaction<'_, Postgres>,
    rows: &[OnchainRefreshTaskWrite],
    next_run_at: i64,
    now_ms: i64,
) -> Result<u64, PostgresIndexerRunnerStoreError> {
    if rows.is_empty() {
        return Ok(0);
    }

    let mut rescheduled_count = 0;
    for chunk in rows.chunks(MAX_ONCHAIN_REFRESH_TASK_UPSERT_ROWS) {
        let ids = chunk.iter().map(|row| row.id.clone()).collect::<Vec<_>>();
        let result = sqlx::query(
            "UPDATE onchain_refresh_task
             SET next_run_at = GREATEST(next_run_at, $2::NUMERIC(78, 0)),
                 updated_at = $3::NUMERIC(78, 0)
             WHERE id = ANY($1)
               AND status IN ('pending', 'failed')
               AND next_run_at < $2::NUMERIC(78, 0)",
        )
        .bind(&ids)
        .bind(next_run_at.to_string())
        .bind(now_ms.to_string())
        .execute(&mut **transaction)
        .await?;
        rescheduled_count += result.rows_affected();
    }

    Ok(rescheduled_count)
}

async fn drain_deferred_onchain_refresh_tasks_in_transaction(
    transaction: &mut Transaction<'_, Postgres>,
    max_rows: usize,
    now_ms: i64,
    scope: Option<&crate::OnchainRefreshTaskScope>,
) -> Result<usize, PostgresIndexerRunnerStoreError> {
    if max_rows == 0 {
        return Ok(0);
    }

    let rows =
        read_deferred_onchain_refresh_candidates(transaction, max_rows, now_ms, scope).await?;
    if rows.is_empty() {
        return Ok(0);
    }

    let ids = rows.iter().map(|row| row.id.clone()).collect::<Vec<_>>();
    for chunk in rows.chunks(MAX_ONCHAIN_REFRESH_TASK_UPSERT_ROWS) {
        upsert_onchain_refresh_task_chunk(transaction, chunk, now_ms).await?;
    }
    sqlx::query("DELETE FROM onchain_refresh_deferred_candidate WHERE id = ANY($1)")
        .bind(&ids)
        .execute(&mut **transaction)
        .await?;

    Ok(ids.len())
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct OnchainRefreshTaskKey {
    chain_id: i32,
    contract_set_id: String,
    dao_code: String,
    governor: String,
    governor_token: String,
    account: String,
}

fn dedupe_onchain_refresh_tasks(rows: &[PowerReconcileCandidate]) -> Vec<PowerReconcileCandidate> {
    let mut order = Vec::new();
    let mut deduped = HashMap::<OnchainRefreshTaskKey, PowerReconcileCandidate>::new();

    for row in rows {
        let key = OnchainRefreshTaskKey::from(row);
        if let Some(existing) = deduped.get_mut(&key) {
            merge_onchain_refresh_task(existing, row);
        } else {
            order.push(key.clone());
            deduped.insert(key, row.clone());
        }
    }

    order
        .into_iter()
        .filter_map(|key| deduped.remove(&key))
        .collect()
}

impl From<&PowerReconcileCandidate> for OnchainRefreshTaskKey {
    fn from(row: &PowerReconcileCandidate) -> Self {
        Self {
            chain_id: row.status.chain_id,
            contract_set_id: row.status.contract_set_id.clone(),
            dao_code: row.status.dao_code.clone(),
            governor: row.status.governor.clone(),
            governor_token: row.status.governor_token.clone(),
            account: row.status.account.clone(),
        }
    }
}

fn merge_onchain_refresh_task(
    existing: &mut PowerReconcileCandidate,
    row: &PowerReconcileCandidate,
) {
    existing.reasons.extend(row.reasons.iter().copied());
    existing.status.refresh_balance |= row.status.refresh_balance;
    existing.status.refresh_power |= row.status.refresh_power;
    existing.status.reason = merge_onchain_refresh_reason(&existing.status.reason, &row.status.reason);
    existing.status.first_seen_activity_block = existing
        .status
        .first_seen_activity_block
        .min(row.status.first_seen_activity_block);

    if row.status_position() >= existing.status_position() {
        existing.latest_activity_block = row.latest_activity_block;
        existing.latest_transaction_index = row.latest_transaction_index;
        existing.latest_log_index = row.latest_log_index;
        existing.observed_log_power = row.observed_log_power.clone();
        existing.status.last_seen_activity_block = row.status.last_seen_activity_block;
        existing.status.last_seen_block_timestamp_ms = row.status.last_seen_block_timestamp_ms;
        existing.status.last_seen_transaction_hash = row.status.last_seen_transaction_hash.clone();
        existing.status.last_seen_transaction_index = row.status.last_seen_transaction_index;
        existing.status.last_seen_log_index = row.status.last_seen_log_index;
    }
}

trait PowerReconcileCandidatePosition {
    fn status_position(&self) -> (u64, u64, u64);
}

impl PowerReconcileCandidatePosition for PowerReconcileCandidate {
    fn status_position(&self) -> (u64, u64, u64) {
        (
            self.status.last_seen_activity_block,
            self.status.last_seen_transaction_index,
            self.status.last_seen_log_index,
        )
    }
}

fn merge_onchain_refresh_reason(left: &str, right: &str) -> String {
    let mut labels = std::collections::BTreeSet::new();
    collect_onchain_refresh_reason_labels(&mut labels, left);
    collect_onchain_refresh_reason_labels(&mut labels, right);

    labels.into_iter().collect::<Vec<_>>().join("+")
}

fn collect_onchain_refresh_reason_labels(labels: &mut std::collections::BTreeSet<String>, reason: &str) {
    if reason.is_empty() {
        labels.insert("token-activity".to_owned());
        return;
    }

    labels.extend(
        reason
            .split('+')
            .map(str::trim)
            .filter(|label| !label.is_empty())
            .map(str::to_owned),
    );
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct OnchainRefreshTaskWrite {
    id: String,
    contract_set_id: String,
    chain_id: i32,
    dao_code: String,
    governor_address: String,
    token_address: String,
    account: String,
    refresh_balance: bool,
    refresh_power: bool,
    reason: String,
    first_seen_block_number: String,
    last_seen_block_number: String,
    last_seen_block_timestamp: String,
    last_seen_transaction_hash: String,
    next_run_at: String,
}

impl From<PowerReconcileCandidate> for OnchainRefreshTaskWrite {
    fn from(row: PowerReconcileCandidate) -> Self {
        let status = row.status;
        let id = refresh_task_id(
            &status.contract_set_id,
            &status.dao_code,
            status.chain_id,
            &status.governor,
            &status.governor_token,
            &status.account,
        );
        let reason = if status.reason.is_empty() {
            "token-activity".to_owned()
        } else {
            status.reason
        };

        Self {
            id,
            contract_set_id: status.contract_set_id,
            chain_id: status.chain_id,
            dao_code: status.dao_code,
            governor_address: status.governor,
            token_address: status.governor_token,
            account: status.account,
            refresh_balance: status.refresh_balance,
            refresh_power: status.refresh_power,
            reason,
            first_seen_block_number: u64_to_string(status.first_seen_activity_block),
            last_seen_block_number: u64_to_string(status.last_seen_activity_block),
            last_seen_block_timestamp: status
                .last_seen_block_timestamp_ms
                .map(u64_to_string)
                .unwrap_or_else(|| "0".to_owned()),
            last_seen_transaction_hash: status.last_seen_transaction_hash,
            next_run_at: "0".to_owned(),
        }
    }
}

fn refresh_task_id(
    contract_set_id: &str,
    dao_code: &str,
    chain_id: i32,
    governor_address: &str,
    token_address: &str,
    account: &str,
) -> String {
    format!(
        "{contract_set_id}:{dao_code}:{chain_id}:{governor_address}:{token_address}:{account}"
    )
}

async fn upsert_onchain_refresh_task_chunk(
    transaction: &mut Transaction<'_, Postgres>,
    rows: &[OnchainRefreshTaskWrite],
    now_ms: i64,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    let rows = OnchainRefreshTaskArrays::from_rows(rows);
    sqlx::query(onchain_refresh_task_upsert_sql())
        .bind(&rows.ids)
        .bind(&rows.contract_set_ids)
        .bind(&rows.chain_ids)
        .bind(&rows.dao_codes)
        .bind(&rows.governor_addresses)
        .bind(&rows.token_addresses)
        .bind(&rows.accounts)
        .bind(&rows.refresh_balances)
        .bind(&rows.refresh_powers)
        .bind(&rows.reasons)
        .bind(&rows.first_seen_block_numbers)
        .bind(&rows.last_seen_block_numbers)
        .bind(&rows.last_seen_block_timestamps)
        .bind(&rows.last_seen_transaction_hashes)
        .bind(&rows.next_run_ats)
        .bind(now_ms.to_string())
        .execute(&mut **transaction)
        .await?;

    Ok(())
}

fn onchain_refresh_task_upsert_sql() -> &'static str {
    "INSERT INTO onchain_refresh_task (
        id, contract_set_id, chain_id, dao_code, governor_address, token_address, account,
        refresh_balance, refresh_power, reason, first_seen_block_number, last_seen_block_number,
        last_seen_block_timestamp, last_seen_transaction_hash, status, attempts,
        next_run_at, pending_after_lock, created_at, updated_at
     )
     SELECT
        id, contract_set_id, chain_id, dao_code, governor_address, token_address, account,
        refresh_balance, refresh_power, reason,
        first_seen_block_number::NUMERIC(78, 0),
        last_seen_block_number::NUMERIC(78, 0),
        last_seen_block_timestamp::NUMERIC(78, 0),
        last_seen_transaction_hash,
        'pending', 0,
        next_run_at::NUMERIC(78, 0),
        false,
        $16::NUMERIC(78, 0),
        $16::NUMERIC(78, 0)
     FROM UNNEST(
        $1::TEXT[], $2::TEXT[], $3::INT4[], $4::TEXT[], $5::TEXT[], $6::TEXT[], $7::TEXT[],
        $8::BOOL[], $9::BOOL[], $10::TEXT[], $11::TEXT[], $12::TEXT[], $13::TEXT[], $14::TEXT[],
        $15::TEXT[]
     ) AS rows(
        id, contract_set_id, chain_id, dao_code, governor_address, token_address, account,
        refresh_balance, refresh_power, reason, first_seen_block_number, last_seen_block_number,
        last_seen_block_timestamp, last_seen_transaction_hash, next_run_at
     )
     ON CONFLICT ON CONSTRAINT onchain_refresh_task_account_unique DO UPDATE
     SET refresh_balance = onchain_refresh_task.refresh_balance OR EXCLUDED.refresh_balance,
         refresh_power = onchain_refresh_task.refresh_power OR EXCLUDED.refresh_power,
         reason = EXCLUDED.reason,
         status = CASE
           WHEN onchain_refresh_task.status = 'processing' THEN onchain_refresh_task.status
           ELSE 'pending'
         END,
         attempts = CASE
           WHEN onchain_refresh_task.status = 'processing' THEN onchain_refresh_task.attempts
           ELSE 0
         END,
         next_run_at = CASE
           WHEN onchain_refresh_task.status = 'processing' THEN onchain_refresh_task.next_run_at
           ELSE EXCLUDED.next_run_at
         END,
         processed_at = CASE
           WHEN onchain_refresh_task.status = 'processing' THEN onchain_refresh_task.processed_at
           ELSE NULL
         END,
         error = CASE
           WHEN onchain_refresh_task.status = 'processing' THEN onchain_refresh_task.error
           ELSE NULL
         END,
         first_seen_block_number = LEAST(onchain_refresh_task.first_seen_block_number, EXCLUDED.first_seen_block_number),
         last_seen_block_number = GREATEST(onchain_refresh_task.last_seen_block_number, EXCLUDED.last_seen_block_number),
         last_seen_block_timestamp = GREATEST(onchain_refresh_task.last_seen_block_timestamp, EXCLUDED.last_seen_block_timestamp),
         last_seen_transaction_hash = EXCLUDED.last_seen_transaction_hash,
         pending_after_lock = onchain_refresh_task.pending_after_lock
           OR onchain_refresh_task.status = 'processing',
         pending_after_lock_block_number = CASE
           WHEN onchain_refresh_task.status = 'processing'
             THEN GREATEST(
               COALESCE(onchain_refresh_task.pending_after_lock_block_number, onchain_refresh_task.last_seen_block_number),
               EXCLUDED.last_seen_block_number
             )
           ELSE NULL
         END,
         pending_after_lock_block_timestamp = CASE
           WHEN onchain_refresh_task.status = 'processing'
             THEN GREATEST(
               COALESCE(onchain_refresh_task.pending_after_lock_block_timestamp, onchain_refresh_task.last_seen_block_timestamp),
               EXCLUDED.last_seen_block_timestamp
             )
           ELSE NULL
         END,
         pending_after_lock_transaction_hash = CASE
           WHEN onchain_refresh_task.status = 'processing'
             THEN EXCLUDED.last_seen_transaction_hash
           ELSE NULL
         END,
         updated_at = EXCLUDED.updated_at
     WHERE onchain_refresh_task.status <> 'completed'
        OR EXCLUDED.reason = 'contributor-coverage'
        OR EXCLUDED.last_seen_block_number > onchain_refresh_task.last_seen_block_number
        OR EXCLUDED.last_seen_block_timestamp > onchain_refresh_task.last_seen_block_timestamp
        OR (EXCLUDED.refresh_balance AND NOT onchain_refresh_task.refresh_balance)
        OR (EXCLUDED.refresh_power AND NOT onchain_refresh_task.refresh_power)"
}

async fn upsert_deferred_onchain_refresh_candidate_chunk(
    transaction: &mut Transaction<'_, Postgres>,
    rows: &[OnchainRefreshTaskWrite],
    now_ms: i64,
    next_run_at: i64,
) -> Result<u64, PostgresIndexerRunnerStoreError> {
    let mut rows = OnchainRefreshTaskArrays::from_rows(rows);
    rows.next_run_ats.fill(next_run_at.to_string());
    let result = sqlx::query(deferred_onchain_refresh_candidate_upsert_sql())
        .bind(&rows.ids)
        .bind(&rows.contract_set_ids)
        .bind(&rows.chain_ids)
        .bind(&rows.dao_codes)
        .bind(&rows.governor_addresses)
        .bind(&rows.token_addresses)
        .bind(&rows.accounts)
        .bind(&rows.refresh_balances)
        .bind(&rows.refresh_powers)
        .bind(&rows.reasons)
        .bind(&rows.first_seen_block_numbers)
        .bind(&rows.last_seen_block_numbers)
        .bind(&rows.last_seen_block_timestamps)
        .bind(&rows.last_seen_transaction_hashes)
        .bind(&rows.next_run_ats)
        .bind(now_ms.to_string())
        .execute(&mut **transaction)
        .await?;

    Ok(result.rows_affected())
}

fn deferred_onchain_refresh_candidate_upsert_sql() -> &'static str {
    "INSERT INTO onchain_refresh_deferred_candidate (
        id, contract_set_id, chain_id, dao_code, governor_address, token_address, account,
        refresh_balance, refresh_power, reason, first_seen_block_number, last_seen_block_number,
        last_seen_block_timestamp, last_seen_transaction_hash, next_run_at, created_at, updated_at
     )
     SELECT
        id, contract_set_id, chain_id, dao_code, governor_address, token_address, account,
        refresh_balance, refresh_power, reason,
        first_seen_block_number::NUMERIC(78, 0),
        last_seen_block_number::NUMERIC(78, 0),
        last_seen_block_timestamp::NUMERIC(78, 0),
        last_seen_transaction_hash,
        next_run_at::NUMERIC(78, 0),
        $16::NUMERIC(78, 0),
        $16::NUMERIC(78, 0)
     FROM UNNEST(
        $1::TEXT[], $2::TEXT[], $3::INT4[], $4::TEXT[], $5::TEXT[], $6::TEXT[], $7::TEXT[],
        $8::BOOL[], $9::BOOL[], $10::TEXT[], $11::TEXT[], $12::TEXT[], $13::TEXT[], $14::TEXT[],
        $15::TEXT[]
     ) AS rows(
        id, contract_set_id, chain_id, dao_code, governor_address, token_address, account,
        refresh_balance, refresh_power, reason, first_seen_block_number, last_seen_block_number,
        last_seen_block_timestamp, last_seen_transaction_hash, next_run_at
     )
     ON CONFLICT ON CONSTRAINT onchain_refresh_deferred_candidate_account_unique DO UPDATE
     SET refresh_balance = onchain_refresh_deferred_candidate.refresh_balance OR EXCLUDED.refresh_balance,
         refresh_power = onchain_refresh_deferred_candidate.refresh_power OR EXCLUDED.refresh_power,
         reason = EXCLUDED.reason,
         first_seen_block_number = LEAST(onchain_refresh_deferred_candidate.first_seen_block_number, EXCLUDED.first_seen_block_number),
         last_seen_block_number = GREATEST(onchain_refresh_deferred_candidate.last_seen_block_number, EXCLUDED.last_seen_block_number),
         last_seen_block_timestamp = GREATEST(onchain_refresh_deferred_candidate.last_seen_block_timestamp, EXCLUDED.last_seen_block_timestamp),
         last_seen_transaction_hash = EXCLUDED.last_seen_transaction_hash,
         next_run_at = GREATEST(onchain_refresh_deferred_candidate.next_run_at, EXCLUDED.next_run_at),
         updated_at = EXCLUDED.updated_at
     WHERE onchain_refresh_deferred_candidate.next_run_at > EXCLUDED.updated_at
        OR (EXCLUDED.refresh_balance AND NOT onchain_refresh_deferred_candidate.refresh_balance)
        OR (EXCLUDED.refresh_power AND NOT onchain_refresh_deferred_candidate.refresh_power)
        OR onchain_refresh_deferred_candidate.first_seen_block_number > EXCLUDED.first_seen_block_number
        OR onchain_refresh_deferred_candidate.last_seen_block_number < EXCLUDED.last_seen_block_number"
}

struct OnchainRefreshTaskArrays {
    ids: Vec<String>,
    contract_set_ids: Vec<String>,
    chain_ids: Vec<i32>,
    dao_codes: Vec<String>,
    governor_addresses: Vec<String>,
    token_addresses: Vec<String>,
    accounts: Vec<String>,
    refresh_balances: Vec<bool>,
    refresh_powers: Vec<bool>,
    reasons: Vec<String>,
    first_seen_block_numbers: Vec<String>,
    last_seen_block_numbers: Vec<String>,
    last_seen_block_timestamps: Vec<String>,
    last_seen_transaction_hashes: Vec<String>,
    next_run_ats: Vec<String>,
}

impl OnchainRefreshTaskArrays {
    fn from_rows(rows: &[OnchainRefreshTaskWrite]) -> Self {
        Self {
            ids: rows.iter().map(|row| row.id.clone()).collect(),
            contract_set_ids: rows.iter().map(|row| row.contract_set_id.clone()).collect(),
            chain_ids: rows.iter().map(|row| row.chain_id).collect(),
            dao_codes: rows.iter().map(|row| row.dao_code.clone()).collect(),
            governor_addresses: rows.iter().map(|row| row.governor_address.clone()).collect(),
            token_addresses: rows.iter().map(|row| row.token_address.clone()).collect(),
            accounts: rows.iter().map(|row| row.account.clone()).collect(),
            refresh_balances: rows.iter().map(|row| row.refresh_balance).collect(),
            refresh_powers: rows.iter().map(|row| row.refresh_power).collect(),
            reasons: rows.iter().map(|row| row.reason.clone()).collect(),
            first_seen_block_numbers: rows
                .iter()
                .map(|row| row.first_seen_block_number.clone())
                .collect(),
            last_seen_block_numbers: rows
                .iter()
                .map(|row| row.last_seen_block_number.clone())
                .collect(),
            last_seen_block_timestamps: rows
                .iter()
                .map(|row| row.last_seen_block_timestamp.clone())
                .collect(),
            last_seen_transaction_hashes: rows
                .iter()
                .map(|row| row.last_seen_transaction_hash.clone())
                .collect(),
            next_run_ats: rows.iter().map(|row| row.next_run_at.clone()).collect(),
        }
    }
}

async fn read_deferred_onchain_refresh_candidates(
    transaction: &mut Transaction<'_, Postgres>,
    max_rows: usize,
    now_ms: i64,
    scope: Option<&crate::OnchainRefreshTaskScope>,
) -> Result<Vec<OnchainRefreshTaskWrite>, PostgresIndexerRunnerStoreError> {
    let max_rows = i64::try_from(max_rows)
        .map_err(|_| PostgresIndexerRunnerStoreError::new("deferred drain batch size exceeds i64"))?;
    let mut query = QueryBuilder::<Postgres>::new(
        "SELECT id, contract_set_id, chain_id, dao_code, governor_address, token_address, account,
                refresh_balance, refresh_power, reason,
                first_seen_block_number::TEXT AS first_seen_block_number,
                last_seen_block_number::TEXT AS last_seen_block_number,
                last_seen_block_timestamp::TEXT AS last_seen_block_timestamp,
                last_seen_transaction_hash,
                next_run_at::TEXT AS next_run_at
         FROM onchain_refresh_deferred_candidate
         WHERE next_run_at <= ",
    );
    query.push_bind(now_ms.to_string()).push("::NUMERIC(78, 0)");
    push_deferred_onchain_refresh_scope_filter(&mut query, scope);
    query
        .push(
            "
         ORDER BY onchain_refresh_deferred_candidate.next_run_at,
                  onchain_refresh_deferred_candidate.updated_at,
                  onchain_refresh_deferred_candidate.id
         LIMIT ",
        )
        .push_bind(max_rows)
        .push(" FOR UPDATE SKIP LOCKED");
    let rows = query.build().fetch_all(&mut **transaction).await?;

    Ok(rows
        .into_iter()
        .map(|row| OnchainRefreshTaskWrite {
            id: row.get("id"),
            contract_set_id: row.get("contract_set_id"),
            chain_id: row.get("chain_id"),
            dao_code: row.get::<Option<String>, _>("dao_code").unwrap_or_default(),
            governor_address: row.get("governor_address"),
            token_address: row.get("token_address"),
            account: row.get("account"),
            refresh_balance: row.get("refresh_balance"),
            refresh_power: row.get("refresh_power"),
            reason: row.get("reason"),
            first_seen_block_number: row.get("first_seen_block_number"),
            last_seen_block_number: row.get("last_seen_block_number"),
            last_seen_block_timestamp: row.get("last_seen_block_timestamp"),
            last_seen_transaction_hash: row.get("last_seen_transaction_hash"),
            next_run_at: row.get("next_run_at"),
        })
        .collect())
}

fn push_deferred_onchain_refresh_scope_filter<'args>(
    query: &mut QueryBuilder<'args, Postgres>,
    scope: Option<&'args crate::OnchainRefreshTaskScope>,
) {
    if let Some(scope) = scope {
        query
            .push(" AND chain_id = ")
            .push_bind(scope.chain_id)
            .push(" AND contract_set_id = ")
            .push_bind(&scope.contract_set_id)
            .push(" AND dao_code = ")
            .push_bind(&scope.dao_code);
    }
}

fn push_contributor_coverage_repair_scope_filter<'args>(
    query: &mut QueryBuilder<'args, Postgres>,
    scope: Option<&'args crate::OnchainRefreshTaskScope>,
) {
    if let Some(scope) = scope {
        query
            .push(" AND contributor.chain_id = ")
            .push_bind(scope.chain_id)
            .push(" AND contributor.contract_set_id = ")
            .push_bind(&scope.contract_set_id)
            .push(" AND contributor.dao_code = ")
            .push_bind(&scope.dao_code);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        PowerActivityReason, PowerRefreshReadSource, PowerRefreshStatus, PowerRefreshStatusRecord,
    };

    #[test]
    fn test_dedupe_onchain_refresh_tasks_merges_duplicate_account_metadata() {
        let mut first = candidate("demo-set", 1, "demo-dao", "0xabc", 10, 20, 1, "transfer");
        first.status.refresh_balance = true;
        let mut second = candidate(
            "demo-set",
            1,
            "demo-dao",
            "0xabc",
            8,
            25,
            2,
            "delegate-votes-changed",
        );
        second.status.refresh_power = true;

        let deduped = dedupe_onchain_refresh_tasks(&[first, second]);

        assert_eq!(deduped.len(), 1);
        assert!(deduped[0].status.refresh_balance);
        assert!(deduped[0].status.refresh_power);
        assert_eq!(
            deduped[0].status.reason,
            "delegate-votes-changed+transfer"
        );
        assert_eq!(deduped[0].status.first_seen_activity_block, 8);
        assert_eq!(deduped[0].status.last_seen_activity_block, 25);
        assert_eq!(
            deduped[0].status.last_seen_block_timestamp_ms,
            Some(1_700_000_025_000)
        );
        assert_eq!(deduped[0].status.last_seen_transaction_hash, "0xtx25");
    }

    #[test]
    fn test_dedupe_onchain_refresh_tasks_uses_full_database_uniqueness_key() {
        let rows = vec![
            candidate("demo-set", 1, "demo-dao", "0xabc", 10, 20, 1, "transfer"),
            candidate("other-set", 1, "demo-dao", "0xabc", 10, 20, 1, "transfer"),
            candidate("demo-set", 2, "demo-dao", "0xabc", 10, 20, 1, "transfer"),
            candidate("demo-set", 1, "other-dao", "0xabc", 10, 20, 1, "transfer"),
            candidate("demo-set", 1, "demo-dao", "0xdef", 10, 20, 1, "transfer"),
            candidate("demo-set", 1, "demo-dao", "0xabc", 10, 20, 1, "transfer")
                .with_governor("0x3333333333333333333333333333333333333333"),
            candidate("demo-set", 1, "demo-dao", "0xabc", 10, 20, 1, "transfer")
                .with_governor_token("0x4444444444444444444444444444444444444444"),
        ];

        let deduped = dedupe_onchain_refresh_tasks(&rows);

        assert_eq!(deduped.len(), rows.len());
    }

    #[test]
    fn test_deferred_scope_filters_use_indexable_dao_code_equality() {
        let scope = crate::OnchainRefreshTaskScope {
            chain_id: 1,
            contract_set_id: "contract-set".to_owned(),
            dao_code: "demo-dao".to_owned(),
        };
        let mut deferred_query = QueryBuilder::<Postgres>::new("SELECT 1 WHERE true");
        let mut repair_query = QueryBuilder::<Postgres>::new("SELECT 1 WHERE true");

        push_deferred_onchain_refresh_scope_filter(&mut deferred_query, Some(&scope));
        push_contributor_coverage_repair_scope_filter(&mut repair_query, Some(&scope));

        let deferred_sql = deferred_query.sql();
        let repair_sql = repair_query.sql();
        assert!(deferred_sql.contains("dao_code = "));
        assert!(!deferred_sql.contains("dao_code IS NOT DISTINCT FROM"));
        assert!(repair_sql.contains("contributor.dao_code = "));
        assert!(!repair_sql.contains("contributor.dao_code IS NOT DISTINCT FROM"));
    }

    #[test]
    fn test_plan_onchain_refresh_enqueue_buffers_dense_candidates() {
        let debounced = plan_onchain_refresh_enqueue_with_drain_budget(
            1_205,
            Duration::from_secs(120),
            DEFAULT_ONCHAIN_REFRESH_DEFERRED_DRAIN_ROWS,
        );
        assert_eq!(debounced.inline_upsert_count, 0);
        assert_eq!(debounced.deferred_candidate_count, 1_205);
        assert_eq!(debounced.ready_drain_count, 0);

        let immediate = plan_onchain_refresh_enqueue_with_drain_budget(
            1_205,
            Duration::ZERO,
            DEFAULT_ONCHAIN_REFRESH_DEFERRED_DRAIN_ROWS,
        );
        assert_eq!(immediate.inline_upsert_count, 0);
        assert_eq!(immediate.deferred_candidate_count, 1_205);
        assert_eq!(immediate.ready_drain_count, DEFAULT_ONCHAIN_REFRESH_DEFERRED_DRAIN_ROWS);
    }

    #[test]
    fn test_plan_onchain_refresh_enqueue_uses_configured_ready_drain_budget() {
        let immediate = plan_onchain_refresh_enqueue_with_drain_budget(
            1_205,
            Duration::ZERO,
            1_000,
        );

        assert_eq!(immediate.inline_upsert_count, 0);
        assert_eq!(immediate.deferred_candidate_count, 1_205);
        assert_eq!(immediate.ready_drain_count, 1_000);
    }

    #[test]
    fn test_deferred_candidate_conflict_skips_ready_metadata_only_update() {
        assert!(!should_update_deferred_candidate_conflict(
            1_000, 1_234, true, false, true, true, 30, 31, 40, 40,
        ));
    }

    #[test]
    fn test_deferred_candidate_conflict_updates_behavioral_changes() {
        assert!(should_update_deferred_candidate_conflict(
            2_000, 1_234, true, false, true, true, 30, 31, 40, 40,
        ));
        assert!(should_update_deferred_candidate_conflict(
            1_000, 1_234, false, true, true, true, 30, 31, 40, 40,
        ));
        assert!(should_update_deferred_candidate_conflict(
            1_000, 1_234, true, false, false, true, 30, 31, 40, 40,
        ));
        assert!(should_update_deferred_candidate_conflict(
            1_000, 1_234, true, false, true, true, 30, 29, 40, 40,
        ));
        assert!(should_update_deferred_candidate_conflict(
            1_000, 1_234, true, false, true, true, 30, 31, 40, 41,
        ));
    }

    #[test]
    fn test_onchain_refresh_task_upsert_chunk_size_keeps_writes_bounded() {
        assert_eq!(MAX_ONCHAIN_REFRESH_TASK_UPSERT_ROWS, 200);
    }

    #[test]
    fn test_onchain_refresh_task_upsert_uses_fixed_unnest_sql() {
        let sql = onchain_refresh_task_upsert_sql();

        assert!(sql.contains("FROM UNNEST("));
        assert!(!sql.contains("VALUES ("));
    }

    #[test]
    fn test_deferred_candidate_upsert_uses_fixed_unnest_sql() {
        let sql = deferred_onchain_refresh_candidate_upsert_sql();

        assert!(sql.contains("FROM UNNEST("));
        assert!(!sql.contains("VALUES ("));
    }

    fn candidate(
        contract_set_id: &str,
        chain_id: i32,
        dao_code: &str,
        account: &str,
        first_block: u64,
        last_block: u64,
        log_index: u64,
        reason: &str,
    ) -> PowerReconcileCandidate {
        let governor = "0x1111111111111111111111111111111111111111".to_owned();
        let governor_token = "0x2222222222222222222222222222222222222222".to_owned();
        let account = account.to_owned();
        PowerReconcileCandidate {
            contract_set_id: contract_set_id.to_owned(),
            dao_code: dao_code.to_owned(),
            chain_id,
            governor: governor.clone(),
            governor_token: governor_token.clone(),
            account: account.clone(),
            latest_activity_block: last_block,
            latest_transaction_index: 0,
            latest_log_index: log_index,
            reasons: [PowerActivityReason::Transfer].into(),
            observed_log_power: None,
            status: PowerRefreshStatusRecord {
                contract_set_id: contract_set_id.to_owned(),
                dao_code: dao_code.to_owned(),
                chain_id,
                governor,
                governor_token,
                account,
                source: PowerRefreshReadSource::OnchainRpc,
                status: PowerRefreshStatus::Pending,
                refresh_balance: false,
                refresh_power: false,
                reason: reason.to_owned(),
                first_seen_activity_block: first_block,
                last_seen_activity_block: last_block,
                last_seen_block_timestamp_ms: Some(1_700_000_000_000 + last_block * 1_000),
                last_seen_transaction_hash: format!("0xtx{last_block}"),
                last_seen_transaction_index: 0,
                last_seen_log_index: log_index,
            },
        }
    }

    trait CandidateTestExt {
        fn with_governor(self, governor: &str) -> Self;
        fn with_governor_token(self, governor_token: &str) -> Self;
    }

    impl CandidateTestExt for PowerReconcileCandidate {
        fn with_governor(mut self, governor: &str) -> Self {
            self.governor = governor.to_owned();
            self.status.governor = governor.to_owned();
            self
        }

        fn with_governor_token(mut self, governor_token: &str) -> Self {
            self.governor_token = governor_token.to_owned();
            self.status.governor_token = governor_token.to_owned();
            self
        }
    }
}
