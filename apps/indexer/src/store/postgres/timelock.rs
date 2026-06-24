// Timelock projection writes and proposal linking.
async fn write_timelock_batch(
    transaction: &mut Transaction<'_, Postgres>,
    batch: &TimelockProjectionBatch,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    for row in &batch.timelock_operations {
        upsert_timelock_operation(transaction, row).await?;
    }
    for row in &batch.timelock_calls {
        upsert_timelock_call(transaction, row).await?;
    }
    for row in &batch.timelock_role_events {
        insert_timelock_role_event(transaction, row).await?;
    }
    for row in &batch.timelock_min_delay_changes {
        insert_timelock_min_delay_change(transaction, row).await?;
    }
    for row in &batch.timelock_operation_hints {
        insert_timelock_operation_hint(transaction, row).await?;
    }

    Ok(())
}

async fn read_timelock_proposal_link_context(
    pool: &PgPool,
    context: &TimelockProjectionContext,
    events: &[TimelockProjectionEvent],
    proposal: Option<&ProposalProjectionBatch>,
) -> Result<TimelockProposalLinkContext, PostgresIndexerRunnerStoreError> {
    let mut links = TimelockProposalLinkContext::default();
    let governor_address = normalize_identifier(&context.governor_address);

    for input in events {
        let DecodedTimelockEvent::CallScheduled(event) = &input.event else {
            continue;
        };
        let Ok(action_index) = event.index.parse::<i32>() else {
            continue;
        };
        let row = sqlx::query(
            "SELECT p.chain_id, p.governor_address, p.id AS proposal_ref,
                    p.proposal_id AS raw_proposal_id,
                    pq.transaction_hash AS queue_transaction_hash,
                    pq.block_number::TEXT AS queue_block_number,
                    pq.block_timestamp::TEXT AS queue_block_timestamp,
                    pq.log_index AS queue_log_index,
                    pq.transaction_index AS queue_transaction_index,
                    pe.transaction_hash AS execution_transaction_hash,
                    pe.block_number::TEXT AS execution_block_number,
                    pe.block_timestamp::TEXT AS execution_block_timestamp,
                    pq.eta_seconds::TEXT AS queue_eta,
                    pa.id AS proposal_action_id,
                    pa.action_index AS proposal_action_index,
                    pa.target, pa.value, pa.calldata
             FROM proposal_queued pq
             JOIN proposal p
               ON p.chain_id IS NOT DISTINCT FROM pq.chain_id
              AND p.governor_address IS NOT DISTINCT FROM pq.governor_address
              AND p.contract_set_id = $8
              AND p.proposal_id = pq.proposal_id
             JOIN proposal_action pa ON pa.proposal_ref = p.id
             LEFT JOIN proposal_executed pe
               ON pe.chain_id IS NOT DISTINCT FROM p.chain_id
              AND pe.governor_address IS NOT DISTINCT FROM p.governor_address
              AND pe.proposal_id = p.proposal_id
             WHERE pq.chain_id IS NOT DISTINCT FROM $1
               AND pq.governor_address IS NOT DISTINCT FROM $2
               AND pq.transaction_hash = $3
               AND pa.action_index = $4
               AND pa.target = $5
               AND pa.value = $6
               AND pa.calldata = $7
             ORDER BY p.id, pa.id
             LIMIT 1",
        )
        .bind(input.log.chain_id)
        .bind(&governor_address)
        .bind(normalize_identifier(&input.log.transaction_hash))
        .bind(action_index)
        .bind(normalize_identifier(&event.target))
        .bind(&event.value)
        .bind(normalize_identifier(&event.data))
        .bind(&context.contract_set_id)
        .fetch_optional(pool)
        .await?;

        let Some(row) = row else { continue };
        insert_link_from_row(&mut links, row)?;
    }

    if let Some(proposal) = proposal {
        for input in events {
            let DecodedTimelockEvent::CallScheduled(event) = &input.event else {
                continue;
            };
            let Ok(action_index) = event.index.parse::<i32>() else {
                continue;
            };
            let queue_transaction_hash = normalize_identifier(&input.log.transaction_hash);
            for queued in proposal.proposal_queued.iter().filter(|queued| {
                queued.common.chain_id == input.log.chain_id
                    && normalize_identifier(&queued.common.governor_address) == governor_address
                    && normalize_identifier(&queued.common.transaction_hash)
                        == queue_transaction_hash
            }) {
                let row = sqlx::query(
                    "SELECT p.chain_id, p.governor_address, p.id AS proposal_ref,
                            p.proposal_id AS raw_proposal_id,
                            $3::TEXT AS queue_transaction_hash,
                            $11::TEXT AS queue_block_number,
                            $12::TEXT AS queue_block_timestamp,
                            $13::INT AS queue_log_index,
                            $14::INT AS queue_transaction_index,
                            pe.transaction_hash AS execution_transaction_hash,
                            pe.block_number::TEXT AS execution_block_number,
                            pe.block_timestamp::TEXT AS execution_block_timestamp,
                            $4::TEXT AS queue_eta,
                            pa.id AS proposal_action_id,
                            pa.action_index AS proposal_action_index,
                            pa.target, pa.value, pa.calldata
                     FROM proposal p
                     JOIN proposal_action pa ON pa.proposal_ref = p.id
                     LEFT JOIN proposal_executed pe
                       ON pe.chain_id IS NOT DISTINCT FROM p.chain_id
                      AND pe.governor_address IS NOT DISTINCT FROM p.governor_address
                      AND pe.proposal_id = p.proposal_id
                     WHERE p.chain_id IS NOT DISTINCT FROM $1
                       AND p.governor_address IS NOT DISTINCT FROM $2
                       AND p.contract_set_id = $10
                       AND p.proposal_id = $5
                       AND pa.action_index = $6
                       AND pa.target = $7
                       AND pa.value = $8
                       AND pa.calldata = $9
                     ORDER BY p.id, pa.id
                     LIMIT 1",
                )
                .bind(input.log.chain_id)
                .bind(&governor_address)
                .bind(&queue_transaction_hash)
                .bind(&queued.eta_seconds)
                .bind(&queued.proposal_id)
                .bind(action_index)
                .bind(normalize_identifier(&event.target))
                .bind(&event.value)
                .bind(normalize_identifier(&event.data))
                .bind(&context.contract_set_id)
                .bind(&queued.common.block_number)
                .bind(queued.common.block_timestamp.as_deref())
                .bind(u64_to_i32(queued.common.log_index, "proposal_queued.log_index")?)
                .bind(u64_to_i32(
                    queued.common.transaction_index,
                    "proposal_queued.transaction_index",
                )?)
                .fetch_optional(pool)
                .await?;

                let Some(row) = row else { continue };
                insert_link_from_row(&mut links, row)?;
            }
        }

        for queued in &proposal.proposal_queued {
            let rows = sqlx::query(
                "SELECT p.chain_id, p.governor_address, p.id AS proposal_ref,
                        p.proposal_id AS raw_proposal_id,
                        $3::TEXT AS queue_transaction_hash,
                        $4::TEXT AS queue_block_number,
                        $5::TEXT AS queue_block_timestamp,
                        $6::INT AS queue_log_index,
                        $7::INT AS queue_transaction_index,
                        pe.transaction_hash AS execution_transaction_hash,
                        pe.block_number::TEXT AS execution_block_number,
                        pe.block_timestamp::TEXT AS execution_block_timestamp,
                        $8::TEXT AS queue_eta,
                        pa.id AS proposal_action_id,
                        pa.action_index AS proposal_action_index,
                        pa.target, pa.value, pa.calldata
                 FROM proposal p
                 JOIN proposal_action pa ON pa.proposal_ref = p.id
                 LEFT JOIN proposal_executed pe
                   ON pe.chain_id IS NOT DISTINCT FROM p.chain_id
                  AND pe.governor_address IS NOT DISTINCT FROM p.governor_address
                  AND pe.proposal_id = p.proposal_id
                 WHERE p.chain_id IS NOT DISTINCT FROM $1
                   AND p.governor_address IS NOT DISTINCT FROM $2
                   AND p.contract_set_id = $9
                   AND p.proposal_id = $10
                 ORDER BY p.id, pa.action_index, pa.id",
            )
            .bind(queued.common.chain_id)
            .bind(&governor_address)
            .bind(normalize_identifier(&queued.common.transaction_hash))
            .bind(&queued.common.block_number)
            .bind(queued.common.block_timestamp.as_deref())
            .bind(u64_to_i32(queued.common.log_index, "proposal_queued.log_index")?)
            .bind(u64_to_i32(
                queued.common.transaction_index,
                "proposal_queued.transaction_index",
            )?)
            .bind(&queued.eta_seconds)
            .bind(&context.contract_set_id)
            .bind(&queued.proposal_id)
            .fetch_all(pool)
            .await?;

            for row in rows {
                insert_link_from_row(&mut links, row)?;
            }
        }
    }

    Ok(links)
}

