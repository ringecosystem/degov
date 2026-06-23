// Proposal projection writes.
async fn write_proposal_batch_rows(
    transaction: &mut Transaction<'_, Postgres>,
    batch: &ProposalProjectionBatch,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    for row in &batch.proposal_created {
        insert_proposal_created(transaction, row).await?;
    }
    for row in &batch.proposal_queued {
        insert_proposal_queued(transaction, row).await?;
    }
    for row in &batch.proposal_extended {
        insert_proposal_extended(transaction, row).await?;
    }
    for row in &batch.proposal_executed {
        insert_proposal_id_event(transaction, "proposal_executed", row).await?;
    }
    for row in &batch.proposal_canceled {
        insert_proposal_id_event(transaction, "proposal_canceled", row).await?;
    }
    for row in &batch.proposals {
        upsert_proposal(transaction, row).await?;
    }
    for row in &batch.proposal_actions {
        insert_proposal_action(transaction, row).await?;
    }
    for row in &batch.proposal_state_epochs {
        insert_proposal_state_epoch(transaction, row).await?;
    }
    for row in &batch.proposal_deadline_extensions {
        insert_proposal_deadline_extension(transaction, row).await?;
    }
    for row in &batch.voting_delay_set {
        insert_governor_parameter_change(
            transaction,
            "voting_delay_set",
            "old_voting_delay",
            "new_voting_delay",
            row,
        )
        .await?;
    }
    for row in &batch.voting_period_set {
        insert_governor_parameter_change(
            transaction,
            "voting_period_set",
            "old_voting_period",
            "new_voting_period",
            row,
        )
        .await?;
    }
    for row in &batch.proposal_threshold_set {
        insert_governor_parameter_change(
            transaction,
            "proposal_threshold_set",
            "old_proposal_threshold",
            "new_proposal_threshold",
            row,
        )
        .await?;
    }
    for row in &batch.quorum_numerator_updated {
        insert_governor_parameter_change(
            transaction,
            "quorum_numerator_updated",
            "old_quorum_numerator",
            "new_quorum_numerator",
            row,
        )
        .await?;
    }
    for row in &batch.late_quorum_vote_extension_set {
        insert_governor_parameter_change(
            transaction,
            "late_quorum_vote_extension_set",
            "old_late_quorum_vote_extension",
            "new_late_quorum_vote_extension",
            row,
        )
        .await?;
    }
    for row in &batch.timelock_change {
        insert_governor_timelock_change(transaction, row).await?;
    }
    for row in &batch.governance_parameter_checkpoints {
        insert_governance_parameter_checkpoint(transaction, row).await?;
    }
    Ok(())
}

