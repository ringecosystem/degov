// Token projection writes and delegate relation maintenance.
const POSTGRES_BIND_PARAMETER_LIMIT: usize = 65_535;
const CONTRIBUTOR_ENSURE_BULK_CHUNK_SIZE_DEFAULT: usize = 3_000;
const TOKEN_EVENT_BULK_CHUNK_SIZE_DEFAULT: usize = 3_000;
const DELEGATE_ROLLING_VOTE_UPDATE_CHUNK_SIZE_DEFAULT: usize = 1_000;
const VOTE_POWER_CHECKPOINT_BULK_CHUNK_SIZE_DEFAULT: usize = 3_000;
const CONTRIBUTOR_ENSURE_BULK_BINDS_PER_ROW: usize = 16;
const TOKEN_EVENT_BULK_BINDS_PER_ROW: usize = 19;
const DELEGATE_ROLLING_VOTE_UPDATE_BINDS_PER_ROW: usize = 6;
const VOTE_POWER_CHECKPOINT_BULK_BINDS_PER_ROW: usize = 21;
const RECOMPUTE_DELEGATE_COUNT_EFFECTIVE_BINDS_PER_ROW: usize = 2;

fn bulk_chunk_size_from_env(
    env_name: &str,
    default_size: usize,
    binds_per_row: usize,
) -> usize {
    let requested_size = std::env::var(env_name)
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|size| *size > 0)
        .unwrap_or(default_size);
    requested_size.min(POSTGRES_BIND_PARAMETER_LIMIT / binds_per_row)
}

fn token_event_bulk_chunk_size() -> usize {
    bulk_chunk_size_from_env(
        "DEGOV_INDEXER_TOKEN_EVENT_BULK_CHUNK_SIZE",
        TOKEN_EVENT_BULK_CHUNK_SIZE_DEFAULT,
        TOKEN_EVENT_BULK_BINDS_PER_ROW,
    )
}

fn contributor_ensure_bulk_chunk_size() -> usize {
    bulk_chunk_size_from_env(
        "DEGOV_INDEXER_CONTRIBUTOR_ENSURE_BULK_CHUNK_SIZE",
        CONTRIBUTOR_ENSURE_BULK_CHUNK_SIZE_DEFAULT,
        CONTRIBUTOR_ENSURE_BULK_BINDS_PER_ROW,
    )
}

fn delegate_rolling_vote_update_chunk_size() -> usize {
    bulk_chunk_size_from_env(
        "DEGOV_INDEXER_DELEGATE_ROLLING_VOTE_UPDATE_CHUNK_SIZE",
        DELEGATE_ROLLING_VOTE_UPDATE_CHUNK_SIZE_DEFAULT,
        DELEGATE_ROLLING_VOTE_UPDATE_BINDS_PER_ROW,
    )
}

fn vote_power_checkpoint_bulk_chunk_size() -> usize {
    bulk_chunk_size_from_env(
        "DEGOV_INDEXER_VOTE_POWER_CHECKPOINT_BULK_CHUNK_SIZE",
        VOTE_POWER_CHECKPOINT_BULK_CHUNK_SIZE_DEFAULT,
        VOTE_POWER_CHECKPOINT_BULK_BINDS_PER_ROW,
    )
}

fn recompute_delegate_count_effective_chunk_size() -> usize {
    bulk_chunk_size_from_env(
        "DEGOV_INDEXER_RECOMPUTE_DELEGATE_COUNT_EFFECTIVE_CHUNK_SIZE",
        TOKEN_EVENT_BULK_CHUNK_SIZE_DEFAULT,
        RECOMPUTE_DELEGATE_COUNT_EFFECTIVE_BINDS_PER_ROW,
    )
}

fn chunk_count(row_count: usize, chunk_size: usize) -> usize {
    if row_count == 0 {
        0
    } else {
        (row_count - 1) / chunk_size + 1
    }
}

async fn write_token_batch_rows(
    transaction: &mut Transaction<'_, Postgres>,
    batch: &TokenProjectionBatch,
) -> Result<Vec<(String, String)>, PostgresIndexerRunnerStoreError> {
    let total_started_at = std::time::Instant::now();
    let mut inserted_operation_keys = Vec::new();

    let delegate_changed_started_at = std::time::Instant::now();
    inserted_operation_keys.extend(insert_delegate_changed_batch(transaction, &batch.delegate_changed).await?);
    let delegate_changed_duration = delegate_changed_started_at.elapsed();

    let delegate_votes_changed_started_at = std::time::Instant::now();
    inserted_operation_keys.extend(
        insert_delegate_votes_changed_batch(transaction, &batch.delegate_votes_changed).await?,
    );
    let delegate_votes_changed_duration = delegate_votes_changed_started_at.elapsed();

    let token_transfer_started_at = std::time::Instant::now();
    inserted_operation_keys.extend(insert_token_transfer_batch(transaction, &batch.token_transfers).await?);
    let token_transfer_duration = token_transfer_started_at.elapsed();

    let delegate_rolling_started_at = std::time::Instant::now();
    upsert_delegate_rolling_batch(transaction, &batch.delegate_rollings).await?;
    let delegate_rolling_duration = delegate_rolling_started_at.elapsed();

    let metadata_preload_started_at = std::time::Instant::now();
    let metadata_cache = BatchTokenMetadataCache::preload(transaction, batch).await?;
    let metadata_preload_duration = metadata_preload_started_at.elapsed();

    let vote_power_checkpoint_started_at = std::time::Instant::now();
    insert_vote_power_checkpoint_batch(transaction, &metadata_cache, &batch.delegate_votes_changed).await?;
    let vote_power_checkpoint_duration = vote_power_checkpoint_started_at.elapsed();

    if let Some(common) = token_batch_common(batch) {
        let token_event_chunk_size = token_event_bulk_chunk_size();
        log::info!(
            "Datalens indexer token row write phases dao_code={} chain_id={} contract_set_id={} token_event_chunk_size={} delegate_changed_count={} delegate_changed_chunk_count={} delegate_votes_changed_count={} delegate_votes_changed_chunk_count={} token_transfer_count={} token_transfer_chunk_count={} delegate_rolling_count={} delegate_rolling_chunk_count={} inserted_operation_count={} delegate_changed_duration_ms={} delegate_votes_changed_duration_ms={} token_transfer_duration_ms={} delegate_rolling_duration_ms={} metadata_preload_duration_ms={} vote_power_checkpoint_duration_ms={} total_duration_ms={}",
            common.dao_code,
            common.chain_id,
            common.contract_set_id,
            token_event_chunk_size,
            batch.delegate_changed.len(),
            chunk_count(batch.delegate_changed.len(), token_event_chunk_size),
            batch.delegate_votes_changed.len(),
            chunk_count(batch.delegate_votes_changed.len(), token_event_chunk_size),
            batch.token_transfers.len(),
            chunk_count(batch.token_transfers.len(), token_event_chunk_size),
            batch.delegate_rollings.len(),
            chunk_count(batch.delegate_rollings.len(), token_event_chunk_size),
            inserted_operation_keys.len(),
            delegate_changed_duration.as_millis(),
            delegate_votes_changed_duration.as_millis(),
            token_transfer_duration.as_millis(),
            delegate_rolling_duration.as_millis(),
            metadata_preload_duration.as_millis(),
            vote_power_checkpoint_duration.as_millis(),
            total_started_at.elapsed().as_millis(),
        );
    }

    Ok(inserted_operation_keys)
}

async fn insert_delegate_changed_batch(
    transaction: &mut Transaction<'_, Postgres>,
    rows: &[DelegateChangedWrite],
) -> Result<Vec<(String, String)>, PostgresIndexerRunnerStoreError> {
    let mut inserted = Vec::new();
    for rows in rows.chunks(token_event_bulk_chunk_size()) {
        let mut query = QueryBuilder::<Postgres>::new(
            "INSERT INTO delegate_changed (
                id, contract_set_id, chain_id, dao_code, governor_address, token_address,
                contract_address, log_index, transaction_index, delegator, from_delegate,
                to_delegate, block_number, block_timestamp, transaction_hash
             ) VALUES ",
        );
        for (index, row) in rows.iter().enumerate() {
            if index > 0 {
                query.push(", ");
            }
            let common = &row.common;
            query
                .push("(")
                .push_bind(&row.id)
                .push(", ")
                .push_bind(&common.contract_set_id)
                .push(", ")
                .push_bind(common.chain_id)
                .push(", ")
                .push_bind(&common.dao_code)
                .push(", ")
                .push_bind(&common.governor_address)
                .push(", ")
                .push_bind(&common.token_address)
                .push(", ")
                .push_bind(&common.contract_address)
                .push(", ")
                .push_bind(u64_to_i32(common.log_index, "delegate_changed.log_index")?)
                .push(", ")
                .push_bind(u64_to_i32(
                    common.transaction_index,
                    "delegate_changed.transaction_index",
                )?)
                .push(", ")
                .push_bind(&row.delegator)
                .push(", ")
                .push_bind(&row.from_delegate)
                .push(", ")
                .push_bind(&row.to_delegate)
                .push(", ")
                .push_bind(&common.block_number)
                .push("::NUMERIC(78, 0), ")
                .push_bind(required_numeric(
                    &common.block_timestamp,
                    "delegate_changed.block_timestamp",
                )?)
                .push("::NUMERIC(78, 0), ")
                .push_bind(&common.transaction_hash)
                .push(")");
        }
        query.push(" ON CONFLICT (contract_set_id, id) DO NOTHING RETURNING contract_set_id, id");
        inserted.extend(fetch_inserted_operation_keys(transaction, query).await?);
    }

    Ok(inserted)
}

async fn insert_delegate_votes_changed_batch(
    transaction: &mut Transaction<'_, Postgres>,
    rows: &[DelegateVotesChangedWrite],
) -> Result<Vec<(String, String)>, PostgresIndexerRunnerStoreError> {
    let mut inserted = Vec::new();
    for rows in rows.chunks(token_event_bulk_chunk_size()) {
        let mut query = QueryBuilder::<Postgres>::new(
            "INSERT INTO delegate_votes_changed (
                id, contract_set_id, chain_id, dao_code, governor_address, token_address,
                contract_address, log_index, transaction_index, delegate, previous_votes,
                new_votes, block_number, block_timestamp, transaction_hash
             ) VALUES ",
        );
        for (index, row) in rows.iter().enumerate() {
            if index > 0 {
                query.push(", ");
            }
            let common = &row.common;
            query
                .push("(")
                .push_bind(&row.id)
                .push(", ")
                .push_bind(&common.contract_set_id)
                .push(", ")
                .push_bind(common.chain_id)
                .push(", ")
                .push_bind(&common.dao_code)
                .push(", ")
                .push_bind(&common.governor_address)
                .push(", ")
                .push_bind(&common.token_address)
                .push(", ")
                .push_bind(&common.contract_address)
                .push(", ")
                .push_bind(u64_to_i32(
                    common.log_index,
                    "delegate_votes_changed.log_index",
                )?)
                .push(", ")
                .push_bind(u64_to_i32(
                    common.transaction_index,
                    "delegate_votes_changed.transaction_index",
                )?)
                .push(", ")
                .push_bind(&row.delegate)
                .push(", ")
                .push_bind(&row.previous_votes)
                .push("::NUMERIC(78, 0), ")
                .push_bind(&row.new_votes)
                .push("::NUMERIC(78, 0), ")
                .push_bind(&common.block_number)
                .push("::NUMERIC(78, 0), ")
                .push_bind(required_numeric(
                    &common.block_timestamp,
                    "delegate_votes_changed.block_timestamp",
                )?)
                .push("::NUMERIC(78, 0), ")
                .push_bind(&common.transaction_hash)
                .push(")");
        }
        query.push(" ON CONFLICT (contract_set_id, id) DO NOTHING RETURNING contract_set_id, id");
        inserted.extend(fetch_inserted_operation_keys(transaction, query).await?);
    }

    Ok(inserted)
}

