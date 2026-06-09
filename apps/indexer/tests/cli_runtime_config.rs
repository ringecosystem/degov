use std::time::Duration;

use degov_datalens_indexer::{
    ContractSetConcurrencyLimit, DatalensConfig, DatalensProvisionalFinality,
    DatalensQueryConcurrencyConfig, GraphqlRuntimeConfig, IndexerContractSetMode,
    IndexerRuntimeConfig, IndexerTargetHeight, OnchainRefreshRuntimeConfig,
    OnchainRefreshTickConfig, ProvisionalRuntimeConfig, datalens_retry_config,
    onchain_refresh_worker_enabled, parse_bool_env_value, parse_i64_env_value,
};

#[test]
fn test_onchain_refresh_worker_enabled_accepts_disabled_values() {
    assert!(!onchain_refresh_worker_enabled("false").expect("false parses"));
    assert!(!onchain_refresh_worker_enabled("0").expect("0 parses"));
    assert!(!onchain_refresh_worker_enabled("no").expect("no parses"));
}

#[test]
fn test_onchain_refresh_worker_enabled_rejects_ambiguous_values() {
    let error = onchain_refresh_worker_enabled("disabled").expect_err("disabled is invalid");

    assert!(
        error
            .to_string()
            .contains("DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED")
    );
}

#[test]
fn test_onchain_refresh_runtime_config_defaults_debounce() {
    temp_env::with_vars(
        [
            ("DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED", Some("false")),
            ("DEGOV_ONCHAIN_REFRESH_DEBOUNCE_MS", None::<&str>),
        ],
        || {
            let config = OnchainRefreshRuntimeConfig::from_env().expect("runtime config parses");

            assert_eq!(config.debounce, Duration::from_millis(120_000));
            assert_eq!(
                config.worker_config().debounce,
                Duration::from_millis(120_000)
            );
        },
    );
}

#[test]
fn test_onchain_refresh_runtime_config_accepts_debounce_override() {
    temp_env::with_vars(
        [
            ("DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED", Some("false")),
            ("DEGOV_ONCHAIN_REFRESH_DEBOUNCE_MS", Some("2500")),
        ],
        || {
            let config = OnchainRefreshRuntimeConfig::from_env().expect("runtime config parses");

            assert_eq!(config.debounce, Duration::from_millis(2_500));
            assert_eq!(
                config.worker_config().debounce,
                Duration::from_millis(2_500)
            );
        },
    );
}

#[test]
fn test_onchain_refresh_runtime_config_accepts_deferred_drain_batch_override() {
    temp_env::with_vars(
        [
            ("DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED", Some("false")),
            (
                "DEGOV_ONCHAIN_REFRESH_DEFERRED_DRAIN_BATCH_SIZE",
                Some("1000"),
            ),
        ],
        || {
            let config = OnchainRefreshRuntimeConfig::from_env().expect("runtime config parses");

            assert_eq!(config.deferred_drain_batch_size, 1000);
            assert_eq!(config.worker_config().deferred_drain_batch_size, 1000);
        },
    );
}

#[test]
fn test_onchain_refresh_runtime_config_rejects_zero_deferred_drain_batch() {
    temp_env::with_vars(
        [
            ("DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED", Some("false")),
            ("DEGOV_ONCHAIN_REFRESH_DEFERRED_DRAIN_BATCH_SIZE", Some("0")),
        ],
        || {
            let error = OnchainRefreshRuntimeConfig::from_env()
                .expect_err("zero deferred drain batch is invalid");

            assert!(
                error
                    .to_string()
                    .contains("DEGOV_ONCHAIN_REFRESH_DEFERRED_DRAIN_BATCH_SIZE")
            );
        },
    );
}

#[test]
fn test_parse_bool_env_value_accepts_runtime_flag_values() {
    assert!(parse_bool_env_value("DEGOV_INDEXER_RUN_ONCE", "yes").expect("yes parses"));
    assert!(!parse_bool_env_value("DEGOV_INDEXER_RUN_ONCE", "0").expect("0 parses"));
}

#[test]
fn test_parse_i64_env_value_reports_field_name() {
    let error =
        parse_i64_env_value("DEGOV_INDEXER_START_BLOCK", "latest").expect_err("latest is invalid");

    assert!(error.to_string().contains("DEGOV_INDEXER_START_BLOCK"));
}

