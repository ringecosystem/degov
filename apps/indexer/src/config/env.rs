use figment::{
    Figment,
    providers::{Env, Serialized},
};
use serde::{Deserialize, Serialize};
use std::{env, path::Path};

use crate::ConfigError;

use super::{RawDatalensChainConfig, RawDatalensConfig};

pub(super) const DEGOV_INDEXER_CONFIG_FILE: &str = "DEGOV_INDEXER_CONFIG_FILE";

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
struct RawDatalensEnvOverlay {
    datalens_endpoint: Option<String>,
    datalens_application: Option<String>,
    datalens_token: Option<String>,
    datalens_timeout_seconds: Option<u64>,
    datalens_finality: Option<String>,
    datalens_chain_family: Option<String>,
    datalens_chain_name: Option<String>,
    datalens_chain_id: Option<i32>,
    datalens_dataset_family: Option<String>,
    datalens_dataset_name: Option<String>,
    datalens_query_block_range_limit: Option<u32>,
    datalens_governor_address: Option<String>,
    datalens_governor_token_address: Option<String>,
    datalens_governor_token_standard: Option<String>,
    datalens_timelock_address: Option<String>,
    datalens_chains_json: Option<String>,
    degov_indexer_dao_code: Option<String>,
    degov_indexer_start_block: Option<i64>,
}

