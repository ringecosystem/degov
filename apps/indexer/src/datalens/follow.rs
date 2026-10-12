use std::collections::HashMap;
use std::sync::Mutex;

use datalens_sdk::{
    Address, B256, BlockRange, ChainName, Client, Dataset, Error, Finality, FinalizedCursor,
    FollowEvent, FollowRequest, IncompleteReason, LogSelector, Observation, ProvisionalCursor,
    QueryFinality, QueryRequest, Segment, SegmentSource, TopicFilter,
};
use futures::StreamExt;

use crate::{
    DaoLogRequest, DatalensIncomplete, DatalensLogQueryCacheOutcome, DatalensLogQueryCacheSummary,
    DatalensLogQueryResult, DatalensProvisionalCacheSegment, DatalensProvisionalLogQueryResult,
    DatalensServe,
};

pub(crate) async fn follow_durable(
    client: &Client,
    request: &DaoLogRequest,
) -> Result<DatalensLogQueryResult, Error> {
    let wire = query_request(request, QueryFinality::DurableOnly)?;
    let mut follow = FollowRequest::logs(
        wire.chain.clone(),
        wire.selector.clone().unwrap(),
        request.start,
    );
    follow.end = Some(request.end);
    follow.finality = QueryFinality::DurableOnly;
    follow.fields = Some(log_fields());
    follow.chunk_blocks = request.end.saturating_sub(request.start).saturating_add(1);

    let mut cursor = FinalizedCursor::new(request.start);
    let mut rows = Vec::new();
    let mut segments = Vec::new();
    let mut incomplete = None;
    let mut stream = client.follow(follow);
    while let Some(event) = stream.next().await {
        match event? {
            FollowEvent::Batch(batch) => {
                cursor.advance(&batch);
                let durable_until = cursor.next();
                rows.extend(
                    batch
                        .rows
                        .into_iter()
                        .filter(|row| row_block(row).is_some_and(|block| block < durable_until)),
                );
                segments.extend(batch.segments);
            }
            FollowEvent::CaughtUp { .. } => break,
            FollowEvent::Skipped { blocks } => {
                return Err(Error::Decode(format!(
                    "durable follow skipped blocks {}..={}",
                    blocks.start(),
                    blocks.end()
                )));
            }
            FollowEvent::Stalled { reason, .. } => {
                incomplete = Some(map_incomplete(reason));
                break;
            }
        }
    }

    let next = cursor.next();
    let served_end = (next > request.start).then_some(next - 1);
    let serve = match served_end {
        None => DatalensServe::Nothing,
        Some(end) if end >= request.end && incomplete.is_none() => DatalensServe::ThroughRequest,
        Some(end) => DatalensServe::ThroughBlock(end.min(request.end)),
    };
    Ok(DatalensLogQueryResult {
        rows: serde_json::Value::Array(rows),
        cache: cache_summary(request, served_end, &segments, incomplete),
        serve,
        incomplete,
    })
}

pub(crate) async fn query_latest(
    client: &Client,
    cursors: &Mutex<HashMap<String, ProvisionalCursor>>,
    request: &DaoLogRequest,
) -> Result<DatalensProvisionalLogQueryResult, Error> {
    let wire = query_request(request, QueryFinality::LatestOnly)?;
    let response = client.query_all(&wire).await?;
    let key = format!(
        "{}:{}",
        request.chain,
        crate::datalens_selector_fingerprint(request)
    );
    let observation = {
        let mut cursors = cursors
            .lock()
            .map_err(|_| Error::Decode("provisional cursor lock poisoned".to_owned()))?;
        let cursor = cursors
            .entry(key)
            .or_insert_with(|| ProvisionalCursor::new(request.start));
        cursor.observe(&response)
    };
    let rollback_from = match observation {
        Observation::Consistent => None,
        Observation::Rollback { from } => Some(from),
    };
    let segments = response
        .segments
        .iter()
        .filter(|segment| segment.source == SegmentSource::Hot)
        .filter_map(provisional_segment)
        .collect();
    Ok(DatalensProvisionalLogQueryResult {
        rows: if rollback_from.is_some() {
            serde_json::Value::Array(Vec::new())
        } else {
            serde_json::Value::Array(response.rows)
        },
        segments,
        rollback_from,
    })
}

