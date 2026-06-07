// Onchain refresh task persistence.
const MAX_ONCHAIN_REFRESH_TASK_UPSERT_ROWS: usize = 1_000;

async fn upsert_onchain_refresh_tasks(
    transaction: &mut Transaction<'_, Postgres>,
    rows: &[PowerReconcileCandidate],
) -> Result<(), PostgresIndexerRunnerStoreError> {
    for chunk in rows.chunks(MAX_ONCHAIN_REFRESH_TASK_UPSERT_ROWS) {
        upsert_onchain_refresh_task_chunk(transaction, chunk).await?;
    }

    Ok(())
}

async fn upsert_onchain_refresh_task_chunk(
    transaction: &mut Transaction<'_, Postgres>,
    rows: &[PowerReconcileCandidate],
) -> Result<(), PostgresIndexerRunnerStoreError> {
    let mut query = QueryBuilder::<Postgres>::new(
        "INSERT INTO onchain_refresh_task (
            id, contract_set_id, chain_id, dao_code, governor_address, token_address, account, refresh_balance,
            refresh_power, reason, first_seen_block_number, last_seen_block_number,
            last_seen_block_timestamp, last_seen_transaction_hash, status, attempts,
            next_run_at, pending_after_lock, created_at, updated_at
         )
         ",
    );
    query.push_values(rows, |mut values, row| {
        let status = &row.status;
        let task_id = format!(
            "{}:{}:{}:{}:{}:{}",
            status.contract_set_id,
            status.dao_code,
            status.chain_id,
            status.governor,
            status.governor_token,
            status.account
        );
        let reason = if status.reason.is_empty() {
            "token-activity".to_owned()
        } else {
            status.reason.clone()
        };
        let first_seen_block_number = u64_to_string(status.first_seen_activity_block);
        let last_seen_block_number = u64_to_string(status.last_seen_activity_block);
        let last_seen_block_timestamp = status.last_seen_block_timestamp_ms.map(u64_to_string);

        values
            .push_bind(task_id)
            .push_bind(&status.contract_set_id)
            .push_bind(status.chain_id)
            .push_bind(&status.dao_code)
            .push_bind(&status.governor)
            .push_bind(&status.governor_token)
            .push_bind(&status.account)
            .push_bind(status.refresh_balance)
            .push_bind(status.refresh_power)
            .push_bind(reason)
            .push_bind(first_seen_block_number)
            .push_unseparated("::NUMERIC(78, 0)")
            .push_bind(last_seen_block_number.clone())
            .push_unseparated("::NUMERIC(78, 0)")
            .push_bind(last_seen_block_timestamp)
            .push_unseparated("::NUMERIC(78, 0)")
            .push_bind(&status.last_seen_transaction_hash)
            .push("'pending'")
            .push("0")
            .push("0::NUMERIC(78, 0)")
            .push("false")
            .push_bind(last_seen_block_number.clone())
            .push_unseparated("::NUMERIC(78, 0)")
            .push_bind(last_seen_block_number)
            .push_unseparated("::NUMERIC(78, 0)");
    });
    query.push(
        "
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
               ELSE 0::NUMERIC(78, 0)
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
             updated_at = EXCLUDED.updated_at",
    );
    query
        .build()
        .execute(&mut **transaction)
        .await?;

    Ok(())
}
