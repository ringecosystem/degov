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
}
