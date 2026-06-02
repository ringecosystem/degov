use std::{fmt, future::Future};

use sqlx::{PgPool, Postgres, Row, Transaction};

use crate::{
    CheckpointRepository, ContributorVoteSignalWrite, DelegateChangedWrite, DelegateRollingWrite,
    DelegateVotesChangedWrite, GovernanceTokenStandard, IndexerCheckpoint,
    IndexerCheckpointIdentity, IndexerProjectionBatch, IndexerRunnerStore,
    IndexerRunnerTransaction, PowerReconcileCandidate, ProposalActionWrite, ProposalCreatedWrite,
    ProposalDeadlineExtensionWrite, ProposalExtendedWrite, ProposalIdWrite,
    ProposalProjectionBatch, ProposalQueuedWrite, ProposalStateEpochWrite, ProposalVoteTotalWrite,
    ProposalWrite, TimelockCallWrite, TimelockMinDelayChangeWrite, TimelockOperationHintWrite,
    TimelockOperationWrite, TimelockProjectionBatch, TimelockRoleEventWrite, TokenEventCommon,
    TokenProjectionBatch, TokenProjectionOperation, TokenTransferWrite, VoteCastGroupWrite,
    VoteCastWithParamsWrite, VoteCastWrite, VoteProjectionBatch,
};

#[derive(Clone)]
pub struct PostgresIndexerRunnerStore {
    pool: PgPool,
    checkpoint_repository: CheckpointRepository,
}

impl PostgresIndexerRunnerStore {
    pub fn new(pool: PgPool) -> Self {
        Self {
            checkpoint_repository: CheckpointRepository::new(pool.clone()),
            pool,
        }
    }
}

impl IndexerRunnerStore for PostgresIndexerRunnerStore {
    type Error = PostgresIndexerRunnerStoreError;
    type Transaction<'a> = PostgresIndexerRunnerTransaction<'a>;

    fn read_or_create_checkpoint(
        &mut self,
        identity: &IndexerCheckpointIdentity,
        start_block: i64,
    ) -> Result<IndexerCheckpoint, Self::Error> {
        block_on_runtime(
            self.checkpoint_repository
                .read_or_create(identity, start_block),
        )
        .map_err(PostgresIndexerRunnerStoreError::from)
    }

    fn begin_transaction(&mut self) -> Result<Self::Transaction<'_>, Self::Error> {
        let transaction = block_on_runtime(self.pool.begin())?;

        Ok(PostgresIndexerRunnerTransaction {
            transaction: Some(transaction),
            checkpoint_repository: self.checkpoint_repository.clone(),
        })
    }
}

pub struct PostgresIndexerRunnerTransaction<'a> {
    transaction: Option<Transaction<'a, Postgres>>,
    checkpoint_repository: CheckpointRepository,
}

