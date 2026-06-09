// Token projection writes and delegate relation maintenance.
const CONTRIBUTOR_ENSURE_BULK_CHUNK_SIZE: usize = 2_000;
const TOKEN_EVENT_BULK_CHUNK_SIZE: usize = 1_000;

async fn write_token_batch_rows(
    transaction: &mut Transaction<'_, Postgres>,
    batch: &TokenProjectionBatch,
) -> Result<Vec<(String, String)>, PostgresIndexerRunnerStoreError> {
    let mut inserted_operation_keys = Vec::new();

    inserted_operation_keys.extend(insert_delegate_changed_batch(transaction, &batch.delegate_changed).await?);
    inserted_operation_keys.extend(
        insert_delegate_votes_changed_batch(transaction, &batch.delegate_votes_changed).await?,
    );
    inserted_operation_keys.extend(insert_token_transfer_batch(transaction, &batch.token_transfers).await?);
    upsert_delegate_rolling_batch(transaction, &batch.delegate_rollings).await?;
    let mut metadata_cache = BatchTokenMetadataCache::preload(transaction, batch).await?;
    for row in &batch.delegate_votes_changed {
        insert_vote_power_checkpoint(transaction, &mut metadata_cache, row).await?;
    }
    Ok(inserted_operation_keys)
}