async fn insert_proposal_created(
    transaction: &mut Transaction<'_, Postgres>,
    row: &ProposalCreatedWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(
        "INSERT INTO proposal_created (
            id, chain_id, dao_code, governor_address, contract_address, log_index,
            transaction_index, proposal_id, proposer, targets, values, signatures, calldatas,
            vote_start, vote_end, description, block_number, block_timestamp, transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
            $14::NUMERIC(78, 0), $15::NUMERIC(78, 0), $16, $17::NUMERIC(78, 0),
            $18::NUMERIC(78, 0), $19
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
        "proposal_created.log_index",
    )?)
    .bind(u64_to_i32(
        row.common.transaction_index,
        "proposal_created.transaction_index",
    )?)
    .bind(&row.proposal_id)
    .bind(&row.proposer)
    .bind(&row.targets)
    .bind(&row.values)
    .bind(&row.signatures)
    .bind(&row.calldatas)
    .bind(&row.vote_start)
    .bind(&row.vote_end)
    .bind(&row.description)
    .bind(&row.common.block_number)
    .bind(required_numeric(
        &row.common.block_timestamp,
        "proposal_created.block_timestamp",
    )?)
    .bind(&row.common.transaction_hash)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn insert_proposal_queued(
    transaction: &mut Transaction<'_, Postgres>,
    row: &ProposalQueuedWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(
        "INSERT INTO proposal_queued (
            id, chain_id, dao_code, governor_address, contract_address, log_index,
            transaction_index, proposal_id, eta_seconds, block_number, block_timestamp,
            transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9::NUMERIC(78, 0), $10::NUMERIC(78, 0),
            $11::NUMERIC(78, 0), $12
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
        "proposal_queued.log_index",
    )?)
    .bind(u64_to_i32(
        row.common.transaction_index,
        "proposal_queued.transaction_index",
    )?)
    .bind(&row.proposal_id)
    .bind(&row.eta_seconds)
    .bind(&row.common.block_number)
    .bind(required_numeric(
        &row.common.block_timestamp,
        "proposal_queued.block_timestamp",
    )?)
    .bind(&row.common.transaction_hash)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn insert_proposal_extended(
    transaction: &mut Transaction<'_, Postgres>,
    row: &ProposalExtendedWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(
        "INSERT INTO proposal_extended (
            id, chain_id, dao_code, governor_address, contract_address, log_index,
            transaction_index, proposal_id, extended_deadline, block_number, block_timestamp,
            transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9::NUMERIC(78, 0), $10::NUMERIC(78, 0),
            $11::NUMERIC(78, 0), $12
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
        "proposal_extended.log_index",
    )?)
    .bind(u64_to_i32(
        row.common.transaction_index,
        "proposal_extended.transaction_index",
    )?)
    .bind(&row.proposal_id)
    .bind(&row.extended_deadline)
    .bind(&row.common.block_number)
    .bind(required_numeric(
        &row.common.block_timestamp,
        "proposal_extended.block_timestamp",
    )?)
    .bind(&row.common.transaction_hash)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn insert_proposal_id_event(
    transaction: &mut Transaction<'_, Postgres>,
    table: &str,
    row: &ProposalIdWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    let sql = format!(
        "INSERT INTO {table} (
            id, chain_id, dao_code, governor_address, contract_address, log_index,
            transaction_index, proposal_id, block_number, block_timestamp, transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9::NUMERIC(78, 0), $10::NUMERIC(78, 0), $11
         )
         ON CONFLICT (id) DO NOTHING"
    );

    sqlx::query(&sql)
        .bind(&row.id)
        .bind(row.common.chain_id)
        .bind(&row.common.dao_code)
        .bind(&row.common.governor_address)
        .bind(&row.common.contract_address)
        .bind(u64_to_i32(row.common.log_index, "proposal_id.log_index")?)
        .bind(u64_to_i32(
            row.common.transaction_index,
            "proposal_id.transaction_index",
        )?)
        .bind(&row.proposal_id)
        .bind(&row.common.block_number)
        .bind(required_numeric(
            &row.common.block_timestamp,
            "proposal_id.block_timestamp",
        )?)
        .bind(&row.common.transaction_hash)
        .execute(&mut **transaction)
        .await?;

    Ok(())
}

const UPSERT_PROPOSAL_SQL: &str = "INSERT INTO proposal (
            id, contract_set_id, chain_id, dao_code, governor_address, contract_address, log_index,
            transaction_index, proposal_id, proposer, targets, values, signatures, calldatas,
            vote_start, vote_end, description, block_number, block_timestamp, transaction_hash,
            title, vote_start_timestamp, vote_end_timestamp, description_hash, proposal_snapshot,
            proposal_deadline, proposal_eta, queue_ready_at, queue_expires_at, block_interval,
            counting_mode, clock_mode, quorum, decimals, timelock_address
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
            $15::NUMERIC(78, 0), $16::NUMERIC(78, 0), $17, $18::NUMERIC(78, 0),
            $19::NUMERIC(78, 0), $20, $21, $22::NUMERIC(78, 0), $23::NUMERIC(78, 0),
            $24, $25::NUMERIC(78, 0), $26::NUMERIC(78, 0), $27::NUMERIC(78, 0),
            $28::NUMERIC(78, 0), $29::NUMERIC(78, 0), $30, $31, $32, $33::NUMERIC(78, 0),
            $34::NUMERIC(78, 0), $35
         )
         ON CONFLICT (id) DO UPDATE
         SET proposer = CASE WHEN EXCLUDED.proposer = '' THEN proposal.proposer ELSE EXCLUDED.proposer END,
             targets = CASE WHEN cardinality(EXCLUDED.targets) = 0 THEN proposal.targets ELSE EXCLUDED.targets END,
             values = CASE WHEN cardinality(EXCLUDED.values) = 0 THEN proposal.values ELSE EXCLUDED.values END,
             signatures = CASE WHEN cardinality(EXCLUDED.signatures) = 0 THEN proposal.signatures ELSE EXCLUDED.signatures END,
             calldatas = CASE WHEN cardinality(EXCLUDED.calldatas) = 0 THEN proposal.calldatas ELSE EXCLUDED.calldatas END,
             vote_start = GREATEST(proposal.vote_start, EXCLUDED.vote_start),
             vote_end = GREATEST(proposal.vote_end, EXCLUDED.vote_end),
             description = CASE WHEN EXCLUDED.description = '' THEN proposal.description ELSE EXCLUDED.description END,
             title = CASE WHEN EXCLUDED.title = '' THEN proposal.title ELSE EXCLUDED.title END,
             vote_start_timestamp = CASE WHEN EXCLUDED.vote_start_timestamp = 0::NUMERIC(78, 0) THEN proposal.vote_start_timestamp ELSE EXCLUDED.vote_start_timestamp END,
             vote_end_timestamp = CASE WHEN EXCLUDED.vote_end_timestamp = 0::NUMERIC(78, 0) THEN proposal.vote_end_timestamp ELSE EXCLUDED.vote_end_timestamp END,
             description_hash = CASE
                 WHEN EXCLUDED.proposer = '' AND EXCLUDED.description = '' THEN proposal.description_hash
                 ELSE COALESCE(EXCLUDED.description_hash, proposal.description_hash)
             END,
             proposal_snapshot = COALESCE(EXCLUDED.proposal_snapshot, proposal.proposal_snapshot),
             proposal_deadline = COALESCE(EXCLUDED.proposal_deadline, proposal.proposal_deadline),
             proposal_eta = COALESCE(EXCLUDED.proposal_eta, proposal.proposal_eta),
             queue_ready_at = COALESCE(EXCLUDED.queue_ready_at, proposal.queue_ready_at),
             queue_expires_at = COALESCE(EXCLUDED.queue_expires_at, proposal.queue_expires_at),
             counting_mode = COALESCE(EXCLUDED.counting_mode, proposal.counting_mode),
             block_interval = CASE
                 WHEN EXCLUDED.clock_mode <> 'blocknumber' THEN EXCLUDED.block_interval
                 ELSE COALESCE(EXCLUDED.block_interval, proposal.block_interval)
             END,
             clock_mode = CASE
                 WHEN EXCLUDED.proposer = '' AND EXCLUDED.clock_mode = 'blocknumber' AND proposal.clock_mode <> 'blocknumber' THEN proposal.clock_mode
                 ELSE EXCLUDED.clock_mode
             END,
             quorum = CASE WHEN EXCLUDED.quorum = 0::NUMERIC(78, 0) THEN proposal.quorum ELSE EXCLUDED.quorum END,
             decimals = CASE WHEN EXCLUDED.decimals = 0::NUMERIC(78, 0) THEN proposal.decimals ELSE EXCLUDED.decimals END,
             timelock_address = COALESCE(EXCLUDED.timelock_address, proposal.timelock_address)";

