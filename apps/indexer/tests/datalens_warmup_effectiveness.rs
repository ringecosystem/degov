use std::time::Duration;

use datalens_sdk::native::QueryInput;
use degov_datalens_indexer::{
    ChainFamily, ChainIdentityConfig, DaoContractAddresses, DatalensConfig, DatalensError,
    DatalensFinality, DatalensLogQueryCacheOutcome, DatalensLogQueryCacheSummary,
    DatalensLogQueryReader, DatalensLogQueryResult, DatalensWarmupEffectivenessAggregation,
    DatalensWarmupEffectivenessLogFields, DatasetKeyConfig, GovernanceTokenStandard,
    IndexerCheckpointIdentity, QueryLimitConfig, SecretString, fetch_dao_log_pages,
    plan_dao_log_queries,
};
use serde_json::json;

#[test]
fn test_query_cache_summary_extracts_full_partial_and_miss_outcomes() {
    let full_hit = DatalensLogQueryCacheSummary::from_datalens_cache_json(&json!({
        "hit_ranges": [{ "kind": "block", "start": 10, "end": 12 }],
        "missing_ranges": [],
        "durable_hit_ranges": [{ "kind": "block", "start": 10, "end": 12 }],
        "hot_hit_ranges": [],
        "provider_fill_ranges": []
    }));
    let partial_hit = DatalensLogQueryCacheSummary::from_datalens_cache_json(&json!({
        "hit_ranges": [{ "kind": "block", "start": 10, "end": 10 }],
        "missing_ranges": [{ "kind": "block", "start": 11, "end": 12 }],
        "durable_hit_ranges": [{ "kind": "block", "start": 10, "end": 10 }],
        "hot_hit_ranges": [],
        "provider_fill_ranges": [{ "kind": "block", "start": 11, "end": 12 }]
    }));
    let miss = DatalensLogQueryCacheSummary::from_datalens_cache_json(&json!({
        "hit_ranges": [],
        "missing_ranges": [{ "kind": "block", "start": 10, "end": 12 }],
        "durable_hit_ranges": [],
        "hot_hit_ranges": [],
        "provider_fill_ranges": [{ "kind": "block", "start": 10, "end": 12 }]
    }));

    assert_eq!(full_hit.outcome, DatalensLogQueryCacheOutcome::FullHit);
    assert_eq!(full_hit.provider_fill_range_count, Some(0));
    assert_eq!(
        partial_hit.outcome,
        DatalensLogQueryCacheOutcome::PartialHit
    );
    assert_eq!(partial_hit.provider_fill_range_count, Some(1));
    assert_eq!(miss.outcome, DatalensLogQueryCacheOutcome::Miss);
    assert_eq!(miss.provider_fill_range_count, Some(1));
}

#[test]
fn test_query_cache_summary_marks_missing_fields_unavailable() {
    let summary = DatalensLogQueryCacheSummary::from_datalens_cache_json(&json!({}));

    assert_eq!(summary.outcome, DatalensLogQueryCacheOutcome::Unavailable);
    assert_eq!(summary.hit_range_count, None);
    assert_eq!(summary.missing_range_count, None);
    assert_eq!(summary.provider_fill_range_count, None);
}

#[test]
fn test_warmup_effectiveness_aggregation_builds_operator_log_fields() {
    let mut aggregation = DatalensWarmupEffectivenessAggregation::new();
    aggregation.record_query(
        DatalensLogQueryCacheSummary::from_datalens_cache_json(&json!({
            "hit_ranges": [{ "kind": "block", "start": 100, "end": 109 }],
            "missing_ranges": [],
            "provider_fill_ranges": []
        })),
        Duration::from_millis(20),
    );
    aggregation.record_query(
        DatalensLogQueryCacheSummary::from_datalens_cache_json(&json!({
            "hit_ranges": [{ "kind": "block", "start": 110, "end": 114 }],
            "missing_ranges": [{ "kind": "block", "start": 115, "end": 119 }],
            "provider_fill_ranges": [{ "kind": "block", "start": 115, "end": 119 }]
        })),
        Duration::from_millis(100),
    );
    aggregation.record_query(
        DatalensLogQueryCacheSummary::from_datalens_cache_json(&json!({})),
        Duration::from_millis(60),
    );
    aggregation.record_provider_limit();

    let fields = DatalensWarmupEffectivenessLogFields::from_aggregation(
        &identity(),
        "selector-abc",
        Some(100),
        Some(119),
        &aggregation,
    );

    assert_eq!(fields.dao_code, "demo-dao");
    assert_eq!(fields.chain_id, 1);
    assert_eq!(fields.contract_set_id, "demo-contracts");
    assert_eq!(fields.selector_fingerprint, "selector-abc");
    assert_eq!(fields.query_watermark, Some(119));
    assert_eq!(fields.current_checkpoint, Some(100));
    assert_eq!(fields.full_hit_count, 1);
    assert_eq!(fields.partial_hit_count, 1);
    assert_eq!(fields.miss_count, 0);
    assert_eq!(fields.unavailable_count, 1);
    assert_eq!(fields.provider_fill_range_count, 1);
    assert_eq!(fields.provider_limit_count, 1);
    assert_eq!(fields.query_duration_min_ms, Some(20));
    assert_eq!(fields.query_duration_avg_ms, Some(60));
    assert_eq!(fields.query_duration_max_ms, Some(100));
}

