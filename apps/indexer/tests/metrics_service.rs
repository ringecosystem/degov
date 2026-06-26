use degov_datalens_indexer::MetricsRuntimeConfig;
use degov_datalens_indexer::metrics::{
    IndexerChunkRuntimeMetricsRow, IndexerMetricsSnapshot, IndexerSyncMetricsRow,
    OnchainRefreshBacklogMetricsRow, OnchainRefreshWorkerMetricsRow, render_prometheus_metrics,
};

#[test]
fn test_prometheus_renderer_emits_indexer_sync_and_onchain_backlog_gauges() {
    let snapshot = IndexerMetricsSnapshot {
        sync_rows: vec![IndexerSyncMetricsRow {
            dao_code: "ring-dao".to_owned(),
            chain_id: 46,
            contract_set_id: "dao=ring-dao|chain=46|governor=0xgovernor".to_owned(),
            processed_height: Some(12_209_673),
            target_height: Some(12_209_908),
            provisional_height: Some(12_209_931),
            latest_height: Some(12_209_940),
            synced_percentage: Some(99.998),
            updated_timestamp_seconds: Some(1_782_437_000.0),
            last_error_present: false,
            current_rate_blocks_per_second: Some(4.5),
            eta_seconds: Some(52.2),
        }],
        onchain_backlog_rows: vec![OnchainRefreshBacklogMetricsRow {
            dao_code: "ring-dao".to_owned(),
            chain_id: 46,
            contract_set_id: "dao=ring-dao|chain=46|governor=0xgovernor".to_owned(),
            status: "pending".to_owned(),
            tasks: 15,
            ready_tasks: 9,
        }],
        deferred_onchain_backlog_rows: vec![OnchainRefreshBacklogMetricsRow {
            dao_code: "ring-dao".to_owned(),
            chain_id: 46,
            contract_set_id: "dao=ring-dao|chain=46|governor=0xgovernor".to_owned(),
            status: "deferred".to_owned(),
            tasks: 7,
            ready_tasks: 3,
        }],
        chunk_runtime_rows: vec![IndexerChunkRuntimeMetricsRow {
            dao_code: "ring-dao".to_owned(),
            chain_id: 46,
            contract_set_id: "dao=ring-dao|chain=46|governor=0xgovernor".to_owned(),
            chunks_total: 2,
            datalens_requests_total: 4,
            cache_full_hit_total: 3,
            cache_partial_hit_total: 1,
            cache_miss_total: 0,
            cache_provider_fill_total: 0,
            chunk_duration_seconds_sum: 3.5,
            chunk_duration_seconds_count: 2,
            last_chunk_size: Some(5000),
            current_chunk_size: Some(10000),
        }],
        onchain_worker_rows: vec![OnchainRefreshWorkerMetricsRow {
            scope: "contract_set".to_owned(),
            dao_code: "ring-dao".to_owned(),
            chain_id: "46".to_owned(),
            contract_set_id: "dao=ring-dao|chain=46|governor=0xgovernor".to_owned(),
            claimed_total: 12,
            completed_total: 10,
            failed_total: 2,
            skipped_total: 1,
            cache_hits_total: 8,
            data_metric_refreshes_total: 3,
            duration_seconds_sum: 6.0,
            duration_seconds_count: 2,
            last_backlog: Some(5),
        }],
    };

    let output = render_prometheus_metrics(&snapshot);

    assert!(output.contains(
        "degov_indexer_processed_height{dao_code=\"ring-dao\",chain_id=\"46\",contract_set_id=\"dao=ring-dao|chain=46|governor=0xgovernor\"} 12209673"
    ));
    assert!(output.contains(
        "degov_indexer_target_height{dao_code=\"ring-dao\",chain_id=\"46\",contract_set_id=\"dao=ring-dao|chain=46|governor=0xgovernor\"} 12209908"
    ));
    assert!(output.contains(
        "degov_indexer_provisional_height{dao_code=\"ring-dao\",chain_id=\"46\",contract_set_id=\"dao=ring-dao|chain=46|governor=0xgovernor\"} 12209931"
    ));
    assert!(output.contains(
        "degov_indexer_latest_height{dao_code=\"ring-dao\",chain_id=\"46\",contract_set_id=\"dao=ring-dao|chain=46|governor=0xgovernor\"} 12209940"
    ));
    assert!(output.contains(
        "degov_indexer_remaining_blocks{dao_code=\"ring-dao\",chain_id=\"46\",contract_set_id=\"dao=ring-dao|chain=46|governor=0xgovernor\"} 235"
    ));
    assert!(output.contains(
        "degov_indexer_latest_lag_blocks{dao_code=\"ring-dao\",chain_id=\"46\",contract_set_id=\"dao=ring-dao|chain=46|governor=0xgovernor\"} 267"
    ));
    assert!(output.contains(
        "degov_indexer_current_rate_blocks_per_second{dao_code=\"ring-dao\",chain_id=\"46\",contract_set_id=\"dao=ring-dao|chain=46|governor=0xgovernor\"} 4.5"
    ));
    assert!(output.contains(
        "degov_indexer_eta_seconds{dao_code=\"ring-dao\",chain_id=\"46\",contract_set_id=\"dao=ring-dao|chain=46|governor=0xgovernor\"} 52.2"
    ));
    assert!(output.contains(
        "degov_onchain_refresh_tasks{dao_code=\"ring-dao\",chain_id=\"46\",contract_set_id=\"dao=ring-dao|chain=46|governor=0xgovernor\",status=\"pending\"} 15"
    ));
    assert!(output.contains(
        "degov_onchain_refresh_ready_tasks{dao_code=\"ring-dao\",chain_id=\"46\",contract_set_id=\"dao=ring-dao|chain=46|governor=0xgovernor\",status=\"pending\"} 9"
    ));
    assert!(output.contains(
        "degov_onchain_refresh_deferred_candidates{dao_code=\"ring-dao\",chain_id=\"46\",contract_set_id=\"dao=ring-dao|chain=46|governor=0xgovernor\",status=\"deferred\"} 7"
    ));
    assert!(output.contains(
        "degov_indexer_chunks_total{dao_code=\"ring-dao\",chain_id=\"46\",contract_set_id=\"dao=ring-dao|chain=46|governor=0xgovernor\"} 2"
    ));
    assert!(output.contains(
        "degov_indexer_datalens_cache_ranges_total{dao_code=\"ring-dao\",chain_id=\"46\",contract_set_id=\"dao=ring-dao|chain=46|governor=0xgovernor\",outcome=\"full_hit\"} 3"
    ));
    assert!(output.contains(
        "degov_indexer_chunk_duration_seconds_sum{dao_code=\"ring-dao\",chain_id=\"46\",contract_set_id=\"dao=ring-dao|chain=46|governor=0xgovernor\"} 3.5"
    ));
    assert!(output.contains(
        "degov_onchain_refresh_worker_tasks_total{scope=\"contract_set\",dao_code=\"ring-dao\",chain_id=\"46\",contract_set_id=\"dao=ring-dao|chain=46|governor=0xgovernor\",result=\"completed\"} 10"
    ));
    assert!(output.contains(
        "degov_onchain_refresh_worker_last_backlog{scope=\"contract_set\",dao_code=\"ring-dao\",chain_id=\"46\",contract_set_id=\"dao=ring-dao|chain=46|governor=0xgovernor\"} 5"
    ));
}

#[test]
fn test_metrics_runtime_config_is_disabled_by_default_and_parses_bind_address() {
    temp_env::with_vars(
        [
            ("DEGOV_INDEXER_METRICS_ENABLED", None::<&str>),
            ("DEGOV_INDEXER_METRICS_BIND_ADDRESS", None::<&str>),
        ],
        || {
            let config = MetricsRuntimeConfig::from_env().expect("default metrics config");
            assert!(!config.enabled);
            assert_eq!(config.bind_address.to_string(), "0.0.0.0:9464");
        },
    );

    temp_env::with_vars(
        [
            ("DEGOV_INDEXER_METRICS_ENABLED", Some("true")),
            (
                "DEGOV_INDEXER_METRICS_BIND_ADDRESS",
                Some("127.0.0.1:19464"),
            ),
        ],
        || {
            let config = MetricsRuntimeConfig::from_env().expect("enabled metrics config");
            assert!(config.enabled);
            assert_eq!(config.bind_address.to_string(), "127.0.0.1:19464");
        },
    );
}
