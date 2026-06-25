use std::{collections::BTreeMap, time::Duration};

use degov_datalens_indexer::{
    ChainFamily, ChainIdentityConfig, DaoContractAddresses, DatalensConfig, DatalensError,
    DatalensFinality, DatalensWarmupEnsureOutcome, DatalensWarmupEnsurer, DatasetKeyConfig,
    GovernanceTokenStandard, QueryLimitConfig, SecretString, ensure_datalens_warmup_task,
};

#[test]
fn test_ensure_datalens_warmup_task_skips_when_disabled() {
    let mut config = config();
    config.warmup.enabled = false;
    config.warmup.ensure_on_startup = true;
    let mut ensurer = MockWarmupEnsurer::default();

    let outcome =
        ensure_datalens_warmup_task(&mut ensurer, &config, &addresses(), 100).expect("ensure");

    assert_eq!(outcome, DatalensWarmupEnsureOutcome::Disabled);
    assert!(ensurer.requests.is_empty());
}

#[test]
fn test_ensure_datalens_warmup_task_submits_follow_query_when_enabled() {
    let config = config();
    let mut ensurer = MockWarmupEnsurer::default();

    let outcome =
        ensure_datalens_warmup_task(&mut ensurer, &config, &addresses(), 100).expect("ensure");

    assert!(matches!(
        outcome,
        DatalensWarmupEnsureOutcome::Submitted { created: true, .. }
    ));
    assert_eq!(ensurer.requests.len(), 2);
    let selector_addresses = &ensurer.requests[0].selector.addresses;
    assert!(selector_addresses.is_empty());
    assert_eq!(
        ensurer.requests[1].selector.addresses,
        vec![addresses().governor_token]
    );
    let topic_counts = ensurer
        .requests
        .iter()
        .map(|request| {
            assert_eq!(request.selector.topics.len(), 1);
            request.selector.topics[0].len()
        })
        .collect::<Vec<_>>();
    assert_eq!(topic_counts, vec![21, 3]);
    for request in &ensurer.requests {
        assert_eq!(request.chain.configured_name, "ethereum");
        assert_eq!(request.chain.network_id, Some(1));
        assert_eq!(request.dataset_key, "evm.logs");
        assert_eq!(request.range_kind, "block");
        assert_eq!(request.start, 100);
        assert_eq!(request.end, None);
        assert_eq!(request.mode, "follow_query");
    }
}

#[test]
fn test_ensure_datalens_warmup_task_reuses_existing_matching_task() {
    let config = config();
    let mut ensurer = MockWarmupEnsurer::default();

    let first =
        ensure_datalens_warmup_task(&mut ensurer, &config, &addresses(), 100).expect("first");
    let second =
        ensure_datalens_warmup_task(&mut ensurer, &config, &addresses(), 100).expect("second");

    assert!(matches!(
        first,
        DatalensWarmupEnsureOutcome::Submitted { created: true, .. }
    ));
    assert!(matches!(
        second,
        DatalensWarmupEnsureOutcome::Submitted { created: false, .. }
    ));
    assert_eq!(ensurer.created_tasks.len(), 2);
}

#[test]
fn test_ensure_datalens_warmup_task_reuses_broad_selector_for_dao_address_mismatch() {
    let config = config();
    let mut ensurer = MockWarmupEnsurer::default();
    let mut other_addresses = addresses();
    other_addresses.timelock = Some("0x4444444444444444444444444444444444444444".to_owned());

    ensure_datalens_warmup_task(&mut ensurer, &config, &addresses(), 100).expect("first");
    let second =
        ensure_datalens_warmup_task(&mut ensurer, &config, &other_addresses, 100).expect("second");

    assert!(matches!(
        second,
        DatalensWarmupEnsureOutcome::Submitted { created: false, .. }
    ));
    assert_eq!(ensurer.created_tasks.len(), 2);
}

#[test]
fn test_ensure_datalens_warmup_task_returns_failed_outcome_when_submit_fails_by_default() {
    let config = config();
    let mut ensurer = MockWarmupEnsurer::with_error("submit unavailable");

    let outcome =
        ensure_datalens_warmup_task(&mut ensurer, &config, &addresses(), 100).expect("ensure");

    assert_eq!(
        outcome,
        DatalensWarmupEnsureOutcome::Failed {
            error: "submit unavailable".to_owned()
        }
    );
    assert_eq!(ensurer.requests.len(), 1);
}

#[test]
fn test_ensure_datalens_warmup_task_returns_error_when_submit_fails_and_required() {
    let mut config = config();
    config.warmup.required = true;
    let mut ensurer = MockWarmupEnsurer::with_error("submit unavailable");

    let error = ensure_datalens_warmup_task(&mut ensurer, &config, &addresses(), 100)
        .expect_err("required warmup fails fast");

    assert!(error.to_string().contains("submit unavailable"));
    assert_eq!(ensurer.requests.len(), 1);
}

fn config() -> DatalensConfig {
    let mut warmup = degov_datalens_indexer::DatalensWarmupConfig::default();
    warmup.enabled = true;
    warmup.ensure_on_startup = true;

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
        warmup,
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

#[derive(Default)]
struct MockWarmupEnsurer {
    requests: Vec<degov_datalens_indexer::DatalensWarmupSubmitRequest>,
    created_tasks: BTreeMap<String, String>,
    error: Option<String>,
}

impl MockWarmupEnsurer {
    fn with_error(error: impl Into<String>) -> Self {
        Self {
            error: Some(error.into()),
            ..Default::default()
        }
    }
}

impl DatalensWarmupEnsurer for MockWarmupEnsurer {
    fn ensure_warmup_task(
        &mut self,
        request: degov_datalens_indexer::DatalensWarmupSubmitRequest,
    ) -> Result<DatalensWarmupEnsureOutcome, degov_datalens_indexer::DatalensError> {
        self.requests.push(request.clone());
        if let Some(error) = &self.error {
            return Err(DatalensError::Warmup(error.clone()));
        }
        let key = serde_json::to_string(&request).expect("request serializes");
        let (task_id, created) = match self.created_tasks.get(&key) {
            Some(task_id) => (task_id.clone(), false),
            None => {
                let task_id = format!("warmup-{}", self.created_tasks.len() + 1);
                self.created_tasks.insert(key, task_id.clone());
                (task_id, true)
            }
        };
        Ok(DatalensWarmupEnsureOutcome::Submitted { task_id, created })
    }
}
