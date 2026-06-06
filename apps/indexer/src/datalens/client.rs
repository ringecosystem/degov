use std::time::Instant;

use datalens_sdk::{
    ApiErrorKind, DatalensClient, Error as DatalensSdkError, RetryConfig,
    native::{ChainHeadFinalityInput, QueryInput},
};
use log::{info, warn};

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
    retry_config: RetryConfig,
    service_base_endpoint: String,
    application: String,
    bearer_token: crate::SecretString,
    http: reqwest::blocking::Client,
}

impl DatalensNativeClient {
    pub fn from_config(config: &DatalensConfig) -> Result<Self, DatalensError> {
        let retry_config = RetryConfig::default();
        let client = DatalensClient::new(config.sdk_config())
            .map_err(|error| DatalensError::SdkConfig(error.to_string()))?;
        Ok(Self {
            client,
            retry_config,
            service_base_endpoint: config.endpoint.clone(),
            application: config.application.clone(),
            bearer_token: config.bearer_token.clone(),
            http: reqwest::blocking::Client::builder()
                .timeout(config.timeout)
                .user_agent(crate::config::DEGOV_DATALENS_USER_AGENT)
                .build()
                .map_err(|error| DatalensError::SdkConfig(error.to_string()))?,
        })
    }

    pub fn from_config_with_retry_config(
        config: &DatalensConfig,
        retry_config: RetryConfig,
    ) -> Result<Self, DatalensError> {
        info!(
            "Datalens SDK retry/backoff configured max_attempts={} initial_delay_ms={} max_delay_ms={} max_elapsed_ms={:?} jitter={} jitter_factor={} per_attempt_delays_managed_by_sdk=true",
            retry_config.max_attempts,
            retry_config.initial_delay.as_millis(),
            retry_config.max_delay.as_millis(),
            retry_config
                .max_elapsed
                .map(|duration| duration.as_millis()),
            retry_config.jitter,
            retry_config.jitter_factor
        );
        let client =
            DatalensClient::new_with_retry_config(config.sdk_config(), retry_config.clone())
                .map_err(|error| DatalensError::SdkConfig(error.to_string()))?;
        Ok(Self {
            client,
            retry_config,
            service_base_endpoint: config.endpoint.clone(),
            application: config.application.clone(),
            bearer_token: config.bearer_token.clone(),
            http: reqwest::blocking::Client::builder()
                .timeout(config.timeout)
                .user_agent(crate::config::DEGOV_DATALENS_USER_AGENT)
                .build()
                .map_err(|error| DatalensError::SdkConfig(error.to_string()))?,
        })
    }

    pub(crate) fn service_base_endpoint(&self) -> &str {
        &self.service_base_endpoint
    }

    pub(crate) fn application(&self) -> &str {
        &self.application
    }

    pub(crate) fn bearer_token(&self) -> &str {
        self.bearer_token.expose_secret()
    }

    pub(crate) fn blocking_http(&self) -> &reqwest::blocking::Client {
        &self.http
    }

    fn query_with_transient_fallback(
        &self,
        input: QueryInput,
    ) -> Result<crate::DatalensLogQueryResult, DatalensSdkError> {
        let started_at = Instant::now();
        let mut attempt = 1;
        loop {
            match self.client.native().query(input.clone()) {
                Ok(response) => {
                    return Ok(crate::DatalensLogQueryResult {
                        rows: response.rows,
                        cache: crate::DatalensLogQueryCacheSummary::from_datalens_cache_json(
                            &response.cache,
                        ),
                    });
                }
                Err(error) => {
                    let Some(delay) =
                        fallback_retry_delay(&self.retry_config, &error, attempt, started_at)
                    else {
                        return Err(error);
                    };
                    warn!(
                        "Datalens query transient fallback retry scheduled attempt={} max_attempts={} delay_ms={} error={}",
                        attempt + 1,
                        self.retry_config.max_attempts,
                        delay.as_millis(),
                        error
                    );
                    std::thread::sleep(delay);
                    attempt += 1;
                }
            }
        }
    }
}

fn fallback_retry_delay(
    retry_config: &RetryConfig,
    error: &DatalensSdkError,
    failed_attempt: u32,
    started_at: Instant,
) -> Option<std::time::Duration> {
    if error.is_retryable() || !is_transient_sdk_api_error(error) {
        return None;
    }
    let delay = retry_config.delay_for_attempt(
        failed_attempt,
        error
            .retry_after_seconds()
            .map(std::time::Duration::from_secs),
    )?;
    if let Some(max_elapsed) = retry_config.max_elapsed
        && started_at.elapsed().saturating_add(delay) > max_elapsed
    {
        return None;
    }
    Some(delay)
}

fn is_transient_sdk_api_error(error: &DatalensSdkError) -> bool {
    if let Some(api_error) = error.api_error() {
        return matches!(
            api_error.kind,
            ApiErrorKind::ProviderFailure
                | ApiErrorKind::ProviderTimeout
                | ApiErrorKind::StorageReadFailure
                | ApiErrorKind::StorageWriteFailure
                | ApiErrorKind::ManifestUpdateFailure
                | ApiErrorKind::Internal
                | ApiErrorKind::UnavailableHead
        ) || api_error
            .status
            .is_some_and(|status| (500..600).contains(&status));
    }

    match error {
        DatalensSdkError::Transport(_) => true,
        DatalensSdkError::HttpStatus { status, .. } => (500..600).contains(status),
        _ => false,
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
    fn query_logs(
        &mut self,
        input: QueryInput,
    ) -> Result<crate::DatalensLogQueryResult, DatalensError> {
        self.query_with_transient_fallback(input)
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
