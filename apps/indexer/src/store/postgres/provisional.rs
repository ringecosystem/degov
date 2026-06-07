#[derive(Clone)]
pub struct PostgresProvisionalSegmentStore {
    pool: PgPool,
}

impl PostgresProvisionalSegmentStore {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn write_provisional_segments(
        &self,
        segments: &[DatalensProvisionalSegmentWrite],
    ) -> Result<(), PostgresIndexerRunnerStoreError> {
        let mut transaction = self.pool.begin().await?;
        for segment in segments {
            upsert_provisional_segment(&mut transaction, segment).await?;
        }
        transaction.commit().await?;

        Ok(())
    }
}

impl DatalensProvisionalSegmentStore for PostgresProvisionalSegmentStore {
    type Error = PostgresIndexerRunnerStoreError;

    fn write_provisional_segments(
        &mut self,
        segments: &[DatalensProvisionalSegmentWrite],
    ) -> Result<(), Self::Error> {
        block_on_runtime(PostgresProvisionalSegmentStore::write_provisional_segments(
            self, segments,
        ))
    }
}

#[derive(Clone)]
pub struct PostgresProvisionalPowerOverlayStore {
    pool: PgPool,
}

impl PostgresProvisionalPowerOverlayStore {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn write_power_overlays(
        &self,
        contributors: &[ProvisionalContributorPowerOverlayWrite],
        delegates: &[ProvisionalDelegatePowerOverlayWrite],
    ) -> Result<(), PostgresIndexerRunnerStoreError> {
        let mut transaction = self.pool.begin().await?;
        for contributor in contributors {
            upsert_provisional_contributor_power_overlay(&mut transaction, contributor).await?;
        }
        for delegate in delegates {
            upsert_provisional_delegate_power_overlay(&mut transaction, delegate).await?;
        }
        transaction.commit().await?;

        Ok(())
    }

    pub async fn current_delegate_power_overlay_relations(
        &self,
        scopes: &[ProvisionalPowerOverlayScope],
    ) -> Result<Vec<ProvisionalDelegatePowerOverlayRelation>, PostgresIndexerRunnerStoreError> {
        let mut relations = Vec::new();
        for scope in scopes {
            relations.extend(read_current_delegate_power_overlay_relations(&self.pool, scope).await?);
        }

        Ok(relations)
    }
}

impl ProvisionalPowerOverlayStore for PostgresProvisionalPowerOverlayStore {
    type Error = PostgresIndexerRunnerStoreError;

    fn current_delegate_power_overlay_relations(
        &mut self,
        scopes: &[ProvisionalPowerOverlayScope],
    ) -> Result<Vec<ProvisionalDelegatePowerOverlayRelation>, Self::Error> {
        block_on_runtime(
            PostgresProvisionalPowerOverlayStore::current_delegate_power_overlay_relations(
                self, scopes,
            ),
        )
    }

    fn write_power_overlays(
        &mut self,
        contributors: &[ProvisionalContributorPowerOverlayWrite],
        delegates: &[ProvisionalDelegatePowerOverlayWrite],
    ) -> Result<(), Self::Error> {
        block_on_runtime(PostgresProvisionalPowerOverlayStore::write_power_overlays(
            self,
            contributors,
            delegates,
        ))
    }
}

#[derive(Clone)]
pub struct PostgresProvisionalProposalOverlayStore {
    pool: PgPool,
}

impl PostgresProvisionalProposalOverlayStore {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn write_proposal_overlays(
        &self,
        proposals: &[ProvisionalProposalOverlayWrite],
        timelocks: &[ProvisionalTimelockOperationOverlayWrite],
    ) -> Result<(), PostgresIndexerRunnerStoreError> {
        let mut transaction = self.pool.begin().await?;
        for proposal in proposals {
            upsert_provisional_proposal_overlay(&mut transaction, proposal).await?;
        }
        for timelock in timelocks {
            upsert_provisional_timelock_operation_overlay(&mut transaction, timelock).await?;
        }
        transaction.commit().await?;

        Ok(())
    }
}

impl ProvisionalProposalOverlayStore for PostgresProvisionalProposalOverlayStore {
    type Error = PostgresIndexerRunnerStoreError;

