use std::{
    collections::HashMap,
    sync::{
        Arc, Condvar, Mutex, OnceLock,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    time::{Duration, Instant},
};

use datalens_sdk::{
    ApiErrorKind, DatalensClient, Error as DatalensSdkError, RetryConfig,
    native::{ChainHeadFinalityInput, QueryInput, QueryResponse},
    safety::{CacheSegment, DataFinality, extract_cache_segments},
};
use log::{info, warn};

use crate::{
    DatalensConfig, DatalensError, DatalensLogQueryReader, DatalensProvisionalCacheSegment,
    DatalensProvisionalLogQueryReader, DatalensProvisionalLogQueryResult,
};

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
    query_gate: Option<DatalensQueryConcurrencyGate>,
    query_key: DatalensQueryConcurrencyKey,
    query_timeout: Duration,
    blocking_query_in_flight: Arc<AtomicBool>,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct DatalensQueryConcurrencyConfig {
    pub global_max_in_flight: Option<usize>,
    pub per_chain_max_in_flight: Option<usize>,
}

impl DatalensQueryConcurrencyConfig {
    pub fn is_limited(self) -> bool {
        self.global_max_in_flight.is_some() || self.per_chain_max_in_flight.is_some()
    }

    pub fn validate(self) -> Result<Self, DatalensError> {
        if self.global_max_in_flight.is_some_and(|limit| limit == 0) {
            return Err(DatalensError::Query(
                "Datalens process-local query concurrency limit must be greater than zero"
                    .to_owned(),
            ));
        }
        if self.per_chain_max_in_flight.is_some_and(|limit| limit == 0) {
            return Err(DatalensError::Query(
                "Datalens process-local per-chain query concurrency limit must be greater than zero"
                    .to_owned(),
            ));
        }
        Ok(self)
    }
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub struct DatalensQueryConcurrencyKey {
    pub family: String,
    pub configured_name: String,
    pub network_id: Option<i32>,
}

impl DatalensQueryConcurrencyKey {
    pub fn from_config(config: &DatalensConfig) -> Self {
        Self {
            family: config.chain.family.as_datalens_value().to_owned(),
            configured_name: config.chain.configured_name.clone(),
            network_id: config.chain.network_id,
        }
    }

    fn log_network_id(&self) -> String {
        self.network_id
            .map(|network_id| network_id.to_string())
            .unwrap_or_else(|| "none".to_owned())
    }
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct DatalensBlockingQueryKey {
    endpoint: String,
    application: String,
    query_key: DatalensQueryConcurrencyKey,
}

impl DatalensBlockingQueryKey {
    fn from_config(config: &DatalensConfig) -> Self {
        Self {
            endpoint: config.endpoint.clone(),
            application: config.application.clone(),
            query_key: DatalensQueryConcurrencyKey::from_config(config),
        }
    }
}

#[derive(Clone)]
pub struct DatalensQueryConcurrencyGate {
    inner: Arc<DatalensQueryConcurrencyGateInner>,
}

struct DatalensQueryConcurrencyGateInner {
    config: DatalensQueryConcurrencyConfig,
    state: Mutex<DatalensQueryConcurrencyGateState>,
    available: Condvar,
}

#[derive(Default)]
struct DatalensQueryConcurrencyGateState {
    global_in_flight: usize,
    per_chain_in_flight: HashMap<DatalensQueryConcurrencyKey, usize>,
}

pub struct DatalensQueryConcurrencyPermit {
    gate: DatalensQueryConcurrencyGate,
    key: DatalensQueryConcurrencyKey,
    pub wait_duration: Duration,
    pub global_in_flight: usize,
    pub chain_in_flight: usize,
}

impl DatalensQueryConcurrencyGate {
    pub fn new(config: DatalensQueryConcurrencyConfig) -> Result<Self, DatalensError> {
        let config = config.validate()?;
        Ok(Self {
            inner: Arc::new(DatalensQueryConcurrencyGateInner {
                config,
                state: Mutex::new(DatalensQueryConcurrencyGateState::default()),
                available: Condvar::new(),
            }),
        })
    }

    pub fn acquire(
        &self,
        key: &DatalensQueryConcurrencyKey,
    ) -> Result<DatalensQueryConcurrencyPermit, DatalensError> {
        let started_at = Instant::now();
        let mut state = self.inner.state.lock().map_err(|_| {
            DatalensError::Query("Datalens query concurrency gate lock poisoned".to_owned())
        })?;

        while self
            .inner
            .config
            .global_max_in_flight
            .is_some_and(|limit| state.global_in_flight >= limit)
            || self
                .inner
                .config
                .per_chain_max_in_flight
                .is_some_and(|limit| {
                    state
                        .per_chain_in_flight
                        .get(key)
                        .copied()
                        .unwrap_or_default()
                        >= limit
                })
        {
            state = self.inner.available.wait(state).map_err(|_| {
                DatalensError::Query("Datalens query concurrency gate lock poisoned".to_owned())
            })?;
        }

        state.global_in_flight += 1;
        let chain_in_flight = {
            let chain_in_flight = state.per_chain_in_flight.entry(key.clone()).or_default();
            *chain_in_flight += 1;
            *chain_in_flight
        };
        let global_in_flight = state.global_in_flight;

        Ok(DatalensQueryConcurrencyPermit {
            gate: self.clone(),
            key: key.clone(),
            wait_duration: started_at.elapsed(),
            global_in_flight,
            chain_in_flight,
        })
    }
}

impl Drop for DatalensQueryConcurrencyPermit {
    fn drop(&mut self) {
        if let Ok(mut state) = self.gate.inner.state.lock() {
            state.global_in_flight = state.global_in_flight.saturating_sub(1);
            if let Some(chain_in_flight) = state.per_chain_in_flight.get_mut(&self.key) {
                *chain_in_flight = chain_in_flight.saturating_sub(1);
                if *chain_in_flight == 0 {
                    state.per_chain_in_flight.remove(&self.key);
                }
            }
        }
        self.gate.inner.available.notify_all();
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DatalensQueryErrorClass {
    ProviderLimit,
    Transient,
    Other,
}

impl DatalensQueryErrorClass {
    fn as_str(self) -> &'static str {
        match self {
            Self::ProviderLimit => "provider_limit",
            Self::Transient => "transient",
            Self::Other => "other",
        }
    }
}

pub fn classify_datalens_query_error(error: &str) -> DatalensQueryErrorClass {
    let normalized = error.to_ascii_lowercase();
    if normalized.contains("provider_limit") || normalized.contains("narrow your filter") {
        return DatalensQueryErrorClass::ProviderLimit;
    }
    if normalized.contains("provider_timeout")
        || normalized.contains("timeout")
        || normalized.contains("timed out")
        || normalized.contains("request_rate_limit")
        || normalized.contains("rate_limit")
        || normalized.contains("transport")
        || normalized.contains("send request")
        || normalized.contains("sending request")
        || normalized.contains("connection")
        || normalized.contains("network")
        || normalized.contains("provider_failure")
        || normalized.contains("unavailable_head")
        || normalized.contains("no available server")
        || normalized.contains("storage_read_failure")
        || normalized.contains("storage_write_failure")
        || normalized.contains("manifest_update_failure")
        || normalized.contains("internal")
        || normalized.contains("502")
        || normalized.contains("503")
        || normalized.contains("504")
        || normalized.contains("524")
    {
        return DatalensQueryErrorClass::Transient;
    }
    DatalensQueryErrorClass::Other
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
            query_gate: None,
            query_key: DatalensQueryConcurrencyKey::from_config(config),
            query_timeout: config.timeout,
            blocking_query_in_flight: blocking_query_guard_for_config(config)?,
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
            query_gate: None,
            query_key: DatalensQueryConcurrencyKey::from_config(config),
            query_timeout: config.timeout,
            blocking_query_in_flight: blocking_query_guard_for_config(config)?,
        })
    }

    pub fn with_query_concurrency_gate(mut self, gate: DatalensQueryConcurrencyGate) -> Self {
        self.query_gate = Some(gate);
        self
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
            match self.query_with_deadline(input.clone()) {
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
                        "Datalens query transient fallback retry scheduled attempt={} max_attempts={} delay_ms={} error_class={} error={}",
                        attempt + 1,
                        self.retry_config.max_attempts,
                        delay.as_millis(),
                        classify_datalens_query_error(&error.to_string()).as_str(),
                        error
                    );
                    std::thread::sleep(delay);
                    attempt += 1;
                }
            }
        }
    }

    fn query_provisional_with_transient_fallback(
        &self,
        input: QueryInput,
    ) -> Result<DatalensProvisionalLogQueryResult, DatalensSdkError> {
        let started_at = Instant::now();
        let mut attempt = 1;
        loop {
            match self.query_provisional_with_deadline(input.clone()) {
                Ok(response) => {
                    let segments = extract_cache_segments(&response)
                        .into_iter()
                        .filter_map(provisional_cache_segment)
                        .collect();
                    return Ok(DatalensProvisionalLogQueryResult {
                        rows: response.rows,
                        segments,
                    });
                }
                Err(error) => {
                    let Some(delay) =
                        fallback_retry_delay(&self.retry_config, &error, attempt, started_at)
                    else {
                        return Err(error);
                    };
                    warn!(
                        "Datalens provisional query transient fallback retry scheduled attempt={} max_attempts={} delay_ms={} error_class={} error={}",
                        attempt + 1,
                        self.retry_config.max_attempts,
                        delay.as_millis(),
                        classify_datalens_query_error(&error.to_string()).as_str(),
                        error
                    );
                    std::thread::sleep(delay);
                    attempt += 1;
                }
            }
        }
    }

    fn query_with_deadline(&self, input: QueryInput) -> Result<QueryResponse, DatalensSdkError> {
        self.run_query_with_deadline("query", move |client| client.native().query(input))
    }

    fn query_provisional_with_deadline(
        &self,
        input: QueryInput,
    ) -> Result<QueryResponse, DatalensSdkError> {
        self.run_query_with_deadline("provisional query", move |client| {
            client.native().query_provisional(input)
        })
    }

    fn run_query_with_deadline<F>(
        &self,
        operation: &'static str,
        run: F,
    ) -> Result<QueryResponse, DatalensSdkError>
    where
        F: FnOnce(DatalensClient) -> Result<QueryResponse, DatalensSdkError> + Send + 'static,
    {
        if self
            .blocking_query_in_flight
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return Err(datalens_query_timeout_error(
                operation,
                self.query_timeout,
                Some("previous SDK query is still in flight"),
            ));
        }

        let permit = match self.acquire_query_concurrency_permit(operation) {
            Ok(permit) => permit,
            Err(error) => {
                self.blocking_query_in_flight
                    .store(false, Ordering::Release);
                return Err(DatalensSdkError::Transport(error.to_string()));
            }
        };
        let (sender, receiver) = mpsc::sync_channel(1);
        let client = self.client.clone();
        let blocking_query_in_flight = self.blocking_query_in_flight.clone();
        let spawn_result = std::thread::Builder::new()
            .name(format!("degov-datalens-{operation}"))
            .spawn(move || {
                let _in_flight_reset = DatalensBlockingQueryReset(blocking_query_in_flight);
                let _permit = permit;
                let result = run(client);
                let _ = sender.send(result);
            });

        if let Err(error) = spawn_result {
            self.blocking_query_in_flight
                .store(false, Ordering::Release);
            return Err(DatalensSdkError::Transport(format!(
                "spawn Datalens {operation} worker: {error}"
            )));
        }

        match receiver.recv_timeout(self.query_timeout) {
            Ok(result) => result,
            Err(mpsc::RecvTimeoutError::Timeout) => Err(datalens_query_timeout_error(
                operation,
                self.query_timeout,
                None,
            )),
            Err(mpsc::RecvTimeoutError::Disconnected) => Err(DatalensSdkError::Transport(format!(
                "Datalens {operation} worker stopped before returning a response"
            ))),
        }
    }

    fn acquire_query_concurrency_permit(
        &self,
        operation: &str,
    ) -> Result<Option<DatalensQueryConcurrencyPermit>, DatalensError> {
        self.query_gate
            .as_ref()
            .map(|gate| {
                let permit = gate.acquire(&self.query_key)?;
                info!(
                    "Datalens process-local {operation} concurrency permit acquired chain_family={} chain_name={} chain_network_id={} wait_ms={} process_in_flight={} chain_in_flight={}",
                    self.query_key.family,
                    self.query_key.configured_name,
                    self.query_key.log_network_id(),
                    permit.wait_duration.as_millis(),
                    permit.global_in_flight,
                    permit.chain_in_flight
                );
                Ok::<_, DatalensError>(permit)
            })
            .transpose()
    }
}

