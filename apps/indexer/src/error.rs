use thiserror::Error;

#[derive(Debug, Error, Eq, PartialEq)]
pub enum ConfigError {
    #[error("missing required Datalens configuration field {field}")]
    MissingRequired { field: &'static str },

    #[error("Datalens endpoint must be a service base URL, not a native GraphQL path")]
    EndpointMustBeServiceBase,

    #[error("Datalens timeout must be greater than zero seconds")]
    InvalidTimeout,

    #[error("Datalens query limit {field} must be greater than zero")]
    InvalidLimit { field: &'static str },

    #[error("invalid Datalens finality mode {value}")]
    InvalidFinality { value: String },

    #[error("invalid Datalens chain family {value}")]
    InvalidChainFamily { value: String },

    #[error("failed to load Datalens configuration: {0}")]
    Load(String),
}

#[derive(Debug, Error)]
pub enum DatalensError {
    #[error("Datalens SDK configuration failed: {0}")]
    SdkConfig(String),

    #[error("Datalens service readiness check failed: {0}")]
    Readiness(String),
}

#[derive(Debug, Error)]
pub enum IndexerError {
    #[error("configuration error: {0}")]
    Config(#[from] ConfigError),

    #[error("Datalens client error: {0}")]
    Datalens(#[from] DatalensError),
}