impl IndexerRunnerTransaction for PostgresIndexerRunnerTransaction<'_> {
    type Error = PostgresIndexerRunnerStoreError;

    fn apply_projection_batch(
        &mut self,
        batch: &IndexerProjectionBatch,
    ) -> Result<(), Self::Error> {
        let transaction = self
            .transaction
            .as_mut()
            .ok_or_else(|| PostgresIndexerRunnerStoreError::new("transaction is closed"))?;

        block_on_runtime(write_projection_batch(transaction, batch))
    }

    fn advance_checkpoint(
        &mut self,
        identity: &IndexerCheckpointIdentity,
        processed_height: i64,
        target_height: Option<i64>,
    ) -> Result<(), Self::Error> {
        let transaction = self
            .transaction
            .as_mut()
            .ok_or_else(|| PostgresIndexerRunnerStoreError::new("transaction is closed"))?;

        block_on_runtime(self.checkpoint_repository.advance_after_projection(
            transaction,
            identity,
            processed_height,
            target_height,
        ))
        .map_err(PostgresIndexerRunnerStoreError::from)
    }

    fn commit(mut self) -> Result<(), Self::Error> {
        let transaction = self
            .transaction
            .take()
            .ok_or_else(|| PostgresIndexerRunnerStoreError::new("transaction is closed"))?;

        block_on_runtime(transaction.commit()).map_err(PostgresIndexerRunnerStoreError::from)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PostgresIndexerRunnerStoreError {
    message: String,
}

impl PostgresIndexerRunnerStoreError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for PostgresIndexerRunnerStoreError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl From<sqlx::Error> for PostgresIndexerRunnerStoreError {
    fn from(error: sqlx::Error) -> Self {
        Self::new(format!("Postgres runner store error: {error}"))
    }
}

impl From<crate::CheckpointError> for PostgresIndexerRunnerStoreError {
    fn from(error: crate::CheckpointError) -> Self {
        Self::new(format!("Postgres runner checkpoint error: {error}"))
    }
}

fn block_on_runtime<F>(future: F) -> F::Output
where
    F: Future,
{
    tokio::task::block_in_place(|| tokio::runtime::Handle::current().block_on(future))
}

async fn write_projection_batch(
    transaction: &mut Transaction<'_, Postgres>,
    batch: &IndexerProjectionBatch,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    if let Some(batch) = &batch.proposal {
        write_proposal_batch(transaction, batch).await?;
    }
    if let Some(batch) = &batch.vote {
        write_vote_batch(transaction, batch).await?;
    }
    if let Some(batch) = &batch.token {
        write_token_batch(transaction, batch).await?;
    }
    if let Some(batch) = &batch.timelock {
        write_timelock_batch(transaction, batch).await?;
    }

    Ok(())
}

async fn write_proposal_batch(
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

    Ok(())
}

async fn write_vote_batch(
    transaction: &mut Transaction<'_, Postgres>,
    batch: &VoteProjectionBatch,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    for row in &batch.vote_cast {
        insert_vote_cast(transaction, row).await?;
    }
    for row in &batch.vote_cast_with_params {
        insert_vote_cast_with_params(transaction, row).await?;
    }
    for row in &batch.vote_cast_groups {
        upsert_vote_cast_group(transaction, row).await?;
    }
    for row in &batch.proposal_vote_totals {
        refresh_proposal_vote_totals(transaction, row).await?;
    }
    for row in &batch.contributor_vote_signals {
        upsert_contributor_vote_signal(transaction, row).await?;
    }
    refresh_vote_data_metric(transaction, &batch.contributor_vote_signals).await?;

    Ok(())
}

async fn write_token_batch(
    transaction: &mut Transaction<'_, Postgres>,
    batch: &TokenProjectionBatch,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    let mut inserted_operation_ids = Vec::new();

    for row in &batch.delegate_changed {
        if insert_delegate_changed(transaction, row).await? {
            inserted_operation_ids.push(row.id.as_str());
        }
    }
    for row in &batch.delegate_votes_changed {
        if insert_delegate_votes_changed(transaction, row).await? {
            inserted_operation_ids.push(row.id.as_str());
        }
    }
    for row in &batch.token_transfers {
        if insert_token_transfer(transaction, row).await? {
            inserted_operation_ids.push(row.id.as_str());
        }
    }
    for row in &batch.delegate_rollings {
        upsert_delegate_rolling(transaction, row).await?;
    }
    for row in &batch.delegate_votes_changed {
        insert_vote_power_checkpoint(transaction, row).await?;
    }
    for operation in &batch.operations {
        if inserted_operation_ids
            .iter()
            .any(|inserted_id| *inserted_id == token_operation_id(operation))
        {
            apply_token_operation(transaction, operation).await?;
        }
    }
    for candidate in &batch.reconcile_plan.candidates {
        upsert_onchain_refresh_task(transaction, candidate).await?;
    }

    Ok(())
}

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

async fn upsert_proposal(
    transaction: &mut Transaction<'_, Postgres>,
    row: &ProposalWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    if !row.proposer.is_empty() {
        relink_existing_proposal_to_raw_id(transaction, row).await?;
    }

    let proposal_ref = resolve_proposal_ref(
        transaction,
        row.chain_id,
        &row.governor_address,
        &row.proposal_id,
        &row.id,
    )
    .await?;

    sqlx::query(
        "INSERT INTO proposal (
            id, chain_id, dao_code, governor_address, contract_address, log_index,
            transaction_index, proposal_id, proposer, targets, values, signatures, calldatas,
            vote_start, vote_end, description, block_number, block_timestamp, transaction_hash,
            title, vote_start_timestamp, vote_end_timestamp, description_hash, proposal_snapshot,
            proposal_deadline, proposal_eta, queue_ready_at, queue_expires_at, clock_mode, quorum,
            decimals
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
            $14::NUMERIC(78, 0), $15::NUMERIC(78, 0), $16, $17::NUMERIC(78, 0),
            $18::NUMERIC(78, 0), $19, $20, $21::NUMERIC(78, 0), $22::NUMERIC(78, 0),
            $23, $24::NUMERIC(78, 0), $25::NUMERIC(78, 0), $26::NUMERIC(78, 0),
            $27::NUMERIC(78, 0), $28::NUMERIC(78, 0), $29, $30::NUMERIC(78, 0),
            $31::NUMERIC(78, 0)
         )
         ON CONFLICT (id) DO UPDATE
         SET proposer = CASE WHEN EXCLUDED.proposer = '' THEN proposal.proposer ELSE EXCLUDED.proposer END,
             log_index = CASE WHEN EXCLUDED.proposer = '' THEN proposal.log_index ELSE EXCLUDED.log_index END,
             transaction_index = CASE WHEN EXCLUDED.proposer = '' THEN proposal.transaction_index ELSE EXCLUDED.transaction_index END,
             targets = CASE WHEN cardinality(EXCLUDED.targets) = 0 THEN proposal.targets ELSE EXCLUDED.targets END,
             values = CASE WHEN cardinality(EXCLUDED.values) = 0 THEN proposal.values ELSE EXCLUDED.values END,
             signatures = CASE WHEN cardinality(EXCLUDED.signatures) = 0 THEN proposal.signatures ELSE EXCLUDED.signatures END,
             calldatas = CASE WHEN cardinality(EXCLUDED.calldatas) = 0 THEN proposal.calldatas ELSE EXCLUDED.calldatas END,
             vote_start = GREATEST(proposal.vote_start, EXCLUDED.vote_start),
             vote_end = GREATEST(proposal.vote_end, EXCLUDED.vote_end),
             description = CASE WHEN EXCLUDED.description = '' THEN proposal.description ELSE EXCLUDED.description END,
             block_number = CASE WHEN EXCLUDED.proposer = '' THEN proposal.block_number ELSE EXCLUDED.block_number END,
             block_timestamp = CASE WHEN EXCLUDED.proposer = '' THEN proposal.block_timestamp ELSE EXCLUDED.block_timestamp END,
             transaction_hash = CASE WHEN EXCLUDED.proposer = '' THEN proposal.transaction_hash ELSE EXCLUDED.transaction_hash END,
             title = CASE WHEN EXCLUDED.title = '' THEN proposal.title ELSE EXCLUDED.title END,
             vote_start_timestamp = CASE WHEN EXCLUDED.proposer = '' THEN proposal.vote_start_timestamp ELSE EXCLUDED.vote_start_timestamp END,
             vote_end_timestamp = CASE WHEN EXCLUDED.proposer = '' THEN proposal.vote_end_timestamp ELSE EXCLUDED.vote_end_timestamp END,
             description_hash = COALESCE(EXCLUDED.description_hash, proposal.description_hash),
             proposal_snapshot = COALESCE(EXCLUDED.proposal_snapshot, proposal.proposal_snapshot),
             proposal_deadline = CASE
               WHEN EXCLUDED.proposer <> ''
                    AND proposal.proposal_deadline IS NOT NULL
                    AND EXCLUDED.proposal_deadline IS NOT NULL
                    AND proposal.proposal_deadline > EXCLUDED.proposal_deadline
                 THEN proposal.proposal_deadline
               ELSE COALESCE(EXCLUDED.proposal_deadline, proposal.proposal_deadline)
             END,
             proposal_eta = CASE
               WHEN EXCLUDED.proposal_eta = 0
                    AND proposal.proposal_eta IS NOT NULL
                    AND proposal.proposal_eta <> 0
                 THEN proposal.proposal_eta
               ELSE COALESCE(EXCLUDED.proposal_eta, proposal.proposal_eta)
             END,
             queue_ready_at = COALESCE(EXCLUDED.queue_ready_at, proposal.queue_ready_at),
             queue_expires_at = COALESCE(EXCLUDED.queue_expires_at, proposal.queue_expires_at),
             clock_mode = EXCLUDED.clock_mode,
             quorum = EXCLUDED.quorum,
             decimals = EXCLUDED.decimals",
    )
    .bind(&proposal_ref)
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
    .bind(&row.clock_mode)
    .bind(&row.quorum)
    .bind(&row.decimals)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn resolve_proposal_ref(
    transaction: &mut Transaction<'_, Postgres>,
    chain_id: i32,
    governor_address: &str,
    proposal_id: &str,
    fallback: &str,
) -> Result<String, PostgresIndexerRunnerStoreError> {
    if let Some(row) = sqlx::query("SELECT id FROM proposal WHERE id = $1")
        .bind(fallback)
        .fetch_optional(&mut **transaction)
        .await?
    {
        return Ok(row.get::<String, _>("id"));
    }

    let proposal_id =
        proposal_lookup_id_from_ref(chain_id, governor_address, fallback).unwrap_or(proposal_id);
    let row = sqlx::query(
        "SELECT id
         FROM proposal
         WHERE chain_id IS NOT DISTINCT FROM $1
           AND governor_address IS NOT DISTINCT FROM $2
           AND proposal_id = $3
         LIMIT 1",
    )
    .bind(chain_id)
    .bind(governor_address)
    .bind(proposal_id)
    .fetch_optional(&mut **transaction)
    .await?;

    Ok(row
        .map(|row| row.get::<String, _>("id"))
        .unwrap_or_else(|| fallback.to_owned()))
}

fn proposal_lookup_id_from_ref<'a>(
    chain_id: i32,
    governor_address: &str,
    proposal_ref: &'a str,
) -> Option<&'a str> {
    let prefix = format!(
        "proposal:{chain_id}:{}:",
        governor_address.to_ascii_lowercase()
    );

    proposal_ref.strip_prefix(&prefix)
}