#[test]
fn test_graphql_runtime_config_keeps_public_endpoint_separate_from_bind_address() {
    temp_env::with_vars(
        [
            (
                "DEGOV_INDEXER_GRAPHQL_ENDPOINT",
                Some("https://indexer.next.degov.ai/degov-demo-dao/graphql"),
            ),
            ("DEGOV_INDEXER_GRAPHQL_BIND_ADDRESS", Some("0.0.0.0:4350")),
        ],
        || {
            let config = GraphqlRuntimeConfig::from_env().expect("graphql config parses");

            assert_eq!(config.bind_address, "0.0.0.0:4350".parse().unwrap());
            assert_eq!(
                config.public_endpoint.as_deref(),
                Some("https://indexer.next.degov.ai/degov-demo-dao/graphql")
            );
            assert_eq!(
                config.paths,
                vec!["/graphql".to_owned(), "/degov-demo-dao/graphql".to_owned()]
            );
        },
    );
}

#[test]
fn test_graphql_runtime_config_accepts_legacy_bind_endpoint() {
    temp_env::with_vars(
        [
            ("DEGOV_INDEXER_GRAPHQL_ENDPOINT", Some("127.0.0.1:4350")),
            ("DEGOV_INDEXER_GRAPHQL_BIND_ADDRESS", None),
        ],
        || {
            let config = GraphqlRuntimeConfig::from_env().expect("legacy bind endpoint parses");

            assert_eq!(config.bind_address, "127.0.0.1:4350".parse().unwrap());
            assert_eq!(config.public_endpoint, None);
            assert_eq!(config.paths, vec!["/graphql".to_owned()]);
        },
    );
}

#[test]
fn test_indexer_runtime_config_defaults_to_latest_target_height() {
    temp_env::with_vars(
        [
            ("DEGOV_INDEXER_DAO_CODE", Some("demo-dao")),
            ("DEGOV_INDEXER_START_BLOCK", Some("10")),
            ("DEGOV_INDEXER_TARGET_HEIGHT", None::<&str>),
            ("DEGOV_PROVISIONAL_WORKER_ENABLED", None::<&str>),
            ("DEGOV_PROVISIONAL_FINALITY", None::<&str>),
        ],
        || {
            let config = IndexerRuntimeConfig::from_env().expect("runtime config parses");

            assert_eq!(config.target_height, IndexerTargetHeight::Latest);
            assert!(!config.provisional.enabled);
            assert_eq!(
                config.provisional.finality,
                DatalensProvisionalFinality::SafeToLatest
            );
        },
    );
}

#[test]
fn test_provisional_runtime_config_defaults_to_disabled_safe_to_latest() {
    temp_env::with_vars(
        [
            ("DEGOV_PROVISIONAL_WORKER_ENABLED", None::<&str>),
            ("DEGOV_PROVISIONAL_FINALITY", None::<&str>),
        ],
        || {
            let config = ProvisionalRuntimeConfig::from_env().expect("runtime config parses");

            assert!(!config.enabled);
            assert_eq!(config.finality, DatalensProvisionalFinality::SafeToLatest);
        },
    );
}

#[test]
fn test_provisional_runtime_config_rejects_final_finality() {
    temp_env::with_vars(
        [
            ("DEGOV_PROVISIONAL_WORKER_ENABLED", Some("true")),
            ("DEGOV_PROVISIONAL_FINALITY", Some("durable_only")),
        ],
        || {
            let error = ProvisionalRuntimeConfig::from_env()
                .expect_err("durable finality is invalid for provisional worker");

            assert!(error.to_string().contains("DEGOV_PROVISIONAL_FINALITY"));
        },
    );
}

#[test]
fn test_indexer_runtime_config_accepts_provisional_worker_enablement() {
    temp_env::with_vars(
        [
            ("DEGOV_INDEXER_DAO_CODE", Some("demo-dao")),
            ("DEGOV_INDEXER_START_BLOCK", Some("10")),
            ("DEGOV_INDEXER_TARGET_HEIGHT", Some("latest")),
            ("DEGOV_PROVISIONAL_WORKER_ENABLED", Some("true")),
            ("DEGOV_PROVISIONAL_FINALITY", Some("latest_only")),
        ],
        || {
            let config = IndexerRuntimeConfig::from_env().expect("runtime config parses");

            assert!(config.provisional.enabled);
            assert_eq!(
                config.provisional.finality,
                DatalensProvisionalFinality::LatestOnly
            );
        },
    );
}

