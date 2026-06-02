use std::{fmt, str::FromStr, time::Duration};

use datalens_sdk::ClientConfig;
use figment::{
    Figment,
    providers::{Env, Serialized},
};
use serde::{Deserialize, Serialize};

use crate::{ConfigError, DaoContractAddresses, GovernanceTokenStandard};

pub const DEFAULT_DATALENS_TIMEOUT_SECONDS: u64 = 60;
pub const DEFAULT_DATALENS_FINALITY: DatalensFinality = DatalensFinality::DurableOnly;
pub const DEFAULT_DATALENS_CHAIN_FAMILY: ChainFamily = ChainFamily::Evm;
pub const DEFAULT_DATALENS_CHAIN_NAME: &str = "ethereum";
pub const DEFAULT_DATALENS_CHAIN_ID: i32 = 1;
pub const DEFAULT_DATALENS_DATASET_FAMILY: &str = "evm";
pub const DEFAULT_DATALENS_DATASET_NAME: &str = "logs";
pub const DEFAULT_DATALENS_QUERY_BLOCK_RANGE_LIMIT: u32 = 1_000;
pub const DEGOV_DATALENS_USER_AGENT: &str = "degov-datalens-indexer";

#[derive(Clone, Eq, PartialEq)]
pub struct SecretString(String);

impl SecretString {
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into())
    }

    pub fn expose_secret(&self) -> &str {
        &self.0
    }

    fn into_inner(self) -> String {
        self.0
    }
}

impl fmt::Debug for SecretString {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("<redacted>")
    }
}

impl fmt::Display for SecretString {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("<redacted>")
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DatalensFinality {
    DurableOnly,
    IncludePending,
}

impl DatalensFinality {
    pub fn as_datalens_value(self) -> &'static str {
        match self {
            Self::DurableOnly => "durable_only",
            Self::IncludePending => "include_pending",
        }
    }
}