async fn relink_existing_proposal_to_raw_id(
    transaction: &mut Transaction<'_, Postgres>,
    row: &ProposalWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(
        "UPDATE proposal
         SET id = $1
         WHERE chain_id IS NOT DISTINCT FROM $2
           AND governor_address IS NOT DISTINCT FROM $3
           AND proposal_id = $4
           AND id <> $1",
    )
    .bind(&row.id)
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

async fn insert_proposal_action(
    transaction: &mut Transaction<'_, Postgres>,
    row: &ProposalActionWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    let proposal_ref = resolve_proposal_ref(
        transaction,
        row.chain_id,
        &row.governor_address,
        &row.proposal_id,
        &row.proposal_ref,
    )
    .await?;

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
    .bind(&proposal_ref)
    .bind(&proposal_ref)
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
    let proposal_ref = resolve_proposal_ref(
        transaction,
        row.chain_id,
        &row.governor_address,
        &row.proposal_id,
        &row.proposal_ref,
    )
    .await?;

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
    .bind(&proposal_ref)
    .bind(&proposal_ref)
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
    let proposal_ref = resolve_proposal_ref(
        transaction,
        row.chain_id,
        &row.governor_address,
        &row.proposal_id,
        &row.proposal_ref,
    )
    .await?;

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
    .bind(&proposal_ref)
    .bind(&proposal_ref)
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

async fn insert_vote_cast(
    transaction: &mut Transaction<'_, Postgres>,
    row: &VoteCastWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(
        "INSERT INTO vote_cast (
            id, chain_id, dao_code, governor_address, contract_address, log_index,
            transaction_index, voter, proposal_id, support, weight, reason, block_number,
            block_timestamp, transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::NUMERIC(78, 0), $12,
            $13::NUMERIC(78, 0), $14::NUMERIC(78, 0), $15
         )
         ON CONFLICT (id) DO NOTHING",
    )
    .bind(&row.id)
    .bind(row.common.chain_id)
    .bind(&row.common.dao_code)
    .bind(&row.common.governor_address)
    .bind(&row.common.contract_address)
    .bind(u64_to_i32(row.common.log_index, "vote_cast.log_index")?)
    .bind(u64_to_i32(
        row.common.transaction_index,
        "vote_cast.transaction_index",
    )?)
    .bind(&row.voter)
    .bind(&row.proposal_id)
    .bind(i32::from(row.support))
    .bind(&row.weight)
    .bind(&row.reason)
    .bind(&row.block_number)
    .bind(required_numeric(
        &row.block_timestamp,
        "vote_cast.block_timestamp",
    )?)
    .bind(&row.transaction_hash)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn insert_vote_cast_with_params(
    transaction: &mut Transaction<'_, Postgres>,
    row: &VoteCastWithParamsWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(
        "INSERT INTO vote_cast_with_params (
            id, chain_id, dao_code, governor_address, contract_address, log_index,
            transaction_index, voter, proposal_id, support, weight, reason, params, block_number,
            block_timestamp, transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::NUMERIC(78, 0), $12, $13,
            $14::NUMERIC(78, 0), $15::NUMERIC(78, 0), $16
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
        "vote_cast_with_params.log_index",
    )?)
    .bind(u64_to_i32(
        row.common.transaction_index,
        "vote_cast_with_params.transaction_index",
    )?)
    .bind(&row.voter)
    .bind(&row.proposal_id)
    .bind(i32::from(row.support))
    .bind(&row.weight)
    .bind(&row.reason)
    .bind(&row.params)
    .bind(&row.block_number)
    .bind(required_numeric(
        &row.block_timestamp,
        "vote_cast_with_params.block_timestamp",
    )?)
    .bind(&row.transaction_hash)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn upsert_vote_cast_group(
    transaction: &mut Transaction<'_, Postgres>,
    row: &VoteCastGroupWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(
        "INSERT INTO vote_cast_group (
            id, chain_id, dao_code, governor_address, contract_address, log_index,
            transaction_index, proposal_id, type, voter, ref_proposal_id, support, weight,
            reason, params, block_number, block_timestamp, transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            COALESCE(
              (
                SELECT proposal.id
                FROM proposal
                WHERE proposal.chain_id IS NOT DISTINCT FROM $2
                  AND proposal.governor_address IS NOT DISTINCT FROM $4
                  AND proposal.proposal_id = $11
                LIMIT 1
              ),
              $8
            ),
            $9, $10, $11, $12,
            $13::NUMERIC(78, 0), $14, $15, $16::NUMERIC(78, 0), $17::NUMERIC(78, 0), $18
         )
         ON CONFLICT (id) DO UPDATE
         SET support = EXCLUDED.support,
             weight = EXCLUDED.weight,
             reason = EXCLUDED.reason,
             params = EXCLUDED.params,
             block_number = EXCLUDED.block_number,
             block_timestamp = EXCLUDED.block_timestamp,
             transaction_hash = EXCLUDED.transaction_hash",
    )
    .bind(&row.id)
    .bind(row.chain_id)
    .bind(&row.dao_code)
    .bind(&row.governor_address)
    .bind(&row.contract_address)
    .bind(u64_to_i32(row.log_index, "vote_cast_group.log_index")?)
    .bind(u64_to_i32(
        row.transaction_index,
        "vote_cast_group.transaction_index",
    )?)
    .bind(&row.proposal_ref)
    .bind(&row.kind)
    .bind(&row.voter)
    .bind(&row.ref_proposal_id)
    .bind(i32::from(row.support))
    .bind(&row.weight)
    .bind(&row.reason)
    .bind(row.params.as_deref())
    .bind(&row.block_number)
    .bind(required_numeric(
        &row.block_timestamp,
        "vote_cast_group.block_timestamp",
    )?)
    .bind(&row.transaction_hash)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn refresh_proposal_vote_totals(
    transaction: &mut Transaction<'_, Postgres>,
    row: &ProposalVoteTotalWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(
        "WITH resolved AS (
             SELECT COALESCE(
               (
                 SELECT proposal.id
                 FROM proposal
                 WHERE proposal.chain_id IS NOT DISTINCT FROM $2
                   AND proposal.governor_address IS NOT DISTINCT FROM $3
                   AND proposal.proposal_id = $4
                 LIMIT 1
               ),
               $1
             ) AS proposal_ref
         )
         UPDATE proposal
         SET metrics_votes_count = totals.votes_count,
             metrics_votes_with_params_count = totals.votes_with_params_count,
             metrics_votes_without_params_count = totals.votes_without_params_count,
             metrics_votes_weight_for_sum = totals.votes_weight_for_sum,
             metrics_votes_weight_against_sum = totals.votes_weight_against_sum,
             metrics_votes_weight_abstain_sum = totals.votes_weight_abstain_sum
         FROM (
             SELECT
               count(*)::INTEGER AS votes_count,
               count(*) FILTER (WHERE type = 'vote-cast-with-params')::INTEGER AS votes_with_params_count,
               count(*) FILTER (WHERE type = 'vote-cast-without-params')::INTEGER AS votes_without_params_count,
               COALESCE(sum(CASE WHEN support = 1 THEN weight ELSE 0 END), 0)::NUMERIC(78, 0) AS votes_weight_for_sum,
               COALESCE(sum(CASE WHEN support = 0 THEN weight ELSE 0 END), 0)::NUMERIC(78, 0) AS votes_weight_against_sum,
               COALESCE(sum(CASE WHEN support = 2 THEN weight ELSE 0 END), 0)::NUMERIC(78, 0) AS votes_weight_abstain_sum
             FROM vote_cast_group, resolved
             WHERE vote_cast_group.proposal_id = resolved.proposal_ref
         ) totals, resolved
         WHERE proposal.id = resolved.proposal_ref",
    )
    .bind(&row.proposal_ref)
    .bind(row.chain_id)
    .bind(&row.governor_address)
    .bind(&row.proposal_id)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn upsert_contributor_vote_signal(
    transaction: &mut Transaction<'_, Postgres>,
    row: &ContributorVoteSignalWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(
        "INSERT INTO contributor (
            id, chain_id, dao_code, governor_address, token_address, contract_address,
            log_index, transaction_index, block_number, block_timestamp, transaction_hash,
            last_vote_block_number, last_vote_timestamp, power, balance, delegates_count_all,
            delegates_count_effective
         )
         VALUES (
            $1, $2, $3, $4, NULL, $5, $6, $7, $8::NUMERIC(78, 0), $9::NUMERIC(78, 0), $10,
            $8::NUMERIC(78, 0), $9::NUMERIC(78, 0), 0::NUMERIC(78, 0), NULL, 0, 0
         )
         ON CONFLICT (id) DO UPDATE
         SET last_vote_block_number = GREATEST(
               COALESCE(contributor.last_vote_block_number, EXCLUDED.last_vote_block_number),
               EXCLUDED.last_vote_block_number
             ),
             last_vote_timestamp = GREATEST(
               COALESCE(contributor.last_vote_timestamp, EXCLUDED.last_vote_timestamp),
               EXCLUDED.last_vote_timestamp
             ),
             transaction_hash = EXCLUDED.transaction_hash",
    )
    .bind(&row.voter)
    .bind(row.chain_id)
    .bind(&row.dao_code)
    .bind(&row.governor_address)
    .bind(&row.contract_address)
    .bind(u64_to_i32(
        row.log_index,
        "contributor_vote_signal.log_index",
    )?)
    .bind(u64_to_i32(
        row.transaction_index,
        "contributor_vote_signal.transaction_index",
    )?)
    .bind(&row.last_vote_block_number)
    .bind(required_numeric(
        &row.last_vote_timestamp,
        "contributor_vote_signal.last_vote_timestamp",
    )?)
    .bind(&row.transaction_hash)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn refresh_vote_data_metric(
    transaction: &mut Transaction<'_, Postgres>,
    rows: &[ContributorVoteSignalWrite],
) -> Result<(), PostgresIndexerRunnerStoreError> {
    let Some(row) = rows.first() else {
        return Ok(());
    };
    let metric_id = data_metric_id(row.chain_id, &row.governor_address, &row.dao_code);

    sqlx::query(
        "INSERT INTO data_metric (
            id, chain_id, dao_code, governor_address, votes_count, votes_with_params_count,
            votes_without_params_count, votes_weight_for_sum, votes_weight_against_sum,
            votes_weight_abstain_sum
         )
         SELECT
            $1, $2, $3, $4,
            count(*)::INTEGER,
            count(*) FILTER (WHERE type = 'vote-cast-with-params')::INTEGER,
            count(*) FILTER (WHERE type = 'vote-cast-without-params')::INTEGER,
            COALESCE(sum(CASE WHEN support = 1 THEN weight ELSE 0 END), 0)::NUMERIC(78, 0),
            COALESCE(sum(CASE WHEN support = 0 THEN weight ELSE 0 END), 0)::NUMERIC(78, 0),
            COALESCE(sum(CASE WHEN support = 2 THEN weight ELSE 0 END), 0)::NUMERIC(78, 0)
         FROM vote_cast_group
         WHERE chain_id = $2 AND governor_address = $4 AND dao_code = $3
         ON CONFLICT ON CONSTRAINT data_metric_lookup_unique DO UPDATE
         SET votes_count = EXCLUDED.votes_count,
             votes_with_params_count = EXCLUDED.votes_with_params_count,
             votes_without_params_count = EXCLUDED.votes_without_params_count,
             votes_weight_for_sum = EXCLUDED.votes_weight_for_sum,
             votes_weight_against_sum = EXCLUDED.votes_weight_against_sum,
             votes_weight_abstain_sum = EXCLUDED.votes_weight_abstain_sum",
    )
    .bind(metric_id)
    .bind(row.chain_id)
    .bind(&row.dao_code)
    .bind(&row.governor_address)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn insert_delegate_changed(
    transaction: &mut Transaction<'_, Postgres>,
    row: &DelegateChangedWrite,
) -> Result<bool, PostgresIndexerRunnerStoreError> {
    let result = sqlx::query(
        "INSERT INTO delegate_changed (
            id, chain_id, dao_code, governor_address, token_address, contract_address,
            log_index, transaction_index, delegator, from_delegate, to_delegate, block_number,
            block_timestamp, transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::NUMERIC(78, 0),
            $13::NUMERIC(78, 0), $14
         )
         ON CONFLICT (id) DO NOTHING",
    )
    .bind(&row.id)
    .bind(row.common.chain_id)
    .bind(&row.common.dao_code)
    .bind(&row.common.governor_address)
    .bind(&row.common.token_address)
    .bind(&row.common.contract_address)
    .bind(u64_to_i32(
        row.common.log_index,
        "delegate_changed.log_index",
    )?)
    .bind(u64_to_i32(
        row.common.transaction_index,
        "delegate_changed.transaction_index",
    )?)
    .bind(&row.delegator)
    .bind(&row.from_delegate)
    .bind(&row.to_delegate)
    .bind(&row.common.block_number)
    .bind(required_numeric(
        &row.common.block_timestamp,
        "delegate_changed.block_timestamp",
    )?)
    .bind(&row.common.transaction_hash)
    .execute(&mut **transaction)
    .await?;

    Ok(result.rows_affected() > 0)
}

async fn insert_delegate_votes_changed(
    transaction: &mut Transaction<'_, Postgres>,
    row: &DelegateVotesChangedWrite,
) -> Result<bool, PostgresIndexerRunnerStoreError> {
    let result = sqlx::query(
        "INSERT INTO delegate_votes_changed (
            id, chain_id, dao_code, governor_address, token_address, contract_address,
            log_index, transaction_index, delegate, previous_votes, new_votes, block_number,
            block_timestamp, transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::NUMERIC(78, 0), $11::NUMERIC(78, 0),
            $12::NUMERIC(78, 0), $13::NUMERIC(78, 0), $14
         )
         ON CONFLICT (id) DO NOTHING",
    )
    .bind(&row.id)
    .bind(row.common.chain_id)
    .bind(&row.common.dao_code)
    .bind(&row.common.governor_address)
    .bind(&row.common.token_address)
    .bind(&row.common.contract_address)
    .bind(u64_to_i32(
        row.common.log_index,
        "delegate_votes_changed.log_index",
    )?)
    .bind(u64_to_i32(
        row.common.transaction_index,
        "delegate_votes_changed.transaction_index",
    )?)
    .bind(&row.delegate)
    .bind(&row.previous_votes)
    .bind(&row.new_votes)
    .bind(&row.common.block_number)
    .bind(required_numeric(
        &row.common.block_timestamp,
        "delegate_votes_changed.block_timestamp",
    )?)
    .bind(&row.common.transaction_hash)
    .execute(&mut **transaction)
    .await?;

    Ok(result.rows_affected() > 0)
}

