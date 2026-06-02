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
pub enum CheckpointError {
    #[error("checkpoint range limit must be greater than zero")]
    InvalidRangeLimit,

    #[error("checkpoint block height must be greater than or equal to zero")]
    InvalidBlockHeight,

    #[error(
        "checkpoint row is missing for DAO {dao_code}, chain {chain_id}, stream {stream_id}, data source {data_source_version}"
    )]
    MissingCheckpoint {
        dao_code: String,
        chain_id: i32,
        stream_id: String,
        data_source_version: String,
    },

    #[error("checkpoint database error: {0}")]
    Database(#[from] sqlx::Error),
}

#[derive(Debug, Error)]
pub enum IndexerError {
    #[error("configuration error: {0}")]
    Config(#[from] ConfigError),

    #[error("Datalens client error: {0}")]
    Datalens(#[from] DatalensError),

    #[error("checkpoint error: {0}")]
    Checkpoint(#[from] CheckpointError),
}