async fn upsert_proposal(
    transaction: &mut Transaction<'_, Postgres>,
    row: &ProposalWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    relink_existing_proposal_to_raw_id(transaction, row).await?;

    sqlx::query(UPSERT_PROPOSAL_SQL)
    .bind(&row.id)
    .bind(&row.contract_set_id)
    .bind(row.chain_id)
    .bind(&row.dao_code)
    .bind(&row.governor_address)
    .bind(&row.contract_address)
    .bind(u64_to_i32(row.log_index, "proposal.log_index")?)
    .bind(u64_to_i32(
        row.transaction_index,
        "proposal.transaction_index",
    )?)
    .bind(&row.proposal_id)
    .bind(&row.proposer)
    .bind(&row.targets)
    .bind(&row.values)
    .bind(&row.signatures)
    .bind(&row.calldatas)
    .bind(&row.vote_start)
    .bind(&row.vote_end)
    .bind(&row.description)
    .bind(&row.block_number)
    .bind(required_numeric(
        &row.block_timestamp,
        "proposal.block_timestamp",
    )?)
    .bind(&row.transaction_hash)
    .bind(&row.title)
    .bind(&row.vote_start_timestamp)
    .bind(&row.vote_end_timestamp)
    .bind(&row.description_hash)
    .bind(row.proposal_snapshot.as_deref())
    .bind(row.proposal_deadline.as_deref())
    .bind(row.proposal_eta.as_deref())
    .bind(row.queue_ready_at.as_deref())
    .bind(row.queue_expires_at.as_deref())
    .bind(row.block_interval.as_deref())
    .bind(row.counting_mode.as_deref())
    .bind(&row.clock_mode)
    .bind(&row.quorum)
    .bind(&row.decimals)
    .bind(row.timelock_address.as_deref())
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn relink_existing_proposal_to_raw_id(
    transaction: &mut Transaction<'_, Postgres>,
    row: &ProposalWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(
        "UPDATE proposal
         SET id = $1
         WHERE contract_set_id = $2
           AND chain_id IS NOT DISTINCT FROM $3
           AND governor_address IS NOT DISTINCT FROM $4
           AND proposal_id = $5
           AND id <> $1",
    )
    .bind(&row.id)
    .bind(&row.contract_set_id)
    .bind(row.chain_id)
    .bind(&row.governor_address)
    .bind(&row.proposal_id)
    .execute(&mut **transaction)
    .await?;

    for table in [
        "proposal_action",
        "proposal_state_epoch",
        "proposal_deadline_extension",
    ] {
        let sql = format!(
            "UPDATE {table}
             SET proposal_id = $1
             WHERE proposal_ref = $1
               AND proposal_id <> $1"
        );
        sqlx::query(&sql)
            .bind(&row.id)
            .execute(&mut **transaction)
            .await?;
    }

    Ok(())
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalTitleRefreshCandidate {
    pub id: String,
    pub description: String,
    pub title: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalTitleRefreshUpdate {
    pub id: String,
    pub description: String,
    pub previous_title: String,
    pub title: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalReferenceFieldCandidate {
    pub id: String,
    pub proposal_id: String,
    pub title: String,
    pub block_interval: Option<String>,
    pub clock_mode: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalReferenceFieldUpdate {
    pub id: String,
    pub previous_title: String,
    pub previous_block_interval: Option<String>,
    pub previous_clock_mode: String,
    pub title: String,
    pub clock_mode: String,
    pub block_interval: Option<String>,
}

pub async fn read_proposal_title_refresh_candidates(
    pool: &PgPool,
    dao_code: &str,
) -> Result<Vec<ProposalTitleRefreshCandidate>, PostgresIndexerRunnerStoreError> {
    let rows = sqlx::query(
        "SELECT id, description, title
         FROM proposal
         WHERE dao_code = $1
         ORDER BY block_number, transaction_index, log_index, id",
    )
    .bind(dao_code)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| ProposalTitleRefreshCandidate {
            id: row.get("id"),
            description: row.get("description"),
            title: row.get("title"),
        })
        .collect())
}

const UPDATE_PROPOSAL_TITLES_SQL_PREFIX: &str =
    "UPDATE proposal SET title = proposal_title_refresh.title FROM (";
const UPDATE_PROPOSAL_TITLES_CHUNK_SIZE: usize = 5_000;

pub async fn update_proposal_titles(
    pool: &PgPool,
    dao_code: &str,
    updates: &[ProposalTitleRefreshUpdate],
) -> Result<u64, PostgresIndexerRunnerStoreError> {
    if updates.is_empty() {
        return Ok(0);
    }

    let mut rows_affected = 0;
    for update_chunk in updates.chunks(UPDATE_PROPOSAL_TITLES_CHUNK_SIZE) {
        rows_affected += update_proposal_title_chunk(pool, dao_code, update_chunk).await?;
    }

    Ok(rows_affected)
}

async fn update_proposal_title_chunk(
    pool: &PgPool,
    dao_code: &str,
    updates: &[ProposalTitleRefreshUpdate],
) -> Result<u64, PostgresIndexerRunnerStoreError> {
    let mut builder: QueryBuilder<Postgres> = QueryBuilder::new(UPDATE_PROPOSAL_TITLES_SQL_PREFIX);
    builder.push_values(updates, |mut row, update| {
        row.push_bind(&update.id)
            .push_bind(&update.description)
            .push_bind(&update.previous_title)
            .push_bind(&update.title);
    });
    builder.push(
        ") AS proposal_title_refresh(id, description, previous_title, title)
         WHERE proposal.id = proposal_title_refresh.id
           AND proposal.description = proposal_title_refresh.description
           AND proposal.title = proposal_title_refresh.previous_title
           AND proposal.dao_code = ",
    );
    builder.push_bind(dao_code);
    builder.push(" AND proposal.title IS DISTINCT FROM proposal_title_refresh.title");

    let result = builder.build().execute(pool).await?;
    Ok(result.rows_affected())
}

pub async fn read_proposal_reference_field_candidates(
    pool: &PgPool,
    dao_code: &str,
) -> Result<Vec<ProposalReferenceFieldCandidate>, PostgresIndexerRunnerStoreError> {
    let rows = sqlx::query(
        "SELECT id, proposal_id, title, block_interval, clock_mode
         FROM proposal
         WHERE dao_code = $1
         ORDER BY block_number, transaction_index, log_index, id",
    )
    .bind(dao_code)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| ProposalReferenceFieldCandidate {
            id: row.get("id"),
            proposal_id: row.get("proposal_id"),
            title: row.get("title"),
            block_interval: row.get("block_interval"),
            clock_mode: row.get("clock_mode"),
        })
        .collect())
}

const UPDATE_PROPOSAL_REFERENCE_FIELDS_SQL_PREFIX: &str =
    "UPDATE proposal SET title = proposal_reference_fields.title,
         block_interval = proposal_reference_fields.block_interval,
         clock_mode = proposal_reference_fields.clock_mode
     FROM (";
const UPDATE_PROPOSAL_REFERENCE_FIELDS_CHUNK_SIZE: usize = 5_000;

pub async fn update_proposal_reference_fields(
    pool: &PgPool,
    dao_code: &str,
    updates: &[ProposalReferenceFieldUpdate],
) -> Result<u64, PostgresIndexerRunnerStoreError> {
    if updates.is_empty() {
        return Ok(0);
    }

    let mut rows_affected = 0;
    for update_chunk in updates.chunks(UPDATE_PROPOSAL_REFERENCE_FIELDS_CHUNK_SIZE) {
        rows_affected += update_proposal_reference_field_chunk(pool, dao_code, update_chunk).await?;
    }

    Ok(rows_affected)
}

async fn update_proposal_reference_field_chunk(
    pool: &PgPool,
    dao_code: &str,
    updates: &[ProposalReferenceFieldUpdate],
) -> Result<u64, PostgresIndexerRunnerStoreError> {
    let mut builder: QueryBuilder<Postgres> =
        QueryBuilder::new(UPDATE_PROPOSAL_REFERENCE_FIELDS_SQL_PREFIX);
    builder.push_values(updates, |mut row, update| {
        row.push_bind(&update.id)
            .push_bind(&update.previous_title)
            .push_bind(&update.previous_block_interval)
            .push_bind(&update.previous_clock_mode)
            .push_bind(&update.title)
            .push_bind(&update.clock_mode)
            .push_bind(&update.block_interval);
    });
    builder.push(
        ") AS proposal_reference_fields(
            id, previous_title, previous_block_interval, previous_clock_mode,
            title, clock_mode, block_interval
         )
         WHERE proposal.id = proposal_reference_fields.id
           AND proposal.title = proposal_reference_fields.previous_title
           AND proposal.block_interval IS NOT DISTINCT FROM proposal_reference_fields.previous_block_interval
           AND proposal.clock_mode = proposal_reference_fields.previous_clock_mode
           AND proposal.dao_code = ",
    );
    builder.push_bind(dao_code);
    builder.push(
        " AND (
            proposal.title IS DISTINCT FROM proposal_reference_fields.title
            OR proposal.clock_mode IS DISTINCT FROM proposal_reference_fields.clock_mode
            OR proposal.block_interval IS DISTINCT FROM proposal_reference_fields.block_interval
         )",
    );

    let result = builder.build().execute(pool).await?;
    Ok(result.rows_affected())
}

