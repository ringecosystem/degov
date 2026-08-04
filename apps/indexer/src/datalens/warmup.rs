use std::fmt;

use datalens_sdk::native::{
    EvmLogsSelectorInput, QueryRangeKindInput, QuerySelectorInput, SelectorKindInput,
};
use serde::{Deserialize, Serialize};

use crate::{
    ChainFamily, ChainIdentityConfig, DaoContractAddresses, DatalensConfig, DatalensError,
    DatasetKeyConfig,
};

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DatalensWarmupKind {
    #[default]
    FollowQuery,
}

impl DatalensWarmupKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::FollowQuery => "follow_query",
        }
    }
}

impl std::str::FromStr for DatalensWarmupKind {
    type Err = crate::ConfigError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.trim() {
            "follow_query" => Ok(Self::FollowQuery),
            value => Err(crate::ConfigError::InvalidField {
                field: "DATALENS_WARMUP_KIND".to_owned(),
                reason: format!("unsupported warmup kind {value}"),
            }),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct DatalensWarmupConfig {
    pub enabled: bool,
    pub ensure_on_startup: bool,
    pub required: bool,
    pub kind: DatalensWarmupKind,
}

impl Default for DatalensWarmupConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            ensure_on_startup: true,
            required: false,
            kind: DatalensWarmupKind::FollowQuery,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DatalensWarmupEnsureOutcome {
    Disabled,
    Failed { error: String },
    Submitted { task_id: String, created: bool },
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct DatalensWarmupSubmitRequest {
    pub chain: WarmupChainIdentity,
    pub dataset_key: String,
    pub selector: WarmupEvmLogsSelector,
    pub range_kind: String,
    pub start: u64,
    pub end: Option<u64>,
    pub mode: String,
    pub chunk_policy: WarmupChunkPolicy,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct WarmupChainIdentity {
    pub family: serde_json::Value,
    pub configured_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub network_id: Option<u64>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct WarmupEvmLogsSelector {
    pub addresses: Vec<String>,
    pub topics: Vec<Vec<String>>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct WarmupChunkPolicy {
    pub max_range_len: u32,
}

#[derive(Clone, Debug, Deserialize)]
struct WarmupSubmitResponse {
    task_id: WarmupTaskIdResponse,
    created: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(untagged)]
enum WarmupTaskIdResponse {
    String(String),
    Object { task_id: String },
}

impl fmt::Display for WarmupTaskIdResponse {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::String(value) => formatter.write_str(value),
            Self::Object { task_id } => formatter.write_str(task_id),
        }
    }
}

pub trait DatalensWarmupEnsurer {
    fn ensure_warmup_task(
        &mut self,
        request: DatalensWarmupSubmitRequest,
    ) -> Result<DatalensWarmupEnsureOutcome, DatalensError>;
}

pub fn ensure_datalens_warmup_task(
    ensurer: &mut impl DatalensWarmupEnsurer,
    config: &DatalensConfig,
    addresses: &DaoContractAddresses,
    start_block: i64,
) -> Result<DatalensWarmupEnsureOutcome, DatalensError> {
    if !config.warmup.enabled || !config.warmup.ensure_on_startup {
        return Ok(DatalensWarmupEnsureOutcome::Disabled);
    }

    let result = match config.warmup.kind {
        DatalensWarmupKind::FollowQuery => {
            let requests = follow_query_requests(config, addresses, start_block)?;
            ensure_follow_query_requests(ensurer, requests)
        }
    };

    match result {
        Ok(outcome) => Ok(outcome),
        Err(error) if config.warmup.required => Err(error),
        Err(error) => Ok(DatalensWarmupEnsureOutcome::Failed {
            error: warmup_failure_message(error),
        }),
    }
}

fn warmup_failure_message(error: DatalensError) -> String {
    match error {
        DatalensError::Warmup(message) => message,
        error => error.to_string(),
    }
}

pub fn follow_query_request(
    config: &DatalensConfig,
    addresses: &DaoContractAddresses,
    start_block: i64,
) -> Result<DatalensWarmupSubmitRequest, DatalensError> {
    follow_query_requests(config, addresses, start_block)?
        .into_iter()
        .next()
        .ok_or_else(|| DatalensError::Warmup("Datalens warmup query plan was empty".to_owned()))
}

fn follow_query_requests(
    config: &DatalensConfig,
    addresses: &DaoContractAddresses,
    start_block: i64,
) -> Result<Vec<DatalensWarmupSubmitRequest>, DatalensError> {
    if start_block < 0 {
        return Err(DatalensError::Warmup(format!(
            "Datalens warmup start block must be non-negative: {start_block}"
        )));
    }

    let queries = crate::plan_dao_log_queries(config, addresses, start_block, start_block)?;
    if queries.is_empty() {
        return Err(DatalensError::Warmup(
            "Datalens warmup query plan was empty".to_owned(),
        ));
    }

    queries
        .into_iter()
        .map(|query| {
            let selector = query.input.selector.evm_logs.as_ref().ok_or_else(|| {
                DatalensError::Warmup("Datalens warmup selector is not evm_logs".to_owned())
            })?;

            Ok(DatalensWarmupSubmitRequest {
                chain: warmup_chain_identity(&config.chain)?,
                dataset_key: warmup_dataset_key(&config.dataset),
                selector: warmup_evm_logs_selector(&query.input.selector, selector)?,
                range_kind: warmup_range_kind(&query.input.range.kind)?,
                start: start_block as u64,
                end: None,
                mode: "follow_query".to_owned(),
                chunk_policy: WarmupChunkPolicy {
                    max_range_len: config.query_limits.block_range_limit,
                },
            })
        })
        .collect()
}

fn ensure_follow_query_requests(
    ensurer: &mut impl DatalensWarmupEnsurer,
    requests: Vec<DatalensWarmupSubmitRequest>,
) -> Result<DatalensWarmupEnsureOutcome, DatalensError> {
    let mut task_ids = Vec::new();
    let mut created_any = false;

    for request in requests {
        match ensurer.ensure_warmup_task(request)? {
            DatalensWarmupEnsureOutcome::Submitted { task_id, created } => {
                task_ids.push(task_id);
                created_any |= created;
            }
            outcome => return Ok(outcome),
        }
    }

    Ok(DatalensWarmupEnsureOutcome::Submitted {
        task_id: task_ids.join(","),
        created: created_any,
    })
}

impl DatalensWarmupEnsurer for crate::DatalensNativeClient {
    fn ensure_warmup_task(
        &mut self,
        request: DatalensWarmupSubmitRequest,
    ) -> Result<DatalensWarmupEnsureOutcome, DatalensError> {
        self.ensure_warmup_task_http(request)
    }
}

impl crate::DatalensNativeClient {
    pub(crate) fn ensure_warmup_task_http(
        &self,
        request: DatalensWarmupSubmitRequest,
    ) -> Result<DatalensWarmupEnsureOutcome, DatalensError> {
        let response = self
            .blocking_http()
            .post(format!(
                "{}/v1/warmup/tasks/ensure",
                self.service_base_endpoint()
            ))
            .bearer_auth(self.bearer_token())
            .header("x-datalens-application", self.application())
            .json(&warmup_api_request(request))
            .send()
            .map_err(|error| DatalensError::Warmup(format!("ensure warmup task: {error}")))?;
        let status = response.status().as_u16();
        let body = response
            .text()
            .map_err(|error| DatalensError::Warmup(format!("read warmup response: {error}")))?;
        if !(200..300).contains(&status) {
            return Err(DatalensError::Warmup(format!(
                "Datalens warmup ensure failed with status {status}: {body}"
            )));
        }
        let response: WarmupSubmitResponse = serde_json::from_str(&body)
            .map_err(|error| DatalensError::Warmup(format!("decode warmup response: {error}")))?;
        Ok(DatalensWarmupEnsureOutcome::Submitted {
            task_id: response.task_id.to_string(),
            created: response.created,
        })
    }
}

fn warmup_api_request(request: DatalensWarmupSubmitRequest) -> serde_json::Value {
    serde_json::json!({
        "chain": warmup_api_chain(&request.chain),
        "dataset_key": request.dataset_key,
        "selector": {
            "kind": "evm_logs",
            "value": {
                "addresses": request.selector.addresses,
                "topics": request
                    .selector
                    .topics
                    .into_iter()
                    .map(serde_json::Value::from)
                    .collect::<Vec<_>>()
            }
        },
        "range_kind": { "kind": request.range_kind },
        "start": request.start,
        "end": request.end,
        "mode": request.mode,
        "chunk_policy": request.chunk_policy
    })
}

fn warmup_api_chain(chain: &WarmupChainIdentity) -> serde_json::Value {
    let mut value = serde_json::json!({
        "family": chain.family,
        "configured_name": chain.configured_name,
    });
    if let Some(network_id) = chain.network_id {
        value["network_id"] = serde_json::json!({
            "kind": "numeric",
            "value": network_id,
        });
    }
    value
}

fn warmup_chain_identity(
    chain: &ChainIdentityConfig,
) -> Result<WarmupChainIdentity, DatalensError> {
    let family = match chain.family {
        ChainFamily::Evm => serde_json::Value::String("Evm".to_owned()),
    };
    let network_id = chain
        .network_id
        .map(|value| {
            u64::try_from(value).map_err(|_| {
                DatalensError::Warmup(format!(
                    "Datalens warmup chain id must be non-negative: {value}"
                ))
            })
        })
        .transpose()?;
    Ok(WarmupChainIdentity {
        family,
        configured_name: chain.configured_name.clone(),
        network_id,
    })
}

fn warmup_dataset_key(dataset: &DatasetKeyConfig) -> String {
    dataset.key()
}

fn warmup_evm_logs_selector(
    selector: &QuerySelectorInput,
    evm_logs: &EvmLogsSelectorInput,
) -> Result<WarmupEvmLogsSelector, DatalensError> {
    if selector.kind != SelectorKindInput::EvmLogs {
        return Err(DatalensError::Warmup(
            "Datalens warmup selector kind is not evm_logs".to_owned(),
        ));
    }
    Ok(WarmupEvmLogsSelector {
        addresses: evm_logs.addresses.clone(),
        topics: evm_logs.topics.clone(),
    })
}

fn warmup_range_kind(kind: &QueryRangeKindInput) -> Result<String, DatalensError> {
    match kind {
        QueryRangeKindInput::Block => Ok("block".to_owned()),
        QueryRangeKindInput::Slot => Ok("slot".to_owned()),
        QueryRangeKindInput::Height => Ok("height".to_owned()),
    }
}