async fn insert_token_transfer(
    transaction: &mut Transaction<'_, Postgres>,
    row: &TokenTransferWrite,
) -> Result<bool, PostgresIndexerRunnerStoreError> {
    let result = sqlx::query(
        "INSERT INTO token_transfer (
            id, chain_id, dao_code, governor_address, token_address, contract_address,
            log_index, transaction_index, \"from\", \"to\", value, standard, block_number,
            block_timestamp, transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::NUMERIC(78, 0), $12,
            $13::NUMERIC(78, 0), $14::NUMERIC(78, 0), $15
         )
         ON CONFLICT (id) DO NOTHING",
    )
    .bind(&row.id)
    .bind(row.common.chain_id)
    .bind(&row.common.dao_code)
    .bind(&row.common.governor_address)
    .bind(&row.common.token_address)
    .bind(&row.common.contract_address)
    .bind(u64_to_i32(
        row.common.log_index,
        "token_transfer.log_index",
    )?)
    .bind(u64_to_i32(
        row.common.transaction_index,
        "token_transfer.transaction_index",
    )?)
    .bind(&row.from)
    .bind(&row.to)
    .bind(&row.value)
    .bind(&row.standard)
    .bind(&row.common.block_number)
    .bind(required_numeric(
        &row.common.block_timestamp,
        "token_transfer.block_timestamp",
    )?)
    .bind(&row.common.transaction_hash)
    .execute(&mut **transaction)
    .await?;

    Ok(result.rows_affected() > 0)
}

