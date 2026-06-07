use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use degov_datalens_indexer::{
    ConfigError, DatalensConfig, DatalensFinality, GovernanceTokenStandard, IndexerRuntimeConfig,
    OnchainRefreshRuntimeConfig, SecretString,
};

fn with_datalens_env<T>(vars: &[(&str, Option<&str>)], test: impl FnOnce() -> T) -> T {
    temp_env::with_vars(vars, test)
}

fn write_config_file(extension: &str, contents: &str) -> PathBuf {
    static NEXT_ID: AtomicU64 = AtomicU64::new(0);

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock is after unix epoch")
        .as_nanos();
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let path =
        std::env::temp_dir().join(format!("degov-indexer-config-{timestamp}-{id}.{extension}"));
    fs::write(&path, contents).expect("write config file fixture");
    path
}

fn remove_config_file(path: PathBuf) {
    fs::remove_file(path).expect("remove config file fixture");
}

#[test]
fn test_from_env_with_required_datalens_fields_builds_sdk_service_base_endpoint() {
    with_datalens_env(
        &[
            ("DATALENS_ENDPOINT", Some("https://datalens.ringdao.com/")),
            ("DATALENS_APPLICATION", Some("degov-live")),
            ("DATALENS_TOKEN", Some("unit-test-redacted-value")),
            ("DATALENS_TIMEOUT_SECONDS", Some("12")),
            ("DATALENS_FINALITY", Some("durable_only")),
            ("DATALENS_CHAIN_NAME", Some("ethereum")),
            ("DATALENS_CHAIN_ID", Some("1")),
            ("DATALENS_DATASET_FAMILY", Some("evm")),
            ("DATALENS_DATASET_NAME", Some("logs")),
            ("DATALENS_QUERY_BLOCK_RANGE_LIMIT", Some("500")),
            ("DATALENS_WARMUP_REQUIRED", Some("true")),
            ("DEGOV_INDEXER_DAO_CODE", Some("lisk-dao")),
            ("DEGOV_INDEXER_START_BLOCK", Some("568752")),
            (
                "DATALENS_GOVERNOR_ADDRESS",
                Some("0x1111111111111111111111111111111111111111"),
            ),
            (
                "DATALENS_GOVERNOR_TOKEN_ADDRESS",
                Some("0x2222222222222222222222222222222222222222"),
            ),
            ("DATALENS_GOVERNOR_TOKEN_STANDARD", Some("ERC20")),
            (
                "DATALENS_TIMELOCK_ADDRESS",
                Some("0x3333333333333333333333333333333333333333"),
            ),
        ],
        || {
            let config = DatalensConfig::from_env().expect("load config");

            assert_eq!(config.endpoint, "https://datalens.ringdao.com");
            assert_eq!(config.application, "degov-live");
            assert_eq!(
                config.bearer_token.expose_secret(),
                "unit-test-redacted-value"
            );
            assert_eq!(config.timeout, Duration::from_secs(12));
            assert_eq!(config.finality, DatalensFinality::DurableOnly);
            assert_eq!(config.chain.configured_name, "ethereum");
            assert_eq!(config.chain.network_id, Some(1));
            assert_eq!(config.dataset.key(), "evm.logs");
            assert_eq!(config.query_limits.block_range_limit, 500);
            assert_eq!(config.warmup.required, true);
            assert_eq!(
                config.dao_contracts.as_ref().expect("contracts").governor,
                "0x1111111111111111111111111111111111111111"
            );
            assert_eq!(
                config
                    .dao_contracts
                    .as_ref()
                    .expect("contracts")
                    .governor_token,
                "0x2222222222222222222222222222222222222222"
            );
            assert_eq!(
                config
                    .dao_contracts
                    .as_ref()
                    .expect("contracts")
                    .governor_token_standard,
                GovernanceTokenStandard::Erc20
            );
            assert_eq!(
                config.dao_contracts.as_ref().expect("contracts").timelock,
                "0x3333333333333333333333333333333333333333"
            );
            assert_eq!(config.chains.len(), 1);
            assert_eq!(config.chains[0].network_id, 1);
            assert_eq!(config.chains[0].configured_name, "ethereum");
            assert_eq!(config.chains[0].contracts.len(), 1);
            assert_eq!(
                config.chains[0].contracts[0].dao_code.as_deref(),
                Some("lisk-dao")
            );
            assert_eq!(config.chains[0].contracts[0].start_block, 568752);
            assert_eq!(
                config.chains[0].contracts[0].governor,
                "0x1111111111111111111111111111111111111111"
            );

            let sdk_config = config.sdk_config();
            assert_eq!(sdk_config.endpoint, "https://datalens.ringdao.com");
            assert_eq!(
                sdk_config.bearer_token.as_deref(),
                Some("unit-test-redacted-value")
            );
            assert_eq!(sdk_config.application.as_deref(), Some("degov-live"));
        },
    );
}

#[test]
fn test_from_env_rejects_include_pending_finality_for_final_indexing() {
    with_datalens_env(
        &[
            ("DATALENS_ENDPOINT", Some("https://datalens.ringdao.com/")),
            ("DATALENS_APPLICATION", Some("degov-live")),
            ("DATALENS_TOKEN", Some("unit-test-redacted-value")),
            ("DATALENS_FINALITY", Some("include_pending")),
            ("DATALENS_CHAIN_NAME", Some("ethereum")),
            ("DATALENS_CHAIN_ID", Some("1")),
            ("DATALENS_DATASET_FAMILY", Some("evm")),
            ("DATALENS_DATASET_NAME", Some("logs")),
            ("DEGOV_INDEXER_DAO_CODE", Some("lisk-dao")),
            ("DEGOV_INDEXER_START_BLOCK", Some("568752")),
            (
                "DATALENS_GOVERNOR_ADDRESS",
                Some("0x1111111111111111111111111111111111111111"),
            ),
            (
                "DATALENS_GOVERNOR_TOKEN_ADDRESS",
                Some("0x2222222222222222222222222222222222222222"),
            ),
            ("DATALENS_GOVERNOR_TOKEN_STANDARD", Some("ERC20")),
            (
                "DATALENS_TIMELOCK_ADDRESS",
                Some("0x3333333333333333333333333333333333333333"),
            ),
        ],
        || {
            let error = DatalensConfig::from_env().expect_err("reject include_pending");

            assert!(error.to_string().contains("include_pending"));
        },
    );
}

