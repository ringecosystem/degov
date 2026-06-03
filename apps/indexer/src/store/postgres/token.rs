// Token projection writes and delegate relation maintenance.
async fn write_token_batch_rows(
    transaction: &mut Transaction<'_, Postgres>,
    batch: &TokenProjectionBatch,
) -> Result<Vec<(String, String)>, PostgresIndexerRunnerStoreError> {
    let mut inserted_operation_keys = Vec::new();

    for row in &batch.delegate_changed {
        if insert_delegate_changed(transaction, row).await? {
            inserted_operation_keys.push((row.common.contract_set_id.clone(), row.id.clone()));
        }
    }
    for row in &batch.delegate_votes_changed {
        if insert_delegate_votes_changed(transaction, row).await? {
            inserted_operation_keys.push((row.common.contract_set_id.clone(), row.id.clone()));
        }
    }
    for row in &batch.token_transfers {
        if insert_token_transfer(transaction, row).await? {
            inserted_operation_keys.push((row.common.contract_set_id.clone(), row.id.clone()));
        }
    }
    for row in &batch.delegate_rollings {
        upsert_delegate_rolling(transaction, row).await?;
    }
    for row in &batch.delegate_votes_changed {
        insert_vote_power_checkpoint(transaction, row).await?;
    }
    Ok(inserted_operation_keys)
}

async fn insert_delegate_changed(
    transaction: &mut Transaction<'_, Postgres>,
    row: &DelegateChangedWrite,
) -> Result<bool, PostgresIndexerRunnerStoreError> {
    let result = sqlx::query(
        "INSERT INTO delegate_changed (
            id, contract_set_id, chain_id, dao_code, governor_address, token_address, contract_address,
            log_index, transaction_index, delegator, from_delegate, to_delegate, block_number,
            block_timestamp, transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::NUMERIC(78, 0),
            $14::NUMERIC(78, 0), $15
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
            id, contract_set_id, chain_id, dao_code, governor_address, token_address, contract_address,
            log_index, transaction_index, delegate, previous_votes, new_votes, block_number,
            block_timestamp, transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::NUMERIC(78, 0), $12::NUMERIC(78, 0),
            $13::NUMERIC(78, 0), $14::NUMERIC(78, 0), $15
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
            id, contract_set_id, chain_id, dao_code, governor_address, token_address, contract_address,
            log_index, transaction_index, \"from\", \"to\", value, standard, block_number,
            block_timestamp, transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::NUMERIC(78, 0), $13,
            $14::NUMERIC(78, 0), $15::NUMERIC(78, 0), $16
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
            id, contract_set_id, chain_id, dao_code, governor_address, token_address, contract_address,
            log_index, transaction_index, delegator, from_delegate, to_delegate, block_number,
            block_timestamp, transaction_hash, from_previous_votes, from_new_votes,
            to_previous_votes, to_new_votes
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::NUMERIC(78, 0),
            $14::NUMERIC(78, 0), $15, $16::NUMERIC(78, 0), $17::NUMERIC(78, 0),
            $18::NUMERIC(78, 0), $19::NUMERIC(78, 0)
         )
         ON CONFLICT (contract_set_id, id) DO UPDATE
         SET from_previous_votes = COALESCE(EXCLUDED.from_previous_votes, delegate_rolling.from_previous_votes),
             from_new_votes = COALESCE(EXCLUDED.from_new_votes, delegate_rolling.from_new_votes),
             to_previous_votes = COALESCE(EXCLUDED.to_previous_votes, delegate_rolling.to_previous_votes),
             to_new_votes = COALESCE(EXCLUDED.to_new_votes, delegate_rolling.to_new_votes)",
    )
    .bind(&row.id)
    .bind(&row.common.contract_set_id)
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
    let rollings = transaction_rollings(transaction, &row.common).await?;
    let transfers_count: i64 = sqlx::query(
        "SELECT count(*)::BIGINT
             FROM token_transfer
             WHERE contract_set_id = $1 AND transaction_hash = $2",
    )
    .bind(&row.common.contract_set_id)
    .bind(&row.common.transaction_hash)
    .fetch_one(&mut **transaction)
    .await?
    .get(0);
    let rolling_match =
        find_rolling_match_from_rows(&rollings, &row.delegate, &delta, row.common.log_index);
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
    let previous_mapping = read_delegate_mapping(transaction, common, delegator).await?;
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
        sqlx::query("DELETE FROM delegate_mapping WHERE contract_set_id = $1 AND id = $2")
            .bind(&common.contract_set_id)
            .bind(delegate_mapping_ref(common, delegator))
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
    let rollings = transaction_rollings(transaction, common).await?;
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
                 WHERE contract_set_id = $4 AND id = $1",
            )
            .bind(&rolling_match.id)
            .bind(previous_votes)
            .bind(new_votes)
            .bind(&common.contract_set_id)
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
                 WHERE contract_set_id = $4 AND id = $1",
            )
            .bind(&rolling_match.id)
            .bind(previous_votes)
            .bind(new_votes)
            .bind(&common.contract_set_id)
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
    if let Some(mapping) = read_delegate_mapping(transaction, common, from).await? {
        apply_delegate_delta(
            transaction,
            common,
            &mapping.from,
            &mapping.to,
            &format!("-{value}"),
        )
        .await?;
    }
    if let Some(mapping) = read_delegate_mapping(transaction, common, to).await? {
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

    let previous_mapping_power = read_delegate_mapping(transaction, common, from_delegate)
        .await?
        .filter(|mapping| mapping.to == to_delegate)
        .map(|mapping| mapping.power)
        .unwrap_or_else(|| "0".to_owned());
    let next_mapping_power =
        add_signed_decimal(transaction, &previous_mapping_power, delta).await?;

    sqlx::query(
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

async fn transaction_rollings(
    transaction: &mut Transaction<'_, Postgres>,
    common: &TokenEventCommon,
) -> Result<Vec<DelegateRollingSnapshot>, PostgresIndexerRunnerStoreError> {
    let rows = sqlx::query(
        "SELECT id, log_index, delegator, from_delegate, to_delegate,
                from_new_votes::TEXT AS from_new_votes,
                to_new_votes::TEXT AS to_new_votes
         FROM delegate_rolling
         WHERE contract_set_id = $1
           AND transaction_hash = $2
           AND from_delegate <> to_delegate
         ORDER BY log_index DESC",
    )
    .bind(&common.contract_set_id)
    .bind(&common.transaction_hash)
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