    fn write_proposal_overlays(
        &mut self,
        proposals: &[ProvisionalProposalOverlayWrite],
        timelocks: &[ProvisionalTimelockOperationOverlayWrite],
    ) -> Result<(), Self::Error> {
        block_on_runtime(PostgresProvisionalProposalOverlayStore::write_proposal_overlays(
            self, proposals, timelocks,
        ))
    }
}

async fn upsert_provisional_segment(
    transaction: &mut Transaction<'_, Postgres>,
    segment: &DatalensProvisionalSegmentWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(UPSERT_PROVISIONAL_SEGMENT_SQL)
        .bind(&segment.id)
        .bind(&segment.dao_code)
        .bind(&segment.contract_set_id)
        .bind(segment.chain_id)
        .bind(&segment.chain_name)
        .bind(&segment.dataset_key)
        .bind(&segment.selector)
        .bind(&segment.selector_fingerprint)
        .bind(segment.range_start_block)
        .bind(segment.range_end_block)
        .bind(&segment.segment_finality)
        .bind(&segment.source)
        .bind(if segment.error.is_some() {
            "error"
        } else {
            "available"
        })
        .bind(segment.anchor_block_number)
        .bind(&segment.anchor_block_hash)
        .bind(&segment.anchor_parent_hash)
        .bind(segment.anchor_block_timestamp)
        .bind(&segment.error)
        .execute(&mut **transaction)
        .await?;

    Ok(())
}

async fn upsert_provisional_proposal_overlay(
    transaction: &mut Transaction<'_, Postgres>,
    proposal: &ProvisionalProposalOverlayWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(UPSERT_PROVISIONAL_PROPOSAL_OVERLAY_SQL)
        .bind(&proposal.id)
        .bind(&proposal.segment_id)
        .bind(&proposal.contract_set_id)
        .bind(proposal.chain_id)
        .bind(&proposal.chain_name)
        .bind(&proposal.dao_code)
        .bind(&proposal.governor_address)
        .bind(&proposal.contract_address)
        .bind(&proposal.proposal_id)
        .bind(&proposal.proposer)
        .bind(&proposal.targets)
        .bind(&proposal.values)
        .bind(&proposal.signatures)
        .bind(&proposal.calldatas)
        .bind(&proposal.vote_start)
        .bind(&proposal.vote_end)
        .bind(&proposal.description)
        .bind(&proposal.title)
        .bind(&proposal.state)
        .bind(&proposal.vote_start_timestamp)
        .bind(&proposal.vote_end_timestamp)
        .bind(&proposal.description_hash)
        .bind(&proposal.proposal_snapshot)
        .bind(&proposal.proposal_deadline)
        .bind(&proposal.proposal_eta)
        .bind(&proposal.queue_ready_at)
        .bind(&proposal.queue_expires_at)
        .bind(&proposal.counting_mode)
        .bind(&proposal.timelock_address)
        .bind(&proposal.timelock_grace_period)
        .bind(&proposal.clock_mode)
        .bind(&proposal.quorum)
        .bind(&proposal.decimals)
        .bind(&proposal.source)
        .bind(&proposal.status)
        .bind(&proposal.anchor_block_number)
        .bind(&proposal.anchor_block_hash)
        .bind(&proposal.anchor_parent_hash)
        .bind(&proposal.anchor_block_timestamp)
        .execute(&mut **transaction)
        .await?;

    Ok(())
}

async fn upsert_provisional_timelock_operation_overlay(
    transaction: &mut Transaction<'_, Postgres>,
    timelock: &ProvisionalTimelockOperationOverlayWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(UPSERT_PROVISIONAL_TIMELOCK_OPERATION_OVERLAY_SQL)
        .bind(&timelock.id)
        .bind(&timelock.segment_id)
        .bind(&timelock.contract_set_id)
        .bind(timelock.chain_id)
        .bind(&timelock.chain_name)
        .bind(&timelock.dao_code)
        .bind(&timelock.governor_address)
        .bind(&timelock.timelock_address)
        .bind(&timelock.proposal_id)
        .bind(&timelock.operation_id)
        .bind(&timelock.timelock_type)
        .bind(&timelock.predecessor)
        .bind(&timelock.salt)
        .bind(&timelock.state)
        .bind(timelock.call_count)
        .bind(timelock.executed_call_count)
        .bind(&timelock.delay_seconds)
        .bind(&timelock.ready_at)
        .bind(&timelock.expires_at)
        .bind(&timelock.queued_block_number)
        .bind(&timelock.queued_block_timestamp)
        .bind(&timelock.queued_transaction_hash)
        .bind(&timelock.cancelled_block_number)
        .bind(&timelock.cancelled_block_timestamp)
        .bind(&timelock.cancelled_transaction_hash)
        .bind(&timelock.executed_block_number)
        .bind(&timelock.executed_block_timestamp)
        .bind(&timelock.executed_transaction_hash)
        .bind(&timelock.source)
        .bind(&timelock.status)
        .bind(&timelock.anchor_block_number)
        .bind(&timelock.anchor_block_hash)
        .bind(&timelock.anchor_parent_hash)
        .bind(&timelock.anchor_block_timestamp)
        .execute(&mut **transaction)
        .await?;

    Ok(())
}