async fn insert_token_transfer_batch(
    transaction: &mut Transaction<'_, Postgres>,
    rows: &[TokenTransferWrite],
) -> Result<Vec<(String, String)>, PostgresIndexerRunnerStoreError> {
    let started_at = std::time::Instant::now();
    let chunk_size = token_event_bulk_chunk_size();
    let mut inserted = Vec::new();
    for rows in rows.chunks(chunk_size) {
        let mut ids = Vec::with_capacity(rows.len());
        let mut contract_set_ids = Vec::with_capacity(rows.len());
        let mut chain_ids = Vec::with_capacity(rows.len());
        let mut dao_codes = Vec::with_capacity(rows.len());
        let mut governor_addresses = Vec::with_capacity(rows.len());
        let mut token_addresses = Vec::with_capacity(rows.len());
        let mut contract_addresses = Vec::with_capacity(rows.len());
        let mut log_indexes = Vec::with_capacity(rows.len());
        let mut transaction_indexes = Vec::with_capacity(rows.len());
        let mut from_accounts = Vec::with_capacity(rows.len());
        let mut to_accounts = Vec::with_capacity(rows.len());
        let mut values = Vec::with_capacity(rows.len());
        let mut standards = Vec::with_capacity(rows.len());
        let mut block_numbers = Vec::with_capacity(rows.len());
        let mut block_timestamps = Vec::with_capacity(rows.len());
        let mut transaction_hashes = Vec::with_capacity(rows.len());

        for row in rows {
            let common = &row.common;
            ids.push(row.id.clone());
            contract_set_ids.push(common.contract_set_id.clone());
            chain_ids.push(common.chain_id);
            dao_codes.push(common.dao_code.clone());
            governor_addresses.push(common.governor_address.clone());
            token_addresses.push(common.token_address.clone());
            contract_addresses.push(common.contract_address.clone());
            log_indexes.push(u64_to_i32(common.log_index, "token_transfer.log_index")?);
            transaction_indexes.push(u64_to_i32(
                common.transaction_index,
                "token_transfer.transaction_index",
            )?);
            from_accounts.push(row.from.clone());
            to_accounts.push(row.to.clone());
            values.push(row.value.clone());
            standards.push(row.standard.clone());
            block_numbers.push(common.block_number.clone());
            block_timestamps.push(
                required_numeric(&common.block_timestamp, "token_transfer.block_timestamp")?
                    .to_owned(),
            );
            transaction_hashes.push(common.transaction_hash.clone());
        }

        let inserted_rows = sqlx::query(
            "INSERT INTO token_transfer (
                id, contract_set_id, chain_id, dao_code, governor_address, token_address,
                contract_address, log_index, transaction_index, \"from\", \"to\", value, standard,
                block_number, block_timestamp, transaction_hash
             )
             SELECT
                source.id,
                source.contract_set_id,
                source.chain_id,
                source.dao_code,
                source.governor_address,
                source.token_address,
                source.contract_address,
                source.log_index,
                source.transaction_index,
                source.from_account,
                source.to_account,
                source.value::NUMERIC(78, 0),
                source.standard,
                source.block_number::NUMERIC(78, 0),
                source.block_timestamp::NUMERIC(78, 0),
                source.transaction_hash
             FROM UNNEST(
                $1::TEXT[], $2::TEXT[], $3::INT4[], $4::TEXT[], $5::TEXT[], $6::TEXT[],
                $7::TEXT[], $8::INT4[], $9::INT4[], $10::TEXT[], $11::TEXT[], $12::TEXT[],
                $13::TEXT[], $14::TEXT[], $15::TEXT[], $16::TEXT[]
             ) AS source(
                id, contract_set_id, chain_id, dao_code, governor_address, token_address,
                contract_address, log_index, transaction_index, from_account, to_account, value,
                standard, block_number, block_timestamp, transaction_hash
             )
             ON CONFLICT (contract_set_id, id) DO NOTHING
             RETURNING contract_set_id, id",
        )
        .bind(&ids)
        .bind(&contract_set_ids)
        .bind(&chain_ids)
        .bind(&dao_codes)
        .bind(&governor_addresses)
        .bind(&token_addresses)
        .bind(&contract_addresses)
        .bind(&log_indexes)
        .bind(&transaction_indexes)
        .bind(&from_accounts)
        .bind(&to_accounts)
        .bind(&values)
        .bind(&standards)
        .bind(&block_numbers)
        .bind(&block_timestamps)
        .bind(&transaction_hashes)
        .fetch_all(&mut **transaction)
        .await?;
        inserted.extend(inserted_rows.into_iter().map(|row| {
            (
                row.get::<String, _>("contract_set_id"),
                row.get::<String, _>("id"),
            )
        }));
    }

    if let Some(common) = rows.first().map(|row| &row.common) {
        log::info!(
            "Datalens indexer token transfer row write completed dao_code={} chain_id={} contract_set_id={} row_count={} chunk_size={} chunk_count={} inserted_count={} duration_ms={}",
            common.dao_code,
            common.chain_id,
            common.contract_set_id,
            rows.len(),
            chunk_size,
            chunk_count(rows.len(), chunk_size),
            inserted.len(),
            started_at.elapsed().as_millis()
        );
    }

    Ok(inserted)
}

async fn fetch_inserted_operation_keys(
    transaction: &mut Transaction<'_, Postgres>,
    mut query: QueryBuilder<'_, Postgres>,
) -> Result<Vec<(String, String)>, PostgresIndexerRunnerStoreError> {
    Ok(query
        .build()
        .fetch_all(&mut **transaction)
        .await?
        .into_iter()
        .map(|row| {
            (
                row.get::<String, _>("contract_set_id"),
                row.get::<String, _>("id"),
            )
        })
        .collect())
}

async fn upsert_delegate_rolling_batch(
    transaction: &mut Transaction<'_, Postgres>,
    rows: &[DelegateRollingWrite],
) -> Result<(), PostgresIndexerRunnerStoreError> {
    for rows in rows.chunks(token_event_bulk_chunk_size()) {
        let mut query = QueryBuilder::<Postgres>::new(
            "INSERT INTO delegate_rolling (
                id, contract_set_id, chain_id, dao_code, governor_address, token_address,
                contract_address, log_index, transaction_index, delegator, from_delegate,
                to_delegate, block_number, block_timestamp, transaction_hash, from_previous_votes,
                from_new_votes, to_previous_votes, to_new_votes
             ) VALUES ",
        );
        for (index, row) in rows.iter().enumerate() {
            if index > 0 {
                query.push(", ");
            }
            let common = &row.common;
            query
                .push("(")
                .push_bind(&row.id)
                .push(", ")
                .push_bind(&common.contract_set_id)
                .push(", ")
                .push_bind(common.chain_id)
                .push(", ")
                .push_bind(&common.dao_code)
                .push(", ")
                .push_bind(&common.governor_address)
                .push(", ")
                .push_bind(&common.token_address)
                .push(", ")
                .push_bind(&common.contract_address)
                .push(", ")
                .push_bind(u64_to_i32(common.log_index, "delegate_rolling.log_index")?)
                .push(", ")
                .push_bind(u64_to_i32(
                    common.transaction_index,
                    "delegate_rolling.transaction_index",
                )?)
                .push(", ")
                .push_bind(&row.delegator)
                .push(", ")
                .push_bind(&row.from_delegate)
                .push(", ")
                .push_bind(&row.to_delegate)
                .push(", ")
                .push_bind(&common.block_number)
                .push("::NUMERIC(78, 0), ")
                .push_bind(required_numeric(
                    &common.block_timestamp,
                    "delegate_rolling.block_timestamp",
                )?)
                .push("::NUMERIC(78, 0), ")
                .push_bind(&common.transaction_hash)
                .push(", ")
                .push_bind(row.from_previous_votes.as_deref())
                .push("::NUMERIC(78, 0), ")
                .push_bind(row.from_new_votes.as_deref())
                .push("::NUMERIC(78, 0), ")
                .push_bind(row.to_previous_votes.as_deref())
                .push("::NUMERIC(78, 0), ")
                .push_bind(row.to_new_votes.as_deref())
                .push("::NUMERIC(78, 0))");
        }
        query.push(
            " ON CONFLICT (contract_set_id, id) DO UPDATE
              SET from_previous_votes = COALESCE(EXCLUDED.from_previous_votes, delegate_rolling.from_previous_votes),
                  from_new_votes = COALESCE(EXCLUDED.from_new_votes, delegate_rolling.from_new_votes),
                  to_previous_votes = COALESCE(EXCLUDED.to_previous_votes, delegate_rolling.to_previous_votes),
                  to_new_votes = COALESCE(EXCLUDED.to_new_votes, delegate_rolling.to_new_votes)",
        );
        query.build().execute(&mut **transaction).await?;
    }

    Ok(())
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct VotePowerCheckpointInsert {
    id: String,
    common: TokenEventCommon,
    log_index: i32,
    transaction_index: i32,
    account: String,
    timepoint: String,
    previous_power: String,
    new_power: String,
    delta: String,
    cause: &'static str,
    delegator: Option<String>,
    from_delegate: Option<String>,
    to_delegate: Option<String>,
    block_timestamp: String,
}

async fn insert_vote_power_checkpoint_batch(
    transaction: &mut Transaction<'_, Postgres>,
    metadata_cache: &BatchTokenMetadataCache,
    rows: &[DelegateVotesChangedWrite],
) -> Result<(), PostgresIndexerRunnerStoreError> {
    let rows = collect_vote_power_checkpoint_inserts(metadata_cache, rows)?;
    for rows in rows.chunks(vote_power_checkpoint_bulk_chunk_size()) {
        let mut query = QueryBuilder::<Postgres>::new(
            "INSERT INTO vote_power_checkpoint (
                id, contract_set_id, chain_id, dao_code, governor_address, token_address, contract_address,
                log_index, transaction_index, account, clock_mode, timepoint, previous_power,
                new_power, delta, source, cause, delegator, from_delegate, to_delegate, block_number,
                block_timestamp, transaction_hash
             ) VALUES ",
        );
        for (index, row) in rows.iter().enumerate() {
            if index > 0 {
                query.push(", ");
            }
            let common = &row.common;
            query
                .push("(")
                .push_bind(&row.id)
                .push(", ")
                .push_bind(&common.contract_set_id)
                .push(", ")
                .push_bind(common.chain_id)
                .push(", ")
                .push_bind(&common.dao_code)
                .push(", ")
                .push_bind(&common.governor_address)
                .push(", ")
                .push_bind(&common.token_address)
                .push(", ")
                .push_bind(&common.contract_address)
                .push(", ")
                .push_bind(row.log_index)
                .push(", ")
                .push_bind(row.transaction_index)
                .push(", ")
                .push_bind(&row.account)
                .push(", 'blocknumber', ")
                .push_bind(&row.timepoint)
                .push("::NUMERIC(78, 0), ")
                .push_bind(&row.previous_power)
                .push("::NUMERIC(78, 0), ")
                .push_bind(&row.new_power)
                .push("::NUMERIC(78, 0), ")
                .push_bind(&row.delta)
                .push("::NUMERIC(78, 0), 'event', ")
                .push_bind(row.cause)
                .push(", ")
                .push_bind(row.delegator.as_deref())
                .push(", ")
                .push_bind(row.from_delegate.as_deref())
                .push(", ")
                .push_bind(row.to_delegate.as_deref())
                .push(", ")
                .push_bind(&common.block_number)
                .push("::NUMERIC(78, 0), ")
                .push_bind(&row.block_timestamp)
                .push("::NUMERIC(78, 0), ")
                .push_bind(&common.transaction_hash)
                .push(")");
        }
        query.push(" ON CONFLICT (contract_set_id, id) DO NOTHING");
        query.build().execute(&mut **transaction).await?;
    }

    Ok(())
}