async fn insert_delegate_changed_batch(
    transaction: &mut Transaction<'_, Postgres>,
    rows: &[DelegateChangedWrite],
) -> Result<Vec<(String, String)>, PostgresIndexerRunnerStoreError> {
    let mut inserted = Vec::new();
    for rows in rows.chunks(TOKEN_EVENT_BULK_CHUNK_SIZE) {
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
    for rows in rows.chunks(TOKEN_EVENT_BULK_CHUNK_SIZE) {
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
    let mut inserted = Vec::new();
    for rows in rows.chunks(TOKEN_EVENT_BULK_CHUNK_SIZE) {
        let mut query = QueryBuilder::<Postgres>::new(
            "INSERT INTO token_transfer (
                id, contract_set_id, chain_id, dao_code, governor_address, token_address,
                contract_address, log_index, transaction_index, \"from\", \"to\", value, standard,
                block_number, block_timestamp, transaction_hash
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
                .push_bind(u64_to_i32(common.log_index, "token_transfer.log_index")?)
                .push(", ")
                .push_bind(u64_to_i32(
                    common.transaction_index,
                    "token_transfer.transaction_index",
                )?)
                .push(", ")
                .push_bind(&row.from)
                .push(", ")
                .push_bind(&row.to)
                .push(", ")
                .push_bind(&row.value)
                .push("::NUMERIC(78, 0), ")
                .push_bind(&row.standard)
                .push(", ")
                .push_bind(&common.block_number)
                .push("::NUMERIC(78, 0), ")
                .push_bind(required_numeric(
                    &common.block_timestamp,
                    "token_transfer.block_timestamp",
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
    for rows in rows.chunks(TOKEN_EVENT_BULK_CHUNK_SIZE) {
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

async fn insert_vote_power_checkpoint(
    transaction: &mut Transaction<'_, Postgres>,
    metadata_cache: &mut BatchTokenMetadataCache,
    row: &DelegateVotesChangedWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    let delta = signed_decimal_delta(&row.new_votes, &row.previous_votes);
    let rollings = metadata_cache.rollings(&row.common);
    let transfers_count = metadata_cache.transfer_count(&row.common);
    let rolling_match =
        find_rolling_match_from_rows(rollings, &row.delegate, &delta, row.common.log_index);
    let cause = vote_power_checkpoint_cause(!rollings.is_empty(), transfers_count > 0);

    sqlx::query(
        "INSERT INTO vote_power_checkpoint (
            id, contract_set_id, chain_id, dao_code, governor_address, token_address, contract_address,
            log_index, transaction_index, account, clock_mode, timepoint, previous_power,
            new_power, delta, source, cause, delegator, from_delegate, to_delegate, block_number,
            block_timestamp, transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'blocknumber', $11::NUMERIC(78, 0),
            $12::NUMERIC(78, 0), $13::NUMERIC(78, 0), $14::NUMERIC(78, 0), 'event',
            $15, $16, $17, $18, $19::NUMERIC(78, 0), $20::NUMERIC(78, 0), $21
         )
         ON CONFLICT (contract_set_id, id) DO NOTHING",
    )
    .bind(&row.id)
    .bind(&row.common.contract_set_id)
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
    delegate_mapping_cache: &mut DelegateMappingCache,
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
    upsert_delegate_mapping(
        transaction,
        delegate_mapping_cache,
        common,
        delegator,
        to_delegate,
        "0",
    )
    .await?;

    Ok(())
}

async fn apply_delegate_votes_changed_operation(
    transaction: &mut Transaction<'_, Postgres>,
    delegate_mapping_cache: &mut DelegateMappingCache,
    common: &TokenEventCommon,
    delegate: &str,
    previous_votes: &str,
    new_votes: &str,
    contributor_ensure_cache: &mut ContributorEnsureCache,
    metadata_cache: &mut BatchTokenMetadataCache,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    let delta = signed_decimal_delta(new_votes, previous_votes);
    let rollings = metadata_cache.rollings(common);
    let Some(rolling_match) = find_rolling_match_from_rows(rollings, delegate, &delta, common.log_index)
    else {
        return Ok(());
    };

    match rolling_match.side {
        RollingSide::From => {
            sqlx::query(
                "UPDATE delegate_rolling
                 SET from_previous_votes = $2::NUMERIC(78, 0),
                     from_new_votes = $3::NUMERIC(78, 0)
                 WHERE contract_set_id = $4 AND id = $1",
            )
            .bind(&rolling_match.id)
            .bind(previous_votes)
            .bind(new_votes)
            .bind(&common.contract_set_id)
            .execute(&mut **transaction)
            .await?;
            metadata_cache.mark_rolling_match(common, &rolling_match, new_votes);
            apply_delegate_delta(
                transaction,
                delegate_mapping_cache,
                common,
                &rolling_match.delegator,
                &rolling_match.from_delegate,
                &delta,
                contributor_ensure_cache,
            )
            .await
        }
        RollingSide::To => {
            sqlx::query(
                "UPDATE delegate_rolling
                 SET to_previous_votes = $2::NUMERIC(78, 0),
                     to_new_votes = $3::NUMERIC(78, 0)
                 WHERE contract_set_id = $4 AND id = $1",
            )
            .bind(&rolling_match.id)
            .bind(previous_votes)
            .bind(new_votes)
            .bind(&common.contract_set_id)
            .execute(&mut **transaction)
            .await?;
            metadata_cache.mark_rolling_match(common, &rolling_match, new_votes);
            apply_delegate_delta(
                transaction,
                delegate_mapping_cache,
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
    common: &TokenEventCommon,
    from_delegate: &str,
    to_delegate: &str,
    delta: &str,
    contributor_ensure_cache: &mut ContributorEnsureCache,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    if is_zero_address(to_delegate) {
        return Ok(());
    }

    let previous_mapping_power =
        read_delegate_mapping_cached(transaction, delegate_mapping_cache, common, from_delegate)
            .await?
            .filter(|mapping| mapping.to == to_delegate)
            .map(|mapping| mapping.power)
            .unwrap_or_else(|| "0".to_owned());
    let next_mapping_power = add_signed_decimal(&previous_mapping_power, delta);

    let result = sqlx::query(
        r#"UPDATE delegate_mapping
           SET chain_id = $3, dao_code = $4, governor_address = $5, token_address = $6,
               contract_address = $7, log_index = $8, transaction_index = $9,
               power = $10::NUMERIC(78, 0), block_number = $11::NUMERIC(78, 0),
               block_timestamp = $12::NUMERIC(78, 0), transaction_hash = $13
           WHERE contract_set_id = $1 AND id = $2 AND "to" = $14"#,
    )
    .bind(&common.contract_set_id)
    .bind(delegate_mapping_ref(common, from_delegate))
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
    if result.rows_affected() > 0 {
        delegate_mapping_cache.set(
            common,
            from_delegate,
            Some(DelegateMappingSnapshot {
                from: from_delegate.to_owned(),
                to: to_delegate.to_owned(),
                power: next_mapping_power.clone(),
            }),
        );
    }

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
    let id = delegate_ref(common, from_delegate, to_delegate);
    if is_current && !is_nonzero_decimal(power) {
        sqlx::query("DELETE FROM delegate WHERE contract_set_id = $1 AND id = $2")
            .bind(&common.contract_set_id)
            .bind(&id)
            .execute(&mut **transaction)
            .await?;
        return Ok(());
    }

    sqlx::query(
        "INSERT INTO delegate (
            id, contract_set_id, chain_id, dao_code, governor_address, token_address, contract_address,
            log_index, transaction_index, from_delegate, to_delegate, block_number,
            block_timestamp, transaction_hash, is_current, power
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::NUMERIC(78, 0),
            $13::NUMERIC(78, 0), $14, $15, $16::NUMERIC(78, 0)
         )
         ON CONFLICT (contract_set_id, id) DO UPDATE
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
    .bind(&common.contract_set_id)
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
    delegate_mapping_cache: &mut DelegateMappingCache,
    common: &TokenEventCommon,
    from: &str,
    to: &str,
    power: &str,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(
        r#"INSERT INTO delegate_mapping (
            id, contract_set_id, chain_id, dao_code, governor_address, token_address, contract_address,
            log_index, transaction_index, "from", "to", power, block_number, block_timestamp,
            transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::NUMERIC(78, 0),
            $13::NUMERIC(78, 0), $14::NUMERIC(78, 0), $15
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
    .bind(delegate_mapping_ref(common, from))
    .bind(&common.contract_set_id)
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
    delegate_mapping_cache.set(
        common,
        from,
        Some(DelegateMappingSnapshot {
            from: from.to_owned(),
            to: to.to_owned(),
            power: power.to_owned(),
        }),
    );

    Ok(())
}

async fn delete_delegate_mapping(
    transaction: &mut Transaction<'_, Postgres>,
    delegate_mapping_cache: &mut DelegateMappingCache,
    common: &TokenEventCommon,
    from: &str,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query("DELETE FROM delegate_mapping WHERE contract_set_id = $1 AND id = $2")
        .bind(&common.contract_set_id)
        .bind(delegate_mapping_ref(common, from))
        .execute(&mut **transaction)
        .await?;
    delegate_mapping_cache.set(common, from, None);

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

    sqlx::query(
        "UPDATE contributor
         SET chain_id = $3, dao_code = $4, governor_address = $5, token_address = $6,
             contract_address = $7, log_index = $8, transaction_index = $9,
             block_number = $10::NUMERIC(78, 0), block_timestamp = $11::NUMERIC(78, 0),
             transaction_hash = $12,
             delegates_count_all = GREATEST(delegates_count_all + $13, 0),
             delegates_count_effective = GREATEST(delegates_count_effective + $14, 0)
         WHERE contract_set_id = $1 AND id = $2",
    )
    .bind(&common.contract_set_id)
    .bind(contributor_ref(delegate))
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
        increment_member_count(transaction, common).await?;
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
    pending_member_count_increments: HashMap<(String, String), TokenEventCommon>,
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

        for rows in rows.chunks(CONTRIBUTOR_ENSURE_BULK_CHUNK_SIZE) {
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
            self.stage_member_count_increments(rows, &inserted);
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
            if let Some(common) = self.pending_member_count_increments.remove(&(
                candidate.common.contract_set_id.clone(),
                candidate.account.clone(),
            )) {
                increment_member_count(transaction, &common).await?;
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

    fn stage_member_count_increments(
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
                self.pending_member_count_increments
                    .entry(key)
                    .or_insert_with(|| candidate.common.clone());
            }
        }
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

async fn increment_member_count(
    transaction: &mut Transaction<'_, Postgres>,
    common: &TokenEventCommon,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    sqlx::query(
        "INSERT INTO data_metric (
            id, contract_set_id, chain_id, dao_code, governor_address, token_address, member_count
         )
         VALUES ($1, $2, $3, $4, $5, $6, 1)
         ON CONFLICT ON CONSTRAINT data_metric_scope_unique DO UPDATE
         SET token_address = COALESCE(data_metric.token_address, EXCLUDED.token_address),
             member_count = COALESCE(data_metric.member_count, 0) + 1",
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

#[derive(Clone, Debug)]
struct DelegateMappingSnapshot {
    from: String,
    to: String,
    power: String,
}

#[derive(Debug, Default)]
struct DelegateMappingCache {
    mappings: HashMap<(String, String), Option<DelegateMappingSnapshot>>,
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

    fn key(&self, common: &TokenEventCommon, from: &str) -> (String, String) {
        (
            common.contract_set_id.clone(),
            delegate_mapping_ref(common, from),
        )
    }
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
struct BatchTokenMetadataCache {
    transfer_counts: HashMap<TransactionMetadataKey, i64>,
    rollings: HashMap<TransactionMetadataKey, Vec<DelegateRollingSnapshot>>,
}

impl BatchTokenMetadataCache {
    async fn preload(
        transaction: &mut Transaction<'_, Postgres>,
        batch: &TokenProjectionBatch,
    ) -> Result<Self, PostgresIndexerRunnerStoreError> {
        let keys = collect_transaction_metadata_keys(batch);
        let mut cache = Self::default();
        cache.preload_transfer_counts(transaction, &keys).await?;
        cache.preload_rollings(transaction, &keys).await?;
        Ok(cache)
    }

    fn transfer_count(&self, common: &TokenEventCommon) -> i64 {
        self.transfer_counts
            .get(&TransactionMetadataKey::new(common))
            .copied()
            .unwrap_or_default()
    }

    fn rollings(&self, common: &TokenEventCommon) -> &[DelegateRollingSnapshot] {
        self.rollings
            .get(&TransactionMetadataKey::new(common))
            .map(Vec::as_slice)
            .unwrap_or(&[])
    }

    fn mark_rolling_match(
        &mut self,
        common: &TokenEventCommon,
        rolling_match: &DelegateRollingMatch,
        new_votes: &str,
    ) {
        let Some(rollings) = self.rollings.get_mut(&TransactionMetadataKey::new(common)) else {
            return;
        };
        let Some(rolling) = rollings
            .iter_mut()
            .find(|rolling| rolling.id == rolling_match.id)
        else {
            return;
        };
        match rolling_match.side {
            RollingSide::From => {
                rolling.from_new_votes = Some(new_votes.to_owned());
            }
            RollingSide::To => {
                rolling.to_new_votes = Some(new_votes.to_owned());
            }
        }
    }

    async fn preload_transfer_counts(
        &mut self,
        transaction: &mut Transaction<'_, Postgres>,
        keys: &[TransactionMetadataKey],
    ) -> Result<(), PostgresIndexerRunnerStoreError> {
        for key in keys {
            self.transfer_counts.entry(key.clone()).or_default();
        }
        for (contract_set_id, transaction_hashes) in group_transaction_hashes_by_contract_set(keys) {
            let rows = sqlx::query(
                "SELECT transaction_hash, count(*)::BIGINT AS transfer_count
                 FROM token_transfer
                 WHERE contract_set_id = $1 AND transaction_hash = ANY($2)
                 GROUP BY transaction_hash",
            )
            .bind(&contract_set_id)
            .bind(&transaction_hashes)
            .fetch_all(&mut **transaction)
            .await?;
            for row in rows {
                self.transfer_counts.insert(
                    TransactionMetadataKey {
                        contract_set_id: contract_set_id.clone(),
                        transaction_hash: row.get("transaction_hash"),
                    },
                    row.get("transfer_count"),
                );
            }
        }
        Ok(())
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
                self.rollings
                    .entry(TransactionMetadataKey {
                        contract_set_id: contract_set_id.clone(),
                        transaction_hash: row.get("transaction_hash"),
                    })
                    .or_default()
                    .push(DelegateRollingSnapshot {
                        id: row.get("id"),
                        log_index: row.get("log_index"),
                        delegator: row.get("delegator"),
                        from_delegate: row.get("from_delegate"),
                        to_delegate: row.get("to_delegate"),
                        from_new_votes: row.get("from_new_votes"),
                        to_new_votes: row.get("to_new_votes"),
                    });
            }
        }
        Ok(())
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
        r#"SELECT "from", "to", power::TEXT AS power
           FROM delegate_mapping
           WHERE contract_set_id = $1 AND id = $2"#,
    )
    .bind(&common.contract_set_id)
    .bind(delegate_mapping_ref(common, from))
    .fetch_optional(&mut **transaction)
    .await?;

    Ok(row.map(|row| DelegateMappingSnapshot {
        from: row.get("from"),
        to: row.get("to"),
        power: row.get("power"),
    }))
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

#[cfg(test)]
mod token_store_tests {
    use super::*;
    use crate::{
        BatchReadPlanConfig, ChainContracts, ChainReadMethod, PowerReconcileContext,
        plan_power_reconcile,
    };

    #[test]
    fn test_collect_contributor_ensure_candidates_dedupes_delegate_changed_targets() {
        let common = TokenEventCommon {
            contract_set_id: "scope".to_owned(),
            chain_id: 1,
            dao_code: "demo-dao".to_owned(),
            governor_address: "0xgovernor".to_owned(),
            token_address: "0xtoken".to_owned(),
            contract_address: "0xtoken".to_owned(),
            log_index: 1,
            transaction_index: 0,
            block_number: "10".to_owned(),
            block_timestamp: Some("1000".to_owned()),
            transaction_hash: "0xtx".to_owned(),
        };
        let batch = TokenProjectionBatch {
            event_order: Vec::new(),
            delegate_changed: Vec::new(),
            delegate_votes_changed: Vec::new(),
            token_transfers: Vec::new(),
            delegate_rollings: Vec::new(),
            operations: vec![
                TokenProjectionOperation::DelegateChanged {
                    id: "a".to_owned(),
                    common: common.clone(),
                    delegator: "0xdelegator1".to_owned(),
                    from_delegate: "0x0000000000000000000000000000000000000000".to_owned(),
                    to_delegate: "0x00000000000000000000000000000000000000AA".to_owned(),
                },
                TokenProjectionOperation::DelegateChanged {
                    id: "b".to_owned(),
                    common: common.clone(),
                    delegator: "0xdelegator2".to_owned(),
                    from_delegate: "0x0000000000000000000000000000000000000000".to_owned(),
                    to_delegate: "0x00000000000000000000000000000000000000aa".to_owned(),
                },
                TokenProjectionOperation::DelegateChanged {
                    id: "c".to_owned(),
                    common,
                    delegator: "0xdelegator3".to_owned(),
                    from_delegate: "0x0000000000000000000000000000000000000000".to_owned(),
                    to_delegate: "0x0000000000000000000000000000000000000000".to_owned(),
                },
            ],
            reconcile_plan: plan_power_reconcile(
                &PowerReconcileContext {
                    contract_set_id: "scope".to_owned(),
                    dao_code: "demo-dao".to_owned(),
                    chain_id: 1,
                    contracts: ChainContracts {
                        governor: "0xgovernor".to_owned(),
                        governor_token: "0xtoken".to_owned(),
                        timelock: "0xtimelock".to_owned(),
                    },
                    from_block: 10,
                    to_block: 10,
                    target_height: Some(10),
                    read_plan_config: BatchReadPlanConfig::default().validated(),
                    current_power_method: ChainReadMethod::GetVotes,
                },
                &[],
            ),
        };

        let candidates = collect_contributor_ensure_candidates(&batch);

        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].account, "0x00000000000000000000000000000000000000aa");
    }

    #[test]
    fn test_collect_transaction_metadata_keys_dedupes_repeated_transaction_hashes() {
        let common = token_common("scope", "0xtx1", 10, 1);
        let batch = TokenProjectionBatch {
            event_order: Vec::new(),
            delegate_changed: Vec::new(),
            delegate_votes_changed: vec![
                delegate_votes_changed("a", common.clone(), "0xdelegate1", "0", "1"),
                delegate_votes_changed("b", common.clone(), "0xdelegate2", "1", "2"),
                delegate_votes_changed(
                    "c",
                    token_common("scope", "0xtx2", 12, 3),
                    "0xdelegate3",
                    "2",
                    "3",
                ),
                delegate_votes_changed(
                    "d",
                    token_common("other-scope", "0xtx1", 13, 4),
                    "0xdelegate4",
                    "3",
                    "4",
                ),
            ],
            token_transfers: Vec::new(),
            delegate_rollings: Vec::new(),
            operations: Vec::new(),
            reconcile_plan: empty_reconcile_plan(),
        };

        let keys = collect_transaction_metadata_keys(&batch);

        assert_eq!(
            keys,
            vec![
                TransactionMetadataKey {
                    contract_set_id: "scope".to_owned(),
                    transaction_hash: "0xtx1".to_owned(),
                },
                TransactionMetadataKey {
                    contract_set_id: "scope".to_owned(),
                    transaction_hash: "0xtx2".to_owned(),
                },
                TransactionMetadataKey {
                    contract_set_id: "other-scope".to_owned(),
                    transaction_hash: "0xtx1".to_owned(),
                },
            ]
        );
        assert_eq!(
            group_transaction_hashes_by_contract_set(&keys),
            vec![
                (
                    "scope".to_owned(),
                    vec!["0xtx1".to_owned(), "0xtx2".to_owned()]
                ),
                ("other-scope".to_owned(), vec!["0xtx1".to_owned()]),
            ]
        );
    }

    #[test]
    fn test_batch_token_metadata_cache_marks_repeated_delegate_rolling_match_consumed() {
        let common = token_common("scope", "0xtx1", 10, 5);
        let key = TransactionMetadataKey::new(&common);
        let mut cache = BatchTokenMetadataCache {
            transfer_counts: HashMap::new(),
            rollings: HashMap::from([(
                key,
                vec![DelegateRollingSnapshot {
                    id: "rolling-1".to_owned(),
                    log_index: 4,
                    delegator: "0xdelegator".to_owned(),
                    from_delegate: "0xfrom".to_owned(),
                    to_delegate: "0xto".to_owned(),
                    from_new_votes: None,
                    to_new_votes: None,
                }],
            )]),
        };
        let first_match = find_rolling_match_from_rows(cache.rollings(&common), "0xto", "1", 5)
            .expect("first match should use the to side");

        cache.mark_rolling_match(&common, &first_match, "9");
        let second_match = find_rolling_match_from_rows(cache.rollings(&common), "0xto", "1", 6);

        assert_eq!(first_match.side, RollingSide::To);
        assert!(second_match.is_none());
    }

    #[test]
    fn test_token_decimal_helpers_match_postgres_numeric_shape() {
        assert_eq!(signed_decimal_delta("100", "40"), "60");
        assert_eq!(signed_decimal_delta("40", "100"), "-60");
        assert_eq!(signed_decimal_delta("00040", "40"), "0");
        assert_eq!(add_signed_decimal("100", "60"), "160");
        assert_eq!(add_signed_decimal("100", "-60"), "40");
        assert_eq!(add_signed_decimal("40", "-100"), "-60");
        assert_eq!(add_signed_decimal("-40", "100"), "60");
        assert_eq!(add_signed_decimal("-40", "-100"), "-140");
    }

    fn token_common(
        contract_set_id: &str,
        transaction_hash: &str,
        log_index: u64,
        transaction_index: u64,
    ) -> TokenEventCommon {
        TokenEventCommon {
            contract_set_id: contract_set_id.to_owned(),
            chain_id: 1,
            dao_code: "demo-dao".to_owned(),
            governor_address: "0xgovernor".to_owned(),
            token_address: "0xtoken".to_owned(),
            contract_address: "0xtoken".to_owned(),
            log_index,
            transaction_index,
            block_number: "10".to_owned(),
            block_timestamp: Some("1000".to_owned()),
            transaction_hash: transaction_hash.to_owned(),
        }
    }

    fn delegate_votes_changed(
        id: &str,
        common: TokenEventCommon,
        delegate: &str,
        previous_votes: &str,
        new_votes: &str,
    ) -> DelegateVotesChangedWrite {
        DelegateVotesChangedWrite {
            id: id.to_owned(),
            common,
            delegate: delegate.to_owned(),
            previous_votes: previous_votes.to_owned(),
            new_votes: new_votes.to_owned(),
        }
    }

    fn empty_reconcile_plan() -> crate::PowerReconcilePlan {
        plan_power_reconcile(
            &PowerReconcileContext {
                contract_set_id: "scope".to_owned(),
                dao_code: "demo-dao".to_owned(),
                chain_id: 1,
                contracts: ChainContracts {
                    governor: "0xgovernor".to_owned(),
                    governor_token: "0xtoken".to_owned(),
                    timelock: "0xtimelock".to_owned(),
                },
                from_block: 10,
                to_block: 10,
                target_height: Some(10),
                read_plan_config: BatchReadPlanConfig::default().validated(),
                current_power_method: ChainReadMethod::GetVotes,
            },
            &[],
        )
    }
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