const UPSERT_PROVISIONAL_SEGMENT_SQL: &str = "INSERT INTO degov_provisional_segment (
             id, dao_code, contract_set_id, chain_id, chain_name, dataset_key, selector,
             selector_fingerprint, range_start_block, range_end_block, segment_finality,
             source, status, anchor_block_number, anchor_block_hash, anchor_parent_hash,
             anchor_block_timestamp, error
         )
         VALUES (
             $1, $2, $3, $4, $5, $6, $7,
             $8, $9::NUMERIC(78, 0), $10::NUMERIC(78, 0), $11,
             $12, $13, $14::NUMERIC(78, 0), $15, $16,
             $17::NUMERIC(78, 0), $18
         )
         ON CONFLICT ON CONSTRAINT degov_provisional_segment_scope_unique
         DO UPDATE SET
             id = EXCLUDED.id,
             selector_fingerprint = EXCLUDED.selector_fingerprint,
             status = EXCLUDED.status,
             anchor_block_number = EXCLUDED.anchor_block_number,
             anchor_block_hash = EXCLUDED.anchor_block_hash,
             anchor_parent_hash = EXCLUDED.anchor_parent_hash,
             anchor_block_timestamp = EXCLUDED.anchor_block_timestamp,
             error = EXCLUDED.error,
             updated_at = now()";

async fn read_current_delegate_power_overlay_relations(
    pool: &PgPool,
    scope: &ProvisionalPowerOverlayScope,
) -> Result<Vec<ProvisionalDelegatePowerOverlayRelation>, PostgresIndexerRunnerStoreError> {
    let rows = sqlx::query(
        "SELECT
             contract_set_id, chain_id, dao_code, governor_address, token_address,
             from_delegate, to_delegate, is_current
         FROM delegate
         WHERE contract_set_id = $1
           AND chain_id = $2
           AND dao_code IS NOT DISTINCT FROM $3
           AND governor_address = $4
           AND (token_address IS NOT DISTINCT FROM $5 OR token_address IS NULL)
           AND from_delegate = $6
           AND is_current = TRUE",
    )
    .bind(&scope.contract_set_id)
    .bind(scope.chain_id)
    .bind(&scope.dao_code)
    .bind(&scope.governor_address)
    .bind(&scope.token_address)
    .bind(&scope.account)
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| ProvisionalDelegatePowerOverlayRelation {
            contract_set_id: row.get("contract_set_id"),
            chain_id: row.get("chain_id"),
            chain_name: None,
            dao_code: row.get("dao_code"),
            governor_address: row.get("governor_address"),
            token_address: row
                .get::<Option<String>, _>("token_address")
                .or_else(|| Some(scope.token_address.clone())),
            delegator: row.get("from_delegate"),
            delegate: row.get("to_delegate"),
            is_current: row.get("is_current"),
        })
        .collect())
}

async fn upsert_provisional_contributor_power_overlay(
    transaction: &mut Transaction<'_, Postgres>,
    contributor: &ProvisionalContributorPowerOverlayWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(UPSERT_PROVISIONAL_CONTRIBUTOR_POWER_OVERLAY_SQL)
        .bind(&contributor.id)
        .bind(&contributor.segment_id)
        .bind(&contributor.contract_set_id)
        .bind(contributor.chain_id)
        .bind(&contributor.chain_name)
        .bind(&contributor.dao_code)
        .bind(&contributor.governor_address)
        .bind(&contributor.token_address)
        .bind(&contributor.account)
        .bind(&contributor.power)
        .bind(&contributor.balance)
        .bind(contributor.delegates_count_all)
        .bind(contributor.delegates_count_effective)
        .bind(&contributor.last_vote_block_number)
        .bind(&contributor.last_vote_timestamp)
        .bind(&contributor.source)
        .bind(&contributor.status)
        .bind(&contributor.anchor_block_number)
        .bind(&contributor.anchor_block_hash)
        .bind(&contributor.anchor_parent_hash)
        .bind(&contributor.anchor_block_timestamp)
        .execute(&mut **transaction)
        .await?;

    Ok(())
}