fn collect_vote_power_checkpoint_inserts(
    metadata_cache: &BatchTokenMetadataCache,
    rows: &[DelegateVotesChangedWrite],
) -> Result<Vec<VotePowerCheckpointInsert>, PostgresIndexerRunnerStoreError> {
    rows.iter()
        .map(|row| {
            let delta = signed_decimal_delta(&row.new_votes, &row.previous_votes);
            let transfers_count = metadata_cache.transfer_count(&row.common);
            let rolling_match = metadata_cache.find_rolling_match(
                &row.common,
                &row.delegate,
                &delta,
                row.common.log_index,
            );
            let cause = vote_power_checkpoint_cause(
                metadata_cache.has_rollings(&row.common),
                transfers_count > 0,
            );

            Ok(VotePowerCheckpointInsert {
                id: row.id.clone(),
                common: row.common.clone(),
                log_index: u64_to_i32(row.common.log_index, "vote_power_checkpoint.log_index")?,
                transaction_index: u64_to_i32(
                    row.common.transaction_index,
                    "vote_power_checkpoint.transaction_index",
                )?,
                account: row.delegate.clone(),
                timepoint: row.common.block_number.clone(),
                previous_power: row.previous_votes.clone(),
                new_power: row.new_votes.clone(),
                delta,
                cause,
                delegator: rolling_match.as_ref().map(|item| item.delegator.clone()),
                from_delegate: rolling_match
                    .as_ref()
                    .map(|item| item.from_delegate.clone()),
                to_delegate: rolling_match.as_ref().map(|item| item.to_delegate.clone()),
                block_timestamp: required_numeric(
                    &row.common.block_timestamp,
                    "vote_power_checkpoint.block_timestamp",
                )?
                .to_owned(),
            })
        })
        .collect()
}

async fn apply_token_operation(
    transaction: &mut Transaction<'_, Postgres>,
    delegate_mapping_cache: &mut DelegateMappingCache,
    delegate_snapshot_cache: &mut DelegateSnapshotCache,
    contributor_ensure_cache: &mut ContributorEnsureCache,
    metadata_cache: &mut BatchTokenMetadataCache,
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
                delegate_mapping_cache,
                delegate_snapshot_cache,
                common,
                delegator,
                from_delegate,
                to_delegate,
                contributor_ensure_cache,
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
                delegate_mapping_cache,
                delegate_snapshot_cache,
                common,
                delegate,
                previous_votes,
                new_votes,
                contributor_ensure_cache,
                metadata_cache,
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
        } => {
            apply_transfer_operation(
                transaction,
                delegate_mapping_cache,
                delegate_snapshot_cache,
                common,
                from,
                to,
                value,
                *standard,
                contributor_ensure_cache,
            )
            .await
        }
    }
}

async fn apply_delegate_changed_operation(
    transaction: &mut Transaction<'_, Postgres>,
    delegate_mapping_cache: &mut DelegateMappingCache,
    delegate_snapshot_cache: &mut DelegateSnapshotCache,
    common: &TokenEventCommon,
    delegator: &str,
    from_delegate: &str,
    to_delegate: &str,
    contributor_ensure_cache: &mut ContributorEnsureCache,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    if !is_zero_address(to_delegate) {
        contributor_ensure_cache
            .ensure(transaction, to_delegate, common)
            .await?;
    }
    let previous_mapping =
        read_delegate_mapping_cached(transaction, delegate_mapping_cache, common, delegator)
            .await?;
    let is_noop = previous_mapping
        .as_ref()
        .is_some_and(|mapping| mapping.to == to_delegate && from_delegate == to_delegate);
    if is_noop {
        return Ok(());
    }

    if let Some(previous) = previous_mapping {
        upsert_delegate_snapshot(
            delegate_snapshot_cache,
            common,
            delegator,
            &previous.to,
            false,
            "0",
        )?;
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
            contributor_ensure_cache,
        )
        .await?;
        delete_delegate_mapping(transaction, delegate_mapping_cache, common, delegator).await?;
    }

    if is_zero_address(to_delegate) {
        return Ok(());
    }

    apply_delegate_count_delta(
        transaction,
        common,
        to_delegate,
        1,
        0,
        contributor_ensure_cache,
    )
    .await?;
    upsert_delegate_mapping_relation(
        transaction,
        delegate_mapping_cache,
        common,
        delegator,
        to_delegate,
        "0",
    )
    .await?;
    upsert_delegate_snapshot(
        delegate_snapshot_cache,
        common,
        delegator,
        to_delegate,
        true,
        "0",
    )?;

    Ok(())
}

async fn apply_delegate_votes_changed_operation(
    transaction: &mut Transaction<'_, Postgres>,
    delegate_mapping_cache: &mut DelegateMappingCache,
    delegate_snapshot_cache: &mut DelegateSnapshotCache,
    common: &TokenEventCommon,
    delegate: &str,
    previous_votes: &str,
    new_votes: &str,
    contributor_ensure_cache: &mut ContributorEnsureCache,
    metadata_cache: &mut BatchTokenMetadataCache,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    let delta = signed_decimal_delta(new_votes, previous_votes);
    let Some(rolling_match) =
        metadata_cache.find_rolling_match(common, delegate, &delta, common.log_index)
    else {
        return Ok(());
    };

    match rolling_match.side {
        RollingSide::From => {
            metadata_cache.mark_rolling_match(common, &rolling_match, previous_votes, new_votes);
            apply_delegate_delta(
                transaction,
                delegate_mapping_cache,
                delegate_snapshot_cache,
                common,
                &rolling_match.delegator,
                &rolling_match.from_delegate,
                &delta,
                contributor_ensure_cache,
            )
            .await
        }
        RollingSide::To => {
            metadata_cache.mark_rolling_match(common, &rolling_match, previous_votes, new_votes);
            apply_delegate_delta(
                transaction,
                delegate_mapping_cache,
                delegate_snapshot_cache,
                common,
                &rolling_match.delegator,
                &rolling_match.to_delegate,
                &delta,
                contributor_ensure_cache,
            )
            .await
        }
    }
}

async fn apply_transfer_operation(
    transaction: &mut Transaction<'_, Postgres>,
    delegate_mapping_cache: &mut DelegateMappingCache,
    delegate_snapshot_cache: &mut DelegateSnapshotCache,
    common: &TokenEventCommon,
    from: &str,
    to: &str,
    value: &str,
    standard: GovernanceTokenStandard,
    contributor_ensure_cache: &mut ContributorEnsureCache,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    let value = transfer_units(value, standard);
    if let Some(mapping) =
        read_delegate_mapping_cached(transaction, delegate_mapping_cache, common, from).await?
    {
        apply_delegate_delta(
            transaction,
            delegate_mapping_cache,
            delegate_snapshot_cache,
            common,
            &mapping.from,
            &mapping.to,
            &format!("-{value}"),
            contributor_ensure_cache,
        )
        .await?;
    }
    if let Some(mapping) =
        read_delegate_mapping_cached(transaction, delegate_mapping_cache, common, to).await?
    {
        apply_delegate_delta(
            transaction,
            delegate_mapping_cache,
            delegate_snapshot_cache,
            common,
            &mapping.from,
            &mapping.to,
            &value,
            contributor_ensure_cache,
        )
        .await?;
    }

    Ok(())
}

async fn apply_delegate_delta(
    transaction: &mut Transaction<'_, Postgres>,
    delegate_mapping_cache: &mut DelegateMappingCache,
    delegate_snapshot_cache: &mut DelegateSnapshotCache,
    common: &TokenEventCommon,
    from_delegate: &str,
    to_delegate: &str,
    delta: &str,
    contributor_ensure_cache: &mut ContributorEnsureCache,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    if is_zero_address(to_delegate) {
        return Ok(());
    }

    let Some(previous_mapping) =
        read_delegate_mapping_cached(transaction, delegate_mapping_cache, common, from_delegate)
            .await?
            .filter(|mapping| mapping.to == to_delegate)
    else {
        return Ok(());
    };
    let previous_mapping_power = previous_mapping.power.clone();
    let next_mapping_power = add_signed_decimal(&previous_mapping_power, delta);

    delegate_mapping_cache.stage_power(
        common,
        from_delegate,
        DelegateMappingSnapshot {
            common: previous_mapping.common,
            from: from_delegate.to_owned(),
            to: to_delegate.to_owned(),
            power: next_mapping_power.clone(),
        },
    );

    let previous_effective = is_nonzero_decimal(&previous_mapping_power);
    let next_effective = is_nonzero_decimal(&next_mapping_power);
    if previous_effective != next_effective {
        apply_delegate_count_delta(
            transaction,
            common,
            to_delegate,
            0,
            if next_effective { 1 } else { -1 },
            contributor_ensure_cache,
        )
        .await?;
    }
    upsert_delegate_snapshot(
        delegate_snapshot_cache,
        common,
        from_delegate,
        to_delegate,
        true,
        &next_mapping_power,
    )?;

    Ok(())
}

fn upsert_delegate_snapshot(
    delegate_snapshot_cache: &mut DelegateSnapshotCache,
    common: &TokenEventCommon,
    from_delegate: &str,
    to_delegate: &str,
    is_current: bool,
    power: &str,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    if is_zero_address(to_delegate) {
        return Ok(());
    }
    delegate_snapshot_cache.stage(common, from_delegate, to_delegate, is_current, power);

    Ok(())
}

#[derive(Clone, Debug)]
struct DelegateSnapshot {
    common: TokenEventCommon,
    from_delegate: String,
    to_delegate: String,
    is_current: bool,
    power: String,
}

#[derive(Debug, Default)]
struct DelegateSnapshotCache {
    dirty: std::collections::BTreeMap<(String, String), DelegateSnapshot>,
}

impl DelegateSnapshotCache {
    fn stage(
        &mut self,
        common: &TokenEventCommon,
        from_delegate: &str,
        to_delegate: &str,
        is_current: bool,
        power: &str,
    ) {
        let id = delegate_ref(common, from_delegate, to_delegate);
        self.dirty.insert(
            (common.contract_set_id.clone(), id),
            DelegateSnapshot {
                common: common.clone(),
                from_delegate: from_delegate.to_owned(),
                to_delegate: to_delegate.to_owned(),
                is_current,
                power: power.to_owned(),
            },
        );
    }