fn insert_link_from_row(
    links: &mut TimelockProposalLinkContext,
    row: sqlx::postgres::PgRow,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    let proposal_action_index = row.get::<i32, _>("proposal_action_index");
    let proposal_action_index = usize::try_from(proposal_action_index).map_err(|_| {
        PostgresIndexerRunnerStoreError::new("proposal_action_index cannot be negative")
    })?;
    links.insert_action_link(TimelockProposalActionLink {
        chain_id: row.get("chain_id"),
        governor_address: row.get("governor_address"),
        proposal_ref: row.get("proposal_ref"),
        raw_proposal_id: row.get("raw_proposal_id"),
        queue_transaction_hash: row.get("queue_transaction_hash"),
        queue_block_number: row.get("queue_block_number"),
        queue_block_timestamp: row.get("queue_block_timestamp"),
        queue_log_index: u64::try_from(row.get::<i32, _>("queue_log_index"))
            .map_err(|_| PostgresIndexerRunnerStoreError::new("queue_log_index cannot be negative"))?,
        queue_transaction_index: u64::try_from(row.get::<i32, _>("queue_transaction_index"))
            .map_err(|_| {
                PostgresIndexerRunnerStoreError::new("queue_transaction_index cannot be negative")
            })?,
        execution_transaction_hash: row.get("execution_transaction_hash"),
        execution_block_number: row.get("execution_block_number"),
        execution_block_timestamp: row.get("execution_block_timestamp"),
        queue_eta: row.get("queue_eta"),
        proposal_action_id: row.get("proposal_action_id"),
        proposal_action_index,
        target: row.get("target"),
        value: row.get("value"),
        calldata: row.get("calldata"),
    });

    Ok(())
}

