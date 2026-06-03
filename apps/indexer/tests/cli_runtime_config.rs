use std::time::Duration;

use degov_datalens_indexer::{
    DatalensConfig, GraphqlRuntimeConfig, IndexerContractSetMode, IndexerRuntimeConfig,
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
fn test_indexer_runtime_config_requires_explicit_target_height() {
    temp_env::with_vars(
        [
            ("DEGOV_INDEXER_DAO_CODE", Some("demo-dao")),
            ("DEGOV_INDEXER_START_BLOCK", Some("10")),
            ("DEGOV_INDEXER_TARGET_HEIGHT", None),
        ],
        || {
            let error =
                IndexerRuntimeConfig::from_env().expect_err("missing target height is invalid");

            assert!(error.to_string().contains("DEGOV_INDEXER_TARGET_HEIGHT"));
        },
    );
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
        target_height: 568800,
        checkpoint_stream_id: "datalens-native".to_owned(),
        data_source_version: "datalens-v1".to_owned(),
        query_max_attempts: 3,
        progress_refresh_lag_blocks: 100,
        poll_interval: Duration::from_secs(10),
        run_once: true,
        max_chunks_per_run: None,
        database_max_connections: 1,
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
        target_height: 568751,
        checkpoint_stream_id: "datalens-native".to_owned(),
        data_source_version: "datalens-v1".to_owned(),
        query_max_attempts: 3,
        progress_refresh_lag_blocks: 100,
        poll_interval: Duration::from_secs(10),
        run_once: true,
        max_chunks_per_run: None,
        database_max_connections: 1,
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