    fn drain_snapshots(&mut self) -> Vec<DelegateSnapshot> {
        std::mem::take(&mut self.dirty).into_values().collect()
    }

    async fn flush(
        &mut self,
        transaction: &mut Transaction<'_, Postgres>,
    ) -> Result<(), PostgresIndexerRunnerStoreError> {
        let snapshots = self.drain_snapshots();
        if snapshots.is_empty() {
            return Ok(());
        }

        for rows in snapshots.chunks(token_event_bulk_chunk_size()) {
            upsert_delegate_snapshot_batch(transaction, rows).await?;
        }

        Ok(())
    }
}

async fn upsert_delegate_snapshot_batch(
    transaction: &mut Transaction<'_, Postgres>,
    rows: &[DelegateSnapshot],
) -> Result<(), PostgresIndexerRunnerStoreError> {
    let mut query = QueryBuilder::<Postgres>::new(
        "INSERT INTO delegate (
            id, contract_set_id, chain_id, dao_code, governor_address, token_address, contract_address,
            log_index, transaction_index, from_delegate, to_delegate, block_number,
            block_timestamp, transaction_hash, is_current, power
         ) VALUES ",
    );
    for (index, row) in rows.iter().enumerate() {
        if index > 0 {
            query.push(", ");
        }
        let common = &row.common;
        query
            .push("(")
            .push_bind(delegate_ref(common, &row.from_delegate, &row.to_delegate))
            .push(", ")
            .push_bind(&common.contract_set_id)
            .push(", ")
            .push_bind(common.chain_id)
            .push(", ")
            .push_bind(&common.dao_code)
            .push(", ")
            .push_bind(&common.governor_address)
            .push(", ")
            .push_bind(&common.token_address)
            .push(", ")
            .push_bind(&common.contract_address)
            .push(", ")
            .push_bind(u64_to_i32(common.log_index, "delegate.log_index")?)
            .push(", ")
            .push_bind(u64_to_i32(
                common.transaction_index,
                "delegate.transaction_index",
            )?)
            .push(", ")
            .push_bind(&row.from_delegate)
            .push(", ")
            .push_bind(&row.to_delegate)
            .push(", ")
            .push_bind(&common.block_number)
            .push("::NUMERIC(78, 0), ")
            .push_bind(required_numeric(
                &common.block_timestamp,
                "delegate.block_timestamp",
            )?)
            .push("::NUMERIC(78, 0), ")
            .push_bind(&common.transaction_hash)
            .push(", ")
            .push_bind(row.is_current)
            .push(", ")
            .push_bind(&row.power)
            .push("::NUMERIC(78, 0))");
    }
    query.push(
        " ON CONFLICT (contract_set_id, id) DO UPDATE
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
    );
    query.build().execute(&mut **transaction).await?;

    Ok(())
}

async fn upsert_delegate_mapping_relation(
    _transaction: &mut Transaction<'_, Postgres>,
    delegate_mapping_cache: &mut DelegateMappingCache,
    common: &TokenEventCommon,
    from: &str,
    to: &str,
    power: &str,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    delegate_mapping_cache.stage_relation(
        common,
        from,
        Some(DelegateMappingSnapshot {
            common: common.clone(),
            from: from.to_owned(),
            to: to.to_owned(),
            power: power.to_owned(),
        }),
    );

    Ok(())
}

async fn delete_delegate_mapping(
    _transaction: &mut Transaction<'_, Postgres>,
    delegate_mapping_cache: &mut DelegateMappingCache,
    common: &TokenEventCommon,
    from: &str,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    delegate_mapping_cache.stage_delete(common, from);

    Ok(())
}

async fn apply_delegate_count_delta(
    transaction: &mut Transaction<'_, Postgres>,
    common: &TokenEventCommon,
    delegate: &str,
    all_delta: i64,
    effective_delta: i64,
    contributor_ensure_cache: &mut ContributorEnsureCache,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    if is_zero_address(delegate) {
        return Ok(());
    }
    contributor_ensure_cache
        .ensure(transaction, delegate, common)
        .await?;
    contributor_ensure_cache.stage_contributor_count_delta(
        common,
        delegate,
        all_delta,
        effective_delta,
    );

    Ok(())
}

async fn ensure_contributor(
    transaction: &mut Transaction<'_, Postgres>,
    account: &str,
    common: &TokenEventCommon,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    let result = sqlx::query(
        "INSERT INTO contributor (
            id, contract_set_id, chain_id, dao_code, governor_address, token_address, contract_address,
            log_index, transaction_index, block_number, block_timestamp, transaction_hash,
            power, balance, delegates_count_all, delegates_count_effective
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::NUMERIC(78, 0), $11::NUMERIC(78, 0),
            $12, 0::NUMERIC(78, 0), NULL, 0, 0
         )
         ON CONFLICT (contract_set_id, id) DO NOTHING",
    )
    .bind(contributor_ref(account))
    .bind(&common.contract_set_id)
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
        increment_contributor_count(transaction, common).await?;
    }

    Ok(())
}

#[derive(Clone, Debug)]
struct ContributorEnsureCandidate {
    operation_id: String,
    account: String,
    common: TokenEventCommon,
}

#[derive(Clone, Debug)]
struct ContributorEnsureInsert {
    account: String,
    common: TokenEventCommon,
    log_index: i32,
    transaction_index: i32,
    block_timestamp: String,
}

#[derive(Debug, Default)]
struct ContributorEnsureCache {
    ensured: HashSet<(String, String)>,
    pending_contributor_count_increments: HashMap<(String, String), TokenEventCommon>,
    contributor_count_increments:
        std::collections::BTreeMap<DataMetricIncrementScope, DataMetricIncrement>,
    contributor_count_deltas:
        std::collections::BTreeMap<ContributorCountDeltaKey, ContributorCountDelta>,
}

#[derive(Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
struct DataMetricIncrementScope {
    contract_set_id: String,
    chain_id: i32,
    dao_code: String,
    governor_address: String,
}

impl From<&TokenEventCommon> for DataMetricIncrementScope {
    fn from(common: &TokenEventCommon) -> Self {
        Self {
            contract_set_id: common.contract_set_id.clone(),
            chain_id: common.chain_id,
            dao_code: common.dao_code.clone(),
            governor_address: common.governor_address.clone(),
        }
    }
}

#[derive(Clone, Debug)]
struct DataMetricIncrement {
    common: TokenEventCommon,
    count: i32,
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
struct ContributorCountDeltaKey {
    contract_set_id: String,
    account: String,
}

#[derive(Clone, Debug)]
struct ContributorCountDelta {
    common: TokenEventCommon,
    all_delta: i64,
    effective_delta: i64,
}

impl ContributorEnsureCache {
    async fn preload_batch(
        &mut self,
        transaction: &mut Transaction<'_, Postgres>,
        batch: &TokenProjectionBatch,
        inserted_operation_keys: &HashSet<(&str, &str)>,
    ) -> Result<(), PostgresIndexerRunnerStoreError> {
        let candidates = collect_contributor_ensure_candidates(batch)
            .into_iter()
            .filter(|candidate| {
                inserted_operation_keys.contains(&(
                    candidate.common.contract_set_id.as_str(),
                    candidate.operation_id.as_str(),
                ))
            })
            .collect::<Vec<_>>();
        self.ensure_batch(transaction, &candidates).await
    }

    async fn ensure_batch(
        &mut self,
        transaction: &mut Transaction<'_, Postgres>,
        candidates: &[ContributorEnsureCandidate],
    ) -> Result<(), PostgresIndexerRunnerStoreError> {
        let candidates = candidates
            .iter()
            .filter(|candidate| self.insert_cache_key(candidate))
            .cloned()
            .collect::<Vec<_>>();
        if candidates.is_empty() {
            return Ok(());
        }
        let rows = candidates
            .iter()
            .map(|candidate| {
                let common = &candidate.common;
                Ok(ContributorEnsureInsert {
                    account: candidate.account.clone(),
                    common: common.clone(),
                    log_index: u64_to_i32(common.log_index, "contributor.log_index")?,
                    transaction_index: u64_to_i32(
                        common.transaction_index,
                        "contributor.transaction_index",
                    )?,
                    block_timestamp: required_numeric(
                        &common.block_timestamp,
                        "contributor.block_timestamp",
                    )?
                    .to_owned(),
                })
            })
            .collect::<Result<Vec<_>, PostgresIndexerRunnerStoreError>>()?;

        for rows in rows.chunks(contributor_ensure_bulk_chunk_size()) {
            let mut query = QueryBuilder::<Postgres>::new(
                "INSERT INTO contributor (
                    id, contract_set_id, chain_id, dao_code, governor_address, token_address,
                    contract_address, log_index, transaction_index, block_number, block_timestamp,
                    transaction_hash, power, balance, delegates_count_all, delegates_count_effective
                 ) VALUES ",
            );
            for (index, row) in rows.iter().enumerate() {
                if index > 0 {
                    query.push(", ");
                }
                let common = &row.common;
                query
                    .push("(")
                    .push_bind(&row.account)
                    .push(", ")
                    .push_bind(&common.contract_set_id)
                    .push(", ")
                    .push_bind(common.chain_id)
                    .push(", ")
                    .push_bind(&common.dao_code)
                    .push(", ")
                    .push_bind(&common.governor_address)
                    .push(", ")
                    .push_bind(&common.token_address)
                    .push(", ")
                    .push_bind(&common.contract_address)
                    .push(", ")
                    .push_bind(row.log_index)
                    .push(", ")
                    .push_bind(row.transaction_index)
                    .push(", ")
                    .push_bind(&common.block_number)
                    .push("::NUMERIC(78, 0), ")
                    .push_bind(&row.block_timestamp)
                    .push("::NUMERIC(78, 0), ")
                    .push_bind(&common.transaction_hash)
                    .push(", 0::NUMERIC(78, 0), NULL::NUMERIC(78, 0), 0::INTEGER, 0::INTEGER)");
            }
            query.push(
                " ON CONFLICT (contract_set_id, id) DO NOTHING RETURNING contract_set_id, id",
            );

            let inserted = query
                .build()
                .fetch_all(&mut **transaction)
                .await?
                .into_iter()
                .map(|row| {
                    (
                        row.get::<String, _>("contract_set_id"),
                        row.get::<String, _>("id"),
                    )
                })
                .collect::<Vec<_>>();
            self.stage_contributor_count_increments(rows, &inserted);
        }

        Ok(())
    }

    async fn ensure(
        &mut self,
        transaction: &mut Transaction<'_, Postgres>,
        account: &str,
        common: &TokenEventCommon,
    ) -> Result<(), PostgresIndexerRunnerStoreError> {
        let candidate = ContributorEnsureCandidate {
            operation_id: String::new(),
            account: contributor_ref(account),
            common: common.clone(),
        };
        if !self.insert_cache_key(&candidate) {
            if let Some(common) = self.pending_contributor_count_increments.remove(&(
                candidate.common.contract_set_id.clone(),
                candidate.account.clone(),
            )) {
                self.stage_contributor_count_increment(&common);
            }
            return Ok(());
        }
        ensure_contributor(transaction, account, common).await
    }

    fn insert_cache_key(&mut self, candidate: &ContributorEnsureCandidate) -> bool {
        self.ensured.insert((
            candidate.common.contract_set_id.clone(),
            candidate.account.clone(),
        ))
    }

