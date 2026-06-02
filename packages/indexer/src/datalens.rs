use datalens_sdk::DatalensClient;

use crate::{DatalensConfig, DatalensError};

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

#[cfg(test)]
mod tests {
    use super::*;

    struct MockDatalensReader {
        readiness: Result<ServiceReadiness, DatalensError>,
    }

    impl DatalensNativeReader for MockDatalensReader {
        fn service_readiness(&self) -> Result<ServiceReadiness, DatalensError> {
            match &self.readiness {
                Ok(readiness) => Ok(readiness.clone()),
                Err(error) => Err(DatalensError::Readiness(error.to_string())),
            }
        }
    }

    #[test]
    fn test_verify_datalens_service_accepts_mocked_ready_client() {
        let reader = MockDatalensReader {
            readiness: Ok(ServiceReadiness {
                native_graphql_ready: true,
            }),
        };

        let readiness = verify_datalens_service(&reader).expect("ready");

        assert!(readiness.native_graphql_ready);
    }

    #[test]
    fn test_verify_datalens_service_rejects_mocked_unready_client() {
        let reader = MockDatalensReader {
            readiness: Ok(ServiceReadiness {
                native_graphql_ready: false,
            }),
        };

        let error = verify_datalens_service(&reader).expect_err("unready");

        assert!(error.to_string().contains("readiness was not confirmed"));
    }
}