async fn upsert_delegate_rolling(
    transaction: &mut Transaction<'_, Postgres>,
    row: &DelegateRollingWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(
        "INSERT INTO delegate_rolling (
            id, chain_id, dao_code, governor_address, token_address, contract_address,
            log_index, transaction_index, delegator, from_delegate, to_delegate, block_number,
            block_timestamp, transaction_hash, from_previous_votes, from_new_votes,
            to_previous_votes, to_new_votes
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::NUMERIC(78, 0),
            $13::NUMERIC(78, 0), $14, $15::NUMERIC(78, 0), $16::NUMERIC(78, 0),
            $17::NUMERIC(78, 0), $18::NUMERIC(78, 0)
         )
         ON CONFLICT (id) DO UPDATE
         SET from_previous_votes = COALESCE(EXCLUDED.from_previous_votes, delegate_rolling.from_previous_votes),
             from_new_votes = COALESCE(EXCLUDED.from_new_votes, delegate_rolling.from_new_votes),
             to_previous_votes = COALESCE(EXCLUDED.to_previous_votes, delegate_rolling.to_previous_votes),
             to_new_votes = COALESCE(EXCLUDED.to_new_votes, delegate_rolling.to_new_votes)",
    )
    .bind(&row.id)
    .bind(row.common.chain_id)
    .bind(&row.common.dao_code)
    .bind(&row.common.governor_address)
    .bind(&row.common.token_address)
    .bind(&row.common.contract_address)
    .bind(u64_to_i32(row.common.log_index, "delegate_rolling.log_index")?)
    .bind(u64_to_i32(
        row.common.transaction_index,
        "delegate_rolling.transaction_index",
    )?)
    .bind(&row.delegator)
    .bind(&row.from_delegate)
    .bind(&row.to_delegate)
    .bind(&row.common.block_number)
    .bind(required_numeric(
        &row.common.block_timestamp,
        "delegate_rolling.block_timestamp",
    )?)
    .bind(&row.common.transaction_hash)
    .bind(row.from_previous_votes.as_deref())
    .bind(row.from_new_votes.as_deref())
    .bind(row.to_previous_votes.as_deref())
    .bind(row.to_new_votes.as_deref())
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn insert_vote_power_checkpoint(
    transaction: &mut Transaction<'_, Postgres>,
    row: &DelegateVotesChangedWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    let delta = signed_decimal_delta(transaction, &row.new_votes, &row.previous_votes).await?;
    let rollings = transaction_rollings(transaction, &row.common.transaction_hash).await?;
    let transfers_count: i64 =
        sqlx::query("SELECT count(*)::BIGINT FROM token_transfer WHERE transaction_hash = $1")
            .bind(&row.common.transaction_hash)
            .fetch_one(&mut **transaction)
            .await?
            .get(0);
    let rolling_match =
        find_rolling_match_from_rows(&rollings, &row.delegate, &delta, row.common.log_index);
    let cause = vote_power_checkpoint_cause(!rollings.is_empty(), transfers_count > 0);

    sqlx::query(
        "INSERT INTO vote_power_checkpoint (
            id, chain_id, dao_code, governor_address, token_address, contract_address,
            log_index, transaction_index, account, clock_mode, timepoint, previous_power,
            new_power, delta, source, cause, delegator, from_delegate, to_delegate, block_number,
            block_timestamp, transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, 'blocknumber', $10::NUMERIC(78, 0),
            $11::NUMERIC(78, 0), $12::NUMERIC(78, 0), $13::NUMERIC(78, 0), 'event',
            $14, $15, $16, $17, $18::NUMERIC(78, 0), $19::NUMERIC(78, 0), $20
         )
         ON CONFLICT (id) DO NOTHING",
    )
    .bind(&row.id)
    .bind(row.common.chain_id)
    .bind(&row.common.dao_code)
    .bind(&row.common.governor_address)
    .bind(&row.common.token_address)
    .bind(&row.common.contract_address)
    .bind(u64_to_i32(
        row.common.log_index,
        "vote_power_checkpoint.log_index",
    )?)
    .bind(u64_to_i32(
        row.common.transaction_index,
        "vote_power_checkpoint.transaction_index",
    )?)
    .bind(&row.delegate)
    .bind(&row.common.block_number)
    .bind(&row.previous_votes)
    .bind(&row.new_votes)
    .bind(&delta)
    .bind(cause)
    .bind(rolling_match.as_ref().map(|item| item.delegator.as_str()))
    .bind(
        rolling_match
            .as_ref()
            .map(|item| item.from_delegate.as_str()),
    )
    .bind(rolling_match.as_ref().map(|item| item.to_delegate.as_str()))
    .bind(&row.common.block_number)
    .bind(required_numeric(
        &row.common.block_timestamp,
        "vote_power_checkpoint.block_timestamp",
    )?)
    .bind(&row.common.transaction_hash)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn apply_token_operation(
    transaction: &mut Transaction<'_, Postgres>,
    operation: &TokenProjectionOperation,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    match operation {
        TokenProjectionOperation::DelegateChanged {
            common,
            delegator,
            from_delegate,
            to_delegate,
            ..
        } => {
            apply_delegate_changed_operation(
                transaction,
                common,
                delegator,
                from_delegate,
                to_delegate,
            )
            .await
        }
        TokenProjectionOperation::DelegateVotesChanged {
            common,
            delegate,
            previous_votes,
            new_votes,
            ..
        } => {
            apply_delegate_votes_changed_operation(
                transaction,
                common,
                delegate,
                previous_votes,
                new_votes,
            )
            .await
        }
        TokenProjectionOperation::Transfer {
            common,
            from,
            to,
            value,
            standard,
            ..
        } => apply_transfer_operation(transaction, common, from, to, value, *standard).await,
    }
}

async fn apply_delegate_changed_operation(
    transaction: &mut Transaction<'_, Postgres>,
    common: &TokenEventCommon,
    delegator: &str,
    from_delegate: &str,
    to_delegate: &str,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    if !is_zero_address(to_delegate) {
        ensure_contributor(transaction, to_delegate, common).await?;
    }
    let previous_mapping = read_delegate_mapping(transaction, delegator).await?;
    let is_noop = previous_mapping
        .as_ref()
        .is_some_and(|mapping| mapping.to == to_delegate && from_delegate == to_delegate);
    if is_noop {
        return Ok(());
    }

    if let Some(previous) = previous_mapping {
        upsert_delegate_snapshot(
            transaction,
            common,
            delegator,
            &previous.to,
            false,
            &previous.power,
        )
        .await?;
        apply_delegate_count_delta(
            transaction,
            common,
            &previous.to,
            -1,
            if is_nonzero_decimal(&previous.power) {
                -1
            } else {
                0
            },
        )
        .await?;
        sqlx::query("DELETE FROM delegate_mapping WHERE id = $1")
            .bind(delegator)
            .execute(&mut **transaction)
            .await?;
    }

    if is_zero_address(to_delegate) {
        return Ok(());
    }

    apply_delegate_count_delta(transaction, common, to_delegate, 1, 0).await?;
    upsert_delegate_mapping(transaction, common, delegator, to_delegate, "0").await?;

    Ok(())
}

async fn apply_delegate_votes_changed_operation(
    transaction: &mut Transaction<'_, Postgres>,
    common: &TokenEventCommon,
    delegate: &str,
    previous_votes: &str,
    new_votes: &str,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    let delta = signed_decimal_delta(transaction, new_votes, previous_votes).await?;
    let rollings = transaction_rollings(transaction, &common.transaction_hash).await?;
    let Some(rolling_match) =
        find_rolling_match_from_rows(&rollings, delegate, &delta, common.log_index)
    else {
        return Ok(());
    };

    match rolling_match.side {
        RollingSide::From => {
            sqlx::query(
                "UPDATE delegate_rolling
                 SET from_previous_votes = $2::NUMERIC(78, 0),
                     from_new_votes = $3::NUMERIC(78, 0)
                 WHERE id = $1",
            )
            .bind(&rolling_match.id)
            .bind(previous_votes)
            .bind(new_votes)
            .execute(&mut **transaction)
            .await?;
            apply_delegate_delta(
                transaction,
                common,
                &rolling_match.delegator,
                &rolling_match.from_delegate,
                &delta,
            )
            .await
        }
        RollingSide::To => {
            sqlx::query(
                "UPDATE delegate_rolling
                 SET to_previous_votes = $2::NUMERIC(78, 0),
                     to_new_votes = $3::NUMERIC(78, 0)
                 WHERE id = $1",
            )
            .bind(&rolling_match.id)
            .bind(previous_votes)
            .bind(new_votes)
            .execute(&mut **transaction)
            .await?;
            apply_delegate_delta(
                transaction,
                common,
                &rolling_match.delegator,
                &rolling_match.to_delegate,
                &delta,
            )
            .await
        }
    }
}