#[test]
fn test_from_env_loads_multi_chain_contract_config_json() {
    with_datalens_env(
        &[
            ("DATALENS_ENDPOINT", Some("https://datalens.ringdao.com")),
            ("DATALENS_APPLICATION", Some("degov-live")),
            ("DATALENS_TOKEN", Some("unit-test-redacted-value")),
            (
                "DATALENS_CHAINS_JSON",
                Some(
                    r#"[
                        {
                            "chainId": 1135,
                            "networkName": "lisk",
                            "contracts": [
                                {
                                    "daoCode": "lisk-dao",
                                    "chainId": 1135,
                                    "networkName": "lisk",
                                    "governor": "0x58a61b1807a7bDA541855DaAEAEe89b1DDA48568",
                                    "governorToken": "0x2eE6Eca46d2406454708a1C80356a6E63b57D404",
                                    "tokenStandard": "ERC20",
                                    "timelock": "0x2294A7f24187B84995A2A28112f82f07BE1BceAD",
                                    "startBlock": 568752
                                },
                                {
                                    "daoCode": "demo-dao",
                                    "chainId": 1135,
                                    "networkName": "lisk",
                                    "governor": "0x1111111111111111111111111111111111111111",
                                    "governorToken": "0x2222222222222222222222222222222222222222",
                                    "tokenStandard": "ERC721",
                                    "timelock": "0x3333333333333333333333333333333333333333",
                                    "startBlock": 700000
                                }
                            ]
                        },
                        {
                            "chainId": 1,
                            "networkName": "ethereum",
                            "contracts": [
                                {
                                    "daoCode": "ens-dao",
                                    "chainId": 1,
                                    "networkName": "ethereum",
                                    "governor": "0x4444444444444444444444444444444444444444",
                                    "governorToken": "0x5555555555555555555555555555555555555555",
                                    "tokenStandard": "ERC20",
                                    "timelock": "0x6666666666666666666666666666666666666666",
                                    "startBlock": 100
                                }
                            ]
                        }
                    ]"#,
                ),
            ),
        ],
        || {
            let config = DatalensConfig::from_env().expect("load config");

            assert_eq!(config.chains.len(), 2);
            assert_eq!(config.chains[0].network_id, 1135);
            assert_eq!(config.chains[0].configured_name, "lisk");
            assert_eq!(config.chains[0].contracts.len(), 2);
            assert_eq!(
                config.chains[0].contracts[0].dao_code.as_deref(),
                Some("lisk-dao")
            );
            assert_eq!(config.chains[0].contracts[0].chain_id, 1135);
            assert_eq!(config.chains[0].contracts[0].network_name, "lisk");
            assert_eq!(
                config.chains[0].contracts[0].governor_token_standard,
                GovernanceTokenStandard::Erc20
            );
            assert_eq!(config.chains[0].contracts[0].start_block, 568752);
            assert_eq!(
                config.chains[1].contracts[0].dao_code.as_deref(),
                Some("ens-dao")
            );
            let selected = config.select_contract_set("lisk-dao").expect("select lisk");
            assert_eq!(selected.chain_id, 1135);
            assert_eq!(selected.start_block, 568752);
        },
    );
}

#[test]
fn test_from_env_loads_yaml_config_file_with_env_secret() {
    let path = write_config_file(
        "yml",
        r#"
datalens:
  endpoint: https://datalens.ringdao.com/
  application: degov-live
  finality: durable_only
  dataset:
    family: evm
    name: logs
  queryLimits:
    blockRangeLimit: 777
  warmup:
    enabled: true
    ensureOnStartup: true
    required: true
chains:
  - chainId: 1
    networkName: ethereum
    contracts:
      - daoCode: ens-dao
        governor: "0x1111111111111111111111111111111111111111"
        governorToken: "0x2222222222222222222222222222222222222222"
        tokenStandard: ERC20
        timelock: "0x3333333333333333333333333333333333333333"
        startBlock: 13533418
  - chainId: 1135
    networkName: lisk
    contracts:
      - daoCode: lisk-dao
        governor: "0x4444444444444444444444444444444444444444"
        governorToken: "0x5555555555555555555555555555555555555555"
        tokenStandard: ERC20
        timelock: "0x6666666666666666666666666666666666666666"
        startBlock: 568752
"#,
    );

    with_datalens_env(
        &[
            (
                "DEGOV_INDEXER_CONFIG_FILE",
                Some(path.to_str().expect("utf8 path")),
            ),
            ("DATALENS_TOKEN", Some("unit-test-redacted-value")),
        ],
        || {
            let config = DatalensConfig::from_env().expect("load yaml config");

            assert_eq!(config.endpoint, "https://datalens.ringdao.com");
            assert_eq!(config.application, "degov-live");
            assert_eq!(
                config.bearer_token.expose_secret(),
                "unit-test-redacted-value"
            );
            assert_eq!(config.warmup.enabled, true);
            assert_eq!(config.warmup.ensure_on_startup, true);
            assert_eq!(config.warmup.required, true);
            assert_eq!(config.warmup.kind.as_str(), "follow_query");
            assert_eq!(config.query_limits.block_range_limit, 777);
            assert_eq!(config.chains.len(), 2);
            assert_eq!(config.chains[0].contracts[0].chain_id, 1);
            assert_eq!(config.chains[0].contracts[0].network_name, "ethereum");
            assert_eq!(
                config.chains[1].contracts[0].dao_code.as_deref(),
                Some("lisk-dao")
            );
        },
    );

    remove_config_file(path);
}