#[test]
fn test_indexer_runtime_config_accepts_latest_target_height() {
    temp_env::with_vars(
        [
            ("DEGOV_INDEXER_DAO_CODE", Some("demo-dao")),
            ("DEGOV_INDEXER_START_BLOCK", Some("10")),
            ("DEGOV_INDEXER_TARGET_HEIGHT", Some("latest")),
        ],
        || {
            let config = IndexerRuntimeConfig::from_env().expect("runtime config parses");

            assert_eq!(config.target_height, IndexerTargetHeight::Latest);
        },
    );
}

#[test]
fn test_indexer_runtime_config_keeps_numeric_target_height_for_debug_runs() {
    temp_env::with_vars(
        [
            ("DEGOV_INDEXER_DAO_CODE", Some("demo-dao")),
            ("DEGOV_INDEXER_START_BLOCK", Some("10")),
            ("DEGOV_INDEXER_TARGET_HEIGHT", Some("123")),
        ],
        || {
            let config = IndexerRuntimeConfig::from_env().expect("runtime config parses");

            assert_eq!(config.target_height, IndexerTargetHeight::Fixed(123));
        },
    );
}

#[test]
fn test_indexer_runtime_config_defaults_datalens_query_concurrency_to_unbounded() {
    temp_env::with_vars(
        [
            ("DEGOV_INDEXER_DAO_CODE", Some("demo-dao")),
            ("DEGOV_INDEXER_TARGET_HEIGHT", Some("123")),
            ("DEGOV_INDEXER_DATALENS_QUERY_MAX_IN_FLIGHT", None),
            ("DEGOV_INDEXER_DATALENS_QUERY_PER_CHAIN_MAX_IN_FLIGHT", None),
        ],
        || {
            let config = IndexerRuntimeConfig::from_env().expect("runtime config parses");

            assert_eq!(
                config.datalens_query_concurrency,
                DatalensQueryConcurrencyConfig::default()
            );
            assert!(!config.datalens_query_concurrency.is_limited());
        },
    );
}

#[test]
fn test_indexer_runtime_config_accepts_datalens_query_concurrency_overrides() {
    temp_env::with_vars(
        [
            ("DEGOV_INDEXER_DAO_CODE", Some("demo-dao")),
            ("DEGOV_INDEXER_TARGET_HEIGHT", Some("123")),
            ("DEGOV_INDEXER_DATALENS_QUERY_MAX_IN_FLIGHT", Some("4")),
            (
                "DEGOV_INDEXER_DATALENS_QUERY_PER_CHAIN_MAX_IN_FLIGHT",
                Some("2"),
            ),
        ],
        || {
            let config = IndexerRuntimeConfig::from_env().expect("runtime config parses");

            assert_eq!(
                config.datalens_query_concurrency,
                DatalensQueryConcurrencyConfig {
                    global_max_in_flight: Some(4),
                    per_chain_max_in_flight: Some(2),
                }
            );
            assert!(config.datalens_query_concurrency.is_limited());
        },
    );
}

#[test]
fn test_indexer_runtime_config_rejects_zero_datalens_query_concurrency() {
    temp_env::with_vars(
        [
            ("DEGOV_INDEXER_DAO_CODE", Some("demo-dao")),
            ("DEGOV_INDEXER_TARGET_HEIGHT", Some("123")),
            ("DEGOV_INDEXER_DATALENS_QUERY_MAX_IN_FLIGHT", Some("0")),
            ("DEGOV_INDEXER_DATALENS_QUERY_PER_CHAIN_MAX_IN_FLIGHT", None),
        ],
        || {
            let error = IndexerRuntimeConfig::from_env().expect_err("zero global limit is invalid");

            assert!(
                error
                    .to_string()
                    .contains("DEGOV_INDEXER_DATALENS_QUERY_MAX_IN_FLIGHT")
            );
        },
    );
}