async fn apply_transfer_operation(
    transaction: &mut Transaction<'_, Postgres>,
    common: &TokenEventCommon,
    from: &str,
    to: &str,
    value: &str,
    standard: GovernanceTokenStandard,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    let value = transfer_units(value, standard);
    if let Some(mapping) = read_delegate_mapping(transaction, from).await? {
        apply_delegate_delta(
            transaction,
            common,
            &mapping.from,
            &mapping.to,
            &format!("-{value}"),
        )
        .await?;
    }
    if let Some(mapping) = read_delegate_mapping(transaction, to).await? {
        apply_delegate_delta(transaction, common, &mapping.from, &mapping.to, &value).await?;
    }

    Ok(())
}

async fn apply_delegate_delta(
    transaction: &mut Transaction<'_, Postgres>,
    common: &TokenEventCommon,
    from_delegate: &str,
    to_delegate: &str,
    delta: &str,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    if is_zero_address(to_delegate) {
        return Ok(());
    }

    let previous_mapping_power = read_delegate_mapping(transaction, from_delegate)
        .await?
        .filter(|mapping| mapping.to == to_delegate)
        .map(|mapping| mapping.power)
        .unwrap_or_else(|| "0".to_owned());
    let next_mapping_power =
        add_signed_decimal(transaction, &previous_mapping_power, delta).await?;

    sqlx::query(
        r#"UPDATE delegate_mapping
           SET chain_id = $2, dao_code = $3, governor_address = $4, token_address = $5,
               contract_address = $6, log_index = $7, transaction_index = $8,
               power = $9::NUMERIC(78, 0), block_number = $10::NUMERIC(78, 0),
               block_timestamp = $11::NUMERIC(78, 0), transaction_hash = $12
           WHERE id = $1 AND "to" = $13"#,
    )
    .bind(from_delegate)
    .bind(common.chain_id)
    .bind(&common.dao_code)
    .bind(&common.governor_address)
    .bind(&common.token_address)
    .bind(&common.contract_address)
    .bind(u64_to_i32(common.log_index, "delegate_mapping.log_index")?)
    .bind(u64_to_i32(
        common.transaction_index,
        "delegate_mapping.transaction_index",
    )?)
    .bind(&next_mapping_power)
    .bind(&common.block_number)
    .bind(required_numeric(
        &common.block_timestamp,
        "delegate_mapping.block_timestamp",
    )?)
    .bind(&common.transaction_hash)
    .bind(to_delegate)
    .execute(&mut **transaction)
    .await?;

    let previous_effective = is_nonzero_decimal(&previous_mapping_power);
    let next_effective = is_nonzero_decimal(&next_mapping_power);
    if previous_effective != next_effective {
        apply_delegate_count_delta(
            transaction,
            common,
            to_delegate,
            0,
            if next_effective { 1 } else { -1 },
        )
        .await?;
    }
    upsert_delegate_snapshot(
        transaction,
        common,
        from_delegate,
        to_delegate,
        true,
        &next_mapping_power,
    )
    .await?;

    Ok(())
}

async fn upsert_delegate_snapshot(
    transaction: &mut Transaction<'_, Postgres>,
    common: &TokenEventCommon,
    from_delegate: &str,
    to_delegate: &str,
    is_current: bool,
    power: &str,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    if is_zero_address(to_delegate) {
        return Ok(());
    }
    let id = delegate_ref(from_delegate, to_delegate);
    if is_current && !is_nonzero_decimal(power) {
        sqlx::query("DELETE FROM delegate WHERE id = $1")
            .bind(&id)
            .execute(&mut **transaction)
            .await?;
        return Ok(());
    }

    sqlx::query(
        "INSERT INTO delegate (
            id, chain_id, dao_code, governor_address, token_address, contract_address,
            log_index, transaction_index, from_delegate, to_delegate, block_number,
            block_timestamp, transaction_hash, is_current, power
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::NUMERIC(78, 0),
            $12::NUMERIC(78, 0), $13, $14, $15::NUMERIC(78, 0)
         )
         ON CONFLICT (id) DO UPDATE
         SET chain_id = EXCLUDED.chain_id,
             dao_code = EXCLUDED.dao_code,
             governor_address = EXCLUDED.governor_address,
             token_address = EXCLUDED.token_address,
             contract_address = EXCLUDED.contract_address,
             log_index = EXCLUDED.log_index,
             transaction_index = EXCLUDED.transaction_index,
             block_number = EXCLUDED.block_number,
             block_timestamp = EXCLUDED.block_timestamp,
             transaction_hash = EXCLUDED.transaction_hash,
             is_current = EXCLUDED.is_current,
             power = EXCLUDED.power",
    )
    .bind(id)
    .bind(common.chain_id)
    .bind(&common.dao_code)
    .bind(&common.governor_address)
    .bind(&common.token_address)
    .bind(&common.contract_address)
    .bind(u64_to_i32(common.log_index, "delegate.log_index")?)
    .bind(u64_to_i32(
        common.transaction_index,
        "delegate.transaction_index",
    )?)
    .bind(from_delegate)
    .bind(to_delegate)
    .bind(&common.block_number)
    .bind(required_numeric(
        &common.block_timestamp,
        "delegate.block_timestamp",
    )?)
    .bind(&common.transaction_hash)
    .bind(is_current)
    .bind(power)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn upsert_delegate_mapping(
    transaction: &mut Transaction<'_, Postgres>,
    common: &TokenEventCommon,
    from: &str,
    to: &str,
    power: &str,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(
        r#"INSERT INTO delegate_mapping (
            id, chain_id, dao_code, governor_address, token_address, contract_address,
            log_index, transaction_index, "from", "to", power, block_number, block_timestamp,
            transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::NUMERIC(78, 0),
            $12::NUMERIC(78, 0), $13::NUMERIC(78, 0), $14
         )
         ON CONFLICT (id) DO UPDATE
         SET chain_id = EXCLUDED.chain_id,
             dao_code = EXCLUDED.dao_code,
             governor_address = EXCLUDED.governor_address,
             token_address = EXCLUDED.token_address,
             contract_address = EXCLUDED.contract_address,
             log_index = EXCLUDED.log_index,
             transaction_index = EXCLUDED.transaction_index,
             "from" = EXCLUDED."from",
             "to" = EXCLUDED."to",
             power = EXCLUDED.power,
             block_number = EXCLUDED.block_number,
             block_timestamp = EXCLUDED.block_timestamp,
             transaction_hash = EXCLUDED.transaction_hash"#,
    )
    .bind(from)
    .bind(common.chain_id)
    .bind(&common.dao_code)
    .bind(&common.governor_address)
    .bind(&common.token_address)
    .bind(&common.contract_address)
    .bind(u64_to_i32(common.log_index, "delegate_mapping.log_index")?)
    .bind(u64_to_i32(
        common.transaction_index,
        "delegate_mapping.transaction_index",
    )?)
    .bind(from)
    .bind(to)
    .bind(power)
    .bind(&common.block_number)
    .bind(required_numeric(
        &common.block_timestamp,
        "delegate_mapping.block_timestamp",
    )?)
    .bind(&common.transaction_hash)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn apply_delegate_count_delta(
    transaction: &mut Transaction<'_, Postgres>,
    common: &TokenEventCommon,
    delegate: &str,
    all_delta: i64,
    effective_delta: i64,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    if is_zero_address(delegate) {
        return Ok(());
    }
    ensure_contributor(transaction, delegate, common).await?;

    sqlx::query(
        "UPDATE contributor
         SET chain_id = $2, dao_code = $3, governor_address = $4, token_address = $5,
             contract_address = $6, log_index = $7, transaction_index = $8,
             block_number = $9::NUMERIC(78, 0), block_timestamp = $10::NUMERIC(78, 0),
             transaction_hash = $11,
             delegates_count_all = GREATEST(delegates_count_all + $12, 0),
             delegates_count_effective = GREATEST(delegates_count_effective + $13, 0)
         WHERE id = $1",
    )
    .bind(delegate)
    .bind(common.chain_id)
    .bind(&common.dao_code)
    .bind(&common.governor_address)
    .bind(&common.token_address)
    .bind(&common.contract_address)
    .bind(u64_to_i32(common.log_index, "contributor.log_index")?)
    .bind(u64_to_i32(
        common.transaction_index,
        "contributor.transaction_index",
    )?)
    .bind(&common.block_number)
    .bind(required_numeric(
        &common.block_timestamp,
        "contributor.block_timestamp",
    )?)
    .bind(&common.transaction_hash)
    .bind(i64_to_i32(
        all_delta,
        "contributor.delegates_count_all_delta",
    )?)
    .bind(i64_to_i32(
        effective_delta,
        "contributor.delegates_count_effective_delta",
    )?)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn ensure_contributor(
    transaction: &mut Transaction<'_, Postgres>,
    account: &str,
    common: &TokenEventCommon,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    let result = sqlx::query(
        "INSERT INTO contributor (
            id, chain_id, dao_code, governor_address, token_address, contract_address,
            log_index, transaction_index, block_number, block_timestamp, transaction_hash,
            power, balance, delegates_count_all, delegates_count_effective
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9::NUMERIC(78, 0), $10::NUMERIC(78, 0),
            $11, 0::NUMERIC(78, 0), NULL, 0, 0
         )
         ON CONFLICT (id) DO NOTHING",
    )
    .bind(account)
    .bind(common.chain_id)
    .bind(&common.dao_code)
    .bind(&common.governor_address)
    .bind(&common.token_address)
    .bind(&common.contract_address)
    .bind(u64_to_i32(common.log_index, "contributor.log_index")?)
    .bind(u64_to_i32(
        common.transaction_index,
        "contributor.transaction_index",
    )?)
    .bind(&common.block_number)
    .bind(required_numeric(
        &common.block_timestamp,
        "contributor.block_timestamp",
    )?)
    .bind(&common.transaction_hash)
    .execute(&mut **transaction)
    .await?;

    if result.rows_affected() > 0 {
        increment_member_count(transaction, common).await?;
    }

    Ok(())
}

