use datalens_sdk::{
    DatalensClient,
    native::{
        ChainFamilyInput, ChainFamilyKindInput, ChainIdentityInput, DatasetKeyInput,
        EvmLogsSelectorInput, FieldSelectionInput, NetworkIdInput, QueryInput, QueryRangeInput,
        QueryRangeKindInput, QuerySelectorInput, SelectorKindInput,
    },
};

use crate::{DatalensConfig, DatalensError, DatalensLogQueryReader};

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
        match self.client.native().query(durable_head_probe_input(config)) {
            Ok(_) => Ok(i64::from(i32::MAX)),
            Err(error) => parse_datalens_durable_head_height(&error.to_string()),
        }
    }
}

pub fn parse_datalens_durable_head_height(message: &str) -> Result<i64, DatalensError> {
    const MARKER: &str = "safe/finalized height ";
    let Some((_, height)) = message.rsplit_once(MARKER) else {
        return Err(DatalensError::Query(format!(
            "Datalens durable head height was not available: {message}"
        )));
    };
    let height = height
        .split(|character: char| !character.is_ascii_digit())
        .next()
        .unwrap_or("");

    height.parse::<i64>().map_err(|_| {
        DatalensError::Query(format!(
            "Datalens durable head height was not available: {message}"
        ))
    })
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

fn durable_head_probe_input(config: &DatalensConfig) -> QueryInput {
    QueryInput {
        chain: ChainIdentityInput {
            family: ChainFamilyInput {
                kind: ChainFamilyKindInput::Evm,
                other: None,
            },
            configured_name: config.chain.configured_name.clone(),
            network_id: config.chain.network_id.map(|numeric| NetworkIdInput {
                numeric: Some(numeric),
                textual: None,
            }),
        },
        dataset_key: DatasetKeyInput {
            family: config.dataset.family.clone(),
            name: config.dataset.name.clone(),
        },
        selector: QuerySelectorInput {
            kind: SelectorKindInput::EvmLogs,
            evm_logs: Some(EvmLogsSelectorInput {
                addresses: Vec::new(),
                topics: Vec::new(),
            }),
            other: None,
        },
        range: QueryRangeInput {
            kind: QueryRangeKindInput::Block,
            start: 0,
            end: i32::MAX,
        },
        finality: Some("durable_only".to_owned()),
        fields: Some(FieldSelectionInput {
            include: Vec::new(),
        }),
    }
}
