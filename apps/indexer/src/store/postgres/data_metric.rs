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
    let mut items = Vec::new();
    if let Some(token) = token {
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

    for item in items {
        match item {
            DataMetricTimelineItem::Token(operation) => {
                if inserted_operation_keys.iter().any(|inserted| {
                    (inserted.0.as_str(), inserted.1.as_str()) == token_operation_key(operation)
                }) {
                    apply_token_operation(transaction, operation).await?;
                }
            }
            DataMetricTimelineItem::Proposal(row) | DataMetricTimelineItem::Vote(row) => {
                upsert_event_data_metric(transaction, row).await?;
            }
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
    member_count: Option<i32>,
}

async fn upsert_event_data_metric(
    transaction: &mut Transaction<'_, Postgres>,
    row: &DataMetricWrite,
) -> Result<(), PostgresIndexerRunnerStoreError> {
    let snapshot = read_global_data_metric_snapshot(transaction, row).await?;
    let token_address = row.token_address.clone().or(snapshot.token_address.clone());
    let power_sum = row.power_sum.clone().or(snapshot.power_sum);
    let member_count = match row.member_count {
        Some(value) => Some(i64_to_i32(value, "data_metric.member_count")?),
        None => snapshot.member_count,
    };

    sqlx::query(
        "INSERT INTO data_metric (
            id, contract_set_id, chain_id, dao_code, governor_address, token_address, contract_address,
            log_index, transaction_index, proposals_count, votes_count, votes_with_params_count,
            votes_without_params_count, votes_weight_for_sum, votes_weight_against_sum,
            votes_weight_abstain_sum, power_sum, member_count
         )
         VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
            $14::NUMERIC(78, 0), $15::NUMERIC(78, 0), $16::NUMERIC(78, 0),
            $17::NUMERIC(78, 0), $18
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
        "SELECT token_address, power_sum::TEXT AS power_sum, member_count
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
         WHERE chain_id = $3 AND governor_address = $5 AND dao_code = $4
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
