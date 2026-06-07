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

async fn upsert_provisional_segment(
    transaction: &mut Transaction<'_, Postgres>,
    segment: &DatalensProvisionalSegmentWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(
        "INSERT INTO degov_provisional_segment (
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
         ON CONFLICT (
             chain_id, chain_name, contract_set_id, dao_code, dataset_key, selector,
             range_start_block, range_end_block, segment_finality, source
         )
         DO UPDATE SET
             id = EXCLUDED.id,
             selector_fingerprint = EXCLUDED.selector_fingerprint,
             status = EXCLUDED.status,
             anchor_block_number = EXCLUDED.anchor_block_number,
             anchor_block_hash = EXCLUDED.anchor_block_hash,
             anchor_parent_hash = EXCLUDED.anchor_parent_hash,
             anchor_block_timestamp = EXCLUDED.anchor_block_timestamp,
             error = EXCLUDED.error,
             updated_at = now()",
    )
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