async fn upsert_provisional_delegate_power_overlay(
    transaction: &mut Transaction<'_, Postgres>,
    delegate: &ProvisionalDelegatePowerOverlayWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(UPSERT_PROVISIONAL_DELEGATE_POWER_OVERLAY_SQL)
        .bind(&delegate.id)
        .bind(&delegate.segment_id)
        .bind(&delegate.contract_set_id)
        .bind(delegate.chain_id)
        .bind(&delegate.chain_name)
        .bind(&delegate.dao_code)
        .bind(&delegate.governor_address)
        .bind(&delegate.token_address)
        .bind(&delegate.delegator)
        .bind(&delegate.delegate)
        .bind(&delegate.power)
        .bind(delegate.is_current)
        .bind(&delegate.source)
        .bind(&delegate.status)
        .bind(&delegate.anchor_block_number)
        .bind(&delegate.anchor_block_hash)
        .bind(&delegate.anchor_parent_hash)
        .bind(&delegate.anchor_block_timestamp)
        .execute(&mut **transaction)
        .await?;

    Ok(())
}

const UPSERT_PROVISIONAL_CONTRIBUTOR_POWER_OVERLAY_SQL: &str =
    "INSERT INTO degov_provisional_contributor_power_overlay (
             id, segment_id, contract_set_id, chain_id, chain_name, dao_code, governor_address,
             token_address, account, power, balance, delegates_count_all,
             delegates_count_effective, last_vote_block_number, last_vote_timestamp, source,
             status, anchor_block_number, anchor_block_hash, anchor_parent_hash,
             anchor_block_timestamp
         )
         VALUES (
             $1, $2, $3, $4, $5, $6, $7,
             $8, $9, $10::NUMERIC(78, 0), $11::NUMERIC(78, 0), $12,
             $13, $14::NUMERIC(78, 0), $15::NUMERIC(78, 0), $16,
             $17, $18::NUMERIC(78, 0), $19, $20,
             $21::NUMERIC(78, 0)
         )
         ON CONFLICT ON CONSTRAINT degov_provisional_contributor_power_overlay_scope_unique
         DO UPDATE SET
             id = EXCLUDED.id,
             segment_id = EXCLUDED.segment_id,
             power = EXCLUDED.power,
             balance = EXCLUDED.balance,
             delegates_count_all = EXCLUDED.delegates_count_all,
             delegates_count_effective = EXCLUDED.delegates_count_effective,
             last_vote_block_number = EXCLUDED.last_vote_block_number,
             last_vote_timestamp = EXCLUDED.last_vote_timestamp,
             status = EXCLUDED.status,
             anchor_block_number = EXCLUDED.anchor_block_number,
             anchor_block_hash = EXCLUDED.anchor_block_hash,
             anchor_parent_hash = EXCLUDED.anchor_parent_hash,
             anchor_block_timestamp = EXCLUDED.anchor_block_timestamp,
             updated_at = now()";

const UPSERT_PROVISIONAL_DELEGATE_POWER_OVERLAY_SQL: &str =
    "INSERT INTO degov_provisional_delegate_power_overlay (
             id, segment_id, contract_set_id, chain_id, chain_name, dao_code, governor_address,
             token_address, delegator, delegate, power, is_current, source, status,
             anchor_block_number, anchor_block_hash, anchor_parent_hash, anchor_block_timestamp
         )
         VALUES (
             $1, $2, $3, $4, $5, $6, $7,
             $8, $9, $10, $11::NUMERIC(78, 0), $12, $13, $14,
             $15::NUMERIC(78, 0), $16, $17, $18::NUMERIC(78, 0)
         )
         ON CONFLICT ON CONSTRAINT degov_provisional_delegate_power_overlay_scope_unique
         DO UPDATE SET
             id = EXCLUDED.id,
             segment_id = EXCLUDED.segment_id,
             power = EXCLUDED.power,
             is_current = EXCLUDED.is_current,
             status = EXCLUDED.status,
             anchor_block_number = EXCLUDED.anchor_block_number,
             anchor_block_hash = EXCLUDED.anchor_block_hash,
             anchor_parent_hash = EXCLUDED.anchor_parent_hash,
             anchor_block_timestamp = EXCLUDED.anchor_block_timestamp,
             updated_at = now()";