impl FromStr for DatalensFinality {
    type Err = ConfigError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.trim() {
            "durable_only" => Ok(Self::DurableOnly),
            "include_pending" => Ok(Self::IncludePending),
            value => Err(ConfigError::InvalidFinality {
                value: value.to_owned(),
            }),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ChainFamily {
    Evm,
}

impl ChainFamily {
    pub fn as_datalens_value(self) -> &'static str {
        match self {
            Self::Evm => "evm",
        }
    }
}

impl FromStr for ChainFamily {
    type Err = ConfigError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.trim() {
            "evm" => Ok(Self::Evm),
            value => Err(ConfigError::InvalidChainFamily {
                value: value.to_owned(),
            }),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct ChainIdentityConfig {
    pub family: ChainFamily,
    pub configured_name: String,
    pub network_id: Option<i32>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DatalensChainConfig {
    pub family: ChainFamily,
    pub configured_name: String,
    pub network_id: i32,
    pub contracts: Vec<DatalensContractSetConfig>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DatalensContractSetConfig {
    pub dao_code: Option<String>,
    pub chain_id: i32,
    pub network_name: String,
    pub governor: String,
    pub governor_token: String,
    pub governor_token_standard: GovernanceTokenStandard,
    pub timelock: String,
    pub start_block: i64,
}

impl DatalensContractSetConfig {
    pub fn addresses(&self) -> DaoContractAddresses {
        DaoContractAddresses {
            governor: self.governor.clone(),
            governor_token: self.governor_token.clone(),
            governor_token_standard: self.governor_token_standard,
            timelock: self.timelock.clone(),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct DatasetKeyConfig {
    pub family: String,
    pub name: String,
}

impl DatasetKeyConfig {
    pub fn key(&self) -> String {
        format!("{}.{}", self.family, self.name)
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct QueryLimitConfig {
    pub block_range_limit: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DatalensConfig {
    pub endpoint: String,
    pub application: String,
    pub bearer_token: SecretString,
    pub timeout: Duration,
    pub finality: DatalensFinality,
    pub chain: ChainIdentityConfig,
    pub dataset: DatasetKeyConfig,
    pub query_limits: QueryLimitConfig,
    pub dao_contracts: Option<DaoContractAddresses>,
    pub chains: Vec<DatalensChainConfig>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct RawDatalensConfig {
    datalens_endpoint: Option<String>,
    datalens_application: Option<String>,
    datalens_token: Option<String>,
    datalens_timeout_seconds: u64,
    datalens_finality: String,
    datalens_chain_family: String,
    datalens_chain_name: String,
    datalens_chain_id: Option<i32>,
    datalens_dataset_family: String,
    datalens_dataset_name: String,
    datalens_query_block_range_limit: u32,
    datalens_governor_address: Option<String>,
    datalens_governor_token_address: Option<String>,
    datalens_governor_token_standard: Option<String>,
    datalens_timelock_address: Option<String>,
    datalens_chains_json: Option<String>,
    degov_indexer_dao_code: Option<String>,
    degov_indexer_start_block: Option<i64>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawDatalensChainConfig {
    #[serde(rename = "chainId", alias = "chain_id")]
    chain_id: Option<i32>,
    #[serde(rename = "networkName", alias = "network_name")]
    network_name: Option<String>,
    contracts: Option<Vec<RawDatalensContractSetConfig>>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawDatalensContractSetConfig {
    #[serde(rename = "daoCode", alias = "dao_code")]
    dao_code: Option<String>,
    #[serde(rename = "chainId", alias = "chain_id")]
    chain_id: Option<i32>,
    #[serde(rename = "networkName", alias = "network_name")]
    network_name: Option<String>,
    governor: Option<String>,
    #[serde(rename = "governorToken", alias = "governor_token")]
    governor_token: Option<String>,
    #[serde(rename = "tokenStandard", alias = "token_standard")]
    token_standard: Option<String>,
    timelock: Option<String>,
    #[serde(rename = "startBlock", alias = "start_block")]
    start_block: Option<i64>,
}

impl Default for RawDatalensConfig {
    fn default() -> Self {
        Self {
            datalens_endpoint: None,
            datalens_application: None,
            datalens_token: None,
            datalens_timeout_seconds: DEFAULT_DATALENS_TIMEOUT_SECONDS,
            datalens_finality: DEFAULT_DATALENS_FINALITY.as_datalens_value().to_owned(),
            datalens_chain_family: DEFAULT_DATALENS_CHAIN_FAMILY.as_datalens_value().to_owned(),
            datalens_chain_name: DEFAULT_DATALENS_CHAIN_NAME.to_owned(),
            datalens_chain_id: Some(DEFAULT_DATALENS_CHAIN_ID),
            datalens_dataset_family: DEFAULT_DATALENS_DATASET_FAMILY.to_owned(),
            datalens_dataset_name: DEFAULT_DATALENS_DATASET_NAME.to_owned(),
            datalens_query_block_range_limit: DEFAULT_DATALENS_QUERY_BLOCK_RANGE_LIMIT,
            datalens_governor_address: None,
            datalens_governor_token_address: None,
            datalens_governor_token_standard: None,
            datalens_timelock_address: None,
            datalens_chains_json: None,
            degov_indexer_dao_code: None,
            degov_indexer_start_block: None,
        }
    }
}

impl DatalensConfig {
    pub fn from_env() -> Result<Self, ConfigError> {
        Self::from_raw(load_raw_from_env()?, DatalensConfigMode::Runtime)
    }

    pub fn from_env_for_readiness() -> Result<Self, ConfigError> {
        Self::from_raw(load_raw_from_env()?, DatalensConfigMode::Readiness)
    }

    pub fn sdk_config(&self) -> ClientConfig {
        ClientConfig {
            endpoint: format!("{}/native/graphql", self.endpoint.trim_end_matches('/')),
            bearer_token: Some(self.bearer_token.clone().into_inner()),
            application: Some(self.application.clone()),
            timeout: Some(self.timeout),
            user_agent: Some(DEGOV_DATALENS_USER_AGENT.to_owned()),
        }
    }

    pub fn select_contract_set(
        &self,
        dao_code: &str,
    ) -> Result<DatalensContractSetConfig, ConfigError> {
        let mut matches = self
            .chains
            .iter()
            .flat_map(|chain| chain.contracts.iter())
            .filter(|contract| {
                contract
                    .dao_code
                    .as_deref()
                    .map(|configured| configured == dao_code)
                    .unwrap_or(self.chains.len() == 1 && self.chains[0].contracts.len() == 1)
            });
        let Some(selected) = matches.next() else {
            return Err(ConfigError::InvalidField {
                field: "DEGOV_INDEXER_DAO_CODE".to_owned(),
                reason: format!("no contract set configured for {dao_code}"),
            });
        };
        if matches.next().is_some() {
            return Err(ConfigError::InvalidField {
                field: "DEGOV_INDEXER_DAO_CODE".to_owned(),
                reason: format!("multiple contract sets configured for {dao_code}"),
            });
        }

        Ok(selected.clone())
    }

    pub fn for_contract_set(&self, contract: &DatalensContractSetConfig) -> Self {
        let mut config = self.clone();
        config.chain = ChainIdentityConfig {
            family: ChainFamily::Evm,
            configured_name: contract.network_name.clone(),
            network_id: Some(contract.chain_id),
        };
        config.dao_contracts = Some(contract.addresses());
        config
    }
}

impl TryFrom<RawDatalensConfig> for DatalensConfig {
    type Error = ConfigError;

    fn try_from(raw: RawDatalensConfig) -> Result<Self, Self::Error> {
        Self::from_raw(raw, DatalensConfigMode::Runtime)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum DatalensConfigMode {
    Runtime,
    Readiness,
}

impl DatalensConfig {
    fn from_raw(raw: RawDatalensConfig, mode: DatalensConfigMode) -> Result<Self, ConfigError> {
        let endpoint = required("DATALENS_ENDPOINT", raw.datalens_endpoint)?
            .trim_end_matches('/')
            .to_owned();
        if endpoint.trim_end_matches('/').ends_with("/native/graphql") {
            return Err(ConfigError::EndpointMustBeServiceBase);
        }
        let application = required("DATALENS_APPLICATION", raw.datalens_application)?;
        let bearer_token = SecretString::new(required("DATALENS_TOKEN", raw.datalens_token)?);

        if raw.datalens_timeout_seconds == 0 {
            return Err(ConfigError::InvalidTimeout);
        }
        if raw.datalens_query_block_range_limit == 0 {
            return Err(ConfigError::InvalidLimit {
                field: "DATALENS_QUERY_BLOCK_RANGE_LIMIT",
            });
        }

        let chain = ChainIdentityConfig {
            family: raw.datalens_chain_family.parse()?,
            configured_name: non_empty("DATALENS_CHAIN_NAME", raw.datalens_chain_name)?,
            network_id: raw.datalens_chain_id,
        };
        let has_structured_chains = raw
            .datalens_chains_json
            .as_ref()
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false);
        let (dao_contracts, chains) = match mode {
            DatalensConfigMode::Readiness => (None, Vec::new()),
            DatalensConfigMode::Runtime if has_structured_chains => (
                None,
                datalens_chains(
                    raw.datalens_chains_json,
                    &chain,
                    None,
                    raw.degov_indexer_dao_code,
                    raw.degov_indexer_start_block,
                )?,
            ),
            DatalensConfigMode::Runtime => {
                let dao_contracts = dao_contract_addresses(
                    raw.datalens_governor_address,
                    raw.datalens_governor_token_address,
                    raw.datalens_governor_token_standard,
                    raw.datalens_timelock_address,
                )?;
                let chains = datalens_chains(
                    raw.datalens_chains_json,
                    &chain,
                    dao_contracts.as_ref(),
                    raw.degov_indexer_dao_code,
                    raw.degov_indexer_start_block,
                )?;
                (dao_contracts, chains)
            }
        };

        Ok(Self {
            endpoint,
            application,
            bearer_token,
            timeout: Duration::from_secs(raw.datalens_timeout_seconds),
            finality: raw.datalens_finality.parse()?,
            chain,
            dataset: DatasetKeyConfig {
                family: non_empty("DATALENS_DATASET_FAMILY", raw.datalens_dataset_family)?,
                name: non_empty("DATALENS_DATASET_NAME", raw.datalens_dataset_name)?,
            },
            query_limits: QueryLimitConfig {
                block_range_limit: raw.datalens_query_block_range_limit,
            },
            dao_contracts,
            chains,
        })
    }
}

fn load_raw_from_env() -> Result<RawDatalensConfig, ConfigError> {
    Figment::from(Serialized::defaults(RawDatalensConfig::default()))
        .merge(Env::raw().only(&[
            "DATALENS_ENDPOINT",
            "DATALENS_APPLICATION",
            "DATALENS_TOKEN",
            "DATALENS_TIMEOUT_SECONDS",
            "DATALENS_FINALITY",
            "DATALENS_CHAIN_FAMILY",
            "DATALENS_CHAIN_NAME",
            "DATALENS_CHAIN_ID",
            "DATALENS_DATASET_FAMILY",
            "DATALENS_DATASET_NAME",
            "DATALENS_QUERY_BLOCK_RANGE_LIMIT",
            "DATALENS_GOVERNOR_ADDRESS",
            "DATALENS_GOVERNOR_TOKEN_ADDRESS",
            "DATALENS_GOVERNOR_TOKEN_STANDARD",
            "DATALENS_TIMELOCK_ADDRESS",
            "DATALENS_CHAINS_JSON",
            "DEGOV_INDEXER_DAO_CODE",
            "DEGOV_INDEXER_START_BLOCK",
        ]))
        .extract()
        .map_err(|error| ConfigError::Load(error.to_string()))
}

fn required(field: &'static str, value: Option<String>) -> Result<String, ConfigError> {
    match value {
        Some(value) => non_empty(field, value),
        None => Err(ConfigError::MissingRequired { field }),
    }
}

fn non_empty(field: &'static str, value: String) -> Result<String, ConfigError> {
    let value = value.trim().to_owned();
    if value.is_empty() {
        return Err(ConfigError::MissingRequired { field });
    }
    Ok(value)
}

fn optional_non_empty(
    field: &'static str,
    value: Option<String>,
) -> Result<Option<String>, ConfigError> {
    value.map(|value| non_empty(field, value)).transpose()
}

fn dao_contract_addresses(
    governor: Option<String>,
    governor_token: Option<String>,
    governor_token_standard: Option<String>,
    timelock: Option<String>,
) -> Result<Option<DaoContractAddresses>, ConfigError> {
    let governor = optional_non_empty("DATALENS_GOVERNOR_ADDRESS", governor)?;
    let governor_token = optional_non_empty("DATALENS_GOVERNOR_TOKEN_ADDRESS", governor_token)?;
    let governor_token_standard =
        optional_non_empty("DATALENS_GOVERNOR_TOKEN_STANDARD", governor_token_standard)?
            .map(|value| value.parse::<GovernanceTokenStandard>())
            .transpose()?;
    let timelock = optional_non_empty("DATALENS_TIMELOCK_ADDRESS", timelock)?;

    Ok(
        match (governor, governor_token, governor_token_standard, timelock) {
            (
                Some(governor),
                Some(governor_token),
                Some(governor_token_standard),
                Some(timelock),
            ) => Some(DaoContractAddresses {
                governor,
                governor_token,
                governor_token_standard,
                timelock,
            }),
            (None, None, None, None) => None,
            (None, _, _, _) => {
                return Err(ConfigError::MissingRequired {
                    field: "DATALENS_GOVERNOR_ADDRESS",
                });
            }
            (_, None, _, _) => {
                return Err(ConfigError::MissingRequired {
                    field: "DATALENS_GOVERNOR_TOKEN_ADDRESS",
                });
            }
            (_, _, None, _) => {
                return Err(ConfigError::MissingRequired {
                    field: "DATALENS_GOVERNOR_TOKEN_STANDARD",
                });
            }
            (_, _, _, None) => {
                return Err(ConfigError::MissingRequired {
                    field: "DATALENS_TIMELOCK_ADDRESS",
                });
            }
        },
    )
}

fn datalens_chains(
    chains_json: Option<String>,
    legacy_chain: &ChainIdentityConfig,
    legacy_contracts: Option<&DaoContractAddresses>,
    legacy_dao_code: Option<String>,
    legacy_start_block: Option<i64>,
) -> Result<Vec<DatalensChainConfig>, ConfigError> {
    if let Some(chains_json) = optional_non_empty("DATALENS_CHAINS_JSON", chains_json)? {
        let raw_chains: Vec<RawDatalensChainConfig> =
            serde_json::from_str(&chains_json).map_err(|error| ConfigError::InvalidField {
                field: "DATALENS_CHAINS_JSON".to_owned(),
                reason: error.to_string(),
            })?;
        if raw_chains.is_empty() {
            return Err(ConfigError::InvalidField {
                field: "DATALENS_CHAINS_JSON".to_owned(),
                reason: "must contain at least one chain".to_owned(),
            });
        }
        return raw_chains
            .into_iter()
            .enumerate()
            .map(|(chain_index, raw_chain)| parse_chain_config(chain_index, raw_chain))
            .collect();
    }

    let Some(contracts) = legacy_contracts else {
        return Ok(Vec::new());
    };
    let chain_id = legacy_chain
        .network_id
        .ok_or(ConfigError::MissingRequired {
            field: "DATALENS_CHAIN_ID",
        })?;
    validate_chain_id("DATALENS_CHAIN_ID".to_owned(), chain_id)?;
    let start_block = legacy_start_block.ok_or(ConfigError::MissingRequired {
        field: "DEGOV_INDEXER_START_BLOCK",
    })?;
    validate_start_block("DEGOV_INDEXER_START_BLOCK".to_owned(), start_block)?;

    Ok(vec![DatalensChainConfig {
        family: legacy_chain.family,
        configured_name: legacy_chain.configured_name.clone(),
        network_id: chain_id,
        contracts: vec![DatalensContractSetConfig {
            dao_code: optional_non_empty("DEGOV_INDEXER_DAO_CODE", legacy_dao_code)?,
            chain_id,
            network_name: legacy_chain.configured_name.clone(),
            governor: contracts.governor.clone(),
            governor_token: contracts.governor_token.clone(),
            governor_token_standard: contracts.governor_token_standard,
            timelock: contracts.timelock.clone(),
            start_block,
        }],
    }])
}

fn parse_chain_config(
    chain_index: usize,
    raw: RawDatalensChainConfig,
) -> Result<DatalensChainConfig, ConfigError> {
    let chain_path = format!("DATALENS_CHAINS_JSON[{chain_index}]");
    let chain_id = required_i32_path(format!("{chain_path}.chainId"), raw.chain_id)?;
    validate_chain_id(format!("{chain_path}.chainId"), chain_id)?;
    let network_name = required_string_path(format!("{chain_path}.networkName"), raw.network_name)?;
    let contracts = raw
        .contracts
        .ok_or_else(|| ConfigError::MissingRequiredPath {
            field: format!("{chain_path}.contracts"),
        })?;
    if contracts.is_empty() {
        return Err(ConfigError::InvalidField {
            field: format!("{chain_path}.contracts"),
            reason: "must contain at least one contract set".to_owned(),
        });
    }

    let contracts = contracts
        .into_iter()
        .enumerate()
        .map(|(contract_index, raw_contract)| {
            parse_contract_config(
                format!("{chain_path}.contracts[{contract_index}]"),
                chain_id,
                &network_name,
                raw_contract,
            )
        })
        .collect::<Result<Vec<_>, _>>()?;

    Ok(DatalensChainConfig {
        family: ChainFamily::Evm,
        configured_name: network_name,
        network_id: chain_id,
        contracts,
    })
}

fn parse_contract_config(
    contract_path: String,
    parent_chain_id: i32,
    parent_network_name: &str,
    raw: RawDatalensContractSetConfig,
) -> Result<DatalensContractSetConfig, ConfigError> {
    let chain_id = required_i32_path(format!("{contract_path}.chainId"), raw.chain_id)?;
    validate_chain_id(format!("{contract_path}.chainId"), chain_id)?;
    if chain_id != parent_chain_id {
        return Err(ConfigError::InvalidField {
            field: format!("{contract_path}.chainId"),
            reason: format!("must match parent chainId {parent_chain_id}"),
        });
    }
    let network_name =
        required_string_path(format!("{contract_path}.networkName"), raw.network_name)?;
    if network_name != parent_network_name {
        return Err(ConfigError::InvalidField {
            field: format!("{contract_path}.networkName"),
            reason: format!("must match parent networkName {parent_network_name}"),
        });
    }
    let token_standard_field = format!("{contract_path}.tokenStandard");
    let token_standard = required_string_path(token_standard_field.clone(), raw.token_standard)?
        .parse::<GovernanceTokenStandard>()
        .map_err(|error| ConfigError::InvalidField {
            field: token_standard_field,
            reason: error.to_string(),
        })?;
    let start_block = required_i64_path(format!("{contract_path}.startBlock"), raw.start_block)?;
    validate_start_block(format!("{contract_path}.startBlock"), start_block)?;

    Ok(DatalensContractSetConfig {
        dao_code: raw
            .dao_code
            .map(|value| required_string_path(format!("{contract_path}.daoCode"), Some(value)))
            .transpose()?,
        chain_id,
        network_name,
        governor: required_string_path(format!("{contract_path}.governor"), raw.governor)?,
        governor_token: required_string_path(
            format!("{contract_path}.governorToken"),
            raw.governor_token,
        )?,
        governor_token_standard: token_standard,
        timelock: required_string_path(format!("{contract_path}.timelock"), raw.timelock)?,
        start_block,
    })
}

fn required_string_path(field: String, value: Option<String>) -> Result<String, ConfigError> {
    match value {
        Some(value) => {
            let value = value.trim().to_owned();
            if value.is_empty() {
                Err(ConfigError::MissingRequiredPath { field })
            } else {
                Ok(value)
            }
        }
        None => Err(ConfigError::MissingRequiredPath { field }),
    }
}

fn required_i32_path(field: String, value: Option<i32>) -> Result<i32, ConfigError> {
    value.ok_or(ConfigError::MissingRequiredPath { field })
}

fn required_i64_path(field: String, value: Option<i64>) -> Result<i64, ConfigError> {
    value.ok_or(ConfigError::MissingRequiredPath { field })
}

fn validate_chain_id(field: String, chain_id: i32) -> Result<(), ConfigError> {
    if chain_id <= 0 {
        return Err(ConfigError::InvalidField {
            field,
            reason: "must be greater than zero".to_owned(),
        });
    }

    Ok(())
}

fn validate_start_block(field: String, start_block: i64) -> Result<(), ConfigError> {
    if start_block < 0 {
        return Err(ConfigError::InvalidField {
            field,
            reason: "must be greater than or equal to zero".to_owned(),
        });
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn with_datalens_env<T>(vars: &[(&str, Option<&str>)], test: impl FnOnce() -> T) -> T {
        temp_env::with_vars(vars, test)
    }

    #[test]
    fn test_from_env_with_required_datalens_fields_builds_sdk_graphql_endpoint() {
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
                assert_eq!(
                    sdk_config.endpoint,
                    "https://datalens.ringdao.com/native/graphql"
                );
                assert_eq!(
                    sdk_config.bearer_token.as_deref(),
                    Some("unit-test-redacted-value")
                );
                assert_eq!(sdk_config.application.as_deref(), Some("degov-live"));
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
}