    fn stage_contributor_count_increments(
        &mut self,
        candidates: &[ContributorEnsureInsert],
        inserted: &[(String, String)],
    ) {
        let inserted = inserted.iter().cloned().collect::<HashSet<_>>();
        for candidate in candidates {
            let key = (
                candidate.common.contract_set_id.clone(),
                candidate.account.clone(),
            );
            if inserted.contains(&key) {
                self.pending_contributor_count_increments
                    .entry(key)
                    .or_insert_with(|| candidate.common.clone());
            }
        }
    }

    fn stage_contributor_count_increment(&mut self, common: &TokenEventCommon) {
        let key = DataMetricIncrementScope::from(common);
        self.contributor_count_increments
            .entry(key)
            .and_modify(|increment| increment.count += 1)
            .or_insert_with(|| DataMetricIncrement {
                common: common.clone(),
                count: 1,
            });
    }

    fn stage_contributor_count_delta(
        &mut self,
        common: &TokenEventCommon,
        delegate: &str,
        all_delta: i64,
        effective_delta: i64,
    ) {
        let key = ContributorCountDeltaKey {
            contract_set_id: common.contract_set_id.clone(),
            account: contributor_ref(delegate),
        };
        self.contributor_count_deltas
            .entry(key)
            .and_modify(|delta| {
                delta.common = common.clone();
                delta.all_delta += all_delta;
                delta.effective_delta += effective_delta;
            })
            .or_insert_with(|| ContributorCountDelta {
                common: common.clone(),
                all_delta,
                effective_delta,
            });
    }

    async fn flush_contributor_count_deltas(
        &mut self,
        transaction: &mut Transaction<'_, Postgres>,
    ) -> Result<usize, PostgresIndexerRunnerStoreError> {
        let deltas = std::mem::take(&mut self.contributor_count_deltas)
            .into_iter()
            .collect::<Vec<_>>();
        let delta_count = deltas.len();
        if deltas.is_empty() {
            return Ok(0);
        }

        for rows in deltas.chunks(token_event_bulk_chunk_size()) {
            let mut query = QueryBuilder::<Postgres>::new(
                "UPDATE contributor
                 SET chain_id = delta.chain_id,
                     dao_code = delta.dao_code,
                     governor_address = delta.governor_address,
                     token_address = delta.token_address,
                     contract_address = delta.contract_address,
                     log_index = delta.log_index,
                     transaction_index = delta.transaction_index,
                     block_number = delta.block_number,
                     block_timestamp = delta.block_timestamp,
                     transaction_hash = delta.transaction_hash,
                     delegates_count_all = GREATEST(contributor.delegates_count_all + delta.all_delta, 0),
                     delegates_count_effective = GREATEST(contributor.delegates_count_effective + delta.effective_delta, 0)
                 FROM (VALUES ",
            );
            for (index, (key, delta)) in rows.iter().enumerate() {
                if index > 0 {
                    query.push(", ");
                }
                let common = &delta.common;
                query
                    .push("(")
                    .push_bind(&key.contract_set_id)
                    .push(", ")
                    .push_bind(&key.account)
                    .push(", ")
                    .push_bind(common.chain_id)
                    .push(", ")
                    .push_bind(&common.dao_code)
                    .push(", ")
                    .push_bind(&common.governor_address)
                    .push(", ")
                    .push_bind(&common.token_address)
                    .push(", ")
                    .push_bind(&common.contract_address)
                    .push(", ")
                    .push_bind(u64_to_i32(common.log_index, "contributor.log_index")?)
                    .push(", ")
                    .push_bind(u64_to_i32(
                        common.transaction_index,
                        "contributor.transaction_index",
                    )?)
                    .push(", ")
                    .push_bind(&common.block_number)
                    .push("::NUMERIC(78, 0), ")
                    .push_bind(required_numeric(
                        &common.block_timestamp,
                        "contributor.block_timestamp",
                    )?)
                    .push("::NUMERIC(78, 0), ")
                    .push_bind(&common.transaction_hash)
                    .push(", ")
                    .push_bind(i64_to_i32(
                        delta.all_delta,
                        "contributor.delegates_count_all_delta",
                    )?)
                    .push(", ")
                    .push_bind(i64_to_i32(
                        delta.effective_delta,
                        "contributor.delegates_count_effective_delta",
                    )?)
                    .push(")");
            }
            query.push(
                ") AS delta(
                    contract_set_id, id, chain_id, dao_code, governor_address, token_address,
                    contract_address, log_index, transaction_index, block_number, block_timestamp,
                    transaction_hash, all_delta, effective_delta
                 )
                 WHERE contributor.contract_set_id = delta.contract_set_id
                   AND contributor.id = delta.id",
            );
            query.build().execute(&mut **transaction).await?;
        }

        Ok(delta_count)
    }

    async fn flush_contributor_count_increments(
        &mut self,
        transaction: &mut Transaction<'_, Postgres>,
    ) -> Result<(), PostgresIndexerRunnerStoreError> {
        for (_, increment) in std::mem::take(&mut self.contributor_count_increments) {
            increment_contributor_count_by(transaction, &increment.common, increment.count).await?;
        }

        Ok(())
    }
}

fn collect_contributor_ensure_candidates(
    batch: &TokenProjectionBatch,
) -> Vec<ContributorEnsureCandidate> {
    let mut candidates = Vec::new();
    let mut seen = HashSet::new();
    for operation in &batch.operations {
        let TokenProjectionOperation::DelegateChanged {
            id,
            common,
            to_delegate,
            ..
        } = operation
        else {
            continue;
        };
        if is_zero_address(to_delegate) {
            continue;
        }
        let account = contributor_ref(to_delegate);
        if seen.insert((common.contract_set_id.clone(), account.clone())) {
            candidates.push(ContributorEnsureCandidate {
                operation_id: id.clone(),
                account,
                common: common.clone(),
            });
        }
    }
    candidates
}

async fn increment_contributor_count(
    transaction: &mut Transaction<'_, Postgres>,
    common: &TokenEventCommon,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    increment_contributor_count_by(transaction, common, 1).await
}