struct DatalensBlockingQueryReset(Arc<AtomicBool>);

impl Drop for DatalensBlockingQueryReset {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
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

fn blocking_query_guard_for_config(
    config: &DatalensConfig,
) -> Result<Arc<AtomicBool>, DatalensError> {
    static BLOCKING_QUERY_GUARDS: OnceLock<
        Mutex<HashMap<DatalensBlockingQueryKey, Arc<AtomicBool>>>,
    > = OnceLock::new();

    let key = DatalensBlockingQueryKey::from_config(config);
    let guards = BLOCKING_QUERY_GUARDS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut guards = guards.lock().map_err(|_| {
        DatalensError::Query("Datalens blocking query guard lock poisoned".to_owned())
    })?;
    Ok(guards
        .entry(key)
        .or_insert_with(|| Arc::new(AtomicBool::new(false)))
        .clone())
}

fn datalens_query_timeout_error(
    operation: &str,
    timeout: Duration,
    context: Option<&str>,
) -> DatalensSdkError {
    let mut message = format!(
        "Datalens {operation} timed out after {}ms",
        timeout.as_millis()
    );
    if let Some(context) = context {
        message.push_str(": ");
        message.push_str(context);
    }
    DatalensSdkError::Transport(message)
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
        self.query_with_transient_fallback(input).map_err(|error| {
            let error_message = error.to_string();
            warn!(
                "Datalens query failed error_class={} max_attempts={} error={}",
                classify_datalens_query_error(&error_message).as_str(),
                self.retry_config.max_attempts,
                error_message
            );
            DatalensError::Query(error_message)
        })
    }
}