#[test]
fn test_fetch_dao_log_pages_preserves_cache_summary() {
    let config = config();
    let plans = plan_dao_log_queries(&config, &addresses(), 100, 100).expect("plans");
    let mut reader = MockLogReader::new(vec![
        Ok(DatalensLogQueryResult {
            rows: json!([]),
            cache: DatalensLogQueryCacheSummary::from_datalens_cache_json(&json!({
                "hit_ranges": [],
                "missing_ranges": [{ "kind": "block", "start": 100, "end": 100 }],
                "provider_fill_ranges": [{ "kind": "block", "start": 100, "end": 100 }]
            })),
        }),
        Ok(DatalensLogQueryResult {
            rows: json!([]),
            cache: DatalensLogQueryCacheSummary::from_datalens_cache_json(&json!({
                "hit_ranges": [{ "kind": "block", "start": 100, "end": 100 }],
                "missing_ranges": [],
                "provider_fill_ranges": []
            })),
        }),
        Ok(DatalensLogQueryResult {
            rows: json!([]),
            cache: DatalensLogQueryCacheSummary::from_datalens_cache_json(&json!({
                "hit_ranges": [{ "kind": "block", "start": 100, "end": 100 }],
                "missing_ranges": [],
                "provider_fill_ranges": []
            })),
        }),
    ]);

    let pages = fetch_dao_log_pages(&mut reader, &plans).expect("pages");

    assert_eq!(pages.len(), 3);
    assert_eq!(pages[0].cache.outcome, DatalensLogQueryCacheOutcome::Miss);
    assert_eq!(pages[0].cache.provider_fill_range_count, Some(1));
    assert_eq!(
        pages[1].cache.outcome,
        DatalensLogQueryCacheOutcome::FullHit
    );
    assert_eq!(
        pages[2].cache.outcome,
        DatalensLogQueryCacheOutcome::FullHit
    );
}

fn identity() -> IndexerCheckpointIdentity {
    IndexerCheckpointIdentity {
        dao_code: "demo-dao".to_owned(),
        chain_id: 1,
        contract_set_id: "demo-contracts".to_owned(),
        stream_id: "governance-events".to_owned(),
        data_source_version: "v1".to_owned(),
    }
}

fn config() -> DatalensConfig {
    DatalensConfig {
        endpoint: "https://datalens.ringdao.com".to_owned(),
        application: "degov-live".to_owned(),
        bearer_token: SecretString::new("redacted"),
        timeout: Duration::from_secs(60),
        finality: DatalensFinality::DurableOnly,
        chain: ChainIdentityConfig {
            family: ChainFamily::Evm,
            configured_name: "ethereum".to_owned(),
            network_id: Some(1),
        },
        dataset: DatasetKeyConfig {
            family: "evm".to_owned(),
            name: "logs".to_owned(),
        },
        query_limits: QueryLimitConfig {
            block_range_limit: 1_000,
        },
        warmup: Default::default(),
        dao_contracts: None,
        chains: Vec::new(),
    }
}

fn addresses() -> DaoContractAddresses {
    DaoContractAddresses {
        governor: "0x1111111111111111111111111111111111111111".to_owned(),
        governor_token: "0x2222222222222222222222222222222222222222".to_owned(),
        governor_token_standard: GovernanceTokenStandard::Erc20,
        timelock: "0x3333333333333333333333333333333333333333".to_owned(),
    }
}

struct MockLogReader {
    calls: Vec<QueryInput>,
    results: Vec<Result<DatalensLogQueryResult, DatalensError>>,
}

impl MockLogReader {
    fn new(results: Vec<Result<DatalensLogQueryResult, DatalensError>>) -> Self {
        Self {
            calls: Vec::new(),
            results,
        }
    }
}

impl DatalensLogQueryReader for MockLogReader {
    fn query_logs(&mut self, input: QueryInput) -> Result<DatalensLogQueryResult, DatalensError> {
        self.calls.push(input);
        self.results.remove(0)
    }
}