#[test]
fn test_indexer_runtime_config_defaults_contract_set_concurrency_to_bounded_limits() {
    temp_env::with_vars(
        [
            ("DEGOV_INDEXER_DAO_CODE", None),
            ("DEGOV_INDEXER_CONTRACT_SET_MODE", Some("all")),
            ("DEGOV_INDEXER_TARGET_HEIGHT", Some("123")),
            ("DEGOV_INDEXER_CONTRACT_SET_MAX_CONCURRENCY", None),
            ("DEGOV_INDEXER_CONTRACT_SET_PER_CHAIN_MAX_CONCURRENCY", None),
        ],
        || {
            let config = IndexerRuntimeConfig::from_env().expect("runtime config parses");

            assert_eq!(
                config.contract_set_max_concurrency,
                ContractSetConcurrencyLimit::Limited(4)
            );
            assert_eq!(
                config.contract_set_per_chain_max_concurrency,
                ContractSetConcurrencyLimit::Limited(2)
            );
        },
    );
}

#[test]
fn test_indexer_runtime_config_accepts_contract_set_unlimited_concurrency() {
    temp_env::with_vars(
        [
            ("DEGOV_INDEXER_DAO_CODE", None),
            ("DEGOV_INDEXER_CONTRACT_SET_MODE", Some("all")),
            ("DEGOV_INDEXER_TARGET_HEIGHT", Some("123")),
            (
                "DEGOV_INDEXER_CONTRACT_SET_MAX_CONCURRENCY",
                Some("unlimited"),
            ),
            (
                "DEGOV_INDEXER_CONTRACT_SET_PER_CHAIN_MAX_CONCURRENCY",
                Some("unbounded"),
            ),
        ],
        || {
            let config = IndexerRuntimeConfig::from_env().expect("runtime config parses");

            assert_eq!(
                config.contract_set_max_concurrency,
                ContractSetConcurrencyLimit::Unlimited
            );
            assert_eq!(
                config.contract_set_per_chain_max_concurrency,
                ContractSetConcurrencyLimit::Unlimited
            );
        },
    );
}

#[test]
fn test_indexer_runtime_config_accepts_contract_set_bounded_concurrency() {
    temp_env::with_vars(
        [
            ("DEGOV_INDEXER_DAO_CODE", None),
            ("DEGOV_INDEXER_CONTRACT_SET_MODE", Some("all")),
            ("DEGOV_INDEXER_TARGET_HEIGHT", Some("123")),
            ("DEGOV_INDEXER_CONTRACT_SET_MAX_CONCURRENCY", Some("4")),
            (
                "DEGOV_INDEXER_CONTRACT_SET_PER_CHAIN_MAX_CONCURRENCY",
                Some("2"),
            ),
        ],
        || {
            let config = IndexerRuntimeConfig::from_env().expect("runtime config parses");

            assert_eq!(
                config.contract_set_max_concurrency,
                ContractSetConcurrencyLimit::Limited(4)
            );
            assert_eq!(
                config.contract_set_per_chain_max_concurrency,
                ContractSetConcurrencyLimit::Limited(2)
            );
        },
    );
}

#[test]
fn test_indexer_runtime_config_rejects_zero_contract_set_concurrency() {
    temp_env::with_vars(
        [
            ("DEGOV_INDEXER_DAO_CODE", None),
            ("DEGOV_INDEXER_CONTRACT_SET_MODE", Some("all")),
            ("DEGOV_INDEXER_TARGET_HEIGHT", Some("123")),
            ("DEGOV_INDEXER_CONTRACT_SET_MAX_CONCURRENCY", Some("0")),
            ("DEGOV_INDEXER_CONTRACT_SET_PER_CHAIN_MAX_CONCURRENCY", None),
        ],
        || {
            let error = IndexerRuntimeConfig::from_env().expect_err("zero limit is invalid");

            assert!(
                error
                    .to_string()
                    .contains("DEGOV_INDEXER_CONTRACT_SET_MAX_CONCURRENCY")
            );
        },
    );
}