async fn upsert_timelock_operation(
    transaction: &mut Transaction<'_, Postgres>,
    row: &TimelockOperationWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(
        "INSERT INTO timelock_operation (
            id, contract_set_id, chain_id, dao_code, governor_address, timelock_address, contract_address,
            log_index, transaction_index, proposal_ref, proposal_id, operation_id, timelock_type,
            predecessor, salt, state, call_count, executed_call_count, delay_seconds, ready_at,
            expires_at, queued_block_number, queued_block_timestamp, queued_transaction_hash,
            cancelled_block_number, cancelled_block_timestamp, cancelled_transaction_hash,
            executed_block_number, executed_block_timestamp, executed_transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
            $19::NUMERIC(78, 0), $20::NUMERIC(78, 0), $21::NUMERIC(78, 0),
            $22::NUMERIC(78, 0), $23::NUMERIC(78, 0), $24, $25::NUMERIC(78, 0),
            $26::NUMERIC(78, 0), $27, $28::NUMERIC(78, 0), $29::NUMERIC(78, 0), $30
         )
         ON CONFLICT (id) DO UPDATE
         SET proposal_ref = COALESCE(timelock_operation.proposal_ref, EXCLUDED.proposal_ref),
             proposal_id = COALESCE(timelock_operation.proposal_id, EXCLUDED.proposal_id),
             predecessor = COALESCE(EXCLUDED.predecessor, timelock_operation.predecessor),
             salt = COALESCE(EXCLUDED.salt, timelock_operation.salt),
             state = CASE
                 WHEN CASE EXCLUDED.state
                         WHEN 'Cancelled' THEN 4
                         WHEN 'Done' THEN 3
                         WHEN 'Executed' THEN 3
                         WHEN 'Ready' THEN 2
                         WHEN 'Waiting' THEN 1
                         WHEN 'Queued' THEN 1
                         WHEN 'Unset' THEN 0
                         ELSE 0
                      END >= CASE timelock_operation.state
                         WHEN 'Cancelled' THEN 4
                         WHEN 'Done' THEN 3
                         WHEN 'Executed' THEN 3
                         WHEN 'Ready' THEN 2
                         WHEN 'Waiting' THEN 1
                         WHEN 'Queued' THEN 1
                         WHEN 'Unset' THEN 0
                         ELSE 0
                      END
                 THEN EXCLUDED.state
                 ELSE timelock_operation.state
             END,
             call_count = COALESCE(EXCLUDED.call_count, timelock_operation.call_count),
             executed_call_count = COALESCE(EXCLUDED.executed_call_count, timelock_operation.executed_call_count),
             delay_seconds = COALESCE(EXCLUDED.delay_seconds, timelock_operation.delay_seconds),
             ready_at = COALESCE(EXCLUDED.ready_at, timelock_operation.ready_at),
             expires_at = COALESCE(EXCLUDED.expires_at, timelock_operation.expires_at),
             queued_block_number = COALESCE(EXCLUDED.queued_block_number, timelock_operation.queued_block_number),
             queued_block_timestamp = COALESCE(EXCLUDED.queued_block_timestamp, timelock_operation.queued_block_timestamp),
             queued_transaction_hash = COALESCE(EXCLUDED.queued_transaction_hash, timelock_operation.queued_transaction_hash),
             cancelled_block_number = COALESCE(EXCLUDED.cancelled_block_number, timelock_operation.cancelled_block_number),
             cancelled_block_timestamp = COALESCE(EXCLUDED.cancelled_block_timestamp, timelock_operation.cancelled_block_timestamp),
             cancelled_transaction_hash = COALESCE(EXCLUDED.cancelled_transaction_hash, timelock_operation.cancelled_transaction_hash),
             executed_block_number = COALESCE(EXCLUDED.executed_block_number, timelock_operation.executed_block_number),
             executed_block_timestamp = COALESCE(EXCLUDED.executed_block_timestamp, timelock_operation.executed_block_timestamp),
             executed_transaction_hash = COALESCE(EXCLUDED.executed_transaction_hash, timelock_operation.executed_transaction_hash)",
    )
    .bind(&row.id)
    .bind(&row.contract_set_id)
    .bind(row.chain_id)
    .bind(&row.dao_code)
    .bind(&row.governor_address)
    .bind(&row.timelock_address)
    .bind(&row.contract_address)
    .bind(u64_to_i32(row.log_index, "timelock_operation.log_index")?)
    .bind(u64_to_i32(
        row.transaction_index,
        "timelock_operation.transaction_index",
    )?)
    .bind(row.proposal_ref.as_deref())
    .bind(row.proposal_id.as_deref())
    .bind(&row.operation_id)
    .bind(&row.timelock_type)
    .bind(row.predecessor.as_deref())
    .bind(row.salt.as_deref())
    .bind(&row.state)
    .bind(row.call_count.map(|count| usize_to_i32(count, "timelock_operation.call_count")).transpose()?)
    .bind(
        row.executed_call_count
            .map(|count| usize_to_i32(count, "timelock_operation.executed_call_count"))
            .transpose()?,
    )
    .bind(row.delay_seconds.as_deref())
    .bind(row.ready_at.as_deref())
    .bind(row.expires_at.as_deref())
    .bind(row.queued_block_number.as_deref())
    .bind(row.queued_block_timestamp.as_deref())
    .bind(row.queued_transaction_hash.as_deref())
    .bind(row.cancelled_block_number.as_deref())
    .bind(row.cancelled_block_timestamp.as_deref())
    .bind(row.cancelled_transaction_hash.as_deref())
    .bind(row.executed_block_number.as_deref())
    .bind(row.executed_block_timestamp.as_deref())
    .bind(row.executed_transaction_hash.as_deref())
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn upsert_timelock_call(
    transaction: &mut Transaction<'_, Postgres>,
    row: &TimelockCallWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(
        "INSERT INTO timelock_call (
            id, contract_set_id, chain_id, dao_code, governor_address, timelock_address, contract_address,
            log_index, transaction_index, operation_id, operation_ref, proposal_ref, proposal_id,
            proposal_action_id, proposal_action_index, action_index, target, value, data,
            predecessor, delay_seconds, state, scheduled_block_number, scheduled_block_timestamp,
            scheduled_transaction_hash, executed_block_number, executed_block_timestamp,
            executed_transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
            $17, $18, $19, $20, $21::NUMERIC(78, 0), $22, $23::NUMERIC(78, 0),
            $24::NUMERIC(78, 0), $25, $26::NUMERIC(78, 0), $27::NUMERIC(78, 0), $28
         )
         ON CONFLICT (id) DO UPDATE
         SET proposal_ref = COALESCE(timelock_call.proposal_ref, EXCLUDED.proposal_ref),
             proposal_id = COALESCE(timelock_call.proposal_id, EXCLUDED.proposal_id),
             proposal_action_id = COALESCE(timelock_call.proposal_action_id, EXCLUDED.proposal_action_id),
             proposal_action_index = COALESCE(timelock_call.proposal_action_index, EXCLUDED.proposal_action_index),
             target = EXCLUDED.target,
             value = EXCLUDED.value,
             data = EXCLUDED.data,
             predecessor = COALESCE(EXCLUDED.predecessor, timelock_call.predecessor),
             delay_seconds = COALESCE(EXCLUDED.delay_seconds, timelock_call.delay_seconds),
             state = CASE
                 WHEN CASE EXCLUDED.state
                         WHEN 'Done' THEN 2
                         WHEN 'Executed' THEN 2
                         WHEN 'Scheduled' THEN 1
                         ELSE 0
                      END >= CASE timelock_call.state
                         WHEN 'Done' THEN 2
                         WHEN 'Executed' THEN 2
                         WHEN 'Scheduled' THEN 1
                         ELSE 0
                      END
                 THEN EXCLUDED.state
                 ELSE timelock_call.state
             END,
             scheduled_block_number = COALESCE(EXCLUDED.scheduled_block_number, timelock_call.scheduled_block_number),
             scheduled_block_timestamp = COALESCE(EXCLUDED.scheduled_block_timestamp, timelock_call.scheduled_block_timestamp),
             scheduled_transaction_hash = COALESCE(EXCLUDED.scheduled_transaction_hash, timelock_call.scheduled_transaction_hash),
             executed_block_number = COALESCE(EXCLUDED.executed_block_number, timelock_call.executed_block_number),
             executed_block_timestamp = COALESCE(EXCLUDED.executed_block_timestamp, timelock_call.executed_block_timestamp),
             executed_transaction_hash = COALESCE(EXCLUDED.executed_transaction_hash, timelock_call.executed_transaction_hash)",
    )
    .bind(&row.id)
    .bind(&row.contract_set_id)
    .bind(row.chain_id)
    .bind(&row.dao_code)
    .bind(&row.governor_address)
    .bind(&row.timelock_address)
    .bind(&row.contract_address)
    .bind(u64_to_i32(row.log_index, "timelock_call.log_index")?)
    .bind(u64_to_i32(
        row.transaction_index,
        "timelock_call.transaction_index",
    )?)
    .bind(&row.operation_id)
    .bind(&row.operation_ref)
    .bind(row.proposal_ref.as_deref())
    .bind(row.proposal_id.as_deref())
    .bind(row.proposal_action_id.as_deref())
    .bind(
        row.proposal_action_index
            .map(|index| usize_to_i32(index, "timelock_call.proposal_action_index"))
            .transpose()?,
    )
    .bind(usize_to_i32(row.action_index, "timelock_call.action_index")?)
    .bind(&row.target)
    .bind(&row.value)
    .bind(&row.data)
    .bind(row.predecessor.as_deref())
    .bind(row.delay_seconds.as_deref())
    .bind(&row.state)
    .bind(row.scheduled_block_number.as_deref())
    .bind(row.scheduled_block_timestamp.as_deref())
    .bind(row.scheduled_transaction_hash.as_deref())
    .bind(row.executed_block_number.as_deref())
    .bind(row.executed_block_timestamp.as_deref())
    .bind(row.executed_transaction_hash.as_deref())
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn insert_timelock_role_event(
    transaction: &mut Transaction<'_, Postgres>,
    row: &TimelockRoleEventWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(
        "INSERT INTO timelock_role_event (
            id, chain_id, dao_code, governor_address, timelock_address, contract_address,
            log_index, transaction_index, event_name, role, role_label, account, sender,
            previous_admin_role, previous_admin_role_label, new_admin_role, new_admin_role_label,
            block_number, block_timestamp, transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
            $17, $18::NUMERIC(78, 0), $19::NUMERIC(78, 0), $20
         )
         ON CONFLICT (id) DO NOTHING",
    )
    .bind(&row.id)
    .bind(row.chain_id)
    .bind(&row.dao_code)
    .bind(&row.governor_address)
    .bind(&row.timelock_address)
    .bind(&row.contract_address)
    .bind(u64_to_i32(row.log_index, "timelock_role_event.log_index")?)
    .bind(u64_to_i32(
        row.transaction_index,
        "timelock_role_event.transaction_index",
    )?)
    .bind(&row.event_name)
    .bind(&row.role)
    .bind(row.role_label.as_deref())
    .bind(row.account.as_deref())
    .bind(row.sender.as_deref())
    .bind(row.previous_admin_role.as_deref())
    .bind(row.previous_admin_role_label.as_deref())
    .bind(row.new_admin_role.as_deref())
    .bind(row.new_admin_role_label.as_deref())
    .bind(&row.block_number)
    .bind(required_numeric(
        &row.block_timestamp,
        "timelock_role_event.block_timestamp",
    )?)
    .bind(&row.transaction_hash)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn insert_timelock_min_delay_change(
    transaction: &mut Transaction<'_, Postgres>,
    row: &TimelockMinDelayChangeWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(
        "INSERT INTO timelock_min_delay_change (
            id, chain_id, dao_code, governor_address, timelock_address, contract_address,
            log_index, transaction_index, old_duration, new_duration, block_number,
            block_timestamp, transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9::NUMERIC(78, 0), $10::NUMERIC(78, 0),
            $11::NUMERIC(78, 0), $12::NUMERIC(78, 0), $13
         )
         ON CONFLICT (id) DO NOTHING",
    )
    .bind(&row.id)
    .bind(row.chain_id)
    .bind(&row.dao_code)
    .bind(&row.governor_address)
    .bind(&row.timelock_address)
    .bind(&row.contract_address)
    .bind(u64_to_i32(
        row.log_index,
        "timelock_min_delay_change.log_index",
    )?)
    .bind(u64_to_i32(
        row.transaction_index,
        "timelock_min_delay_change.transaction_index",
    )?)
    .bind(&row.old_duration)
    .bind(&row.new_duration)
    .bind(&row.block_number)
    .bind(required_numeric(
        &row.block_timestamp,
        "timelock_min_delay_change.block_timestamp",
    )?)
    .bind(&row.transaction_hash)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}