const UPSERT_PROVISIONAL_PROPOSAL_OVERLAY_SQL: &str =
    "INSERT INTO degov_provisional_proposal_overlay (
             id, segment_id, contract_set_id, chain_id, chain_name, dao_code, governor_address,
             contract_address, proposal_id, proposer, targets, values, signatures, calldatas,
             vote_start, vote_end, description, title, state, vote_start_timestamp,
             vote_end_timestamp, description_hash, proposal_snapshot, proposal_deadline,
             proposal_eta, queue_ready_at, queue_expires_at, counting_mode, timelock_address,
             timelock_grace_period, clock_mode, quorum, decimals, source, status,
             anchor_block_number, anchor_block_hash, anchor_parent_hash, anchor_block_timestamp
         )
         VALUES (
             $1, $2, $3, $4, $5, $6, $7,
             $8, $9, $10, $11, $12, $13, $14,
             $15::NUMERIC(78, 0), $16::NUMERIC(78, 0), $17, $18, $19,
             $20::NUMERIC(78, 0), $21::NUMERIC(78, 0), $22,
             $23::NUMERIC(78, 0), $24::NUMERIC(78, 0), $25::NUMERIC(78, 0),
             $26::NUMERIC(78, 0), $27::NUMERIC(78, 0), $28, $29,
             $30::NUMERIC(78, 0), $31, $32::NUMERIC(78, 0), $33::NUMERIC(78, 0),
             $34, $35, $36::NUMERIC(78, 0), $37, $38, $39::NUMERIC(78, 0)
         )
         ON CONFLICT ON CONSTRAINT degov_provisional_proposal_overlay_scope_unique
         DO UPDATE SET
             id = EXCLUDED.id,
             segment_id = EXCLUDED.segment_id,
             contract_address = EXCLUDED.contract_address,
             proposer = EXCLUDED.proposer,
             targets = EXCLUDED.targets,
             values = EXCLUDED.values,
             signatures = EXCLUDED.signatures,
             calldatas = EXCLUDED.calldatas,
             vote_start = EXCLUDED.vote_start,
             vote_end = EXCLUDED.vote_end,
             description = EXCLUDED.description,
             title = EXCLUDED.title,
             state = EXCLUDED.state,
             vote_start_timestamp = EXCLUDED.vote_start_timestamp,
             vote_end_timestamp = EXCLUDED.vote_end_timestamp,
             description_hash = EXCLUDED.description_hash,
             proposal_snapshot = EXCLUDED.proposal_snapshot,
             proposal_deadline = EXCLUDED.proposal_deadline,
             proposal_eta = EXCLUDED.proposal_eta,
             queue_ready_at = EXCLUDED.queue_ready_at,
             queue_expires_at = EXCLUDED.queue_expires_at,
             counting_mode = EXCLUDED.counting_mode,
             timelock_address = EXCLUDED.timelock_address,
             timelock_grace_period = EXCLUDED.timelock_grace_period,
             clock_mode = EXCLUDED.clock_mode,
             quorum = EXCLUDED.quorum,
             decimals = EXCLUDED.decimals,
             status = EXCLUDED.status,
             anchor_block_number = EXCLUDED.anchor_block_number,
             anchor_block_hash = EXCLUDED.anchor_block_hash,
             anchor_parent_hash = EXCLUDED.anchor_parent_hash,
             anchor_block_timestamp = EXCLUDED.anchor_block_timestamp,
             updated_at = now()";