#[test]
fn test_indexer_runtime_config_defaults_onchain_refresh_ticks_disabled_and_bounded() {
    temp_env::with_vars(
        [
            ("DEGOV_INDEXER_DAO_CODE", Some("demo-dao")),
            ("DEGOV_INDEXER_TARGET_HEIGHT", Some("123")),
            ("DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_ENABLED", None),
            ("DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_MAX_TASKS", None),
            ("DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_MAX_TASKS_PER_RUN", None),
            ("DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_MAX_DURATION_MS", None),
            ("DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_MIN_BLOCKS", None),
        ],
        || {
            let config = IndexerRuntimeConfig::from_env().expect("runtime config parses");

            assert_eq!(
                config.onchain_refresh_tick,
                OnchainRefreshTickConfig::default()
            );
            assert!(!config.onchain_refresh_tick.enabled);
            assert_eq!(config.onchain_refresh_tick.max_tasks_per_tick, 10);
            assert_eq!(config.onchain_refresh_tick.max_tasks_per_run, 10);
            assert_eq!(
                config.onchain_refresh_tick.max_duration_per_tick,
                Duration::from_millis(500)
            );
            assert_eq!(config.onchain_refresh_tick.min_blocks_between_ticks, 100);
        },
    );
}

#[test]
fn test_indexer_runtime_config_accepts_onchain_refresh_tick_overrides() {
    temp_env::with_vars(
        [
            ("DEGOV_INDEXER_DAO_CODE", Some("demo-dao")),
            ("DEGOV_INDEXER_TARGET_HEIGHT", Some("123")),
            ("DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_ENABLED", Some("true")),
            ("DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_MAX_TASKS", Some("3")),
            (
                "DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_MAX_TASKS_PER_RUN",
                Some("2"),
            ),
            (
                "DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_MAX_DURATION_MS",
                Some("25"),
            ),
            ("DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_MIN_BLOCKS", Some("5")),
        ],
        || {
            let config = IndexerRuntimeConfig::from_env().expect("runtime config parses");

            assert!(config.onchain_refresh_tick.enabled);
            assert_eq!(config.onchain_refresh_tick.max_tasks_per_tick, 3);
            assert_eq!(config.onchain_refresh_tick.max_tasks_per_run, 2);
            assert_eq!(
                config.onchain_refresh_tick.max_duration_per_tick,
                Duration::from_millis(25)
            );
            assert_eq!(config.onchain_refresh_tick.min_blocks_between_ticks, 5);
        },
    );
}

#[test]
fn test_indexer_runtime_config_inherits_onchain_refresh_tick_run_budget_from_total_budget() {
    temp_env::with_vars(
        [
            ("DEGOV_INDEXER_DAO_CODE", Some("demo-dao")),
            ("DEGOV_INDEXER_TARGET_HEIGHT", Some("123")),
            ("DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_ENABLED", Some("true")),
            ("DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_MAX_TASKS", Some("1000")),
            ("DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_MAX_TASKS_PER_RUN", None),
            ("DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_MAX_DURATION_MS", None),
            ("DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_MIN_BLOCKS", None),
        ],
        || {
            let config = IndexerRuntimeConfig::from_env().expect("runtime config parses");

            assert_eq!(config.onchain_refresh_tick.max_tasks_per_tick, 1000);
            assert_eq!(config.onchain_refresh_tick.max_tasks_per_run, 1000);
        },
    );
}

#[test]
fn test_indexer_runtime_config_rejects_enabled_onchain_refresh_tick_zero_total_budget() {
    temp_env::with_vars(
        [
            ("DEGOV_INDEXER_DAO_CODE", Some("demo-dao")),
            ("DEGOV_INDEXER_TARGET_HEIGHT", Some("123")),
            ("DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_ENABLED", Some("true")),
            ("DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_MAX_TASKS", Some("0")),
        ],
        || {
            let error = IndexerRuntimeConfig::from_env().expect_err("zero task budget is invalid");

            assert!(
                error
                    .to_string()
                    .contains("DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_MAX_TASKS")
            );
        },
    );
}

#[test]
fn test_indexer_runtime_config_rejects_enabled_onchain_refresh_tick_zero_run_budget() {
    temp_env::with_vars(
        [
            ("DEGOV_INDEXER_DAO_CODE", Some("demo-dao")),
            ("DEGOV_INDEXER_TARGET_HEIGHT", Some("123")),
            ("DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_ENABLED", Some("true")),
            (
                "DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_MAX_TASKS_PER_RUN",
                Some("0"),
            ),
        ],
        || {
            let error = IndexerRuntimeConfig::from_env().expect_err("zero run budget is invalid");

            assert!(
                error
                    .to_string()
                    .contains("DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_MAX_TASKS_PER_RUN")
            );
        },
    );
}

