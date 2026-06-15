use std::time::Duration;

use datalens_sdk::native::{QueryInput, QueryRangeKindInput, SelectorKindInput};
use degov_datalens_indexer::{
    ChainFamily, ChainIdentityConfig, DaoContractAddresses, DaoLogAddressSource, DaoLogQueryPlan,
    DaoLogSource, DatalensConfig, DatalensError, DatalensFinality, DatalensLogQueryReader,
    DatalensLogQueryResult, DatalensProvisionalFinality, DatalensProvisionalLogQueryReader,
    DatalensProvisionalLogQueryResult, DatasetKeyConfig, GovernanceTokenStandard, QueryLimitConfig,
    SecretString, fetch_dao_log_pages, fetch_provisional_dao_log_pages, plan_dao_log_queries,
};

#[test]
fn test_plan_dao_log_queries_builds_evm_log_inputs_for_governor_token_and_timelock() {
    let config = config(1_000, DatalensFinality::DurableOnly);
    let plans = plan_dao_log_queries(&config, &addresses(), 100, 199).expect("plans");

    assert_eq!(plans.len(), 3);
    assert_query(
        &plans[0],
        &[DaoLogAddressSource {
            address: "0x1111111111111111111111111111111111111111".to_owned(),
            source: DaoLogSource::Governor,
        }],
        &[
            "0x7d84a6263ae0d98d3329bd7b46bb4e8d6f98cd35a7adb45c274c8b7fd5ebd5e0",
            "0x9a2e42fd6722813d69113e7d0079d3d940171428df7373df9c7f7617cfda2892",
            "0x541f725fb9f7c98a30cc9c0ff32fbb14358cd7159c847a3aa20a2bdc442ba511",
            "0x712ae1383f79ac853f8d882153778e0260ef8f03b504e2866e0593e04d2b291f",
            "0x789cf55be980739dad1d0699b93b58e806b51c9d96619bfa8fe0a28abaa7b30c",
            "0xc565b045403dc03c2eea82b81a0465edad9e2e7fc4d97e11421c209da93d7a93",
            "0x7e3f7f0708a84de9203036abaa450dccc85ad5ff52f78c170f3edb55cf5e8828",
            "0xccb45da8d5717e6c4544694297c4ba5cf151d455c9bb0ed4fc7a38411bc05461",
            "0x0553476bf02ef2726e8ce5ced78d63e26e602e4a2257b1f559418e24b4633997",
            "0x7ca4ac117ed3cdce75c1161d8207c440389b1a15d69d096831664657c07dafc2",
            "0x08f74ea46ef7894f65eabfb5e6e695de773a000b47c529ab559178069b226401",
            "0xb8e138887d0aa13bab447e82de9d5c1777041ecd21ca36ba824ff1e6c07ddda4",
            "0xe2babfbac5889a709b63bb7f598b324e08bc5a4fb9ec647fb3cbc9ec07eb8712",
        ],
        100,
        199,
        "durable_only",
    );
    assert_query(
        &plans[1],
        &[DaoLogAddressSource {
            address: "0x2222222222222222222222222222222222222222".to_owned(),
            source: DaoLogSource::GovernorToken,
        }],
        &[
            "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
            "0x3134e8a2e6d97e929a7e54011ea5485d7d196dd5f0ba4d4ef95803e8e3fc257f",
            "0xdec2bacdd2f05b59de34da9b523dff8be42e5e38e818c82fdb0bae774387a724",
        ],
        100,
        199,
        "durable_only",
    );
    assert_query(
        &plans[2],
        &[DaoLogAddressSource {
            address: "0x3333333333333333333333333333333333333333".to_owned(),
            source: DaoLogSource::Timelock,
        }],
        &[
            "0x4cf4410cc57040e44862ef0f45f3dd5a5e02db8eb8add648d4b0e236f1d07dca",
            "0xc2617efa69bab66782fa219543714338489c4e9e178271560a91b82c3f612b58",
            "0x20fda5fd27a1ea7bf5b9567f143ac5470bb059374a27e8f67cb44f946f6d0387",
            "0xbaa1eb22f2a492ba1a5fea61b8df4d27c6c8b5f3971e63bb58fa14ff72eedb70",
            "0x11c24f4ead16507c69ac467fbd5e4eed5fb5c699626d2cc6d66421df253886d5",
            "0x2f8788117e7eff1d82e926ec794901d17c78024a50270940304540a733656f0d",
            "0xf6391f5c32d9c69d2a47ea670b442974b53935d1edc7fd64eb21e047a839171b",
            "0xbd79b86ffe0ab8e8776151514217cd7cacd52c909f66475c3af44e129f0b00ff",
        ],
        100,
        199,
        "durable_only",
    );
}