async fn increment_member_count(
    transaction: &mut Transaction<'_, Postgres>,
    common: &TokenEventCommon,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(
        "INSERT INTO data_metric (
            id, chain_id, dao_code, governor_address, token_address, member_count
         )
         VALUES ($1, $2, $3, $4, $5, 1)
         ON CONFLICT ON CONSTRAINT data_metric_lookup_unique DO UPDATE
         SET token_address = COALESCE(data_metric.token_address, EXCLUDED.token_address),
             member_count = COALESCE(data_metric.member_count, 0) + 1",
    )
    .bind(data_metric_id(
        common.chain_id,
        &common.governor_address,
        &common.dao_code,
    ))
    .bind(common.chain_id)
    .bind(&common.dao_code)
    .bind(&common.governor_address)
    .bind(&common.token_address)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn upsert_onchain_refresh_task(
    transaction: &mut Transaction<'_, Postgres>,
    row: &PowerReconcileCandidate,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    let status = &row.status;
    let task_id = format!(
        "{}:{}:{}:{}",
        status.chain_id, status.governor, status.governor_token, status.account
    );
    let reason = if status.reason.is_empty() {
        "token-activity".to_owned()
    } else {
        status.reason.clone()
    };

    sqlx::query(
        "INSERT INTO onchain_refresh_task (
            id, chain_id, dao_code, governor_address, token_address, account, refresh_balance,
            refresh_power, reason, first_seen_block_number, last_seen_block_number,
            last_seen_block_timestamp, last_seen_transaction_hash, status, attempts,
            next_run_at, pending_after_lock, created_at, updated_at
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::NUMERIC(78, 0), $11::NUMERIC(78, 0),
            $12::NUMERIC(78, 0), $13, 'pending', 0, 0::NUMERIC(78, 0), false,
            $11::NUMERIC(78, 0), $11::NUMERIC(78, 0)
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
    )
    .bind(task_id)
    .bind(status.chain_id)
    .bind(&status.dao_code)
    .bind(&status.governor)
    .bind(&status.governor_token)
    .bind(&status.account)
    .bind(status.refresh_balance)
    .bind(status.refresh_power)
    .bind(reason)
    .bind(u64_to_string(status.first_seen_activity_block))
    .bind(u64_to_string(status.last_seen_activity_block))
    .bind(status.last_seen_block_timestamp_ms.map(u64_to_string))
    .bind(&status.last_seen_transaction_hash)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn upsert_timelock_operation(
    transaction: &mut Transaction<'_, Postgres>,
    row: &TimelockOperationWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(
        "INSERT INTO timelock_operation (
            id, chain_id, dao_code, governor_address, timelock_address, contract_address,
            log_index, transaction_index, proposal_ref, proposal_id, operation_id, timelock_type,
            predecessor, salt, state, call_count, executed_call_count, delay_seconds, ready_at,
            expires_at, queued_block_number, queued_block_timestamp, queued_transaction_hash,
            cancelled_block_number, cancelled_block_timestamp, cancelled_transaction_hash,
            executed_block_number, executed_block_timestamp, executed_transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
            $18::NUMERIC(78, 0), $19::NUMERIC(78, 0), $20::NUMERIC(78, 0),
            $21::NUMERIC(78, 0), $22::NUMERIC(78, 0), $23, $24::NUMERIC(78, 0),
            $25::NUMERIC(78, 0), $26, $27::NUMERIC(78, 0), $28::NUMERIC(78, 0), $29
         )
         ON CONFLICT (id) DO UPDATE
         SET predecessor = COALESCE(EXCLUDED.predecessor, timelock_operation.predecessor),
             salt = COALESCE(EXCLUDED.salt, timelock_operation.salt),
             state = EXCLUDED.state,
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
            id, chain_id, dao_code, governor_address, timelock_address, contract_address,
            log_index, transaction_index, operation_id, operation_ref, proposal_ref, proposal_id,
            proposal_action_id, proposal_action_index, action_index, target, value, data,
            predecessor, delay_seconds, state, scheduled_block_number, scheduled_block_timestamp,
            scheduled_transaction_hash, executed_block_number, executed_block_timestamp,
            executed_transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
            $17, $18, $19, $20::NUMERIC(78, 0), $21, $22::NUMERIC(78, 0),
            $23::NUMERIC(78, 0), $24, $25::NUMERIC(78, 0), $26::NUMERIC(78, 0), $27
         )
         ON CONFLICT (id) DO UPDATE
         SET target = EXCLUDED.target,
             value = EXCLUDED.value,
             data = EXCLUDED.data,
             predecessor = COALESCE(EXCLUDED.predecessor, timelock_call.predecessor),
             delay_seconds = COALESCE(EXCLUDED.delay_seconds, timelock_call.delay_seconds),
             state = EXCLUDED.state,
             scheduled_block_number = COALESCE(EXCLUDED.scheduled_block_number, timelock_call.scheduled_block_number),
             scheduled_block_timestamp = COALESCE(EXCLUDED.scheduled_block_timestamp, timelock_call.scheduled_block_timestamp),
             scheduled_transaction_hash = COALESCE(EXCLUDED.scheduled_transaction_hash, timelock_call.scheduled_transaction_hash),
             executed_block_number = COALESCE(EXCLUDED.executed_block_number, timelock_call.executed_block_number),
             executed_block_timestamp = COALESCE(EXCLUDED.executed_block_timestamp, timelock_call.executed_block_timestamp),
             executed_transaction_hash = COALESCE(EXCLUDED.executed_transaction_hash, timelock_call.executed_transaction_hash)",
    )
    .bind(&row.id)
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