#[test]
fn test_datalens_retry_config_maps_query_max_attempts_to_sdk_retry_attempts() {
    let retry_config = datalens_retry_config(5);

    assert_eq!(retry_config.max_attempts, 5);
    assert_eq!(retry_config.max_elapsed, None);
    assert!(retry_config.jitter);
}

#[test]
fn test_indexer_runtime_contract_set_plan_uses_configured_scope() {
    let config = DatalensConfig {
        endpoint: "https://datalens.ringdao.com".to_owned(),
        application: "degov-live".to_owned(),
        bearer_token: degov_datalens_indexer::SecretString::new("unit-test-redacted-value"),
        timeout: Duration::from_secs(60),
        finality: degov_datalens_indexer::DatalensFinality::DurableOnly,
        chain: degov_datalens_indexer::ChainIdentityConfig {
            family: degov_datalens_indexer::ChainFamily::Evm,
            configured_name: "ethereum".to_owned(),
            network_id: Some(1),
        },
        dataset: degov_datalens_indexer::DatasetKeyConfig {
            family: "evm".to_owned(),
            name: "logs".to_owned(),
        },
        query_limits: degov_datalens_indexer::QueryLimitConfig {
            block_range_limit: 1_000,
        },
        warmup: Default::default(),
        dao_contracts: None,
        chains: vec![degov_datalens_indexer::DatalensChainConfig {
            family: degov_datalens_indexer::ChainFamily::Evm,
            configured_name: "lisk".to_owned(),
            network_id: 1135,
            contracts: vec![degov_datalens_indexer::DatalensContractSetConfig {
                dao_code: Some("lisk-dao".to_owned()),
                chain_id: 1135,
                network_name: "lisk".to_owned(),
                governor: "0x1111111111111111111111111111111111111111".to_owned(),
                governor_token: "0x2222222222222222222222222222222222222222".to_owned(),
                governor_token_standard: degov_datalens_indexer::GovernanceTokenStandard::Erc20,
                timelock: "0x3333333333333333333333333333333333333333".to_owned(),
                start_block: 568752,
            }],
        }],
    };
    let runtime = IndexerRuntimeConfig {
        dao_filter: Some("lisk-dao".to_owned()),
        contract_set_mode: IndexerContractSetMode::Single,
        target_height: IndexerTargetHeight::Fixed(568800),
        checkpoint_stream_id: "datalens-native".to_owned(),
        data_source_version: "datalens-v1".to_owned(),
        query_max_attempts: 3,
        datalens_query_concurrency: Default::default(),
        contract_set_max_concurrency: ContractSetConcurrencyLimit::Unlimited,
        contract_set_per_chain_max_concurrency: ContractSetConcurrencyLimit::Unlimited,
        progress_refresh_lag_blocks: 100,
        adaptive_chunk_sizer: Default::default(),
        poll_interval: Duration::from_secs(10),
        run_once: true,
        max_chunks_per_run: None,
        database_max_connections: 1,
        onchain_refresh_tick: OnchainRefreshTickConfig::default(),
        onchain_refresh_deferred_drain_batch_size: 100,
        provisional: ProvisionalRuntimeConfig {
            enabled: false,
            finality: DatalensProvisionalFinality::SafeToLatest,
        },
    };
    let selected = config
        .configured_contract_sets(Some("lisk-dao"))
        .expect("configured contract sets");

    let planned = runtime
        .for_configured_contract_set(&selected[0])
        .expect("planned contract set runtime");
    let options = planned
        .options(&selected[0].config, &selected[0].addresses)
        .expect("runner options");

    assert_eq!(planned.dao_code, "lisk-dao");
    assert_eq!(planned.start_block, 568752);
    assert_eq!(options.checkpoint_identity.chain_id, 1135);
    assert_eq!(
        options.checkpoint_identity.contract_set_id,
        selected[0].contract_set_id
    );
}