impl DatalensProvisionalLogQueryReader for DatalensNativeClient {
    fn query_provisional_logs(
        &mut self,
        input: QueryInput,
    ) -> Result<DatalensProvisionalLogQueryResult, DatalensError> {
        self.query_provisional_with_transient_fallback(input)
            .map_err(|error| {
                let error_message = error.to_string();
                warn!(
                    "Datalens provisional query failed error_class={} max_attempts={} error={}",
                    classify_datalens_query_error(&error_message).as_str(),
                    self.retry_config.max_attempts,
                    error_message
                );
                DatalensError::Query(error_message)
            })
    }
}

impl DatalensDurableHeadReader for DatalensNativeClient {
    fn durable_head_height(&mut self, config: &DatalensConfig) -> Result<i64, DatalensError> {
        let response = self
            .client
            .native()
            .chain_head(
                &config.chain.configured_name,
                Some(ChainHeadFinalityInput::Safe),
            )
            .map_err(|error| DatalensError::Query(error.to_string()))?;

        i64::try_from(response.height).map_err(|_| {
            DatalensError::Query(format!(
                "Datalens chain head height {} exceeds supported indexer height",
                response.height
            ))
        })
    }
}

fn provisional_cache_segment(segment: CacheSegment) -> Option<DatalensProvisionalCacheSegment> {
    let range = segment.range?;
    let anchor = segment.anchor;
    Some(DatalensProvisionalCacheSegment {
        source: segment.source.unwrap_or_else(|| "unknown".to_owned()),
        finality: data_finality_value(segment.finality).to_owned(),
        range_start_block: i64::try_from(range.start).ok()?,
        range_end_block: i64::try_from(range.end).ok()?,
        anchor_block_number: anchor
            .as_ref()
            .and_then(|anchor| i64::try_from(anchor.height).ok()),
        anchor_block_hash: anchor.as_ref().and_then(|anchor| anchor.block_hash.clone()),
        anchor_parent_hash: anchor
            .as_ref()
            .and_then(|anchor| anchor.parent_hash.clone()),
        anchor_block_timestamp: anchor
            .as_ref()
            .and_then(|anchor| anchor.timestamp)
            .and_then(|timestamp| i64::try_from(timestamp).ok()),
    })
}

fn data_finality_value(finality: DataFinality) -> &'static str {
    match finality {
        DataFinality::Finalized => "finalized",
        DataFinality::Safe => "safe",
        DataFinality::Latest => "latest",
        DataFinality::Provisional => "provisional",
        DataFinality::Unknown => "unknown",
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