#[test]
fn test_from_env_loads_warmup_disabled_for_local_development() {
    let path = write_config_file(
        "yml",
        r#"
datalens:
  endpoint: https://datalens.ringdao.com
  application: degov-live
  warmup:
    enabled: false
    ensureOnStartup: false
chains:
  - chainId: 1
    networkName: ethereum
    contracts:
      - daoCode: ens-dao
        governor: "0x1111111111111111111111111111111111111111"
        governorToken: "0x2222222222222222222222222222222222222222"
        tokenStandard: ERC20
        timelock: "0x3333333333333333333333333333333333333333"
        startBlock: 13533418
"#,
    );

    with_datalens_env(
        &[
            (
                "DEGOV_INDEXER_CONFIG_FILE",
                Some(path.to_str().expect("utf8 path")),
            ),
            ("DATALENS_TOKEN", Some("unit-test-redacted-value")),
        ],
        || {
            let config = DatalensConfig::from_env().expect("load yaml config");

            assert_eq!(config.warmup.enabled, false);
            assert_eq!(config.warmup.ensure_on_startup, false);
            assert_eq!(config.warmup.required, false);
            assert_eq!(config.warmup.kind.as_str(), "follow_query");
        },
    );

    remove_config_file(path);
}

#[test]
fn test_indexer_runtime_loads_adaptive_chunk_sizer_env_and_caps_to_block_range_limit() {
    with_datalens_env(
        &[
            ("DEGOV_INDEXER_DAO_CODE", Some("demo-dao")),
            ("DEGOV_INDEXER_ADAPTIVE_CHUNK_MIN_BLOCKS", Some("25")),
            ("DEGOV_INDEXER_ADAPTIVE_CHUNK_MAX_BLOCKS", Some("400")),
            ("DEGOV_INDEXER_ADAPTIVE_CHUNK_FAST_DURATION_MS", Some("250")),
            (
                "DEGOV_INDEXER_ADAPTIVE_CHUNK_HIGH_DURATION_MS",
                Some("2500"),
            ),
            (
                "DEGOV_INDEXER_ADAPTIVE_CHUNK_CACHE_FILL_HIGH_DURATION_MS",
                Some("1250"),
            ),
            (
                "DEGOV_INDEXER_ADAPTIVE_CHUNK_STABLE_CHUNKS_TO_GROW",
                Some("3"),
            ),
            (
                "DEGOV_INDEXER_ADAPTIVE_CHUNK_UNSTABLE_CHUNKS_TO_SHRINK",
                Some("4"),
            ),
            (
                "DEGOV_INDEXER_ADAPTIVE_CHUNK_SHRINK_FACTOR_PERCENT",
                Some("75"),
            ),
        ],
        || {
            let runtime = IndexerRuntimeConfig::from_env().expect("load runtime config");

            assert_eq!(runtime.adaptive_chunk_sizer.min_chunk_size, 25);
            assert_eq!(runtime.adaptive_chunk_sizer.max_chunk_size, Some(400));
            assert_eq!(
                runtime.adaptive_chunk_sizer.fast_chunk_duration_threshold,
                Duration::from_millis(250)
            );
            assert_eq!(
                runtime.adaptive_chunk_sizer.high_query_duration_threshold,
                Duration::from_millis(2500)
            );
            assert_eq!(
                runtime
                    .adaptive_chunk_sizer
                    .cache_fill_high_duration_threshold,
                Duration::from_millis(1250)
            );
            assert_eq!(runtime.adaptive_chunk_sizer.stable_chunks_to_grow, 3);
            assert_eq!(runtime.adaptive_chunk_sizer.unstable_chunks_to_shrink, 4);
            assert_eq!(runtime.adaptive_chunk_sizer.shrink_factor_percent, 75);

            let capped = runtime.adaptive_chunk_sizer.for_block_range_limit(300);

            assert_eq!(capped.initial_chunk_size, 300);
            assert_eq!(capped.max_chunk_size, 300);
            assert_eq!(capped.min_chunk_size, 25);
            assert_eq!(
                capped.cache_fill_high_duration_threshold,
                Duration::from_millis(1250)
            );
            assert_eq!(capped.stable_chunks_to_grow, 3);
            assert_eq!(capped.unstable_chunks_to_shrink, 4);
            assert_eq!(capped.shrink_factor_percent, 75);
        },
    );
}

#[test]
fn test_from_env_loads_checked_in_example_config() {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("indexer.example.yml");

    with_datalens_env(
        &[
            (
                "DEGOV_INDEXER_CONFIG_FILE",
                Some(path.to_str().expect("utf8 path")),
            ),
            ("DATALENS_TOKEN", Some("unit-test-redacted-value")),
            ("DATALENS_CHAINS_JSON", None),
            ("DATALENS_GOVERNOR_ADDRESS", None),
            ("DATALENS_GOVERNOR_TOKEN_ADDRESS", None),
            ("DATALENS_GOVERNOR_TOKEN_STANDARD", None),
            ("DATALENS_TIMELOCK_ADDRESS", None),
            ("DEGOV_INDEXER_DAO_CODE", None),
            ("DEGOV_INDEXER_START_BLOCK", None),
        ],
        || {
            let config = DatalensConfig::from_env().expect("load checked-in example config");

            assert_eq!(config.endpoint, "https://datalens.ringdao.com");
            assert_eq!(config.application, "degov-live");
            assert_eq!(config.dataset.key(), "evm.logs");
            assert_eq!(config.query_limits.block_range_limit, 1000);
            assert_eq!(config.chains.len(), 4);

            let contracts = config
                .configured_contract_sets(None)
                .expect("configured contract sets");
            let dao_codes = contracts
                .iter()
                .map(|contract| contract.dao_code.as_str())
                .collect::<Vec<_>>();
            assert_eq!(
                dao_codes,
                vec!["ens-dao", "lisk-dao", "internet-token-dao", "gmx-dao"]
            );

            let ens = contracts
                .iter()
                .find(|contract| contract.dao_code == "ens-dao")
                .expect("ens config");
            assert_eq!(ens.contract.chain_id, 1);
            assert_eq!(
                ens.contract.governor,
                "0x323A76393544d5ecca80cd6ef2A560C6a395b7E3"
            );

            let lisk = contracts
                .iter()
                .find(|contract| contract.dao_code == "lisk-dao")
                .expect("lisk config");
            assert_eq!(lisk.contract.chain_id, 1135);
            assert_eq!(lisk.contract.start_block, 568752);

            let base = contracts
                .iter()
                .find(|contract| contract.dao_code == "internet-token-dao")
                .expect("base config");
            assert_eq!(base.contract.chain_id, 8453);

            let arbitrum = contracts
                .iter()
                .find(|contract| contract.dao_code == "gmx-dao")
                .expect("arbitrum config");
            assert_eq!(arbitrum.contract.chain_id, 42161);
        },
    );
}