fn required_numeric<'a>(
    value: &'a Option<String>,
    field: &str,
) -> Result<&'a str, PostgresIndexerRunnerStoreError> {
    value
        .as_deref()
        .ok_or_else(|| PostgresIndexerRunnerStoreError::new(format!("{field} is required")))
}

#[derive(Clone, Debug)]
struct DelegateMappingSnapshot {
    from: String,
    to: String,
    power: String,
}

#[derive(Clone, Debug)]
struct DelegateRollingSnapshot {
    id: String,
    log_index: i32,
    delegator: String,
    from_delegate: String,
    to_delegate: String,
    from_new_votes: Option<String>,
    to_new_votes: Option<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum RollingSide {
    From,
    To,
}

#[derive(Clone, Debug)]
struct DelegateRollingMatch {
    id: String,
    delegator: String,
    from_delegate: String,
    to_delegate: String,
    side: RollingSide,
}

async fn read_delegate_mapping(
    transaction: &mut Transaction<'_, Postgres>,
    from: &str,
) -> Result<Option<DelegateMappingSnapshot>, PostgresIndexerRunnerStoreError> {
    let row = sqlx::query(
        r#"SELECT "from", "to", power::TEXT AS power
           FROM delegate_mapping
           WHERE id = $1"#,
    )
    .bind(from)
    .fetch_optional(&mut **transaction)
    .await?;

    Ok(row.map(|row| DelegateMappingSnapshot {
        from: row.get("from"),
        to: row.get("to"),
        power: row.get("power"),
    }))
}

async fn transaction_rollings(
    transaction: &mut Transaction<'_, Postgres>,
    transaction_hash: &str,
) -> Result<Vec<DelegateRollingSnapshot>, PostgresIndexerRunnerStoreError> {
    let rows = sqlx::query(
        "SELECT id, log_index, delegator, from_delegate, to_delegate,
                from_new_votes::TEXT AS from_new_votes,
                to_new_votes::TEXT AS to_new_votes
         FROM delegate_rolling
         WHERE transaction_hash = $1
           AND from_delegate <> to_delegate
         ORDER BY log_index DESC",
    )
    .bind(transaction_hash)
    .fetch_all(&mut **transaction)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| DelegateRollingSnapshot {
            id: row.get("id"),
            log_index: row.get("log_index"),
            delegator: row.get("delegator"),
            from_delegate: row.get("from_delegate"),
            to_delegate: row.get("to_delegate"),
            from_new_votes: row.get("from_new_votes"),
            to_new_votes: row.get("to_new_votes"),
        })
        .collect())
}

fn find_rolling_match_from_rows(
    rollings: &[DelegateRollingSnapshot],
    delegate: &str,
    delta: &str,
    before_log_index: u64,
) -> Option<DelegateRollingMatch> {
    let before_log_index = u64_to_i32(before_log_index, "delegate_rolling.match_log_index").ok()?;
    let from = rollings
        .iter()
        .filter(|rolling| rolling.log_index < before_log_index)
        .filter(|rolling| rolling.from_new_votes.is_none())
        .find(|rolling| rolling.from_delegate == delegate)
        .map(|rolling| rolling_match(rolling, RollingSide::From));
    let to = rollings
        .iter()
        .filter(|rolling| rolling.log_index < before_log_index)
        .filter(|rolling| rolling.to_new_votes.is_none())
        .find(|rolling| rolling.to_delegate == delegate)
        .map(|rolling| rolling_match(rolling, RollingSide::To));

    if is_negative_decimal(delta) {
        from.or(to)
    } else {
        to.or(from)
    }
}

fn rolling_match(rolling: &DelegateRollingSnapshot, side: RollingSide) -> DelegateRollingMatch {
    DelegateRollingMatch {
        id: rolling.id.clone(),
        delegator: rolling.delegator.clone(),
        from_delegate: rolling.from_delegate.clone(),
        to_delegate: rolling.to_delegate.clone(),
        side,
    }
}

async fn signed_decimal_delta(
    transaction: &mut Transaction<'_, Postgres>,
    next: &str,
    previous: &str,
) -> Result<String, PostgresIndexerRunnerStoreError> {
    let row = sqlx::query("SELECT ($1::NUMERIC(78, 0) - $2::NUMERIC(78, 0))::TEXT AS delta")
        .bind(next)
        .bind(previous)
        .fetch_one(&mut **transaction)
        .await?;

    Ok(row.get("delta"))
}

async fn add_signed_decimal(
    transaction: &mut Transaction<'_, Postgres>,
    value: &str,
    delta: &str,
) -> Result<String, PostgresIndexerRunnerStoreError> {
    let row = sqlx::query("SELECT ($1::NUMERIC(78, 0) + $2::NUMERIC(78, 0))::TEXT AS value")
        .bind(value)
        .bind(delta)
        .fetch_one(&mut **transaction)
        .await?;

    Ok(row.get("value"))
}

fn is_negative_decimal(value: &str) -> bool {
    value.trim_start().starts_with('-')
}

fn is_nonzero_decimal(value: &str) -> bool {
    !value
        .trim()
        .trim_start_matches('-')
        .trim_start_matches('0')
        .is_empty()
}

fn vote_power_checkpoint_cause(has_delegate_change: bool, has_transfer: bool) -> &'static str {
    match (has_delegate_change, has_transfer) {
        (true, true) => "delegate-change+transfer",
        (true, false) => "delegate-change",
        (false, true) => "transfer",
        (false, false) => "delegate-votes-changed",
    }
}

fn token_operation_id(operation: &TokenProjectionOperation) -> &str {
    match operation {
        TokenProjectionOperation::DelegateChanged { id, .. }
        | TokenProjectionOperation::DelegateVotesChanged { id, .. }
        | TokenProjectionOperation::Transfer { id, .. } => id,
    }
}

fn transfer_units(value: &str, standard: GovernanceTokenStandard) -> String {
    match standard {
        GovernanceTokenStandard::Erc20 => value.to_owned(),
        GovernanceTokenStandard::Erc721 => "1".to_owned(),
    }
}

fn delegate_ref(from_delegate: &str, to_delegate: &str) -> String {
    format!("{from_delegate}_{to_delegate}")
}

fn is_zero_address(value: &str) -> bool {
    value.eq_ignore_ascii_case("0x0000000000000000000000000000000000000000")
}

fn u64_to_i32(value: u64, field: &str) -> Result<i32, PostgresIndexerRunnerStoreError> {
    i32::try_from(value).map_err(|_| {
        PostgresIndexerRunnerStoreError::new(format!("{field} value {value} exceeds INTEGER"))
    })
}

fn i64_to_i32(value: i64, field: &str) -> Result<i32, PostgresIndexerRunnerStoreError> {
    i32::try_from(value).map_err(|_| {
        PostgresIndexerRunnerStoreError::new(format!("{field} value {value} exceeds INTEGER"))
    })
}

fn usize_to_i32(value: usize, field: &str) -> Result<i32, PostgresIndexerRunnerStoreError> {
    i32::try_from(value).map_err(|_| {
        PostgresIndexerRunnerStoreError::new(format!("{field} value {value} exceeds INTEGER"))
    })
}

fn u64_to_string(value: u64) -> String {
    value.to_string()
}

fn data_metric_id(chain_id: i32, governor_address: &str, dao_code: &str) -> String {
    format!("{chain_id}:{governor_address}:{dao_code}")
}