async fn increment_contributor_count_by(
    transaction: &mut Transaction<'_, Postgres>,
    common: &TokenEventCommon,
    increment: i32,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(
        "INSERT INTO data_metric (
            id, contract_set_id, chain_id, dao_code, governor_address, token_address,
            contributor_count, member_count
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
         ON CONFLICT ON CONSTRAINT data_metric_scope_unique DO UPDATE
         SET token_address = COALESCE(data_metric.token_address, EXCLUDED.token_address),
             contributor_count = COALESCE(data_metric.contributor_count, 0) + EXCLUDED.contributor_count,
             member_count = COALESCE(data_metric.member_count, 0) + EXCLUDED.member_count",
    )
    .bind(data_metric_id(
        common.chain_id,
        &common.governor_address,
        &common.dao_code,
    ))
    .bind(&common.contract_set_id)
    .bind(common.chain_id)
    .bind(&common.dao_code)
    .bind(&common.governor_address)
    .bind(&common.token_address)
    .bind(increment)
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

fn normalize_identifier(value: &str) -> String {
    value.to_ascii_lowercase()
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct DelegateMappingSnapshot {
    common: TokenEventCommon,
    from: String,
    to: String,
    power: String,
}

#[derive(Clone, Debug)]
struct DelegateMappingPreloadCandidate {
    common: TokenEventCommon,
    id: String,
    from: String,
}

#[derive(Debug, Default)]
struct DelegateMappingCache {
    mappings: HashMap<(String, String), Option<DelegateMappingSnapshot>>,
    dirty: std::collections::BTreeMap<(String, String), DelegateMappingDirty>,
    effective_count_delegates: HashMap<(String, String), TokenEventCommon>,
}

#[derive(Clone, Debug)]
enum DelegateMappingDirty {
    Delete,
    Relation(DelegateMappingSnapshot),
    Power(DelegateMappingSnapshot),
}

impl DelegateMappingCache {
    fn get(
        &self,
        common: &TokenEventCommon,
        from: &str,
    ) -> Option<Option<DelegateMappingSnapshot>> {
        self.mappings.get(&self.key(common, from)).cloned()
    }

    fn set(
        &mut self,
        common: &TokenEventCommon,
        from: &str,
        snapshot: Option<DelegateMappingSnapshot>,
    ) {
        self.mappings.insert(self.key(common, from), snapshot);
    }

    fn set_preloaded(
        &mut self,
        common: &TokenEventCommon,
        from: &str,
        snapshot: Option<DelegateMappingSnapshot>,
    ) {
        let key = self.key(common, from);
        if self.dirty.contains_key(&key) {
            return;
        }
        if let Some(snapshot) = &snapshot {
            self.stage_effective_count_delegate(&snapshot.common, &snapshot.to);
        }
        self.mappings.insert(key, snapshot);
    }

    fn stage_relation(
        &mut self,
        common: &TokenEventCommon,
        from: &str,
        snapshot: Option<DelegateMappingSnapshot>,
    ) {
        let key = self.key(common, from);
        if let Some(Some(previous)) = self.mappings.get(&key).cloned() {
            self.stage_effective_count_delegate(&previous.common, &previous.to);
        }
        if let Some(snapshot) = &snapshot {
            self.stage_effective_count_delegate(&snapshot.common, &snapshot.to);
        }
        self.mappings.insert(key.clone(), snapshot.clone());
        match snapshot {
            Some(snapshot) => {
                self.dirty
                    .insert(key, DelegateMappingDirty::Relation(snapshot));
            }
            None => {
                self.dirty.insert(key, DelegateMappingDirty::Delete);
            }
        }
    }

    fn stage_power(
        &mut self,
        common: &TokenEventCommon,
        from: &str,
        snapshot: DelegateMappingSnapshot,
    ) {
        let key = self.key(common, from);
        self.stage_effective_count_delegate(&snapshot.common, &snapshot.to);
        self.mappings.insert(key.clone(), Some(snapshot.clone()));
        match self.dirty.get_mut(&key) {
            Some(DelegateMappingDirty::Relation(previous)) => {
                *previous = snapshot;
            }
            _ => {
                self.dirty.insert(key, DelegateMappingDirty::Power(snapshot));
            }
        }
    }

    fn stage_delete(&mut self, common: &TokenEventCommon, from: &str) {
        let key = self.key(common, from);
        if let Some(Some(previous)) = self.mappings.get(&key).cloned() {
            self.stage_effective_count_delegate(&previous.common, &previous.to);
        }
        self.mappings.insert(key.clone(), None);
        self.dirty.insert(key, DelegateMappingDirty::Delete);
    }

    fn stage_effective_count_delegate(&mut self, common: &TokenEventCommon, to_delegate: &str) {
        self.effective_count_delegates.insert(
            (common.contract_set_id.clone(), contributor_ref(to_delegate)),
            common.clone(),
        );
    }

    fn key(&self, common: &TokenEventCommon, from: &str) -> (String, String) {
        (
            common.contract_set_id.clone(),
            delegate_mapping_ref(common, from),
        )
    }

    async fn preload_batch(
        &mut self,
        transaction: &mut Transaction<'_, Postgres>,
        batch: &TokenProjectionBatch,
        metadata_cache: &BatchTokenMetadataCache,
    ) -> Result<(), PostgresIndexerRunnerStoreError> {
        let candidates = collect_delegate_mapping_preload_candidates(batch, metadata_cache);
        if candidates.is_empty() {
            return Ok(());
        }

        let mut grouped = std::collections::BTreeMap::<String, Vec<DelegateMappingPreloadCandidate>>::new();
        for candidate in candidates {
            grouped
                .entry(candidate.common.contract_set_id.clone())
                .or_default()
                .push(candidate);
        }

        for (contract_set_id, candidates) in grouped {
            let ids = candidates
                .iter()
                .map(|candidate| candidate.id.clone())
                .collect::<Vec<_>>();
            for candidate in &candidates {
                self.set_preloaded(&candidate.common, &candidate.from, None);
            }

            let rows = sqlx::query(
                r#"SELECT id, chain_id, dao_code, governor_address, token_address, contract_address,
                          log_index, transaction_index, "from", "to", power::TEXT AS power,
                          block_number::TEXT AS block_number, block_timestamp::TEXT AS block_timestamp,
                          transaction_hash
                   FROM delegate_mapping
                   WHERE contract_set_id = $1 AND id = ANY($2)"#,
            )
            .bind(&contract_set_id)
            .bind(&ids)
            .fetch_all(&mut **transaction)
            .await?;
            for row in rows {
                let id = row.get::<String, _>("id");
                let Some(candidate) = candidates.iter().find(|candidate| candidate.id == id) else {
                    continue;
                };
                let from = row.get::<String, _>("from");
                self.set_preloaded(
                    &candidate.common,
                    &from,
                    Some(delegate_mapping_snapshot_from_row(
                        &candidate.common.contract_set_id,
                        row,
                    )),
                );
            }
        }

        Ok(())
    }

    async fn flush(
        &mut self,
        transaction: &mut Transaction<'_, Postgres>,
    ) -> Result<Vec<(String, String)>, PostgresIndexerRunnerStoreError> {
        let dirty = std::mem::take(&mut self.dirty);
        let effective_count_delegates = std::mem::take(&mut self.effective_count_delegates)
            .into_keys()
            .collect::<Vec<_>>();
        if dirty.is_empty() {
            return Ok(effective_count_delegates);
        }

        let mut deletes = Vec::new();
        let mut relation_upserts = Vec::new();
        let mut power_updates = Vec::new();
        for ((contract_set_id, id), dirty) in dirty {
            match dirty {
                DelegateMappingDirty::Delete => deletes.push((contract_set_id, id)),
                DelegateMappingDirty::Relation(snapshot) => relation_upserts.push(snapshot),
                DelegateMappingDirty::Power(snapshot) => power_updates.push(snapshot),
            }
        }

        for rows in deletes.chunks(token_event_bulk_chunk_size()) {
            let mut query =
                QueryBuilder::<Postgres>::new("DELETE FROM delegate_mapping WHERE (contract_set_id, id) IN ");
            query.push_tuples(rows, |mut tuple, (contract_set_id, id)| {
                tuple.push_bind(contract_set_id).push_bind(id);
            });
            query.build().execute(&mut **transaction).await?;
        }

        for rows in relation_upserts.chunks(token_event_bulk_chunk_size()) {
            let mut ids = Vec::with_capacity(rows.len());
            let mut contract_set_ids = Vec::with_capacity(rows.len());
            let mut chain_ids = Vec::with_capacity(rows.len());
            let mut dao_codes = Vec::with_capacity(rows.len());
            let mut governor_addresses = Vec::with_capacity(rows.len());
            let mut token_addresses = Vec::with_capacity(rows.len());
            let mut contract_addresses = Vec::with_capacity(rows.len());
            let mut log_indexes = Vec::with_capacity(rows.len());
            let mut transaction_indexes = Vec::with_capacity(rows.len());
            let mut froms = Vec::with_capacity(rows.len());
            let mut tos = Vec::with_capacity(rows.len());
            let mut powers = Vec::with_capacity(rows.len());
            let mut block_numbers = Vec::with_capacity(rows.len());
            let mut block_timestamps = Vec::with_capacity(rows.len());
            let mut transaction_hashes = Vec::with_capacity(rows.len());
            for row in rows {
                let common = &row.common;
                ids.push(delegate_mapping_ref(common, &row.from));
                contract_set_ids.push(common.contract_set_id.clone());
                chain_ids.push(common.chain_id);
                dao_codes.push(common.dao_code.clone());
                governor_addresses.push(common.governor_address.clone());
                token_addresses.push(common.token_address.clone());
                contract_addresses.push(common.contract_address.clone());
                log_indexes.push(u64_to_i32(
                    common.log_index,
                    "delegate_mapping.log_index",
                )?);
                transaction_indexes.push(u64_to_i32(
                    common.transaction_index,
                    "delegate_mapping.transaction_index",
                )?);
                froms.push(row.from.clone());
                tos.push(row.to.clone());
                powers.push(row.power.clone());
                block_numbers.push(common.block_number.clone());
                block_timestamps.push(
                    required_numeric(&common.block_timestamp, "delegate_mapping.block_timestamp")?
                        .to_owned(),
                );
                transaction_hashes.push(common.transaction_hash.clone());
            }
            sqlx::query(
                r#"INSERT INTO delegate_mapping (
                    id, contract_set_id, chain_id, dao_code, governor_address, token_address, contract_address,
                    log_index, transaction_index, "from", "to", power, block_number, block_timestamp,
                    transaction_hash
                 )
                 SELECT
                    id,
                    contract_set_id,
                    chain_id,
                    dao_code,
                    governor_address,
                    token_address,
                    contract_address,
                    log_index,
                    transaction_index,
                    "from",
                    "to",
                    power_text::NUMERIC(78, 0),
                    block_number_text::NUMERIC(78, 0),
                    block_timestamp_text::NUMERIC(78, 0),
                    transaction_hash
                 FROM unnest(
                    $1::TEXT[], $2::TEXT[], $3::INT4[], $4::TEXT[], $5::TEXT[],
                    $6::TEXT[], $7::TEXT[], $8::INT4[], $9::INT4[], $10::TEXT[],
                    $11::TEXT[], $12::TEXT[], $13::TEXT[], $14::TEXT[], $15::TEXT[]
                 ) AS source(
                    id, contract_set_id, chain_id, dao_code, governor_address,
                    token_address, contract_address, log_index, transaction_index,
                    "from", "to", power_text, block_number_text, block_timestamp_text,
                    transaction_hash
                 )
                 ON CONFLICT (contract_set_id, id) DO UPDATE
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
            .bind(ids)
            .bind(contract_set_ids)
            .bind(chain_ids)
            .bind(dao_codes)
            .bind(governor_addresses)
            .bind(token_addresses)
            .bind(contract_addresses)
            .bind(log_indexes)
            .bind(transaction_indexes)
            .bind(froms)
            .bind(tos)
            .bind(powers)
            .bind(block_numbers)
            .bind(block_timestamps)
            .bind(transaction_hashes)
            .execute(&mut **transaction)
            .await?;
        }

        for rows in power_updates.chunks(token_event_bulk_chunk_size()) {
            let mut contract_set_ids = Vec::with_capacity(rows.len());
            let mut ids = Vec::with_capacity(rows.len());
            let mut powers = Vec::with_capacity(rows.len());
            for row in rows {
                contract_set_ids.push(row.common.contract_set_id.clone());
                ids.push(delegate_mapping_ref(&row.common, &row.from));
                powers.push(row.power.clone());
            }
            sqlx::query(
                "UPDATE delegate_mapping AS target
                 SET power = source.power_text::NUMERIC(78, 0)
                 FROM unnest($1::TEXT[], $2::TEXT[], $3::TEXT[]) AS source(contract_set_id, id, power_text)
                 WHERE target.contract_set_id = source.contract_set_id
                   AND target.id = source.id",
            )
            .bind(contract_set_ids)
            .bind(ids)
            .bind(powers)
            .execute(&mut **transaction)
            .await?;
        }

        Ok(effective_count_delegates)
    }
}

async fn recompute_delegate_count_effective(
    transaction: &mut Transaction<'_, Postgres>,
    delegates: &[(String, String)],
) -> Result<(), PostgresIndexerRunnerStoreError> {
    if delegates.is_empty() {
        return Ok(());
    }

    let chunk_size = recompute_delegate_count_effective_chunk_size();
    for rows in delegates.chunks(chunk_size) {
        let contract_set_ids = rows
            .iter()
            .map(|(contract_set_id, _id)| contract_set_id.clone())
            .collect::<Vec<_>>();
        let ids = rows
            .iter()
            .map(|(_contract_set_id, id)| id.clone())
            .collect::<Vec<_>>();
        sqlx::query(
            r#"UPDATE contributor
             SET delegates_count_effective = counts.positive_count
             FROM (
                SELECT affected.contract_set_id,
                       affected.id,
                       COUNT(delegate_mapping.id)::INT AS positive_count
                FROM unnest($1::TEXT[], $2::TEXT[]) AS affected(contract_set_id, id)
                LEFT JOIN delegate_mapping
                  ON delegate_mapping.contract_set_id = affected.contract_set_id
                 AND delegate_mapping."to" = affected.id
                 AND delegate_mapping.power > 0
                GROUP BY affected.contract_set_id, affected.id
             ) AS counts
             WHERE contributor.contract_set_id = counts.contract_set_id
               AND contributor.id = counts.id
               AND contributor.delegates_count_effective IS DISTINCT FROM counts.positive_count"#,
        )
        .bind(contract_set_ids)
        .bind(ids)
        .execute(&mut **transaction)
        .await?;
    }

    Ok(())
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

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
enum RollingSide {
    From,
    To,
}

#[derive(Clone, Debug)]
struct DelegateRollingMatch {
    index: usize,
    id: String,
    delegator: String,
    from_delegate: String,
    to_delegate: String,
    side: RollingSide,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct DelegateRollingVoteUpdate {
    contract_set_id: String,
    id: String,
    from_previous_votes: Option<String>,
    from_new_votes: Option<String>,
    to_previous_votes: Option<String>,
    to_new_votes: Option<String>,
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct TransactionMetadataKey {
    contract_set_id: String,
    transaction_hash: String,
}

impl TransactionMetadataKey {
    fn new(common: &TokenEventCommon) -> Self {
        Self {
            contract_set_id: common.contract_set_id.clone(),
            transaction_hash: common.transaction_hash.clone(),
        }
    }
}

#[derive(Debug, Default)]
struct RollingSideIndex {
    from: HashMap<String, Vec<usize>>,
    to: HashMap<String, Vec<usize>>,
}

impl RollingSideIndex {
    fn insert(&mut self, delegate: String, side: RollingSide, index: usize) {
        self.by_side_mut(side).entry(delegate).or_default().push(index);
    }

    fn get(&self, delegate: &str, side: RollingSide) -> Option<&[usize]> {
        self.by_side(side).get(delegate).map(Vec::as_slice)
    }

    fn by_side(&self, side: RollingSide) -> &HashMap<String, Vec<usize>> {
        match side {
            RollingSide::From => &self.from,
            RollingSide::To => &self.to,
        }
    }

    fn by_side_mut(&mut self, side: RollingSide) -> &mut HashMap<String, Vec<usize>> {
        match side {
            RollingSide::From => &mut self.from,
            RollingSide::To => &mut self.to,
        }
    }
}

#[derive(Debug, Default)]
struct BatchTokenMetadataCache {
    transfer_counts: HashMap<TransactionMetadataKey, i64>,
    rollings: HashMap<TransactionMetadataKey, Vec<DelegateRollingSnapshot>>,
    rolling_index: HashMap<TransactionMetadataKey, RollingSideIndex>,
    rolling_vote_updates: std::collections::BTreeMap<(String, String), DelegateRollingVoteUpdate>,
}

impl BatchTokenMetadataCache {
    async fn preload(
        transaction: &mut Transaction<'_, Postgres>,
        batch: &TokenProjectionBatch,
    ) -> Result<Self, PostgresIndexerRunnerStoreError> {
        let keys = collect_transaction_metadata_keys(batch);
        let mut cache = Self::default();
        cache.preload_transfer_counts(batch, &keys);
        cache.preload_rollings(transaction, &keys).await?;
        Ok(cache)
    }

    fn transfer_count(&self, common: &TokenEventCommon) -> i64 {
        self.transfer_counts
            .get(&TransactionMetadataKey::new(common))
            .copied()
            .unwrap_or_default()
    }

    fn has_rollings(&self, common: &TokenEventCommon) -> bool {
        self.rollings
            .get(&TransactionMetadataKey::new(common))
            .is_some_and(|rollings| !rollings.is_empty())
    }

    fn find_rolling_match(
        &self,
        common: &TokenEventCommon,
        delegate: &str,
        delta: &str,
        before_log_index: u64,
    ) -> Option<DelegateRollingMatch> {
        let before_log_index = u64_to_i32(before_log_index, "delegate_rolling.match_log_index").ok()?;
        let metadata_key = TransactionMetadataKey::new(common);

        if is_negative_decimal(delta) {
            self.find_rolling_match_by_side(&metadata_key, delegate, RollingSide::From, before_log_index)
                .or_else(|| {
                    self.find_rolling_match_by_side(
                        &metadata_key,
                        delegate,
                        RollingSide::To,
                        before_log_index,
                    )
                })
        } else {
            self.find_rolling_match_by_side(&metadata_key, delegate, RollingSide::To, before_log_index)
                .or_else(|| {
                    self.find_rolling_match_by_side(
                        &metadata_key,
                        delegate,
                        RollingSide::From,
                        before_log_index,
                    )
                })
        }
    }

    fn find_rolling_match_by_side(
        &self,
        metadata_key: &TransactionMetadataKey,
        delegate: &str,
        side: RollingSide,
        before_log_index: i32,
    ) -> Option<DelegateRollingMatch> {
        let indices = self.rolling_index.get(metadata_key)?.get(delegate, side)?;
        let rollings = self.rollings.get(metadata_key)?;
        indices
            .iter()
            .filter_map(|index| rollings.get(*index).map(|rolling| (*index, rolling)))
            .filter(|rolling| rolling.1.log_index < before_log_index)
            .filter(|rolling| match side {
                RollingSide::From => rolling.1.from_new_votes.is_none(),
                RollingSide::To => rolling.1.to_new_votes.is_none(),
            })
            .map(|(index, rolling)| rolling_match(index, rolling, side))
            .next()
    }

    fn mark_rolling_match(
        &mut self,
        common: &TokenEventCommon,
        rolling_match: &DelegateRollingMatch,
        previous_votes: &str,
        new_votes: &str,
    ) {
        let Some(rollings) = self.rollings.get_mut(&TransactionMetadataKey::new(common)) else {
            return;
        };
        let Some(rolling) = rollings.get_mut(rolling_match.index) else {
            return;
        };
        if rolling.id != rolling_match.id {
            return;
        }
        match rolling_match.side {
            RollingSide::From => {
                rolling.from_new_votes = Some(new_votes.to_owned());
            }
            RollingSide::To => {
                rolling.to_new_votes = Some(new_votes.to_owned());
            }
        }
        self.stage_rolling_vote_update(common, rolling_match, previous_votes, new_votes);
    }

    fn stage_rolling_vote_update(
        &mut self,
        common: &TokenEventCommon,
        rolling_match: &DelegateRollingMatch,
        previous_votes: &str,
        new_votes: &str,
    ) {
        let update = self
            .rolling_vote_updates
            .entry((common.contract_set_id.clone(), rolling_match.id.clone()))
            .or_insert_with(|| DelegateRollingVoteUpdate {
                contract_set_id: common.contract_set_id.clone(),
                id: rolling_match.id.clone(),
                from_previous_votes: None,
                from_new_votes: None,
                to_previous_votes: None,
                to_new_votes: None,
            });
        match rolling_match.side {
            RollingSide::From => {
                update.from_previous_votes = Some(previous_votes.to_owned());
                update.from_new_votes = Some(new_votes.to_owned());
            }
            RollingSide::To => {
                update.to_previous_votes = Some(previous_votes.to_owned());
                update.to_new_votes = Some(new_votes.to_owned());
            }
        }
    }

    fn drain_rolling_vote_updates(&mut self) -> Vec<DelegateRollingVoteUpdate> {
        std::mem::take(&mut self.rolling_vote_updates)
            .into_values()
            .collect()
    }

    async fn flush_rolling_vote_updates(
        &mut self,
        transaction: &mut Transaction<'_, Postgres>,
    ) -> Result<(), PostgresIndexerRunnerStoreError> {
        let updates = self.drain_rolling_vote_updates();
        if updates.is_empty() {
            return Ok(());
        }

        for rows in updates.chunks(delegate_rolling_vote_update_chunk_size()) {
            let mut query = QueryBuilder::<Postgres>::new(
                "UPDATE delegate_rolling
                 SET from_previous_votes = COALESCE(delta.from_previous_votes, delegate_rolling.from_previous_votes),
                     from_new_votes = COALESCE(delta.from_new_votes, delegate_rolling.from_new_votes),
                     to_previous_votes = COALESCE(delta.to_previous_votes, delegate_rolling.to_previous_votes),
                     to_new_votes = COALESCE(delta.to_new_votes, delegate_rolling.to_new_votes)
                 FROM (VALUES ",
            );
            for (index, row) in rows.iter().enumerate() {
                if index > 0 {
                    query.push(", ");
                }
                query
                    .push("(")
                    .push_bind(&row.contract_set_id)
                    .push(", ")
                    .push_bind(&row.id)
                    .push(", ")
                    .push_bind(row.from_previous_votes.as_deref())
                    .push("::NUMERIC(78, 0), ")
                    .push_bind(row.from_new_votes.as_deref())
                    .push("::NUMERIC(78, 0), ")
                    .push_bind(row.to_previous_votes.as_deref())
                    .push("::NUMERIC(78, 0), ")
                    .push_bind(row.to_new_votes.as_deref())
                    .push("::NUMERIC(78, 0))");
            }
            query.push(
                ") AS delta(
                    contract_set_id, id, from_previous_votes, from_new_votes, to_previous_votes, to_new_votes
                 )
                 WHERE delegate_rolling.contract_set_id = delta.contract_set_id
                   AND delegate_rolling.id = delta.id",
            );
            query.build().execute(&mut **transaction).await?;
        }

        Ok(())
    }

    fn preload_transfer_counts(
        &mut self,
        batch: &TokenProjectionBatch,
        keys: &[TransactionMetadataKey],
    ) {
        for key in keys {
            self.transfer_counts.entry(key.clone()).or_default();
        }
        for row in &batch.token_transfers {
            let key = TransactionMetadataKey::new(&row.common);
            let Some(count) = self.transfer_counts.get_mut(&key) else {
                continue;
            };
            *count += 1;
        }
    }

    async fn preload_rollings(
        &mut self,
        transaction: &mut Transaction<'_, Postgres>,
        keys: &[TransactionMetadataKey],
    ) -> Result<(), PostgresIndexerRunnerStoreError> {
        for key in keys {
            self.rollings.entry(key.clone()).or_default();
        }
        for (contract_set_id, transaction_hashes) in group_transaction_hashes_by_contract_set(keys) {
            let rows = sqlx::query(
                "SELECT transaction_hash, id, log_index, delegator, from_delegate, to_delegate,
                        from_new_votes::TEXT AS from_new_votes,
                        to_new_votes::TEXT AS to_new_votes
                 FROM delegate_rolling
                 WHERE contract_set_id = $1
                   AND transaction_hash = ANY($2)
                   AND from_delegate <> to_delegate
                 ORDER BY transaction_hash, log_index DESC",
            )
            .bind(&contract_set_id)
            .bind(&transaction_hashes)
            .fetch_all(&mut **transaction)
            .await?;
            for row in rows {
                let key = TransactionMetadataKey {
                    contract_set_id: contract_set_id.clone(),
                    transaction_hash: row.get("transaction_hash"),
                };
                let rolling = DelegateRollingSnapshot {
                    id: row.get("id"),
                    log_index: row.get("log_index"),
                    delegator: row.get("delegator"),
                    from_delegate: row.get("from_delegate"),
                    to_delegate: row.get("to_delegate"),
                    from_new_votes: row.get("from_new_votes"),
                    to_new_votes: row.get("to_new_votes"),
                };
                self.push_rolling(key, rolling);
            }
        }
        Ok(())
    }

    fn push_rolling(&mut self, key: TransactionMetadataKey, rolling: DelegateRollingSnapshot) {
        let rollings = self.rollings.entry(key.clone()).or_default();
        let index = rollings.len();
        self.rolling_index
            .entry(key.clone())
            .or_default()
            .insert(rolling.from_delegate.clone(), RollingSide::From, index);
        self.rolling_index
            .entry(key)
            .or_default()
            .insert(rolling.to_delegate.clone(), RollingSide::To, index);
        rollings.push(rolling);
    }
}

fn collect_transaction_metadata_keys(batch: &TokenProjectionBatch) -> Vec<TransactionMetadataKey> {
    let mut keys = Vec::new();
    let mut seen = HashSet::new();
    for row in &batch.delegate_votes_changed {
        let key = TransactionMetadataKey::new(&row.common);
        if seen.insert(key.clone()) {
            keys.push(key);
        }
    }
    keys
}

fn collect_delegate_mapping_preload_candidates(
    batch: &TokenProjectionBatch,
    metadata_cache: &BatchTokenMetadataCache,
) -> Vec<DelegateMappingPreloadCandidate> {
    let mut candidates = Vec::new();
    let mut seen = HashSet::new();
    for operation in &batch.operations {
        match operation {
            TokenProjectionOperation::DelegateChanged {
                common, delegator, ..
            } => push_delegate_mapping_preload_candidate(
                &mut candidates,
                &mut seen,
                common,
                delegator,
            ),
            TokenProjectionOperation::Transfer {
                common, from, to, ..
            } => {
                push_delegate_mapping_preload_candidate(&mut candidates, &mut seen, common, from);
                push_delegate_mapping_preload_candidate(&mut candidates, &mut seen, common, to);
            }
            TokenProjectionOperation::DelegateVotesChanged { .. } => {}
        }
    }

    let common_by_transaction = batch
        .delegate_votes_changed
        .iter()
        .map(|row| (TransactionMetadataKey::new(&row.common), row.common.clone()))
        .collect::<HashMap<_, _>>();
    for (metadata_key, rollings) in &metadata_cache.rollings {
        let Some(common) = common_by_transaction.get(metadata_key) else {
            continue;
        };
        for rolling in rollings {
            push_delegate_mapping_preload_candidate(
                &mut candidates,
                &mut seen,
                common,
                &rolling.delegator,
            );
            push_delegate_mapping_preload_candidate(
                &mut candidates,
                &mut seen,
                common,
                &rolling.from_delegate,
            );
            push_delegate_mapping_preload_candidate(
                &mut candidates,
                &mut seen,
                common,
                &rolling.to_delegate,
            );
        }
    }

    candidates
}

fn push_delegate_mapping_preload_candidate(
    candidates: &mut Vec<DelegateMappingPreloadCandidate>,
    seen: &mut HashSet<(String, String)>,
    common: &TokenEventCommon,
    from: &str,
) {
    if is_zero_address(from) {
        return;
    }
    let id = delegate_mapping_ref(common, from);
    if seen.insert((common.contract_set_id.clone(), id.clone())) {
        candidates.push(DelegateMappingPreloadCandidate {
            common: common.clone(),
            id,
            from: from.to_owned(),
        });
    }
}

fn group_transaction_hashes_by_contract_set(
    keys: &[TransactionMetadataKey],
) -> Vec<(String, Vec<String>)> {
    let mut order = Vec::new();
    let mut grouped = HashMap::<String, Vec<String>>::new();
    for key in keys {
        if !grouped.contains_key(&key.contract_set_id) {
            order.push(key.contract_set_id.clone());
        }
        grouped
            .entry(key.contract_set_id.clone())
            .or_default()
            .push(key.transaction_hash.clone());
    }
    order
        .into_iter()
        .filter_map(|contract_set_id| {
            grouped
                .remove(&contract_set_id)
                .map(|transaction_hashes| (contract_set_id, transaction_hashes))
        })
        .collect()
}

async fn read_delegate_mapping_cached(
    transaction: &mut Transaction<'_, Postgres>,
    delegate_mapping_cache: &mut DelegateMappingCache,
    common: &TokenEventCommon,
    from: &str,
) -> Result<Option<DelegateMappingSnapshot>, PostgresIndexerRunnerStoreError> {
    if let Some(snapshot) = delegate_mapping_cache.get(common, from) {
        return Ok(snapshot);
    }

    let snapshot = read_delegate_mapping(transaction, common, from).await?;
    delegate_mapping_cache.set(common, from, snapshot.clone());

    Ok(snapshot)
}

async fn read_delegate_mapping(
    transaction: &mut Transaction<'_, Postgres>,
    common: &TokenEventCommon,
    from: &str,
) -> Result<Option<DelegateMappingSnapshot>, PostgresIndexerRunnerStoreError> {
    let row = sqlx::query(
        r#"SELECT chain_id, dao_code, governor_address, token_address, contract_address,
                  log_index, transaction_index, "from", "to", power::TEXT AS power,
                  block_number::TEXT AS block_number, block_timestamp::TEXT AS block_timestamp,
                  transaction_hash
           FROM delegate_mapping
           WHERE contract_set_id = $1 AND id = $2"#,
    )
    .bind(&common.contract_set_id)
    .bind(delegate_mapping_ref(common, from))
    .fetch_optional(&mut **transaction)
    .await?;

    Ok(row.map(|row| delegate_mapping_snapshot_from_row(&common.contract_set_id, row)))
}

fn delegate_mapping_snapshot_from_row(
    contract_set_id: &str,
    row: sqlx::postgres::PgRow,
) -> DelegateMappingSnapshot {
    DelegateMappingSnapshot {
        common: TokenEventCommon {
            contract_set_id: contract_set_id.to_owned(),
            chain_id: row.get("chain_id"),
            dao_code: row.get("dao_code"),
            governor_address: row.get("governor_address"),
            token_address: row.get("token_address"),
            contract_address: row.get("contract_address"),
            log_index: row.get::<i32, _>("log_index") as u64,
            transaction_index: row.get::<i32, _>("transaction_index") as u64,
            block_number: row.get("block_number"),
            block_timestamp: row.get("block_timestamp"),
            transaction_hash: row.get("transaction_hash"),
        },
        from: row.get("from"),
        to: row.get("to"),
        power: row.get("power"),
    }
}

fn rolling_match(
    index: usize,
    rolling: &DelegateRollingSnapshot,
    side: RollingSide,
) -> DelegateRollingMatch {
    DelegateRollingMatch {
        index,
        id: rolling.id.clone(),
        delegator: rolling.delegator.clone(),
        from_delegate: rolling.from_delegate.clone(),
        to_delegate: rolling.to_delegate.clone(),
        side,
    }
}

fn signed_decimal_delta(next: &str, previous: &str) -> String {
    subtract_decimal_signed(next, previous)
}

fn add_signed_decimal(value: &str, delta: &str) -> String {
    let (value_negative, value) = split_decimal_sign(value);
    let (delta_negative, delta) = split_decimal_sign(delta);
    if value_negative == delta_negative {
        format_signed_decimal(value_negative, add_decimal_strings(&value, &delta))
    } else {
        match compare_decimal_strings(&value, &delta) {
            std::cmp::Ordering::Less => {
                format_signed_decimal(delta_negative, subtract_decimal_strings(&delta, &value))
            }
            std::cmp::Ordering::Equal => "0".to_owned(),
            std::cmp::Ordering::Greater => {
                format_signed_decimal(value_negative, subtract_decimal_strings(&value, &delta))
            }
        }
    }
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

fn subtract_decimal_signed(left: &str, right: &str) -> String {
    match compare_decimal_strings(left, right) {
        std::cmp::Ordering::Less => format!("-{}", subtract_decimal_strings(right, left)),
        std::cmp::Ordering::Equal => "0".to_owned(),
        std::cmp::Ordering::Greater => subtract_decimal_strings(left, right),
    }
}

fn add_decimal_strings(left: &str, right: &str) -> String {
    let mut carry = 0u8;
    let mut output = Vec::new();
    let mut left = left.as_bytes().iter().rev();
    let mut right = right.as_bytes().iter().rev();

    loop {
        let left_digit = left.next().map(|digit| digit - b'0');
        let right_digit = right.next().map(|digit| digit - b'0');
        if left_digit.is_none() && right_digit.is_none() && carry == 0 {
            break;
        }
        let sum = left_digit.unwrap_or_default() + right_digit.unwrap_or_default() + carry;
        output.push(b'0' + (sum % 10));
        carry = sum / 10;
    }

    output.reverse();
    normalize_decimal(&String::from_utf8(output).expect("decimal digits"))
}

fn subtract_decimal_strings(left: &str, right: &str) -> String {
    if compare_decimal_strings(left, right) == std::cmp::Ordering::Less {
        return "0".to_owned();
    }

    let mut borrow = 0i16;
    let mut output = Vec::new();
    let mut left = left.as_bytes().iter().rev();
    let mut right = right.as_bytes().iter().rev();

    while let Some(left_digit) = left.next().map(|digit| (digit - b'0') as i16) {
        let right_digit = right
            .next()
            .map(|digit| (digit - b'0') as i16)
            .unwrap_or_default();
        let mut diff = left_digit - borrow - right_digit;
        if diff < 0 {
            diff += 10;
            borrow = 1;
        } else {
            borrow = 0;
        }
        output.push(b'0' + diff as u8);
    }

    output.reverse();
    normalize_decimal(&String::from_utf8(output).expect("decimal digits"))
}

fn compare_decimal_strings(left: &str, right: &str) -> std::cmp::Ordering {
    let left = normalize_decimal(left.trim_start_matches('-'));
    let right = normalize_decimal(right.trim_start_matches('-'));
    left.len()
        .cmp(&right.len())
        .then_with(|| left.as_str().cmp(right.as_str()))
}

fn split_decimal_sign(value: &str) -> (bool, String) {
    let value = value.trim();
    if let Some(value) = value.strip_prefix('-') {
        (true, normalize_decimal(value))
    } else {
        (false, normalize_decimal(value))
    }
}

fn format_signed_decimal(is_negative: bool, value: String) -> String {
    if is_negative && value != "0" {
        format!("-{value}")
    } else {
        value
    }
}

fn normalize_decimal(value: &str) -> String {
    let trimmed = value.trim_start_matches('0');
    if trimmed.is_empty() {
        "0".to_owned()
    } else {
        trimmed.to_owned()
    }
}

fn vote_power_checkpoint_cause(has_delegate_change: bool, has_transfer: bool) -> &'static str {
    match (has_delegate_change, has_transfer) {
        (true, true) => "delegate-change+transfer",
        (true, false) => "delegate-change",
        (false, true) => "transfer",
        (false, false) => "delegate-votes-changed",
    }
}

fn token_operation_key(operation: &TokenProjectionOperation) -> (&str, &str) {
    match operation {
        TokenProjectionOperation::DelegateChanged { id, common, .. }
        | TokenProjectionOperation::DelegateVotesChanged { id, common, .. }
        | TokenProjectionOperation::Transfer { id, common, .. } => {
            (common.contract_set_id.as_str(), id.as_str())
        }
    }
}

fn token_operation_common(operation: &TokenProjectionOperation) -> &TokenEventCommon {
    match operation {
        TokenProjectionOperation::DelegateChanged { common, .. }
        | TokenProjectionOperation::DelegateVotesChanged { common, .. }
        | TokenProjectionOperation::Transfer { common, .. } => common,
    }
}

fn token_batch_common(batch: &TokenProjectionBatch) -> Option<&TokenEventCommon> {
    batch
        .operations
        .first()
        .map(token_operation_common)
        .or_else(|| batch.delegate_changed.first().map(|row| &row.common))
        .or_else(|| batch.delegate_votes_changed.first().map(|row| &row.common))
        .or_else(|| batch.token_transfers.first().map(|row| &row.common))
        .or_else(|| batch.delegate_rollings.first().map(|row| &row.common))
}

fn transfer_units(value: &str, standard: GovernanceTokenStandard) -> String {
    match standard {
        GovernanceTokenStandard::Erc20 => value.to_owned(),
        GovernanceTokenStandard::Erc721 => "1".to_owned(),
    }
}

fn contributor_ref(account: &str) -> String {
    normalize_scope_value(account)
}

fn delegate_mapping_ref(common: &TokenEventCommon, from: &str) -> String {
    let _ = common;
    normalize_scope_value(from)
}

fn delegate_ref(common: &TokenEventCommon, from_delegate: &str, to_delegate: &str) -> String {
    let _ = common;
    format!(
        "{}_{}",
        normalize_scope_value(from_delegate),
        normalize_scope_value(to_delegate)
    )
}

fn normalize_scope_value(value: &str) -> String {
    value.trim().to_ascii_lowercase()
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

fn optional_i64_to_i32(
    value: Option<i64>,
    field: &str,
) -> Result<Option<i32>, PostgresIndexerRunnerStoreError> {
    value.map(|value| i64_to_i32(value, field)).transpose()
}

fn optional_u64_to_i32(
    value: Option<u64>,
    field: &str,
) -> Result<Option<i32>, PostgresIndexerRunnerStoreError> {
    value.map(|value| u64_to_i32(value, field)).transpose()
}

fn usize_to_i32(value: usize, field: &str) -> Result<i32, PostgresIndexerRunnerStoreError> {
    i32::try_from(value).map_err(|_| {
        PostgresIndexerRunnerStoreError::new(format!("{field} value {value} exceeds INTEGER"))
    })
}

fn u64_to_string(value: u64) -> String {
    value.to_string()
}
