// Onchain refresh task persistence.
const MAX_ONCHAIN_REFRESH_TASK_UPSERT_ROWS: usize = 1_000;

async fn upsert_onchain_refresh_tasks(
    transaction: &mut Transaction<'_, Postgres>,
    rows: &[PowerReconcileCandidate],
    debounce: Duration,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    let rows = dedupe_onchain_refresh_tasks(rows);
    let now_ms = unix_time_millis();
    let next_run_at = now_ms.saturating_add(duration_millis_i64(debounce));
    for chunk in rows.chunks(MAX_ONCHAIN_REFRESH_TASK_UPSERT_ROWS) {
        upsert_onchain_refresh_task_chunk(transaction, chunk, now_ms, next_run_at).await?;
    }

    Ok(())
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

async fn upsert_onchain_refresh_task_chunk(
    transaction: &mut Transaction<'_, Postgres>,
    rows: &[PowerReconcileCandidate],
    now_ms: i64,
    next_run_at: i64,
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
            .push_bind(next_run_at.to_string())
            .push_unseparated("::NUMERIC(78, 0)")
            .push("false")
            .push_bind(now_ms.to_string())
            .push_unseparated("::NUMERIC(78, 0)")
            .push_bind(now_ms.to_string())
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
             updated_at = EXCLUDED.updated_at",
    );
    query
        .build()
        .execute(&mut **transaction)
        .await?;

    Ok(())
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
        ];

        let deduped = dedupe_onchain_refresh_tasks(&rows);

        assert_eq!(deduped.len(), rows.len());
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
}