const UPSERT_PROVISIONAL_TIMELOCK_OPERATION_OVERLAY_SQL: &str =
    "INSERT INTO degov_provisional_timelock_operation_overlay (
             id, segment_id, contract_set_id, chain_id, chain_name, dao_code, governor_address,
             timelock_address, proposal_id, operation_id, timelock_type, predecessor, salt,
             state, call_count, executed_call_count, delay_seconds, ready_at, expires_at,
             queued_block_number, queued_block_timestamp, queued_transaction_hash,
             cancelled_block_number, cancelled_block_timestamp, cancelled_transaction_hash,
             executed_block_number, executed_block_timestamp, executed_transaction_hash, source,
             status, anchor_block_number, anchor_block_hash, anchor_parent_hash,
             anchor_block_timestamp
         )
         VALUES (
             $1, $2, $3, $4, $5, $6, $7,
             $8, $9, $10, $11, $12, $13,
             $14, $15, $16, $17::NUMERIC(78, 0), $18::NUMERIC(78, 0),
             $19::NUMERIC(78, 0), $20::NUMERIC(78, 0), $21::NUMERIC(78, 0), $22,
             $23::NUMERIC(78, 0), $24::NUMERIC(78, 0), $25,
             $26::NUMERIC(78, 0), $27::NUMERIC(78, 0), $28, $29,
             $30, $31::NUMERIC(78, 0), $32, $33, $34::NUMERIC(78, 0)
         )
         ON CONFLICT ON CONSTRAINT degov_provisional_timelock_operation_overlay_scope_unique
         DO UPDATE SET
             id = EXCLUDED.id,
             segment_id = EXCLUDED.segment_id,
             timelock_type = EXCLUDED.timelock_type,
             predecessor = EXCLUDED.predecessor,
             salt = EXCLUDED.salt,
             state = EXCLUDED.state,
             call_count = EXCLUDED.call_count,
             executed_call_count = EXCLUDED.executed_call_count,
             delay_seconds = EXCLUDED.delay_seconds,
             ready_at = EXCLUDED.ready_at,
             expires_at = EXCLUDED.expires_at,
             queued_block_number = EXCLUDED.queued_block_number,
             queued_block_timestamp = EXCLUDED.queued_block_timestamp,
             queued_transaction_hash = EXCLUDED.queued_transaction_hash,
             cancelled_block_number = EXCLUDED.cancelled_block_number,
             cancelled_block_timestamp = EXCLUDED.cancelled_block_timestamp,
             cancelled_transaction_hash = EXCLUDED.cancelled_transaction_hash,
             executed_block_number = EXCLUDED.executed_block_number,
             executed_block_timestamp = EXCLUDED.executed_block_timestamp,
             executed_transaction_hash = EXCLUDED.executed_transaction_hash,
             status = EXCLUDED.status,
             anchor_block_number = EXCLUDED.anchor_block_number,
             anchor_block_hash = EXCLUDED.anchor_block_hash,
             anchor_parent_hash = EXCLUDED.anchor_parent_hash,
             anchor_block_timestamp = EXCLUDED.anchor_block_timestamp,
             updated_at = now()";

#[cfg(test)]
mod provisional_segment_sql_tests {
    use super::*;

    #[test]
    fn test_provisional_segment_upsert_targets_scope_constraint() {
        assert!(
            UPSERT_PROVISIONAL_SEGMENT_SQL
                .contains("ON CONFLICT ON CONSTRAINT degov_provisional_segment_scope_unique")
        );
    }

    #[test]
    fn test_provisional_power_overlay_upserts_target_scope_constraints() {
        assert!(
            UPSERT_PROVISIONAL_CONTRIBUTOR_POWER_OVERLAY_SQL.contains(
                "ON CONFLICT ON CONSTRAINT degov_provisional_contributor_power_overlay_scope_unique"
            )
        );
        assert!(
            UPSERT_PROVISIONAL_DELEGATE_POWER_OVERLAY_SQL.contains(
                "ON CONFLICT ON CONSTRAINT degov_provisional_delegate_power_overlay_scope_unique"
            )
        );
    }

    #[test]
    fn test_provisional_proposal_overlay_upserts_target_scope_constraints() {
        assert!(
            UPSERT_PROVISIONAL_PROPOSAL_OVERLAY_SQL
                .contains("ON CONFLICT ON CONSTRAINT degov_provisional_proposal_overlay_scope_unique")
        );
        assert!(
            UPSERT_PROVISIONAL_TIMELOCK_OPERATION_OVERLAY_SQL.contains(
                "ON CONFLICT ON CONSTRAINT degov_provisional_timelock_operation_overlay_scope_unique"
            )
        );
    }
}
