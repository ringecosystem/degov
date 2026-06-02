use std::{fmt, str::FromStr, time::Duration};

use datalens_sdk::ClientConfig;
use figment::{
    Figment,
    providers::{Env, Serialized},
};
use serde::{Deserialize, Serialize};

use crate::ConfigError;

pub const DEFAULT_DATALENS_ENDPOINT: &str = "https://datalens.ringdao.com";
pub const DEFAULT_DATALENS_TIMEOUT_SECONDS: u64 = 60;
pub const DEFAULT_DATALENS_FINALITY: DatalensFinality = DatalensFinality::DurableOnly;
pub const DEFAULT_DATALENS_CHAIN_FAMILY: ChainFamily = ChainFamily::Evm;
pub const DEFAULT_DATALENS_CHAIN_NAME: &str = "ethereum";
pub const DEFAULT_DATALENS_CHAIN_ID: i32 = 1;
pub const DEFAULT_DATALENS_DATASET_FAMILY: &str = "evm";
pub const DEFAULT_DATALENS_DATASET_NAME: &str = "logs";
pub const DEFAULT_DATALENS_QUERY_BLOCK_RANGE_LIMIT: u32 = 1_000;
pub const DEFAULT_DATALENS_QUERY_ROW_LIMIT: u32 = 1_000;
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
    pub row_limit: u32,
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
    datalens_query_row_limit: u32,
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
            datalens_query_row_limit: DEFAULT_DATALENS_QUERY_ROW_LIMIT,
        }
    }
}

impl DatalensConfig {
    pub fn from_env() -> Result<Self, ConfigError> {
        let raw: RawDatalensConfig =
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
                    "DATALENS_QUERY_ROW_LIMIT",
                ]))
                .extract()
                .map_err(|error| ConfigError::Load(error.to_string()))?;

        Self::try_from(raw)
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
}

impl TryFrom<RawDatalensConfig> for DatalensConfig {
    type Error = ConfigError;

    fn try_from(raw: RawDatalensConfig) -> Result<Self, Self::Error> {
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
        if raw.datalens_query_row_limit == 0 {
            return Err(ConfigError::InvalidLimit {
                field: "DATALENS_QUERY_ROW_LIMIT",
            });
        }

        Ok(Self {
            endpoint,
            application,
            bearer_token,
            timeout: Duration::from_secs(raw.datalens_timeout_seconds),
            finality: raw.datalens_finality.parse()?,
            chain: ChainIdentityConfig {
                family: raw.datalens_chain_family.parse()?,
                configured_name: non_empty("DATALENS_CHAIN_NAME", raw.datalens_chain_name)?,
                network_id: raw.datalens_chain_id,
            },
            dataset: DatasetKeyConfig {
                family: non_empty("DATALENS_DATASET_FAMILY", raw.datalens_dataset_family)?,
                name: non_empty("DATALENS_DATASET_NAME", raw.datalens_dataset_name)?,
            },
            query_limits: QueryLimitConfig {
                block_range_limit: raw.datalens_query_block_range_limit,
                row_limit: raw.datalens_query_row_limit,
            },
        })
    }
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
                ("DATALENS_QUERY_ROW_LIMIT", Some("250")),
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
                assert_eq!(config.query_limits.row_limit, 250);

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