#[test]
fn test_from_env_overrides_config_file_values() {
    let path = write_config_file(
        "yml",
        r#"
datalens:
  endpoint: https://file-datalens.example
  application: file-application
  token: file-token-for-local-only
  queryLimits:
    blockRangeLimit: 1000
chains:
  - chainId: 1
    networkName: ethereum
    contracts:
      - daoCode: file-dao
        governor: "0x1111111111111111111111111111111111111111"
        governorToken: "0x2222222222222222222222222222222222222222"
        tokenStandard: ERC20
        timelock: "0x3333333333333333333333333333333333333333"
        startBlock: 100
"#,
    );

    with_datalens_env(
        &[
            (
                "DEGOV_INDEXER_CONFIG_FILE",
                Some(path.to_str().expect("utf8 path")),
            ),
            ("DATALENS_ENDPOINT", Some("https://env-datalens.example/")),
            ("DATALENS_APPLICATION", Some("env-application")),
            ("DATALENS_TOKEN", Some("env-token")),
            ("DATALENS_QUERY_BLOCK_RANGE_LIMIT", Some("250")),
            (
                "DATALENS_CHAINS_JSON",
                Some(
                    r#"[
                        {
                            "chainId": 1135,
                            "networkName": "lisk",
                            "contracts": [
                                {
                                    "daoCode": "env-dao",
                                    "governor": "0x4444444444444444444444444444444444444444",
                                    "governorToken": "0x5555555555555555555555555555555555555555",
                                    "tokenStandard": "ERC20",
                                    "timelock": "0x6666666666666666666666666666666666666666",
                                    "startBlock": 568752
                                }
                            ]
                        }
                    ]"#,
                ),
            ),
        ],
        || {
            let config = DatalensConfig::from_env().expect("load config with env overrides");

            assert_eq!(config.endpoint, "https://env-datalens.example");
            assert_eq!(config.application, "env-application");
            assert_eq!(config.bearer_token.expose_secret(), "env-token");
            assert_eq!(config.query_limits.block_range_limit, 250);
            assert_eq!(config.chains.len(), 1);
            assert_eq!(config.chains[0].network_id, 1135);
            assert_eq!(
                config.chains[0].contracts[0].dao_code.as_deref(),
                Some("env-dao")
            );
        },
    );

    remove_config_file(path);
}

#[test]
fn test_from_env_loads_toml_config_file() {
    let path = write_config_file(
        "toml",
        r#"
[datalens]
endpoint = "https://datalens.ringdao.com"
application = "degov-live"

[datalens.dataset]
family = "evm"
name = "logs"

[[chains]]
chainId = 1
networkName = "ethereum"

[[chains.contracts]]
daoCode = "ens-dao"
governor = "0x1111111111111111111111111111111111111111"
governorToken = "0x2222222222222222222222222222222222222222"
tokenStandard = "ERC20"
timelock = "0x3333333333333333333333333333333333333333"
startBlock = 13533418
"#,
    );

    with_datalens_env(
        &[
            (
                "DEGOV_INDEXER_CONFIG_FILE",
                Some(path.to_str().expect("utf8 path")),
            ),
            ("DATALENS_TOKEN", Some("unit-test-redacted-value")),
        ],
        || {
            let config = DatalensConfig::from_env().expect("load toml config");

            assert_eq!(config.chains.len(), 1);
            assert_eq!(
                config.chains[0].contracts[0].dao_code.as_deref(),
                Some("ens-dao")
            );
            assert_eq!(config.dataset.key(), "evm.logs");
        },
    );

    remove_config_file(path);
}

#[test]
fn test_from_env_loads_json_config_file() {
    let path = write_config_file(
        "json",
        r#"{
  "datalens": {
    "endpoint": "https://datalens.ringdao.com",
    "application": "degov-live"
  },
  "chains": [
    {
      "chainId": 1135,
      "networkName": "lisk",
      "contracts": [
        {
          "daoCode": "lisk-dao",
          "governor": "0x1111111111111111111111111111111111111111",
          "governorToken": "0x2222222222222222222222222222222222222222",
          "tokenStandard": "ERC20",
          "timelock": "0x3333333333333333333333333333333333333333",
          "startBlock": 568752
        }
      ]
    }
  ]
}"#,
    );

    with_datalens_env(
        &[
            (
                "DEGOV_INDEXER_CONFIG_FILE",
                Some(path.to_str().expect("utf8 path")),
            ),
            ("DATALENS_TOKEN", Some("unit-test-redacted-value")),
        ],
        || {
            let config = DatalensConfig::from_env().expect("load json config");

            assert_eq!(config.chains.len(), 1);
            assert_eq!(config.chains[0].network_id, 1135);
            assert_eq!(
                config
                    .select_contract_set("lisk-dao")
                    .expect("select")
                    .governor,
                "0x1111111111111111111111111111111111111111"
            );
        },
    );

    remove_config_file(path);
}

