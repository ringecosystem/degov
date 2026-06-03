use datalens_sdk::{
    DatalensClient,
    native::{ChainHeadFinalityInput, QueryInput},
};

use crate::{DatalensConfig, DatalensError, DatalensFinality, DatalensLogQueryReader};

pub trait DatalensNativeReader {
    fn service_readiness(&self) -> Result<ServiceReadiness, DatalensError>;
}

pub trait DatalensDurableHeadReader {
    fn durable_head_height(&mut self, config: &DatalensConfig) -> Result<i64, DatalensError>;
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ServiceReadiness {
    pub native_graphql_ready: bool,
}

pub struct DatalensNativeClient {
    client: DatalensClient,
}

impl DatalensNativeClient {
    pub fn from_config(config: &DatalensConfig) -> Result<Self, DatalensError> {
        let client = DatalensClient::new(config.sdk_config())
            .map_err(|error| DatalensError::SdkConfig(error.to_string()))?;
        Ok(Self { client })
    }
}

impl DatalensNativeReader for DatalensNativeClient {
    fn service_readiness(&self) -> Result<ServiceReadiness, DatalensError> {
        self.client
            .native()
            .discovery()
            .map(|_| ServiceReadiness {
                native_graphql_ready: true,
            })
            .map_err(|error| DatalensError::Readiness(error.to_string()))
    }
}

impl DatalensLogQueryReader for DatalensNativeClient {
    fn query_logs(&mut self, input: QueryInput) -> Result<serde_json::Value, DatalensError> {
        self.client
            .native()
            .query(input)
            .map(|response| response.rows)
            .map_err(|error| DatalensError::Query(error.to_string()))
    }
}

impl DatalensDurableHeadReader for DatalensNativeClient {
    fn durable_head_height(&mut self, config: &DatalensConfig) -> Result<i64, DatalensError> {
        let finality = match config.finality {
            DatalensFinality::DurableOnly => ChainHeadFinalityInput::Safe,
            DatalensFinality::IncludePending => ChainHeadFinalityInput::Latest,
        };
        let response = self
            .client
            .native()
            .chain_head(&config.chain.configured_name, Some(finality))
            .map_err(|error| DatalensError::Query(error.to_string()))?;

        i64::try_from(response.height).map_err(|_| {
            DatalensError::Query(format!(
                "Datalens chain head height {} exceeds supported indexer height",
                response.height
            ))
        })
    }
}

pub fn verify_datalens_service(
    reader: &impl DatalensNativeReader,
) -> Result<ServiceReadiness, DatalensError> {
    let readiness = reader.service_readiness()?;
    if !readiness.native_graphql_ready {
        return Err(DatalensError::Readiness(
            "native GraphQL QueryRoot readiness was not confirmed".to_owned(),
        ));
    }
    Ok(readiness)
}