#[test]
fn test_plan_dao_log_queries_skips_timelock_when_not_configured() {
    let config = config(1_000, DatalensFinality::DurableOnly);
    let mut addresses = addresses();
    addresses.timelock = None;

    let plans = plan_dao_log_queries(&config, &addresses, 100, 199).expect("plans");

    assert_eq!(plans.len(), 2);
    assert_eq!(plans[0].sources[0].source, DaoLogSource::Governor);
    assert_eq!(plans[1].sources[0].source, DaoLogSource::GovernorToken);
}

#[test]
fn test_plan_dao_log_queries_chunks_ranges_by_config_limit() {
    let config = config(50, DatalensFinality::DurableOnly);
    let plans = plan_dao_log_queries(&config, &addresses(), 100, 220).expect("plans");
    let ranges = plans
        .iter()
        .map(|plan| (plan.from_block, plan.to_block))
        .collect::<Vec<_>>();

    assert_eq!(
        ranges,
        vec![
            (100, 149),
            (100, 149),
            (100, 149),
            (150, 199),
            (150, 199),
            (150, 199),
            (200, 220),
            (200, 220),
            (200, 220),
        ]
    );
}

#[test]
fn test_plan_dao_log_queries_rejects_zero_chunk_limit() {
    let config = config(0, DatalensFinality::DurableOnly);

    let error = plan_dao_log_queries(&config, &addresses(), 100, 220).expect_err("limit error");

    assert!(
        error
            .to_string()
            .contains("block range limit must be greater than zero")
    );
}

#[test]
fn test_plan_dao_log_queries_uses_durable_only_finality_for_final_indexing() {
    let config = config(1_000, DatalensFinality::DurableOnly);
    let plans = plan_dao_log_queries(&config, &addresses(), 100, 100).expect("plans");

    assert_eq!(plans[0].input.finality.as_deref(), Some("durable_only"));
}

#[test]
fn test_fetch_provisional_dao_log_pages_uses_explicit_safe_to_latest_finality() {
    let config = config(1_000, DatalensFinality::DurableOnly);
    let plans = plan_dao_log_queries(&config, &addresses(), 100, 100).expect("plans");
    let mut reader = MockProvisionalLogReader::new(vec![Ok(serde_json::json!([]))]);

    let pages = fetch_provisional_dao_log_pages(
        &mut reader,
        &plans[..1],
        DatalensProvisionalFinality::SafeToLatest,
    )
    .expect("pages");

    assert_eq!(pages.len(), 1);
    assert_eq!(reader.calls.len(), 1);
    assert_eq!(reader.calls[0].finality.as_deref(), Some("safe_to_latest"));
}

#[test]
fn test_fetch_dao_log_pages_keeps_final_path_on_safe_query_api() {
    let config = config(1_000, DatalensFinality::DurableOnly);
    let plans = plan_dao_log_queries(&config, &addresses(), 100, 100).expect("plans");
    let mut reader = MockLogReader::new(vec![Ok(serde_json::json!([]))]);

    fetch_dao_log_pages(&mut reader, &plans[..1]).expect("pages");

    assert_eq!(reader.calls.len(), 1);
    assert_eq!(reader.calls[0].finality.as_deref(), Some("durable_only"));
}

#[test]
fn test_fetch_dao_log_pages_treats_empty_rows_as_successful_page() {
    let config = config(1_000, DatalensFinality::DurableOnly);
    let plans = plan_dao_log_queries(&config, &addresses(), 100, 100).expect("plans");
    let mut reader = MockLogReader::new(vec![Ok(serde_json::json!([]))]);

    let pages = fetch_dao_log_pages(&mut reader, &plans[..1]).expect("pages");

    assert_eq!(pages.len(), 1);
    assert_eq!(pages[0].plan, plans[0]);
    assert_eq!(pages[0].rows, serde_json::json!([]));
    assert_eq!(reader.calls.len(), 1);
}

#[test]
fn test_fetch_dao_log_pages_returns_first_reader_error_without_local_retry() {
    let config = config(1_000, DatalensFinality::DurableOnly);
    let plans = plan_dao_log_queries(&config, &addresses(), 100, 100).expect("plans");
    let mut reader = MockLogReader::new(vec![
        Err(DatalensError::Query("provider timeout".to_owned())),
        Ok(serde_json::json!([{ "blockNumber": 100 }])),
    ]);

    let error = fetch_dao_log_pages(&mut reader, &plans[..1]).expect_err("query error");

    assert!(error.to_string().contains("provider timeout"));
    assert_eq!(reader.calls.len(), 1);
}