async fn insert_timelock_operation_hint(
    transaction: &mut Transaction<'_, Postgres>,
    row: &TimelockOperationHintWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(
        "INSERT INTO governance_parameter_checkpoint (
            id, chain_id, dao_code, governor_address, contract_address, log_index,
            transaction_index, event_name, parameter_name, value_type, new_value, block_number,
            block_timestamp, transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, 'timelock_operation_id', 'bytes32', $9,
            $10::NUMERIC(78, 0), $11::NUMERIC(78, 0), $12
         )
         ON CONFLICT (id) DO NOTHING",
    )
    .bind(&row.id)
    .bind(row.common.chain_id)
    .bind(&row.common.dao_code)
    .bind(&row.common.governor_address)
    .bind(&row.common.contract_address)
    .bind(u64_to_i32(
        row.common.log_index,
        "timelock_operation_hint.log_index",
    )?)
    .bind(u64_to_i32(
        row.common.transaction_index,
        "timelock_operation_hint.transaction_index",
    )?)
    .bind(&row.event_name)
    .bind(&row.operation_id)
    .bind(&row.common.block_number)
    .bind(required_numeric(
        &row.common.block_timestamp,
        "timelock_operation_hint.block_timestamp",
    )?)
    .bind(&row.common.transaction_hash)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}
