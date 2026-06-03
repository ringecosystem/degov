use sqlx::{PgPool, Postgres, Row, Transaction};

use crate::CheckpointError;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IndexerCheckpointIdentity {
    pub dao_code: String,
    pub chain_id: i32,
    pub contract_set_id: String,
    pub stream_id: String,
    pub data_source_version: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IndexerCheckpoint {
    pub identity: IndexerCheckpointIdentity,
    pub next_block: i64,
    pub processed_height: Option<i64>,
    pub target_height: Option<i64>,
    pub updated_at: String,
    pub last_error: Option<String>,
    pub lock_owner: Option<String>,
    pub locked_at: Option<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CheckpointBlockRange {
    pub from_block: i64,
    pub to_block: i64,
}

#[derive(Clone)]
pub struct CheckpointRepository {
    pool: PgPool,
}

impl CheckpointRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn read_or_create(
        &self,
        identity: &IndexerCheckpointIdentity,
        start_block: i64,
    ) -> Result<IndexerCheckpoint, CheckpointError> {
        if start_block < 0 {
            return Err(CheckpointError::InvalidBlockHeight);
        }

        sqlx::query(
            "INSERT INTO degov_indexer_checkpoint (
                dao_code,
                chain_id,
                contract_set_id,
                stream_id,
                data_source_version,
                next_block,
                updated_at
             )
             VALUES ($1, $2, $3, $4, $5, $6::NUMERIC(78, 0), now())
             ON CONFLICT (dao_code, chain_id, contract_set_id, stream_id, data_source_version)
             DO NOTHING",
        )
        .bind(&identity.dao_code)
        .bind(identity.chain_id)
        .bind(&identity.contract_set_id)
        .bind(&identity.stream_id)
        .bind(&identity.data_source_version)
        .bind(start_block)
        .execute(&self.pool)
        .await?;

        self.read(identity).await
    }

    pub async fn read(
        &self,
        identity: &IndexerCheckpointIdentity,
    ) -> Result<IndexerCheckpoint, CheckpointError> {
        let row = sqlx::query(
            "SELECT
                dao_code,
                chain_id,
                contract_set_id,
                stream_id,
                data_source_version,
                next_block::BIGINT AS next_block,
                processed_height::BIGINT AS processed_height,
                target_height::BIGINT AS target_height,
                updated_at::TEXT AS updated_at,
                last_error,
                lock_owner,
                locked_at::TEXT AS locked_at
             FROM degov_indexer_checkpoint
             WHERE dao_code = $1
               AND chain_id = $2
               AND contract_set_id = $3
               AND stream_id = $4
               AND data_source_version = $5",
        )
        .bind(&identity.dao_code)
        .bind(identity.chain_id)
        .bind(&identity.contract_set_id)
        .bind(&identity.stream_id)
        .bind(&identity.data_source_version)
        .fetch_optional(&self.pool)
        .await?
        .ok_or_else(|| missing_checkpoint(identity))?;

        checkpoint_from_row(&row)
    }

    pub async fn processed_height(
        &self,
        identity: &IndexerCheckpointIdentity,
    ) -> Result<Option<i64>, CheckpointError> {
        let row = sqlx::query(
            "SELECT processed_height::BIGINT AS processed_height
             FROM degov_indexer_checkpoint
             WHERE dao_code = $1
               AND chain_id = $2
               AND contract_set_id = $3
               AND stream_id = $4
               AND data_source_version = $5",
        )
        .bind(&identity.dao_code)
        .bind(identity.chain_id)
        .bind(&identity.contract_set_id)
        .bind(&identity.stream_id)
        .bind(&identity.data_source_version)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row
            .map(|row| row.try_get::<Option<i64>, _>("processed_height"))
            .transpose()?
            .flatten())
    }

    pub async fn advance_after_projection(
        &self,
        transaction: &mut Transaction<'_, Postgres>,
        identity: &IndexerCheckpointIdentity,
        processed_height: i64,
        target_height: Option<i64>,
    ) -> Result<(), CheckpointError> {
        if processed_height < 0 || target_height.is_some_and(|height| height < 0) {
            return Err(CheckpointError::InvalidBlockHeight);
        }

        let result = sqlx::query(
            "UPDATE degov_indexer_checkpoint
             SET processed_height = GREATEST(
                   COALESCE(processed_height, $6::NUMERIC(78, 0)),
                   $6::NUMERIC(78, 0)
                 ),
                 next_block = GREATEST(
                   next_block,
                   ($6 + 1)::NUMERIC(78, 0)
                 ),
                 target_height = CASE
                   WHEN $7::BIGINT IS NULL THEN target_height
                   ELSE GREATEST(
                     COALESCE(target_height, $7::NUMERIC(78, 0)),
                     $7::NUMERIC(78, 0)
                   )
                 END,
                 last_error = NULL,
                 updated_at = now()
             WHERE dao_code = $1
               AND chain_id = $2
               AND contract_set_id = $3
               AND stream_id = $4
               AND data_source_version = $5",
        )
        .bind(&identity.dao_code)
        .bind(identity.chain_id)
        .bind(&identity.contract_set_id)
        .bind(&identity.stream_id)
        .bind(&identity.data_source_version)
        .bind(processed_height)
        .bind(target_height)
        .execute(&mut **transaction)
        .await?;

        if result.rows_affected() == 0 {
            return Err(missing_checkpoint(identity));
        }

        Ok(())
    }
}

pub fn plan_next_checkpoint_range(
    checkpoint: &IndexerCheckpoint,
    block_range_limit: u32,
    target_height: i64,
) -> Result<Option<CheckpointBlockRange>, CheckpointError> {
    if block_range_limit == 0 {
        return Err(CheckpointError::InvalidRangeLimit);
    }
    if target_height < 0 {
        return Err(CheckpointError::InvalidBlockHeight);
    }
    if checkpoint.next_block > target_height {
        return Ok(None);
    }

    let limit = i64::from(block_range_limit);
    let limited_end = checkpoint
        .next_block
        .checked_add(limit - 1)
        .ok_or(CheckpointError::InvalidBlockHeight)?;

    Ok(Some(CheckpointBlockRange {
        from_block: checkpoint.next_block,
        to_block: limited_end.min(target_height),
    }))
}

fn checkpoint_from_row(row: &sqlx::postgres::PgRow) -> Result<IndexerCheckpoint, CheckpointError> {
    Ok(IndexerCheckpoint {
        identity: IndexerCheckpointIdentity {
            dao_code: row.try_get("dao_code")?,
            chain_id: row.try_get("chain_id")?,
            contract_set_id: row.try_get("contract_set_id")?,
            stream_id: row.try_get("stream_id")?,
            data_source_version: row.try_get("data_source_version")?,
        },
        next_block: row.try_get("next_block")?,
        processed_height: row.try_get("processed_height")?,
        target_height: row.try_get("target_height")?,
        updated_at: row.try_get("updated_at")?,
        last_error: row.try_get("last_error")?,
        lock_owner: row.try_get("lock_owner")?,
        locked_at: row.try_get("locked_at")?,
    })
}

fn missing_checkpoint(identity: &IndexerCheckpointIdentity) -> CheckpointError {
    CheckpointError::MissingCheckpoint {
        dao_code: identity.dao_code.clone(),
        chain_id: identity.chain_id,
        contract_set_id: identity.contract_set_id.clone(),
        stream_id: identity.stream_id.clone(),
        data_source_version: identity.data_source_version.clone(),
    }
}
