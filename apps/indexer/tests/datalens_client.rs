use degov_datalens_indexer::{
    DatalensError, DatalensNativeReader, ServiceReadiness, verify_datalens_service,
};

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
