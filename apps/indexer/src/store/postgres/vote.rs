// Vote projection writes.
async fn write_vote_batch_rows(
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
            id, contract_set_id, chain_id, dao_code, governor_address, contract_address, log_index,
            transaction_index, proposal_id, type, voter, ref_proposal_id, support, weight,
            reason, params, block_number, block_timestamp, transaction_hash
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            COALESCE(
              (
                SELECT proposal.id
                FROM proposal
                WHERE proposal.chain_id IS NOT DISTINCT FROM $3
                  AND proposal.dao_code IS NOT DISTINCT FROM $4
                  AND proposal.governor_address IS NOT DISTINCT FROM $5
                  AND proposal.proposal_id = $12
                LIMIT 1
              ),
              $9
            ),
            $10, $11, $12, $13,
            $14::NUMERIC(78, 0), $15, $16, $17::NUMERIC(78, 0), $18::NUMERIC(78, 0), $19
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
    .bind(&row.contract_set_id)
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
            id, contract_set_id, chain_id, dao_code, governor_address, token_address, contract_address,
            log_index, transaction_index, block_number, block_timestamp, transaction_hash,
            last_vote_block_number, last_vote_timestamp, power, balance, delegates_count_all,
            delegates_count_effective
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::NUMERIC(78, 0), $11::NUMERIC(78, 0), $12,
            $10::NUMERIC(78, 0), $11::NUMERIC(78, 0), 0::NUMERIC(78, 0), NULL, 0, 0
         )
         ON CONFLICT (contract_set_id, id) DO UPDATE
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
    .bind(&row.contract_set_id)
    .bind(row.chain_id)
    .bind(&row.dao_code)
    .bind(&row.governor_address)
    .bind(&row.token_address)
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