#[test]
fn test_onchain_refresh_runtime_loads_yaml_rpc_chains() {
    let path = write_config_file(
        "yml",
        r#"
rpc:
  chains:
    "1":
      urlEnv: ETHEREUM_RPC_URL
    "1135":
      urlEnv: LISK_RPC_URL
"#,
    );

    with_datalens_env(
        &[
            (
                "DEGOV_INDEXER_CONFIG_FILE",
                Some(path.to_str().expect("utf8 path")),
            ),
            ("DEGOV_ONCHAIN_REFRESH_RPC_URL", None),
            (
                "ETHEREUM_RPC_URL",
                Some("https://ethereum.example/rpc-secret"),
            ),
            ("LISK_RPC_URL", Some("https://lisk.example/rpc-secret")),
        ],
        || {
            let config = OnchainRefreshRuntimeConfig::from_env().expect("load runtime config");

            assert_eq!(config.rpc_chains.len(), 2);
            assert_eq!(
                config.rpc_chains.get(&1).expect("ethereum rpc").url_env,
                "ETHEREUM_RPC_URL"
            );
            assert_eq!(
                config
                    .rpc_chains
                    .get(&1)
                    .expect("ethereum rpc")
                    .url
                    .expose_secret(),
                "https://ethereum.example/rpc-secret"
            );
            assert_eq!(
                config
                    .rpc_chains
                    .get(&1135)
                    .expect("lisk rpc")
                    .url
                    .expose_secret(),
                "https://lisk.example/rpc-secret"
            );
        },
    );

    remove_config_file(path);
}

#[test]
fn test_onchain_refresh_runtime_loads_toml_rpc_chains() {
    let path = write_config_file(
        "toml",
        r#"
[rpc.chains."1"]
urlEnv = "ETHEREUM_RPC_URL"

[rpc.chains."1135"]
urlEnv = "LISK_RPC_URL"
"#,
    );

    with_datalens_env(
        &[
            (
                "DEGOV_INDEXER_CONFIG_FILE",
                Some(path.to_str().expect("utf8 path")),
            ),
            ("DEGOV_ONCHAIN_REFRESH_RPC_URL", None),
            (
                "ETHEREUM_RPC_URL",
                Some("https://ethereum.example/rpc-secret"),
            ),
            ("LISK_RPC_URL", Some("https://lisk.example/rpc-secret")),
        ],
        || {
            let config = OnchainRefreshRuntimeConfig::from_env().expect("load runtime config");

            assert_eq!(
                config
                    .rpc_chains
                    .get(&1135)
                    .expect("lisk rpc")
                    .url
                    .expose_secret(),
                "https://lisk.example/rpc-secret"
            );
        },
    );

    remove_config_file(path);
}

#[test]
fn test_onchain_refresh_runtime_loads_json_rpc_chains() {
    let path = write_config_file(
        "json",
        r#"{
  "rpc": {
    "chains": {
      "1": {
        "urlEnv": "ETHEREUM_RPC_URL"
      },
      "1135": {
        "urlEnv": "LISK_RPC_URL"
      }
    }
  }
}"#,
    );

    with_datalens_env(
        &[
            (
                "DEGOV_INDEXER_CONFIG_FILE",
                Some(path.to_str().expect("utf8 path")),
            ),
            ("DEGOV_ONCHAIN_REFRESH_RPC_URL", None),
            (
                "ETHEREUM_RPC_URL",
                Some("https://ethereum.example/rpc-secret"),
            ),
            ("LISK_RPC_URL", Some("https://lisk.example/rpc-secret")),
        ],
        || {
            let config = OnchainRefreshRuntimeConfig::from_env().expect("load runtime config");

            assert_eq!(
                config
                    .rpc_chains
                    .get(&1)
                    .expect("ethereum rpc")
                    .url
                    .expose_secret(),
                "https://ethereum.example/rpc-secret"
            );
        },
    );

    remove_config_file(path);
}

#[test]
fn test_onchain_refresh_runtime_redacts_rpc_urls_in_debug_output() {
    let path = write_config_file(
        "yml",
        r#"
rpc:
  chains:
    "1":
      urlEnv: ETHEREUM_RPC_URL
"#,
    );

    with_datalens_env(
        &[
            (
                "DEGOV_INDEXER_CONFIG_FILE",
                Some(path.to_str().expect("utf8 path")),
            ),
            ("DEGOV_ONCHAIN_REFRESH_RPC_URL", None),
            (
                "ETHEREUM_RPC_URL",
                Some("https://ethereum.example/rpc-secret"),
            ),
        ],
        || {
            let config = OnchainRefreshRuntimeConfig::from_env().expect("load runtime config");
            let debug = format!("{config:?}");

            assert!(!debug.contains("https://ethereum.example/rpc-secret"));
            assert!(debug.contains("<redacted>"));
            assert!(debug.contains("ETHEREUM_RPC_URL"));
        },
    );

    remove_config_file(path);
}

#[test]
fn test_onchain_refresh_runtime_keeps_legacy_single_rpc_env_fallback() {
    with_datalens_env(
        &[
            ("DEGOV_INDEXER_CONFIG_FILE", None),
            ("DATALENS_CHAIN_ID", Some("46")),
            (
                "DEGOV_ONCHAIN_REFRESH_RPC_URL",
                Some("https://darwinia.example/rpc-secret"),
            ),
        ],
        || {
            let config = OnchainRefreshRuntimeConfig::from_env().expect("load runtime config");

            assert_eq!(config.rpc_chains.len(), 1);
            assert_eq!(
                config
                    .rpc_chains
                    .get(&46)
                    .expect("legacy rpc")
                    .url
                    .expose_secret(),
                "https://darwinia.example/rpc-secret"
            );
        },
    );
}

#[test]
fn test_from_env_config_file_still_requires_secret() {
    let path = write_config_file(
        "yml",
        r#"
datalens:
  endpoint: https://datalens.ringdao.com
  application: degov-live
"#,
    );

    with_datalens_env(
        &[(
            "DEGOV_INDEXER_CONFIG_FILE",
            Some(path.to_str().expect("utf8 path")),
        )],
        || {
            let error = DatalensConfig::from_env().expect_err("missing token fails");

            assert_eq!(
                error,
                ConfigError::MissingRequired {
                    field: "DATALENS_TOKEN"
                }
            );
        },
    );

    remove_config_file(path);
}