pub async fn read_proposal_timestamp_backfill_candidates(
    pool: &PgPool,
    identity: &IndexerCheckpointIdentity,
    processed_height: i64,
    batch_size: usize,
) -> Result<Vec<ProposalTimestampBackfillCandidate>, PostgresIndexerRunnerStoreError> {
    if batch_size == 0 {
        return Ok(Vec::new());
    }

    let rows = sqlx::query(
        "SELECT id, chain_id, governor_address, clock_mode,
                vote_start::TEXT AS vote_start,
                vote_end::TEXT AS vote_end,
                vote_start_timestamp::TEXT AS vote_start_timestamp,
                vote_end_timestamp::TEXT AS vote_end_timestamp
         FROM proposal
         WHERE dao_code = $1
           AND contract_set_id = $2
           AND chain_id = $3
           AND clock_mode = 'blocknumber'
           AND (
                (
                    vote_start <= $4::NUMERIC(78, 0)
                    AND vote_start_timestamp_resolved = FALSE
                )
                OR (
                    vote_end <= $4::NUMERIC(78, 0)
                    AND vote_end_timestamp_resolved = FALSE
                )
           )
         ORDER BY block_number, transaction_index, log_index, id
         LIMIT $5",
    )
    .bind(&identity.dao_code)
    .bind(&identity.contract_set_id)
    .bind(identity.chain_id)
    .bind(processed_height.to_string())
    .bind(i64::try_from(batch_size).unwrap_or(i64::MAX))
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| ProposalTimestampBackfillCandidate {
            proposal_ref: row.get("id"),
            chain_id: row.get("chain_id"),
            governor_address: row.get("governor_address"),
            clock_mode: row.get("clock_mode"),
            vote_start: row.get("vote_start"),
            vote_end: row.get("vote_end"),
            vote_start_timestamp: row.get("vote_start_timestamp"),
            vote_end_timestamp: row.get("vote_end_timestamp"),
        })
        .collect())
}