#[test]
fn test_fetch_dao_log_pages_stops_without_later_pages_on_reader_error() {
    let config = config(1, DatalensFinality::DurableOnly);
    let plans = plan_dao_log_queries(&config, &addresses(), 100, 101).expect("plans");
    let mut reader = MockLogReader::new(vec![
        Err(DatalensError::Query("rate limited".to_owned())),
        Ok(serde_json::json!([])),
    ]);

    let error = fetch_dao_log_pages(&mut reader, &plans[..2]).expect_err("query error");

    assert!(error.to_string().contains("rate limited"));
    assert_eq!(reader.calls.len(), 1);
}

fn assert_query(
    plan: &DaoLogQueryPlan,
    sources: &[DaoLogAddressSource],
    topic0_values: &[&str],
    from_block: i32,
    to_block: i32,
    finality: &str,
) {
    assert_eq!(plan.sources, sources);
    assert_eq!(plan.from_block, from_block);
    assert_eq!(plan.to_block, to_block);
    assert_eq!(plan.input.chain.configured_name, "ethereum");
    assert_eq!(plan.input.dataset_key.family, "evm");
    assert_eq!(plan.input.dataset_key.name, "logs");
    assert_eq!(plan.input.selector.kind, SelectorKindInput::EvmLogs);
    assert_eq!(plan.input.range.kind, QueryRangeKindInput::Block);
    assert_eq!(plan.input.range.start, u64::try_from(from_block).unwrap());
    assert_eq!(plan.input.range.end, u64::try_from(to_block).unwrap());
    assert_eq!(plan.input.finality.as_deref(), Some(finality));

    let evm_logs = plan.input.selector.evm_logs.as_ref().expect("evm logs");
    assert_eq!(
        evm_logs.addresses,
        sources
            .iter()
            .map(|source| source.address.clone())
            .collect::<Vec<_>>()
    );
    assert_eq!(
        evm_logs.topics,
        vec![
            topic0_values
                .iter()
                .map(|topic| topic.to_string())
                .collect::<Vec<_>>()
        ]
    );
}

fn config(block_range_limit: u32, finality: DatalensFinality) -> DatalensConfig {
    DatalensConfig {
        endpoint: "https://datalens.ringdao.com".to_owned(),
        application: "degov-live".to_owned(),
        bearer_token: SecretString::new("redacted"),
        timeout: Duration::from_secs(60),
        finality,
        chain: ChainIdentityConfig {
            family: ChainFamily::Evm,
            configured_name: "ethereum".to_owned(),
            network_id: Some(1),
        },
        dataset: DatasetKeyConfig {
            family: "evm".to_owned(),
            name: "logs".to_owned(),
        },
        query_limits: QueryLimitConfig { block_range_limit },
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
        timelock: Some("0x3333333333333333333333333333333333333333".to_owned()),
    }
}

struct MockLogReader {
    calls: Vec<QueryInput>,
    results: Vec<Result<serde_json::Value, DatalensError>>,
}

impl MockLogReader {
    fn new(results: Vec<Result<serde_json::Value, DatalensError>>) -> Self {
        Self {
            calls: Vec::new(),
            results,
        }
    }
}

impl DatalensLogQueryReader for MockLogReader {
    fn query_logs(&mut self, input: QueryInput) -> Result<DatalensLogQueryResult, DatalensError> {
        self.calls.push(input);
        self.results
            .remove(0)
            .map(DatalensLogQueryResult::rows_only)
    }
}

struct MockProvisionalLogReader {
    calls: Vec<QueryInput>,
    results: Vec<Result<serde_json::Value, DatalensError>>,
}

impl MockProvisionalLogReader {
    fn new(results: Vec<Result<serde_json::Value, DatalensError>>) -> Self {
        Self {
            calls: Vec::new(),
            results,
        }
    }
}

impl DatalensProvisionalLogQueryReader for MockProvisionalLogReader {
    fn query_provisional_logs(
        &mut self,
        input: QueryInput,
    ) -> Result<DatalensProvisionalLogQueryResult, DatalensError> {
        self.calls.push(input);
        self.results
            .remove(0)
            .map(DatalensProvisionalLogQueryResult::rows_only)
    }
}
