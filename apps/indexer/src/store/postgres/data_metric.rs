// Data metric timeline and aggregate refreshes.
enum DataMetricTimelineItem<'a> {
    Token(&'a TokenProjectionOperation),
    Proposal(&'a DataMetricWrite),
    Vote(&'a DataMetricWrite),
}

async fn write_data_metric_timeline(
    transaction: &mut Transaction<'_, Postgres>,
    inserted_operation_keys: &[(String, String)],
    proposal: Option<&ProposalProjectionBatch>,
    vote: Option<&VoteProjectionBatch>,
    token: Option<&TokenProjectionBatch>,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    let total_started_at = std::time::Instant::now();
    let inserted_operation_keys = inserted_operation_keys
        .iter()
        .map(|(contract_set_id, id)| (contract_set_id.as_str(), id.as_str()))
        .collect::<HashSet<_>>();
    let mut delegate_mapping_cache = DelegateMappingCache::default();
    let mut delegate_snapshot_cache = DelegateSnapshotCache::default();
    let mut contributor_ensure_cache = ContributorEnsureCache::default();
    let mut token_metadata_cache = BatchTokenMetadataCache::default();
    let mut items = Vec::new();
    let mut contributor_preload_duration = std::time::Duration::ZERO;
    let mut metadata_preload_duration = std::time::Duration::ZERO;
    let mut mapping_preload_duration = std::time::Duration::ZERO;
    if let Some(token) = token {
        let started_at = std::time::Instant::now();
        contributor_ensure_cache
            .preload_batch(transaction, token, &inserted_operation_keys)
            .await?;
        contributor_preload_duration = started_at.elapsed();

        let started_at = std::time::Instant::now();
        token_metadata_cache = BatchTokenMetadataCache::preload(transaction, token).await?;
        metadata_preload_duration = started_at.elapsed();

        let started_at = std::time::Instant::now();
        delegate_mapping_cache
            .preload_batch(transaction, token, &token_metadata_cache)
            .await?;
        mapping_preload_duration = started_at.elapsed();
        items.extend(token.operations.iter().map(DataMetricTimelineItem::Token));
    }
    if let Some(proposal) = proposal {
        items.extend(
            proposal
                .data_metrics
                .iter()
                .map(DataMetricTimelineItem::Proposal),
        );
    }
    if let Some(vote) = vote {
        items.extend(vote.data_metrics.iter().map(DataMetricTimelineItem::Vote));
    }
    items.sort_by_key(data_metric_timeline_order);

    let replay_started_at = std::time::Instant::now();
    for item in items {
        match item {
            DataMetricTimelineItem::Token(operation) => {
                if inserted_operation_keys.contains(&token_operation_key(operation)) {
                    apply_token_operation(
                        transaction,
                        &mut delegate_mapping_cache,
                        &mut delegate_snapshot_cache,
                        &mut contributor_ensure_cache,
                        &mut token_metadata_cache,
                        operation,
                    )
                    .await?;
                }
            }
            DataMetricTimelineItem::Proposal(row) | DataMetricTimelineItem::Vote(row) => {
                contributor_ensure_cache
                    .flush_contributor_count_increments(transaction)
                    .await?;
                upsert_event_data_metric(transaction, row).await?;
            }
        }
    }
    let replay_duration = replay_started_at.elapsed();

    let rolling_flush_started_at = std::time::Instant::now();
    token_metadata_cache
        .flush_rolling_vote_updates(transaction)
        .await?;
    let rolling_flush_duration = rolling_flush_started_at.elapsed();

    let snapshot_flush_started_at = std::time::Instant::now();
    delegate_snapshot_cache.flush(transaction).await?;
    let snapshot_flush_duration = snapshot_flush_started_at.elapsed();

    let mapping_flush_started_at = std::time::Instant::now();
    let effective_count_delegates = delegate_mapping_cache.flush(transaction).await?;
    let mapping_flush_duration = mapping_flush_started_at.elapsed();

    let contributor_count_flush_started_at = std::time::Instant::now();
    contributor_ensure_cache
        .flush_contributor_count_deltas(transaction)
        .await?;
    recompute_delegate_count_effective(transaction, &effective_count_delegates).await?;
    let contributor_count_flush_duration = contributor_count_flush_started_at.elapsed();

    let contributor_count_metric_flush_started_at = std::time::Instant::now();
    contributor_ensure_cache
        .flush_contributor_count_increments(transaction)
        .await?;
    let contributor_count_metric_flush_duration =
        contributor_count_metric_flush_started_at.elapsed();

    if let Some(token) = token {
        if let Some(common) = token_batch_common(token) {
            log::info!(
                "Datalens indexer token timeline phases dao_code={} chain_id={} contract_set_id={} token_operation_count={} inserted_operation_count={} contributor_preload_duration_ms={} metadata_preload_duration_ms={} mapping_preload_duration_ms={} replay_duration_ms={} rolling_flush_duration_ms={} snapshot_flush_duration_ms={} mapping_flush_duration_ms={} contributor_count_flush_duration_ms={} contributor_count_metric_flush_duration_ms={} total_duration_ms={}",
                common.dao_code,
                common.chain_id,
                common.contract_set_id,
                token.operations.len(),
                inserted_operation_keys.len(),
                contributor_preload_duration.as_millis(),
                metadata_preload_duration.as_millis(),
                mapping_preload_duration.as_millis(),
                replay_duration.as_millis(),
                rolling_flush_duration.as_millis(),
                snapshot_flush_duration.as_millis(),
                mapping_flush_duration.as_millis(),
                contributor_count_flush_duration.as_millis(),
                contributor_count_metric_flush_duration.as_millis(),
                total_started_at.elapsed().as_millis(),
            );
        }
    }

    Ok(())
}

fn data_metric_timeline_order(item: &DataMetricTimelineItem<'_>) -> (u64, u64, u64, String) {
    match item {
        DataMetricTimelineItem::Token(operation) => {
            let common = token_operation_common(operation);
            (
                common.block_number.parse::<u64>().unwrap_or(u64::MAX),
                common.transaction_index,
                common.log_index,
                token_operation_key(operation).1.to_owned(),
            )
        }
        DataMetricTimelineItem::Proposal(row) | DataMetricTimelineItem::Vote(row) => (
            row.block_number.parse::<u64>().unwrap_or(u64::MAX),
            row.transaction_index.unwrap_or(u64::MAX),
            row.log_index.unwrap_or(u64::MAX),
            row.id.clone(),
        ),
    }
}

#[derive(Clone, Debug, Default)]
struct DataMetricSnapshot {
    token_address: Option<String>,
    power_sum: Option<String>,
    contributor_count: Option<i32>,
    holders_count: Option<i32>,
    member_count: Option<i32>,
}

async fn upsert_event_data_metric(
    transaction: &mut Transaction<'_, Postgres>,
    row: &DataMetricWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    let snapshot = read_global_data_metric_snapshot(transaction, row).await?;
    let token_address = row.token_address.clone().or(snapshot.token_address.clone());
    let power_sum = row.power_sum.clone().or(snapshot.power_sum);
    let contributor_count = match row.contributor_count {
        Some(value) => Some(i64_to_i32(value, "data_metric.contributor_count")?),
        None => snapshot.contributor_count,
    };
    let holders_count = match row.holders_count {
        Some(value) => Some(i64_to_i32(value, "data_metric.holders_count")?),
        None => snapshot.holders_count,
    };
    let member_count = match row.member_count {
        Some(value) => Some(i64_to_i32(value, "data_metric.member_count")?),
        None => snapshot.member_count,
    };

    sqlx::query(
        "INSERT INTO data_metric (
            id, contract_set_id, chain_id, dao_code, governor_address, token_address, contract_address,
            log_index, transaction_index, proposals_count, votes_count, votes_with_params_count,
            votes_without_params_count, votes_weight_for_sum, votes_weight_against_sum,
            votes_weight_abstain_sum, power_sum, contributor_count, holders_count, member_count
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
            $14::NUMERIC(78, 0), $15::NUMERIC(78, 0), $16::NUMERIC(78, 0),
            $17::NUMERIC(78, 0), $18, $19, $20
         )
         ON CONFLICT (contract_set_id, id) WHERE id <> 'global' DO UPDATE
         SET contract_set_id = EXCLUDED.contract_set_id,
             chain_id = EXCLUDED.chain_id,
             dao_code = EXCLUDED.dao_code,
             governor_address = EXCLUDED.governor_address,
             token_address = EXCLUDED.token_address,
             contract_address = EXCLUDED.contract_address,
             log_index = EXCLUDED.log_index,
             transaction_index = EXCLUDED.transaction_index,
             proposals_count = EXCLUDED.proposals_count,
             votes_count = EXCLUDED.votes_count,
             votes_with_params_count = EXCLUDED.votes_with_params_count,
             votes_without_params_count = EXCLUDED.votes_without_params_count,
             votes_weight_for_sum = EXCLUDED.votes_weight_for_sum,
             votes_weight_against_sum = EXCLUDED.votes_weight_against_sum,
             votes_weight_abstain_sum = EXCLUDED.votes_weight_abstain_sum,
             power_sum = EXCLUDED.power_sum,
             contributor_count = EXCLUDED.contributor_count,
             holders_count = EXCLUDED.holders_count,
             member_count = EXCLUDED.member_count",
    )
    .bind(&row.id)
    .bind(&row.contract_set_id)
    .bind(row.chain_id)
    .bind(&row.dao_code)
    .bind(&row.governor_address)
    .bind(&token_address)
    .bind(&row.contract_address)
    .bind(optional_u64_to_i32(row.log_index, "data_metric.log_index")?)
    .bind(optional_u64_to_i32(
        row.transaction_index,
        "data_metric.transaction_index",
    )?)
    .bind(optional_i64_to_i32(
        row.proposals_count,
        "data_metric.proposals_count",
    )?)
    .bind(optional_i64_to_i32(
        row.votes_count,
        "data_metric.votes_count",
    )?)
    .bind(optional_i64_to_i32(
        row.votes_with_params_count,
        "data_metric.votes_with_params_count",
    )?)
    .bind(optional_i64_to_i32(
        row.votes_without_params_count,
        "data_metric.votes_without_params_count",
    )?)
    .bind(&row.votes_weight_for_sum)
    .bind(&row.votes_weight_against_sum)
    .bind(&row.votes_weight_abstain_sum)
    .bind(&power_sum)
    .bind(contributor_count)
    .bind(holders_count)
    .bind(member_count)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn read_global_data_metric_snapshot(
    transaction: &mut Transaction<'_, Postgres>,
    row: &DataMetricWrite,
) -> Result<DataMetricSnapshot, PostgresIndexerRunnerStoreError> {
    let snapshot = sqlx::query(
        "SELECT token_address, power_sum::TEXT AS power_sum, contributor_count, holders_count,
                member_count
         FROM data_metric
         WHERE id = $1 AND contract_set_id = $2 AND chain_id = $3 AND governor_address = $4 AND dao_code IS NOT DISTINCT FROM $5",
    )
    .bind(data_metric_id(
        row.chain_id,
        &row.governor_address,
        &row.dao_code,
    ))
    .bind(&row.contract_set_id)
    .bind(row.chain_id)
    .bind(&row.governor_address)
    .bind(&row.dao_code)
    .fetch_optional(&mut **transaction)
    .await?;

    Ok(snapshot
        .map(|snapshot| DataMetricSnapshot {
            token_address: snapshot.get("token_address"),
            power_sum: snapshot.get("power_sum"),
            contributor_count: snapshot.get("contributor_count"),
            holders_count: snapshot.get("holders_count"),
            member_count: snapshot.get("member_count"),
        })
        .unwrap_or_default())
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
            id, contract_set_id, chain_id, dao_code, governor_address, votes_count, votes_with_params_count,
            votes_without_params_count, votes_weight_for_sum, votes_weight_against_sum,
            votes_weight_abstain_sum
         )
         SELECT
            $1, $2, $3, $4, $5,
            count(*)::INTEGER,
            count(*) FILTER (WHERE type = 'vote-cast-with-params')::INTEGER,
            count(*) FILTER (WHERE type = 'vote-cast-without-params')::INTEGER,
            COALESCE(sum(CASE WHEN support = 1 THEN weight ELSE 0 END), 0)::NUMERIC(78, 0),
            COALESCE(sum(CASE WHEN support = 0 THEN weight ELSE 0 END), 0)::NUMERIC(78, 0),
            COALESCE(sum(CASE WHEN support = 2 THEN weight ELSE 0 END), 0)::NUMERIC(78, 0)
         FROM vote_cast_group
         WHERE contract_set_id = $2 AND chain_id = $3 AND governor_address = $5 AND dao_code = $4
         ON CONFLICT ON CONSTRAINT data_metric_scope_unique DO UPDATE
         SET votes_count = EXCLUDED.votes_count,
             votes_with_params_count = EXCLUDED.votes_with_params_count,
             votes_without_params_count = EXCLUDED.votes_without_params_count,
             votes_weight_for_sum = EXCLUDED.votes_weight_for_sum,
             votes_weight_against_sum = EXCLUDED.votes_weight_against_sum,
             votes_weight_abstain_sum = EXCLUDED.votes_weight_abstain_sum",
    )
    .bind(metric_id)
    .bind(&row.contract_set_id)
    .bind(row.chain_id)
    .bind(&row.dao_code)
    .bind(&row.governor_address)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

async fn refresh_proposal_data_metric(
    transaction: &mut Transaction<'_, Postgres>,
    batch: &ProposalProjectionBatch,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    let scope = batch
        .proposals
        .first()
        .map(|row| {
            (
                row.contract_set_id.as_str(),
                row.chain_id,
                row.dao_code.as_str(),
                row.governor_address.as_str(),
            )
        })
        .or_else(|| {
            batch.data_metrics.first().map(|row| {
                (
                    row.contract_set_id.as_str(),
                    row.chain_id,
                    row.dao_code.as_str(),
                    row.governor_address.as_str(),
                )
            })
        });
    let Some((contract_set_id, chain_id, dao_code, governor_address)) = scope else {
        return Ok(());
    };
    let metric_id = data_metric_id(chain_id, governor_address, dao_code);

    sqlx::query(
        "INSERT INTO data_metric (
            id, contract_set_id, chain_id, dao_code, governor_address, proposals_count
         )
         SELECT $1, $2, $3, $4, $5, count(*)::INTEGER
         FROM proposal
         WHERE contract_set_id = $2 AND chain_id = $3 AND governor_address = $5 AND dao_code = $4
         ON CONFLICT ON CONSTRAINT data_metric_scope_unique DO UPDATE
         SET proposals_count = EXCLUDED.proposals_count",
    )
    .bind(metric_id)
    .bind(contract_set_id)
    .bind(chain_id)
    .bind(dao_code)
    .bind(governor_address)
    .execute(&mut **transaction)
    .await?;

    Ok(())
}

fn data_metric_id(chain_id: i32, governor_address: &str, dao_code: &str) -> String {
    let _ = (chain_id, governor_address, dao_code);
    "global".to_owned()
}