pub async fn update_proposal_timestamp_backfill(
    pool: &PgPool,
    updates: &[ProposalTimestampBackfillUpdate],
) -> Result<u64, PostgresIndexerRunnerStoreError> {
    if updates.is_empty() {
        return Ok(0);
    }

    let proposal_rows = update_proposal_timestamp_backfill_proposals(pool, updates).await?;
    let state_epoch_rows = update_proposal_timestamp_backfill_state_epochs(pool, updates).await?;

    Ok(proposal_rows + state_epoch_rows)
}

const UPDATE_PROPOSAL_TIMESTAMP_BACKFILL_SQL_PREFIX: &str =
    "UPDATE proposal SET
         vote_start_timestamp = COALESCE(proposal_timestamp_backfill.vote_start_timestamp::NUMERIC(78, 0), proposal.vote_start_timestamp),
         vote_end_timestamp = COALESCE(proposal_timestamp_backfill.vote_end_timestamp::NUMERIC(78, 0), proposal.vote_end_timestamp),
         vote_start_timestamp_resolved = proposal.vote_start_timestamp_resolved OR proposal_timestamp_backfill.vote_start_timestamp IS NOT NULL,
         vote_end_timestamp_resolved = proposal.vote_end_timestamp_resolved OR proposal_timestamp_backfill.vote_end_timestamp IS NOT NULL
     FROM (";

async fn update_proposal_timestamp_backfill_proposals(
    pool: &PgPool,
    updates: &[ProposalTimestampBackfillUpdate],
) -> Result<u64, PostgresIndexerRunnerStoreError> {
    let mut builder: QueryBuilder<Postgres> =
        QueryBuilder::new(UPDATE_PROPOSAL_TIMESTAMP_BACKFILL_SQL_PREFIX);
    builder.push_values(updates, |mut row, update| {
        row.push_bind(&update.proposal_ref)
            .push_bind(update.vote_start_timestamp.as_deref())
            .push_bind(update.vote_end_timestamp.as_deref());
    });
    builder.push(
        ") AS proposal_timestamp_backfill(id, vote_start_timestamp, vote_end_timestamp)
         WHERE proposal.id = proposal_timestamp_backfill.id
           AND (
                (
                    proposal_timestamp_backfill.vote_start_timestamp IS NOT NULL
                    AND (
                        proposal.vote_start_timestamp IS DISTINCT FROM proposal_timestamp_backfill.vote_start_timestamp::NUMERIC(78, 0)
                        OR proposal.vote_start_timestamp_resolved = FALSE
                    )
                )
                OR (
                    proposal_timestamp_backfill.vote_end_timestamp IS NOT NULL
                    AND (
                        proposal.vote_end_timestamp IS DISTINCT FROM proposal_timestamp_backfill.vote_end_timestamp::NUMERIC(78, 0)
                        OR proposal.vote_end_timestamp_resolved = FALSE
                    )
                )
           )",
    );

    let result = builder.build().execute(pool).await?;
    Ok(result.rows_affected())
}

const UPDATE_PROPOSAL_STATE_EPOCH_TIMESTAMP_BACKFILL_SQL_PREFIX: &str =
    "UPDATE proposal_state_epoch SET
         start_block_timestamp = CASE
             WHEN proposal_timestamp_backfill.vote_start_timestamp IS NOT NULL
                  AND proposal_state_epoch.start_timepoint = proposal.vote_start
                 THEN proposal_timestamp_backfill.vote_start_timestamp::NUMERIC(78, 0)
             WHEN proposal_timestamp_backfill.vote_end_timestamp IS NOT NULL
                  AND proposal_state_epoch.start_timepoint = proposal.vote_end
                 THEN proposal_timestamp_backfill.vote_end_timestamp::NUMERIC(78, 0)
             ELSE proposal_state_epoch.start_block_timestamp
         END,
         end_block_timestamp = CASE
             WHEN proposal_timestamp_backfill.vote_start_timestamp IS NOT NULL
                  AND proposal_state_epoch.end_timepoint = proposal.vote_start
                 THEN proposal_timestamp_backfill.vote_start_timestamp::NUMERIC(78, 0)
             WHEN proposal_timestamp_backfill.vote_end_timestamp IS NOT NULL
                  AND proposal_state_epoch.end_timepoint = proposal.vote_end
                 THEN proposal_timestamp_backfill.vote_end_timestamp::NUMERIC(78, 0)
             ELSE proposal_state_epoch.end_block_timestamp
         END
     FROM (";

async fn update_proposal_timestamp_backfill_state_epochs(
    pool: &PgPool,
    updates: &[ProposalTimestampBackfillUpdate],
) -> Result<u64, PostgresIndexerRunnerStoreError> {
    let mut builder: QueryBuilder<Postgres> =
        QueryBuilder::new(UPDATE_PROPOSAL_STATE_EPOCH_TIMESTAMP_BACKFILL_SQL_PREFIX);
    builder.push_values(updates, |mut row, update| {
        row.push_bind(&update.proposal_ref)
            .push_bind(update.vote_start_timestamp.as_deref())
            .push_bind(update.vote_end_timestamp.as_deref());
    });
    builder.push(
        ") AS proposal_timestamp_backfill(proposal_ref, vote_start_timestamp, vote_end_timestamp)
         JOIN proposal ON proposal.id = proposal_timestamp_backfill.proposal_ref
         WHERE proposal_state_epoch.proposal_ref = proposal_timestamp_backfill.proposal_ref
           AND (
                (
                    proposal_timestamp_backfill.vote_start_timestamp IS NOT NULL
                    AND (
                        proposal_state_epoch.start_timepoint = proposal.vote_start
                        OR proposal_state_epoch.end_timepoint = proposal.vote_start
                    )
                )
                OR (
                    proposal_timestamp_backfill.vote_end_timestamp IS NOT NULL
                    AND (
                        proposal_state_epoch.start_timepoint = proposal.vote_end
                        OR proposal_state_epoch.end_timepoint = proposal.vote_end
                    )
                )
           )",
    );

    let result = builder.build().execute(pool).await?;
    Ok(result.rows_affected())
}

async fn insert_proposal_action(
    transaction: &mut Transaction<'_, Postgres>,
    row: &ProposalActionWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(
        "INSERT INTO proposal_action (
            id, chain_id, dao_code, governor_address, contract_address, log_index,
            transaction_index, proposal_id, proposal_ref, action_index, target, value,
            signature, calldata, block_number, block_timestamp, transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
            $15::NUMERIC(78, 0), $16::NUMERIC(78, 0), $17
         )
         ON CONFLICT (id) DO NOTHING",
    )
    .bind(&row.id)
    .bind(row.chain_id)
    .bind(&row.dao_code)
    .bind(&row.governor_address)
    .bind(&row.contract_address)
    .bind(u64_to_i32(row.log_index, "proposal_action.log_index")?)
    .bind(u64_to_i32(
        row.transaction_index,
        "proposal_action.transaction_index",
    )?)
    .bind(&row.proposal_id)
    .bind(&row.proposal_ref)
    .bind(usize_to_i32(
        row.action_index,
        "proposal_action.action_index",
    )?)
    .bind(&row.target)
    .bind(&row.value)
    .bind(&row.signature)
    .bind(&row.calldata)
    .bind(&row.block_number)
    .bind(required_numeric(
        &row.block_timestamp,
        "proposal_action.block_timestamp",
    )?)
    .bind(&row.transaction_hash)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn insert_proposal_state_epoch(
    transaction: &mut Transaction<'_, Postgres>,
    row: &ProposalStateEpochWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(
        "INSERT INTO proposal_state_epoch (
            id, chain_id, dao_code, governor_address, contract_address, log_index,
            transaction_index, proposal_id, proposal_ref, state, start_timepoint, end_timepoint,
            start_block_number, start_block_timestamp, end_block_number, end_block_timestamp,
            transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::NUMERIC(78, 0),
            $12::NUMERIC(78, 0), $13::NUMERIC(78, 0), $14::NUMERIC(78, 0),
            $15::NUMERIC(78, 0), $16::NUMERIC(78, 0), $17
         )
         ON CONFLICT (id) DO NOTHING",
    )
    .bind(&row.id)
    .bind(row.chain_id)
    .bind(&row.dao_code)
    .bind(&row.governor_address)
    .bind(&row.contract_address)
    .bind(u64_to_i32(row.log_index, "proposal_state_epoch.log_index")?)
    .bind(u64_to_i32(
        row.transaction_index,
        "proposal_state_epoch.transaction_index",
    )?)
    .bind(&row.proposal_id)
    .bind(&row.proposal_ref)
    .bind(&row.state)
    .bind(row.start_timepoint.as_deref())
    .bind(row.end_timepoint.as_deref())
    .bind(row.start_block_number.as_deref())
    .bind(row.start_block_timestamp.as_deref())
    .bind(row.end_block_number.as_deref())
    .bind(row.end_block_timestamp.as_deref())
    .bind(&row.transaction_hash)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn insert_proposal_deadline_extension(
    transaction: &mut Transaction<'_, Postgres>,
    row: &ProposalDeadlineExtensionWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(
        "INSERT INTO proposal_deadline_extension (
            id, chain_id, dao_code, governor_address, contract_address, log_index,
            transaction_index, proposal_id, proposal_ref, previous_deadline, new_deadline,
            block_number, block_timestamp, transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::NUMERIC(78, 0),
            $11::NUMERIC(78, 0), $12::NUMERIC(78, 0), $13::NUMERIC(78, 0), $14
         )
         ON CONFLICT (id) DO NOTHING",
    )
    .bind(&row.id)
    .bind(row.chain_id)
    .bind(&row.dao_code)
    .bind(&row.governor_address)
    .bind(&row.contract_address)
    .bind(u64_to_i32(
        row.log_index,
        "proposal_deadline_extension.log_index",
    )?)
    .bind(u64_to_i32(
        row.transaction_index,
        "proposal_deadline_extension.transaction_index",
    )?)
    .bind(&row.proposal_id)
    .bind(&row.proposal_ref)
    .bind(row.previous_deadline.as_deref())
    .bind(&row.new_deadline)
    .bind(&row.block_number)
    .bind(required_numeric(
        &row.block_timestamp,
        "proposal_deadline_extension.block_timestamp",
    )?)
    .bind(&row.transaction_hash)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn insert_governor_parameter_change(
    transaction: &mut Transaction<'_, Postgres>,
    table: &str,
    old_column: &str,
    new_column: &str,
    row: &GovernorParameterChangeWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    let sql = format!(
        "INSERT INTO {table} (
            id, chain_id, dao_code, governor_address, contract_address, log_index,
            transaction_index, {old_column}, {new_column}, block_number, block_timestamp,
            transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8::NUMERIC(78, 0), $9::NUMERIC(78, 0),
            $10::NUMERIC(78, 0), $11::NUMERIC(78, 0), $12
         )
         ON CONFLICT (id) DO NOTHING"
    );

    sqlx::query(&sql)
        .bind(&row.id)
        .bind(row.common.chain_id)
        .bind(&row.common.dao_code)
        .bind(&row.common.governor_address)
        .bind(&row.common.contract_address)
        .bind(u64_to_i32(
            row.common.log_index,
            "governor_parameter_change.log_index",
        )?)
        .bind(u64_to_i32(
            row.common.transaction_index,
            "governor_parameter_change.transaction_index",
        )?)
        .bind(&row.old_value)
        .bind(&row.new_value)
        .bind(&row.common.block_number)
        .bind(required_numeric(
            &row.common.block_timestamp,
            "governor_parameter_change.block_timestamp",
        )?)
        .bind(&row.common.transaction_hash)
        .execute(&mut **transaction)
        .await?;

    Ok(())
}

async fn insert_governor_timelock_change(
    transaction: &mut Transaction<'_, Postgres>,
    row: &GovernorTimelockChangeWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(
        "INSERT INTO timelock_change (
            id, chain_id, dao_code, governor_address, contract_address, log_index,
            transaction_index, old_timelock, new_timelock, block_number, block_timestamp,
            transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::NUMERIC(78, 0),
            $11::NUMERIC(78, 0), $12
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
        "timelock_change.log_index",
    )?)
    .bind(u64_to_i32(
        row.common.transaction_index,
        "timelock_change.transaction_index",
    )?)
    .bind(&row.old_timelock)
    .bind(&row.new_timelock)
    .bind(&row.common.block_number)
    .bind(required_numeric(
        &row.common.block_timestamp,
        "timelock_change.block_timestamp",
    )?)
    .bind(&row.common.transaction_hash)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn insert_governance_parameter_checkpoint(
    transaction: &mut Transaction<'_, Postgres>,
    row: &GovernanceParameterCheckpointWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(
        "INSERT INTO governance_parameter_checkpoint (
            id, chain_id, dao_code, governor_address, contract_address, log_index,
            transaction_index, event_name, parameter_name, value_type, old_value, new_value,
            block_number, block_timestamp, transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
            $13::NUMERIC(78, 0), $14::NUMERIC(78, 0), $15
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
        "governance_parameter_checkpoint.log_index",
    )?)
    .bind(u64_to_i32(
        row.common.transaction_index,
        "governance_parameter_checkpoint.transaction_index",
    )?)
    .bind(&row.event_name)
    .bind(&row.parameter_name)
    .bind(&row.value_type)
    .bind(row.old_value.as_deref())
    .bind(&row.new_value)
    .bind(&row.common.block_number)
    .bind(required_numeric(
        &row.common.block_timestamp,
        "governance_parameter_checkpoint.block_timestamp",
    )?)
    .bind(&row.common.transaction_hash)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

#[cfg(test)]
mod proposal_tests {
    use super::*;

    #[test]
    fn test_upsert_proposal_preserves_existing_quorum_and_decimals_when_excluded_zero() {
        assert!(UPSERT_PROPOSAL_SQL.contains(
            "quorum = CASE WHEN EXCLUDED.quorum = 0::NUMERIC(78, 0) THEN proposal.quorum ELSE EXCLUDED.quorum END"
        ));
        assert!(UPSERT_PROPOSAL_SQL.contains(
            "decimals = CASE WHEN EXCLUDED.decimals = 0::NUMERIC(78, 0) THEN proposal.decimals ELSE EXCLUDED.decimals END"
        ));
    }

    #[test]
    fn test_update_proposal_titles_is_scoped_to_dao_and_title_only() {
        assert!(UPDATE_PROPOSAL_TITLES_SQL_PREFIX.contains("UPDATE proposal SET title"));
        assert!(UPDATE_PROPOSAL_TITLES_SQL_PREFIX.contains("FROM ("));
    }
}