#[test]
fn test_configured_contract_sets_returns_stable_config_order() {
    with_datalens_env(
        &[
            ("DATALENS_ENDPOINT", Some("https://datalens.ringdao.com")),
            ("DATALENS_APPLICATION", Some("degov-live")),
            ("DATALENS_TOKEN", Some("unit-test-redacted-value")),
            (
                "DATALENS_CHAINS_JSON",
                Some(
                    r#"[
                        {
                            "chainId": 1135,
                            "networkName": "lisk",
                            "contracts": [
                                {
                                    "daoCode": "lisk-dao",
                                    "chainId": 1135,
                                    "networkName": "lisk",
                                    "governor": "0x1111111111111111111111111111111111111111",
                                    "governorToken": "0x2222222222222222222222222222222222222222",
                                    "tokenStandard": "ERC20",
                                    "timelock": "0x3333333333333333333333333333333333333333",
                                    "startBlock": 568752
                                },
                                {
                                    "daoCode": "demo-dao",
                                    "chainId": 1135,
                                    "networkName": "lisk",
                                    "governor": "0x4444444444444444444444444444444444444444",
                                    "governorToken": "0x5555555555555555555555555555555555555555",
                                    "tokenStandard": "ERC721",
                                    "timelock": "0x6666666666666666666666666666666666666666",
                                    "startBlock": 700000
                                }
                            ]
                        },
                        {
                            "chainId": 1,
                            "networkName": "ethereum",
                            "contracts": [
                                {
                                    "daoCode": "ens-dao",
                                    "chainId": 1,
                                    "networkName": "ethereum",
                                    "governor": "0x7777777777777777777777777777777777777777",
                                    "governorToken": "0x8888888888888888888888888888888888888888",
                                    "tokenStandard": "ERC20",
                                    "timelock": "0x9999999999999999999999999999999999999999",
                                    "startBlock": 100
                                }
                            ]
                        }
                    ]"#,
                ),
            ),
        ],
        || {
            let config = DatalensConfig::from_env().expect("load config");
            let configured = config
                .configured_contract_sets(None)
                .expect("configured contract sets");

            assert_eq!(configured.len(), 3);
            assert_eq!(configured[0].dao_code, "lisk-dao");
            assert_eq!(configured[1].dao_code, "demo-dao");
            assert_eq!(configured[2].dao_code, "ens-dao");
            assert_eq!(configured[0].config.chain.configured_name, "lisk");
            assert_eq!(configured[2].config.chain.network_id, Some(1));
        },
    );
}

#[test]
fn test_configured_contract_sets_filters_by_dao_code() {
    with_datalens_env(
        &[
            ("DATALENS_ENDPOINT", Some("https://datalens.ringdao.com")),
            ("DATALENS_APPLICATION", Some("degov-live")),
            ("DATALENS_TOKEN", Some("unit-test-redacted-value")),
            (
                "DATALENS_CHAINS_JSON",
                Some(
                    r#"[
                        {
                            "chainId": 1135,
                            "networkName": "lisk",
                            "contracts": [
                                {
                                    "daoCode": "shared-dao",
                                    "chainId": 1135,
                                    "networkName": "lisk",
                                    "governor": "0x1111111111111111111111111111111111111111",
                                    "governorToken": "0x2222222222222222222222222222222222222222",
                                    "tokenStandard": "ERC20",
                                    "timelock": "0x3333333333333333333333333333333333333333",
                                    "startBlock": 568752
                                }
                            ]
                        },
                        {
                            "chainId": 1,
                            "networkName": "ethereum",
                            "contracts": [
                                {
                                    "daoCode": "other-dao",
                                    "chainId": 1,
                                    "networkName": "ethereum",
                                    "governor": "0x4444444444444444444444444444444444444444",
                                    "governorToken": "0x5555555555555555555555555555555555555555",
                                    "tokenStandard": "ERC20",
                                    "timelock": "0x6666666666666666666666666666666666666666",
                                    "startBlock": 100
                                }
                            ]
                        }
                    ]"#,
                ),
            ),
        ],
        || {
            let config = DatalensConfig::from_env().expect("load config");
            let configured = config
                .configured_contract_sets(Some("shared-dao"))
                .expect("configured contract sets");

            assert_eq!(configured.len(), 1);
            assert_eq!(configured[0].dao_code, "shared-dao");
            assert_eq!(configured[0].contract.chain_id, 1135);
        },
    );
}

#[test]
fn test_configured_contract_sets_preserves_legacy_single_contract_env_behavior() {
    with_datalens_env(
        &[
            ("DATALENS_ENDPOINT", Some("https://datalens.ringdao.com/")),
            ("DATALENS_APPLICATION", Some("degov-live")),
            ("DATALENS_TOKEN", Some("unit-test-redacted-value")),
            ("DATALENS_CHAIN_NAME", Some("ethereum")),
            ("DATALENS_CHAIN_ID", Some("1")),
            ("DEGOV_INDEXER_DAO_CODE", Some("legacy-dao")),
            ("DEGOV_INDEXER_START_BLOCK", Some("568752")),
            (
                "DATALENS_GOVERNOR_ADDRESS",
                Some("0x1111111111111111111111111111111111111111"),
            ),
            (
                "DATALENS_GOVERNOR_TOKEN_ADDRESS",
                Some("0x2222222222222222222222222222222222222222"),
            ),
            ("DATALENS_GOVERNOR_TOKEN_STANDARD", Some("ERC20")),
            (
                "DATALENS_TIMELOCK_ADDRESS",
                Some("0x3333333333333333333333333333333333333333"),
            ),
        ],
        || {
            let config = DatalensConfig::from_env().expect("load config");
            let selected = config
                .select_contract_set("legacy-dao")
                .expect("select legacy contract set");
            let configured = config
                .configured_contract_sets(Some("legacy-dao"))
                .expect("configured contract sets");

            assert_eq!(configured.len(), 1);
            assert_eq!(configured[0].dao_code, "legacy-dao");
            assert_eq!(configured[0].contract, selected);
        },
    );
}