pub(crate) fn query_request(
    request: &DaoLogRequest,
    finality: QueryFinality,
) -> Result<QueryRequest, Error> {
    let chain =
        ChainName::new(request.chain.clone()).map_err(|error| Error::Decode(error.to_string()))?;
    let range = BlockRange::new(request.start, request.end)
        .map_err(|error| Error::Decode(error.to_string()))?;
    Ok(QueryRequest {
        chain,
        dataset: Dataset::EvmLogs,
        selector: Some(log_selector(request)?),
        range,
        finality,
        fields: Some(log_fields()),
        page: None,
        wait_ms: None,
    })
}

fn log_fields() -> Vec<String> {
    [
        "block_number",
        "block_hash",
        "block_timestamp",
        "transaction_hash",
        "transaction_index",
        "log_index",
        "address",
        "topics",
        "data",
        "finality",
    ]
    .into_iter()
    .map(str::to_owned)
    .collect()
}

fn log_selector(request: &DaoLogRequest) -> Result<LogSelector, Error> {
    let mut selector = LogSelector::default();
    for address in &request.addresses {
        let parsed: Address = address
            .parse()
            .map_err(|error| Error::Decode(format!("address {address}: {error}")))?;
        selector.addresses.insert(parsed);
    }
    let topics = request
        .topic0s
        .iter()
        .map(|topic| {
            topic
                .parse::<B256>()
                .map_err(|error| Error::Decode(format!("topic {topic}: {error}")))
        })
        .collect::<Result<Vec<_>, _>>()?;
    selector.topics[0] =
        TopicFilter::one_of(topics).map_err(|error| Error::Decode(error.to_string()))?;
    Ok(selector)
}

fn map_incomplete(reason: IncompleteReason) -> DatalensIncomplete {
    match reason {
        IncompleteReason::Pending => DatalensIncomplete::Pending,
        IncompleteReason::NotFollowedYet => DatalensIncomplete::NotFollowedYet,
        IncompleteReason::ProviderError => DatalensIncomplete::ProviderError,
        IncompleteReason::BudgetExhausted => DatalensIncomplete::BudgetExhausted,
        // Durable follow does not read the hot tail. below_safe means that range is not
        // promoted yet, so the indexer waits and asks again.
        IncompleteReason::BelowSafe => DatalensIncomplete::NotFollowedYet,
    }
}

fn cache_summary(
    request: &DaoLogRequest,
    served_end: Option<u64>,
    segments: &[Segment],
    incomplete: Option<DatalensIncomplete>,
) -> DatalensLogQueryCacheSummary {
    let durable = segments
        .iter()
        .filter(|segment| segment.source == SegmentSource::Durable)
        .count();
    let hot = segments
        .iter()
        .filter(|segment| segment.source == SegmentSource::Hot)
        .count();
    let covered = served_end.is_some_and(|end| end >= request.end) && incomplete.is_none();
    let outcome = match served_end {
        None if incomplete.is_some() => DatalensLogQueryCacheOutcome::Miss,
        None => DatalensLogQueryCacheOutcome::Empty,
        Some(_) if covered && durable > 0 => DatalensLogQueryCacheOutcome::FullHit,
        Some(_) if durable > 0 || hot > 0 => DatalensLogQueryCacheOutcome::PartialHit,
        Some(_) => DatalensLogQueryCacheOutcome::Miss,
    };
    DatalensLogQueryCacheSummary {
        outcome,
        hit_range_count: Some(durable + hot),
        missing_range_count: Some(usize::from(!covered)),
        durable_hit_range_count: Some(durable),
        hot_hit_range_count: Some(hot),
        provider_fill_range_count: Some(0),
    }
}

fn provisional_segment(segment: &Segment) -> Option<DatalensProvisionalCacheSegment> {
    Some(DatalensProvisionalCacheSegment {
        source: "hot".to_owned(),
        finality: finality_name(segment.finality).to_owned(),
        range_start_block: i64::try_from(segment.start).ok()?,
        range_end_block: i64::try_from(segment.end).ok()?,
        anchor_block_number: segment
            .anchor
            .and_then(|anchor| i64::try_from(anchor.number).ok()),
        anchor_block_hash: segment.anchor.map(|anchor| format!("{:#x}", anchor.hash)),
        anchor_parent_hash: None,
        anchor_block_timestamp: None,
    })
}

fn finality_name(finality: Finality) -> &'static str {
    match finality {
        Finality::Unsafe => "unsafe",
        Finality::Safe => "safe",
        Finality::Finalized => "finalized",
    }
}

fn row_block(row: &serde_json::Value) -> Option<u64> {
    row.get("block_number").and_then(serde_json::Value::as_u64)
}
