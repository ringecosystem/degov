use datalens_sdk::{DatalensClient, native::QueryInput};

use crate::{DatalensConfig, DatalensError, DatalensLogQueryReader};

pub trait DatalensNativeReader {
    fn service_readiness(&self) -> Result<ServiceReadiness, DatalensError>;
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