#[test]
fn test_contract_set_checkpoint_scope_distinguishes_same_dao_on_different_chains() {
    with_datalens_env(
        &[
            ("DATALENS_ENDPOINT", Some("https://datalens.ringdao.com")),
            ("DATALENS_APPLICATION", Some("degov-live")),
            ("DATALENS_TOKEN", Some("unit-test-redacted-value")),
            (
                "DATALENS_CHAINS_JSON",
                Some(
                    r#"[
                        {
                            "chainId": 1135,
                            "networkName": "lisk",
                            "contracts": [
                                {
                                    "daoCode": "shared-dao",
                                    "chainId": 1135,
                                    "networkName": "lisk",
                                    "governor": "0x58a61b1807a7bDA541855DaAEAEe89b1DDA48568",
                                    "governorToken": "0x2eE6Eca46d2406454708a1C80356a6E63b57D404",
                                    "tokenStandard": "ERC20",
                                    "timelock": "0x2294A7f24187B84995A2A28112f82f07BE1BceAD",
                                    "startBlock": 568752
                                }
                            ]
                        },
                        {
                            "chainId": 1,
                            "networkName": "ethereum",
                            "contracts": [
                                {
                                    "daoCode": "shared-dao",
                                    "chainId": 1,
                                    "networkName": "ethereum",
                                    "governor": "0x4444444444444444444444444444444444444444",
                                    "governorToken": "0x5555555555555555555555555555555555555555",
                                    "tokenStandard": "ERC20",
                                    "timelock": "0x6666666666666666666666666666666666666666",
                                    "startBlock": 100
                                }
                            ]
                        }
                    ]"#,
                ),
            ),
        ],
        || {
            let config = DatalensConfig::from_env().expect("load config");
            let first = config.chains[0].contracts[0].clone();
            let second = config.chains[1].contracts[0].clone();

            assert_ne!(
                config.contract_set_scope_id("shared-dao", &first),
                config.contract_set_scope_id("shared-dao", &second)
            );
        },
    );
}

#[test]
fn test_contract_set_checkpoint_scope_distinguishes_same_chain_contract_sets() {
    with_datalens_env(
        &[
            ("DATALENS_ENDPOINT", Some("https://datalens.ringdao.com")),
            ("DATALENS_APPLICATION", Some("degov-live")),
            ("DATALENS_TOKEN", Some("unit-test-redacted-value")),
            (
                "DATALENS_CHAINS_JSON",
                Some(
                    r#"[
                        {
                            "chainId": 1,
                            "networkName": "ethereum",
                            "contracts": [
                                {
                                    "daoCode": "shared-dao",
                                    "chainId": 1,
                                    "networkName": "ethereum",
                                    "governor": "0x1111111111111111111111111111111111111111",
                                    "governorToken": "0x2222222222222222222222222222222222222222",
                                    "tokenStandard": "ERC20",
                                    "timelock": "0x3333333333333333333333333333333333333333",
                                    "startBlock": 100
                                },
                                {
                                    "daoCode": "shared-dao",
                                    "chainId": 1,
                                    "networkName": "ethereum",
                                    "governor": "0x4444444444444444444444444444444444444444",
                                    "governorToken": "0x5555555555555555555555555555555555555555",
                                    "tokenStandard": "ERC20",
                                    "timelock": "0x6666666666666666666666666666666666666666",
                                    "startBlock": 900
                                }
                            ]
                        }
                    ]"#,
                ),
            ),
        ],
        || {
            let config = DatalensConfig::from_env().expect("load config");
            let first = config.chains[0].contracts[0].clone();
            let second = config.chains[0].contracts[1].clone();

            assert_ne!(
                config.contract_set_scope_id("shared-dao", &first),
                config.contract_set_scope_id("shared-dao", &second)
            );
        },
    );
}

#[test]
fn test_from_env_json_config_ignores_blank_legacy_contract_envs() {
    with_datalens_env(
        &[
            ("DATALENS_ENDPOINT", Some("https://datalens.ringdao.com")),
            ("DATALENS_APPLICATION", Some("degov-live")),
            ("DATALENS_TOKEN", Some("unit-test-redacted-value")),
            ("DATALENS_GOVERNOR_ADDRESS", Some("")),
            ("DATALENS_GOVERNOR_TOKEN_ADDRESS", Some("")),
            ("DATALENS_GOVERNOR_TOKEN_STANDARD", Some("")),
            ("DATALENS_TIMELOCK_ADDRESS", Some("")),
            (
                "DATALENS_CHAINS_JSON",
                Some(
                    r#"[
                        {
                            "chainId": 1135,
                            "networkName": "lisk",
                            "contracts": [
                                {
                                    "daoCode": "lisk-dao",
                                    "chainId": 1135,
                                    "networkName": "lisk",
                                    "governor": "0x58a61b1807a7bDA541855DaAEAEe89b1DDA48568",
                                    "governorToken": "0x2eE6Eca46d2406454708a1C80356a6E63b57D404",
                                    "tokenStandard": "ERC20",
                                    "timelock": "0x2294A7f24187B84995A2A28112f82f07BE1BceAD",
                                    "startBlock": 568752
                                }
                            ]
                        }
                    ]"#,
                ),
            ),
        ],
        || {
            let config = DatalensConfig::from_env().expect("load json config");

            assert_eq!(config.dao_contracts, None);
            assert_eq!(config.chains.len(), 1);
            assert_eq!(
                config.chains[0].contracts[0].dao_code.as_deref(),
                Some("lisk-dao")
            );
        },
    );
}

#[test]
fn test_from_env_rejects_multi_chain_contract_missing_start_block() {
    with_datalens_env(
        &[
            ("DATALENS_ENDPOINT", Some("https://datalens.ringdao.com")),
            ("DATALENS_APPLICATION", Some("degov-live")),
            ("DATALENS_TOKEN", Some("unit-test-redacted-value")),
            (
                "DATALENS_CHAINS_JSON",
                Some(
                    r#"[
                        {
                            "chainId": 1135,
                            "networkName": "lisk",
                            "contracts": [
                                {
                                    "daoCode": "lisk-dao",
                                    "chainId": 1135,
                                    "networkName": "lisk",
                                    "governor": "0x58a61b1807a7bDA541855DaAEAEe89b1DDA48568",
                                    "governorToken": "0x2eE6Eca46d2406454708a1C80356a6E63b57D404",
                                    "tokenStandard": "ERC20",
                                    "timelock": "0x2294A7f24187B84995A2A28112f82f07BE1BceAD"
                                }
                            ]
                        }
                    ]"#,
                ),
            ),
        ],
        || {
            let error = DatalensConfig::from_env().expect_err("missing start block");

            assert!(
                error
                    .to_string()
                    .contains("DATALENS_CHAINS_JSON[0].contracts[0].startBlock")
            );
        },
    );
}