#[test]
fn test_indexer_runtime_single_mode_does_not_skip_target_below_start_block() {
    let config = DatalensConfig {
        endpoint: "https://datalens.ringdao.com".to_owned(),
        application: "degov-live".to_owned(),
        bearer_token: degov_datalens_indexer::SecretString::new("unit-test-redacted-value"),
        timeout: Duration::from_secs(60),
        finality: degov_datalens_indexer::DatalensFinality::DurableOnly,
        chain: degov_datalens_indexer::ChainIdentityConfig {
            family: degov_datalens_indexer::ChainFamily::Evm,
            configured_name: "ethereum".to_owned(),
            network_id: Some(1),
        },
        dataset: degov_datalens_indexer::DatasetKeyConfig {
            family: "evm".to_owned(),
            name: "logs".to_owned(),
        },
        query_limits: degov_datalens_indexer::QueryLimitConfig {
            block_range_limit: 1_000,
        },
        warmup: Default::default(),
        dao_contracts: None,
        chains: vec![degov_datalens_indexer::DatalensChainConfig {
            family: degov_datalens_indexer::ChainFamily::Evm,
            configured_name: "lisk".to_owned(),
            network_id: 1135,
            contracts: vec![degov_datalens_indexer::DatalensContractSetConfig {
                dao_code: Some("lisk-dao".to_owned()),
                chain_id: 1135,
                network_name: "lisk".to_owned(),
                governor: "0x1111111111111111111111111111111111111111".to_owned(),
                governor_token: "0x2222222222222222222222222222222222222222".to_owned(),
                governor_token_standard: degov_datalens_indexer::GovernanceTokenStandard::Erc20,
                timelock: "0x3333333333333333333333333333333333333333".to_owned(),
                start_block: 568752,
            }],
        }],
    };
    let runtime = IndexerRuntimeConfig {
        dao_filter: Some("lisk-dao".to_owned()),
        contract_set_mode: IndexerContractSetMode::Single,
        target_height: IndexerTargetHeight::Fixed(568751),
        checkpoint_stream_id: "datalens-native".to_owned(),
        data_source_version: "datalens-v1".to_owned(),
        query_max_attempts: 3,
        datalens_query_concurrency: Default::default(),
        contract_set_max_concurrency: ContractSetConcurrencyLimit::Unlimited,
        contract_set_per_chain_max_concurrency: ContractSetConcurrencyLimit::Unlimited,
        progress_refresh_lag_blocks: 100,
        adaptive_chunk_sizer: Default::default(),
        poll_interval: Duration::from_secs(10),
        run_once: true,
        max_chunks_per_run: None,
        database_max_connections: 1,
        onchain_refresh_tick: OnchainRefreshTickConfig::default(),
        onchain_refresh_deferred_drain_batch_size: 100,
        provisional: ProvisionalRuntimeConfig {
            enabled: false,
            finality: DatalensProvisionalFinality::SafeToLatest,
        },
    };
    let selected = config
        .configured_contract_sets(Some("lisk-dao"))
        .expect("configured contract sets");
    let error = runtime
        .for_configured_contract_set(&selected[0])
        .expect_err("single mode target below startBlock is invalid");
    let all_mode_runtime = IndexerRuntimeConfig {
        contract_set_mode: IndexerContractSetMode::All,
        ..runtime.clone()
    };

    assert!(!runtime.should_skip_contract_set_start_after_target(568752));
    assert!(all_mode_runtime.should_skip_contract_set_start_after_target(568752));
    assert!(error.to_string().contains("DEGOV_INDEXER_TARGET_HEIGHT"));
}

#[test]
fn test_indexer_runtime_latest_target_height_does_not_skip_all_mode_contract_sets() {
    let runtime = IndexerRuntimeConfig {
        dao_filter: None,
        contract_set_mode: IndexerContractSetMode::All,
        target_height: IndexerTargetHeight::Latest,
        checkpoint_stream_id: "datalens-native".to_owned(),
        data_source_version: "datalens-v1".to_owned(),
        query_max_attempts: 3,
        datalens_query_concurrency: Default::default(),
        contract_set_max_concurrency: ContractSetConcurrencyLimit::Unlimited,
        contract_set_per_chain_max_concurrency: ContractSetConcurrencyLimit::Unlimited,
        progress_refresh_lag_blocks: 100,
        adaptive_chunk_sizer: Default::default(),
        poll_interval: Duration::from_secs(10),
        run_once: true,
        max_chunks_per_run: None,
        database_max_connections: 1,
        onchain_refresh_tick: OnchainRefreshTickConfig::default(),
        onchain_refresh_deferred_drain_batch_size: 100,
        provisional: ProvisionalRuntimeConfig {
            enabled: false,
            finality: DatalensProvisionalFinality::SafeToLatest,
        },
    };

    assert!(!runtime.should_skip_contract_set_start_after_target(568752));
}
