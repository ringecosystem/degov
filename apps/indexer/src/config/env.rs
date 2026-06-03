use figment::{
    Figment,
    providers::{Env, Serialized},
};

use crate::ConfigError;

use super::RawDatalensConfig;

pub(super) fn load_raw_from_env() -> Result<RawDatalensConfig, ConfigError> {
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
