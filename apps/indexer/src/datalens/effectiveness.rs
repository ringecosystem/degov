use std::fmt;
use std::time::Duration;

use datalens_sdk::native::QuerySelectorInput;
use sha3::{Digest, Keccak256};

use crate::IndexerCheckpointIdentity;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DatalensLogQueryCacheOutcome {
    FullHit,
    PartialHit,
    Miss,
    Empty,
    Unavailable,
}

impl fmt::Display for DatalensLogQueryCacheOutcome {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::FullHit => formatter.write_str("full_hit"),
            Self::PartialHit => formatter.write_str("partial_hit"),
            Self::Miss => formatter.write_str("miss"),
            Self::Empty => formatter.write_str("empty"),
            Self::Unavailable => formatter.write_str("unavailable"),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DatalensLogQueryCacheSummary {
    pub outcome: DatalensLogQueryCacheOutcome,
    pub hit_range_count: Option<usize>,
    pub missing_range_count: Option<usize>,
    pub durable_hit_range_count: Option<usize>,
    pub hot_hit_range_count: Option<usize>,
    pub provider_fill_range_count: Option<usize>,
}

impl DatalensLogQueryCacheSummary {
    pub fn unavailable() -> Self {
        Self {
            outcome: DatalensLogQueryCacheOutcome::Unavailable,
            hit_range_count: None,
            missing_range_count: None,
            durable_hit_range_count: None,
            hot_hit_range_count: None,
            provider_fill_range_count: None,
        }
    }

    pub fn from_datalens_cache_json(cache: &serde_json::Value) -> Self {
        let hit_range_count = range_count(cache, "hit_ranges");
        let missing_range_count = range_count(cache, "missing_ranges");
        let outcome = match (hit_range_count, missing_range_count) {
            (Some(hit), Some(missing)) if hit > 0 && missing == 0 => {
                DatalensLogQueryCacheOutcome::FullHit
            }
            (Some(hit), Some(missing)) if hit > 0 && missing > 0 => {
                DatalensLogQueryCacheOutcome::PartialHit
            }
            (Some(0), Some(missing)) if missing > 0 => DatalensLogQueryCacheOutcome::Miss,
            (Some(0), Some(0)) => DatalensLogQueryCacheOutcome::Empty,
            _ => DatalensLogQueryCacheOutcome::Unavailable,
        };

        Self {
            outcome,
            hit_range_count,
            missing_range_count,
            durable_hit_range_count: range_count(cache, "durable_hit_ranges"),
            hot_hit_range_count: range_count(cache, "hot_hit_ranges"),
            provider_fill_range_count: range_count(cache, "provider_fill_ranges"),
        }
    }
}

fn range_count(cache: &serde_json::Value, field: &str) -> Option<usize> {
    cache
        .get(field)
        .and_then(serde_json::Value::as_array)
        .map(Vec::len)
}

#[derive(Clone, Debug, PartialEq)]
pub struct DatalensLogQueryResult {
    pub rows: serde_json::Value,
    pub cache: DatalensLogQueryCacheSummary,
}

impl DatalensLogQueryResult {
    pub fn rows_only(rows: serde_json::Value) -> Self {
        Self {
            rows,
            cache: DatalensLogQueryCacheSummary::unavailable(),
        }
    }
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct DatalensWarmupEffectivenessAggregation {
    pub query_count: usize,
    pub full_hit_count: usize,
    pub partial_hit_count: usize,
    pub miss_count: usize,
    pub empty_count: usize,
    pub unavailable_count: usize,
    pub provider_fill_range_count: usize,
    pub provider_limit_count: usize,
    query_duration_min: Option<Duration>,
    query_duration_max: Option<Duration>,
    query_duration_total: Duration,
}

impl DatalensWarmupEffectivenessAggregation {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record_query(&mut self, cache: DatalensLogQueryCacheSummary, duration: Duration) {
        self.query_count += 1;
        match cache.outcome {
            DatalensLogQueryCacheOutcome::FullHit => self.full_hit_count += 1,
            DatalensLogQueryCacheOutcome::PartialHit => self.partial_hit_count += 1,
            DatalensLogQueryCacheOutcome::Miss => self.miss_count += 1,
            DatalensLogQueryCacheOutcome::Empty => self.empty_count += 1,
            DatalensLogQueryCacheOutcome::Unavailable => self.unavailable_count += 1,
        }
        self.provider_fill_range_count += cache.provider_fill_range_count.unwrap_or(0);
        self.query_duration_total += duration;
        self.query_duration_min = Some(
            self.query_duration_min
                .map_or(duration, |current| current.min(duration)),
        );
        self.query_duration_max = Some(
            self.query_duration_max
                .map_or(duration, |current| current.max(duration)),
        );
    }

    pub fn record_provider_limit(&mut self) {
        self.provider_limit_count += 1;
    }

    pub fn record_provider_limits(&mut self, count: usize) {
        self.provider_limit_count += count;
    }

    pub fn query_duration_min_ms(&self) -> Option<u128> {
        self.query_duration_min.map(|duration| duration.as_millis())
    }

    pub fn query_duration_avg_ms(&self) -> Option<u128> {
        if self.query_count == 0 {
            return None;
        }
        Some(self.query_duration_total.as_millis() / self.query_count as u128)
    }

    pub fn query_duration_max_ms(&self) -> Option<u128> {
        self.query_duration_max.map(|duration| duration.as_millis())
    }

    pub fn query_duration_max(&self) -> Option<Duration> {
        self.query_duration_max
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DatalensWarmupEffectivenessLogFields {
    pub dao_code: String,
    pub chain_id: i32,
    pub contract_set_id: String,
    pub selector_fingerprint: String,
    pub query_watermark: Option<i64>,
    pub current_checkpoint: Option<i64>,
    pub full_hit_count: usize,
    pub partial_hit_count: usize,
    pub miss_count: usize,
    pub empty_count: usize,
    pub unavailable_count: usize,
    pub provider_fill_range_count: usize,
    pub provider_limit_count: usize,
    pub query_duration_min_ms: Option<u128>,
    pub query_duration_avg_ms: Option<u128>,
    pub query_duration_max_ms: Option<u128>,
}

impl DatalensWarmupEffectivenessLogFields {
    pub fn from_aggregation(
        identity: &IndexerCheckpointIdentity,
        selector_fingerprint: impl Into<String>,
        current_checkpoint: Option<i64>,
        query_watermark: Option<i64>,
        aggregation: &DatalensWarmupEffectivenessAggregation,
    ) -> Self {
        Self {
            dao_code: identity.dao_code.clone(),
            chain_id: identity.chain_id,
            contract_set_id: identity.contract_set_id.clone(),
            selector_fingerprint: selector_fingerprint.into(),
            query_watermark,
            current_checkpoint,
            full_hit_count: aggregation.full_hit_count,
            partial_hit_count: aggregation.partial_hit_count,
            miss_count: aggregation.miss_count,
            empty_count: aggregation.empty_count,
            unavailable_count: aggregation.unavailable_count,
            provider_fill_range_count: aggregation.provider_fill_range_count,
            provider_limit_count: aggregation.provider_limit_count,
            query_duration_min_ms: aggregation.query_duration_min_ms(),
            query_duration_avg_ms: aggregation.query_duration_avg_ms(),
            query_duration_max_ms: aggregation.query_duration_max_ms(),
        }
    }
}

pub fn datalens_selector_fingerprint(selector: &QuerySelectorInput) -> String {
    let bytes = serde_json::to_vec(selector).unwrap_or_default();
    let digest = Keccak256::digest(bytes);
    hex::encode(digest)
}