#[test]
fn test_from_env_for_readiness_ignores_runtime_only_legacy_contract_fields() {
    with_datalens_env(
        &[
            ("DATALENS_ENDPOINT", Some("https://datalens.ringdao.com")),
            ("DATALENS_APPLICATION", Some("degov-live")),
            ("DATALENS_TOKEN", Some("unit-test-redacted-value")),
            (
                "DATALENS_GOVERNOR_ADDRESS",
                Some("0x1111111111111111111111111111111111111111"),
            ),
            (
                "DATALENS_GOVERNOR_TOKEN_ADDRESS",
                Some("0x2222222222222222222222222222222222222222"),
            ),
            ("DATALENS_GOVERNOR_TOKEN_STANDARD", Some("ERC20")),
            (
                "DATALENS_TIMELOCK_ADDRESS",
                Some("0x3333333333333333333333333333333333333333"),
            ),
            ("DEGOV_INDEXER_START_BLOCK", None),
        ],
        || {
            let config = DatalensConfig::from_env_for_readiness().expect("load config");

            assert_eq!(config.endpoint, "https://datalens.ringdao.com");
            assert_eq!(config.chains, Vec::new());
            assert_eq!(config.dao_contracts, None);
        },
    );
}

#[test]
fn test_from_env_requires_application_and_token_for_startup() {
    with_datalens_env(
        &[
            ("DATALENS_ENDPOINT", Some("https://datalens.ringdao.com")),
            ("DATALENS_APPLICATION", None),
            ("DATALENS_TOKEN", None),
        ],
        || {
            let error = DatalensConfig::from_env().expect_err("missing application");

            assert_eq!(
                error,
                ConfigError::MissingRequired {
                    field: "DATALENS_APPLICATION"
                }
            );
            assert!(!error.to_string().contains("DATALENS_TOKEN="));
        },
    );
}

#[test]
fn test_from_env_requires_endpoint_for_startup() {
    with_datalens_env(
        &[
            ("DATALENS_ENDPOINT", None),
            ("DATALENS_APPLICATION", Some("degov-live")),
            ("DATALENS_TOKEN", Some("unit-test-redacted-value")),
        ],
        || {
            let error = DatalensConfig::from_env().expect_err("missing endpoint");

            assert_eq!(
                error,
                ConfigError::MissingRequired {
                    field: "DATALENS_ENDPOINT"
                }
            );
        },
    );
}

#[test]
fn test_from_env_accepts_case_insensitive_governor_token_standard() {
    with_datalens_env(
        &[
            ("DATALENS_ENDPOINT", Some("https://datalens.ringdao.com")),
            ("DATALENS_APPLICATION", Some("degov-live")),
            ("DATALENS_TOKEN", Some("unit-test-redacted-value")),
            (
                "DATALENS_GOVERNOR_ADDRESS",
                Some("0x1111111111111111111111111111111111111111"),
            ),
            (
                "DATALENS_GOVERNOR_TOKEN_ADDRESS",
                Some("0x2222222222222222222222222222222222222222"),
            ),
            ("DATALENS_GOVERNOR_TOKEN_STANDARD", Some("ErC721")),
            (
                "DATALENS_TIMELOCK_ADDRESS",
                Some("0x3333333333333333333333333333333333333333"),
            ),
            ("DEGOV_INDEXER_START_BLOCK", Some("1")),
        ],
        || {
            let config = DatalensConfig::from_env().expect("load config");

            assert_eq!(
                config
                    .dao_contracts
                    .as_ref()
                    .expect("contracts")
                    .governor_token_standard,
                GovernanceTokenStandard::Erc721
            );
        },
    );
}

#[test]
fn test_from_env_rejects_invalid_governor_token_standard() {
    with_datalens_env(
        &[
            ("DATALENS_ENDPOINT", Some("https://datalens.ringdao.com")),
            ("DATALENS_APPLICATION", Some("degov-live")),
            ("DATALENS_TOKEN", Some("unit-test-redacted-value")),
            (
                "DATALENS_GOVERNOR_ADDRESS",
                Some("0x1111111111111111111111111111111111111111"),
            ),
            (
                "DATALENS_GOVERNOR_TOKEN_ADDRESS",
                Some("0x2222222222222222222222222222222222222222"),
            ),
            ("DATALENS_GOVERNOR_TOKEN_STANDARD", Some("erc1155")),
            (
                "DATALENS_TIMELOCK_ADDRESS",
                Some("0x3333333333333333333333333333333333333333"),
            ),
        ],
        || {
            let error = DatalensConfig::from_env().expect_err("invalid token standard");

            assert_eq!(
                error,
                ConfigError::InvalidTokenStandard {
                    value: "erc1155".to_owned()
                }
            );
        },
    );
}

#[test]
fn test_endpoint_must_be_service_base_url() {
    with_datalens_env(
        &[
            (
                "DATALENS_ENDPOINT",
                Some("https://datalens.ringdao.com/native/graphql"),
            ),
            ("DATALENS_APPLICATION", Some("degov-live")),
            ("DATALENS_TOKEN", Some("unit-test-redacted-value")),
        ],
        || {
            let error = DatalensConfig::from_env().expect_err("graphql path rejected");

            assert_eq!(error, ConfigError::EndpointMustBeServiceBase);
        },
    );
}

#[test]
fn test_secret_string_never_formats_secret() {
    let secret = SecretString::new("unit-test-redacted-value");

    assert_eq!(format!("{secret}"), "<redacted>");
    assert_eq!(format!("{secret:?}"), "<redacted>");
    assert!(!format!("{secret:?}").contains("unit-test-redacted-value"));
}