#[derive(Clone, Debug, Default, Deserialize)]
struct RawIndexerFileConfig {
    datalens: Option<RawDatalensFileConfig>,
    chains: Option<Vec<RawDatalensChainConfig>>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawDatalensFileConfig {
    endpoint: Option<String>,
    application: Option<String>,
    token: Option<String>,
    timeout_seconds: Option<u64>,
    finality: Option<String>,
    chain_family: Option<String>,
    chain_name: Option<String>,
    chain_id: Option<i32>,
    dataset: Option<RawDatalensDatasetFileConfig>,
    query_limits: Option<RawDatalensQueryLimitFileConfig>,
    governor_address: Option<String>,
    governor_token_address: Option<String>,
    governor_token_standard: Option<String>,
    timelock_address: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawDatalensDatasetFileConfig {
    family: Option<String>,
    name: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawDatalensQueryLimitFileConfig {
    block_range_limit: Option<u32>,
}

pub(super) fn load_raw_from_env() -> Result<RawDatalensConfig, ConfigError> {
    let mut raw = RawDatalensConfig::default();
    if let Some(config_file) = optional_config_file()? {
        raw.apply_file(load_raw_from_file(&config_file)?)?;
    }
    raw.apply_env(load_env_overlay()?)?;
    Ok(raw)
}

fn load_env_overlay() -> Result<RawDatalensEnvOverlay, ConfigError> {
    Figment::from(Serialized::defaults(RawDatalensEnvOverlay::default()))
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

fn optional_config_file() -> Result<Option<String>, ConfigError> {
    match env::var(DEGOV_INDEXER_CONFIG_FILE) {
        Ok(value) if value.trim().is_empty() => Ok(None),
        Ok(value) => Ok(Some(value)),
        Err(env::VarError::NotPresent) => Ok(None),
        Err(error) => Err(ConfigError::Load(format!(
            "failed to read {DEGOV_INDEXER_CONFIG_FILE}: {error}"
        ))),
    }
}

fn load_raw_from_file(config_file: &str) -> Result<RawIndexerFileConfig, ConfigError> {
    ::config::Config::builder()
        .add_source(::config::File::from(Path::new(config_file)))
        .build()
        .map_err(|error| {
            ConfigError::Load(format!(
                "failed to load {DEGOV_INDEXER_CONFIG_FILE}: {error}"
            ))
        })?
        .try_deserialize()
        .map_err(|error| {
            ConfigError::Load(format!(
                "failed to parse {DEGOV_INDEXER_CONFIG_FILE}: {error}"
            ))
        })
}

impl RawDatalensConfig {
    fn apply_file(&mut self, file: RawIndexerFileConfig) -> Result<(), ConfigError> {
        if let Some(datalens) = file.datalens {
            assign_if_some(&mut self.datalens_endpoint, datalens.endpoint);
            assign_if_some(&mut self.datalens_application, datalens.application);
            assign_if_some(&mut self.datalens_token, datalens.token);
            assign_value_if_some(&mut self.datalens_timeout_seconds, datalens.timeout_seconds);
            assign_value_if_some(&mut self.datalens_finality, datalens.finality);
            assign_value_if_some(&mut self.datalens_chain_family, datalens.chain_family);
            assign_value_if_some(&mut self.datalens_chain_name, datalens.chain_name);
            assign_if_some(&mut self.datalens_chain_id, datalens.chain_id);
            assign_if_some(
                &mut self.datalens_governor_address,
                datalens.governor_address,
            );
            assign_if_some(
                &mut self.datalens_governor_token_address,
                datalens.governor_token_address,
            );
            assign_if_some(
                &mut self.datalens_governor_token_standard,
                datalens.governor_token_standard,
            );
            assign_if_some(
                &mut self.datalens_timelock_address,
                datalens.timelock_address,
            );

            if let Some(dataset) = datalens.dataset {
                assign_value_if_some(&mut self.datalens_dataset_family, dataset.family);
                assign_value_if_some(&mut self.datalens_dataset_name, dataset.name);
            }
            if let Some(query_limits) = datalens.query_limits {
                assign_value_if_some(
                    &mut self.datalens_query_block_range_limit,
                    query_limits.block_range_limit,
                );
            }
        }

        if let Some(chains) = file.chains {
            self.datalens_chains_json = Some(
                serde_json::to_string(&chains)
                    .map_err(|error| ConfigError::Load(error.to_string()))?,
            );
        }

        Ok(())
    }

    fn apply_env(&mut self, env: RawDatalensEnvOverlay) -> Result<(), ConfigError> {
        assign_if_some(&mut self.datalens_endpoint, env.datalens_endpoint);
        assign_if_some(&mut self.datalens_application, env.datalens_application);
        assign_if_some(&mut self.datalens_token, env.datalens_token);
        assign_value_if_some(
            &mut self.datalens_timeout_seconds,
            env.datalens_timeout_seconds,
        );
        assign_value_if_some(&mut self.datalens_finality, env.datalens_finality);
        assign_value_if_some(&mut self.datalens_chain_family, env.datalens_chain_family);
        assign_value_if_some(&mut self.datalens_chain_name, env.datalens_chain_name);
        assign_if_some(&mut self.datalens_chain_id, env.datalens_chain_id);
        assign_value_if_some(
            &mut self.datalens_dataset_family,
            env.datalens_dataset_family,
        );
        assign_value_if_some(&mut self.datalens_dataset_name, env.datalens_dataset_name);
        assign_value_if_some(
            &mut self.datalens_query_block_range_limit,
            env.datalens_query_block_range_limit,
        );
        assign_if_some(
            &mut self.datalens_governor_address,
            env.datalens_governor_address,
        );
        assign_if_some(
            &mut self.datalens_governor_token_address,
            env.datalens_governor_token_address,
        );
        assign_if_some(
            &mut self.datalens_governor_token_standard,
            env.datalens_governor_token_standard,
        );
        assign_if_some(
            &mut self.datalens_timelock_address,
            env.datalens_timelock_address,
        );
        assign_if_some(&mut self.datalens_chains_json, env.datalens_chains_json);
        assign_if_some(&mut self.degov_indexer_dao_code, env.degov_indexer_dao_code);
        assign_if_some(
            &mut self.degov_indexer_start_block,
            env.degov_indexer_start_block,
        );

        Ok(())
    }
}

fn assign_if_some<T>(target: &mut Option<T>, value: Option<T>) {
    if value.is_some() {
        *target = value;
    }
}

fn assign_value_if_some<T>(target: &mut T, value: Option<T>) {
    if let Some(value) = value {
        *target = value;
    }
}
