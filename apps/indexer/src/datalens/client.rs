use std::{
    collections::HashMap,
    sync::{Arc, Condvar, Mutex, OnceLock, mpsc},
    time::{Duration, Instant},
};

use datalens_sdk::{Client as DatalensClient, Error as DatalensSdkError, HeadKind, RetryConfig};

use super::follow::{follow_durable, query_latest};
use log::{info, warn};

use crate::{
    DatalensConfig, DatalensError, DatalensLogQueryReader, DatalensProvisionalLogQueryReader,
    DatalensProvisionalLogQueryResult,
};

pub trait DatalensNativeReader {
    fn service_readiness(&self) -> Result<ServiceReadiness, DatalensError>;
}

pub trait DatalensDurableHeadReader {
    fn durable_head_height(&mut self, config: &DatalensConfig) -> Result<i64, DatalensError>;
    fn latest_head_height(&mut self, config: &DatalensConfig) -> Result<i64, DatalensError>;
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ServiceReadiness {
    pub native_graphql_ready: bool,
}

pub struct DatalensNativeClient {
    client: DatalensClient,
    retry_config: RetryConfig,
    query_gate: Option<DatalensQueryConcurrencyGate>,
    query_key: DatalensQueryConcurrencyKey,
    query_timeout: Duration,
    chain_name: String,
    blocking_query_guard: Arc<DatalensBlockingQueryGuard>,
    blocking_head_guard: Arc<DatalensBlockingQueryGuard>,
    provisional_cursors: Arc<Mutex<HashMap<String, datalens_sdk::ProvisionalCursor>>>,
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
    operation: &'static str,
}

impl DatalensBlockingQueryKey {
    fn from_config(config: &DatalensConfig, operation: &'static str) -> Self {
        Self {
            endpoint: config.endpoint.clone(),
            application: config.application.clone(),
            query_key: DatalensQueryConcurrencyKey::from_config(config),
            operation,
        }
    }
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct DatalensHeadCacheKey {
    endpoint: String,
    application: String,
    query_key: DatalensQueryConcurrencyKey,
    finality: &'static str,
}

impl DatalensHeadCacheKey {
    fn from_config(config: &DatalensConfig, finality: &'static str) -> Self {
        Self {
            endpoint: config.endpoint.clone(),
            application: config.application.clone(),
            query_key: DatalensQueryConcurrencyKey::from_config(config),
            finality,
        }
    }
}

#[derive(Default)]
struct DatalensHeadCacheState {
    cached: Option<DatalensHeadCacheValue>,
    in_flight: bool,
}

struct DatalensHeadCacheValue {
    height: i64,
    cached_at: Instant,
}

struct DatalensHeadCacheEntry {
    state: Mutex<DatalensHeadCacheState>,
    ready: Condvar,
}

impl DatalensHeadCacheEntry {
    fn new() -> Self {
        Self {
            state: Mutex::new(DatalensHeadCacheState::default()),
            ready: Condvar::new(),
        }
    }
}

enum DatalensHeadCacheAcquire {
    Cached(i64),
    Fetch,
    TimedOut,
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

const MAX_BLOCKING_SDK_WORKERS_PER_KEY: usize = 2;
const HEAD_HEIGHT_CACHE_TTL: Duration = Duration::from_secs(2);

struct DatalensBlockingQueryGuard {
    state: Mutex<DatalensBlockingQueryGuardState>,
}

struct DatalensBlockingQueryGuardState {
    active_workers: usize,
    max_workers: usize,
}

struct DatalensBlockingQueryPermit {
    guard: Arc<DatalensBlockingQueryGuard>,
}

impl DatalensBlockingQueryGuard {
    fn new() -> Self {
        Self {
            state: Mutex::new(DatalensBlockingQueryGuardState {
                active_workers: 0,
                max_workers: MAX_BLOCKING_SDK_WORKERS_PER_KEY,
            }),
        }
    }

    fn acquire(&self, operation: &str) -> Result<(), DatalensSdkError> {
        let mut state = self.state.lock().map_err(|_| {
            DatalensSdkError::Decode("Datalens blocking query guard lock poisoned".to_owned())
        })?;
        if state.active_workers >= state.max_workers {
            let message = if operation == "query" {
                format!(
                    "Datalens query timed out because {} previous SDK queries are still in flight",
                    state.active_workers
                )
            } else {
                format!(
                    "Datalens {operation} timed out because {} previous SDK {operation} workers are still in flight",
                    state.active_workers
                )
            };
            return Err(DatalensSdkError::Decode(message));
        }
        state.active_workers += 1;
        Ok(())
    }

    fn release(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.active_workers = state.active_workers.saturating_sub(1);
        }
    }

    fn set_max_workers(&self, max_workers: usize) {
        if let Ok(mut state) = self.state.lock() {
            state.max_workers = max_workers.max(1);
        }
    }
}

impl Drop for DatalensBlockingQueryPermit {
    fn drop(&mut self) {
        self.guard.release();
    }
}

enum DatalensQueryConcurrencyAcquire {
    Acquired(Option<DatalensQueryConcurrencyPermit>),
    TimedOut,
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
        self.acquire_with_deadline(key, None).map(|permit| {
            permit.expect("unbounded query concurrency gate acquire does not time out")
        })
    }

    fn acquire_timeout(
        &self,
        key: &DatalensQueryConcurrencyKey,
        timeout: Duration,
    ) -> Result<Option<DatalensQueryConcurrencyPermit>, DatalensError> {
        self.acquire_with_deadline(key, Some(timeout))
    }

    fn acquire_with_deadline(
        &self,
        key: &DatalensQueryConcurrencyKey,
        timeout: Option<Duration>,
    ) -> Result<Option<DatalensQueryConcurrencyPermit>, DatalensError> {
        let started_at = Instant::now();
        let mut state = self.inner.state.lock().map_err(|_| {
            DatalensError::Query("Datalens query concurrency gate lock poisoned".to_owned())
        })?;

        while self.is_limited(&state, key) {
            match timeout {
                Some(timeout) => {
                    let elapsed = started_at.elapsed();
                    if elapsed >= timeout {
                        return Ok(None);
                    }
                    let remaining = timeout.saturating_sub(elapsed);
                    let (next_state, wait_result) = self
                        .inner
                        .available
                        .wait_timeout(state, remaining)
                        .map_err(|_| {
                            DatalensError::Query(
                                "Datalens query concurrency gate lock poisoned".to_owned(),
                            )
                        })?;
                    state = next_state;
                    if wait_result.timed_out() && self.is_limited(&state, key) {
                        return Ok(None);
                    }
                }
                None => {
                    state = self.inner.available.wait(state).map_err(|_| {
                        DatalensError::Query(
                            "Datalens query concurrency gate lock poisoned".to_owned(),
                        )
                    })?;
                }
            }
        }

        state.global_in_flight += 1;
        let chain_in_flight = {
            let chain_in_flight = state.per_chain_in_flight.entry(key.clone()).or_default();
            *chain_in_flight += 1;
            *chain_in_flight
        };
        let global_in_flight = state.global_in_flight;

        Ok(Some(DatalensQueryConcurrencyPermit {
            gate: self.clone(),
            key: key.clone(),
            wait_duration: started_at.elapsed(),
            global_in_flight,
            chain_in_flight,
        }))
    }

    fn is_limited(
        &self,
        state: &DatalensQueryConcurrencyGateState,
        key: &DatalensQueryConcurrencyKey,
    ) -> bool {
        self.inner
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
    }

    fn blocking_query_worker_limit(&self) -> Option<usize> {
        self.inner
            .config
            .per_chain_max_in_flight
            .or(self.inner.config.global_max_in_flight)
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
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ProviderLimit => "provider_limit",
            Self::Transient => "transient",
            Self::Other => "other",
        }
    }
}

pub fn classify_datalens_query_error(error: &str) -> DatalensQueryErrorClass {
    let normalized = error.to_ascii_lowercase();
    if normalized.contains("provider_limit")
        || normalized.contains("narrow your filter")
        || normalized.contains("quota_exceeded")
    {
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
        || normalized.contains("still in flight")
        || normalized.contains("provider_failure")
        || normalized.contains("provider_error")
        || normalized.contains("budget_exhausted")
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
        || normalized.contains("http 403")
        || normalized.contains("transient provider")
    {
        return DatalensQueryErrorClass::Transient;
    }
    DatalensQueryErrorClass::Other
}

pub fn datalens_query_error_is_current_head_race(error: &str) -> bool {
    let normalized = error.to_ascii_lowercase();

    normalized.contains("invalid_input")
        && normalized.contains("block range extends beyond current head block")
}

impl DatalensNativeClient {
    pub fn from_config(config: &DatalensConfig) -> Result<Self, DatalensError> {
        Self::from_config_with_retry_config(config, RetryConfig::default())
    }

    pub fn from_config_with_retry_config(
        config: &DatalensConfig,
        retry_config: RetryConfig,
    ) -> Result<Self, DatalensError> {
        info!(
            "Datalens SDK retry/backoff configured max_attempts={} initial_backoff_ms={} max_backoff_ms={}",
            retry_config.max_attempts,
            retry_config.initial_backoff.as_millis(),
            retry_config.max_backoff.as_millis(),
        );
        let mut sdk_config = config.sdk_config();
        sdk_config.retry = retry_config.clone();
        let client = DatalensClient::new(sdk_config)
            .map_err(|error| DatalensError::SdkConfig(error.to_string()))?;
        Ok(Self {
            client,
            retry_config,
            query_gate: None,
            query_key: DatalensQueryConcurrencyKey::from_config(config),
            query_timeout: config.timeout,
            chain_name: config.chain.configured_name.clone(),
            blocking_query_guard: blocking_query_guard_for_config(config, "query")?,
            blocking_head_guard: blocking_query_guard_for_config(config, "head")?,
            provisional_cursors: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    pub fn with_query_concurrency_gate(mut self, gate: DatalensQueryConcurrencyGate) -> Self {
        if let Some(max_workers) = gate.blocking_query_worker_limit() {
            self.blocking_query_guard.set_max_workers(max_workers);
        }
        self.query_gate = Some(gate);
        self
    }

    fn query_with_deadline(
        &self,
        request: crate::DaoLogRequest,
    ) -> Result<crate::DatalensLogQueryResult, DatalensSdkError> {
        self.run_query_with_deadline("query", Instant::now(), move |client| {
            block_on_current_thread(follow_durable(&client, &request))
        })
    }

    fn query_provisional_with_deadline(
        &self,
        request: crate::DaoLogRequest,
    ) -> Result<DatalensProvisionalLogQueryResult, DatalensSdkError> {
        let cursors = Arc::clone(&self.provisional_cursors);
        self.run_query_with_deadline("provisional query", Instant::now(), move |client| {
            block_on_current_thread(query_latest(&client, &cursors, &request))
        })
    }

    fn run_query_with_deadline<F, R>(
        &self,
        operation: &'static str,
        started_at: Instant,
        run: F,
    ) -> Result<R, DatalensSdkError>
    where
        F: FnOnce(DatalensClient) -> Result<R, DatalensSdkError> + Send + 'static,
        R: Send + 'static,
    {
        let permit = match self.acquire_query_concurrency_permit(operation) {
            Ok(DatalensQueryConcurrencyAcquire::Acquired(permit)) => permit,
            Ok(DatalensQueryConcurrencyAcquire::TimedOut) => {
                let error = datalens_query_timeout_error(
                    operation,
                    self.query_timeout,
                    Some("waiting for query concurrency permit"),
                );
                self.warn_query_timeout(operation, &error);
                return Err(error);
            }
            Err(error) => {
                return Err(DatalensSdkError::Decode(error.to_string()));
            }
        };
        let Some(remaining_timeout) = self.query_timeout.checked_sub(started_at.elapsed()) else {
            let error = datalens_query_timeout_error(
                operation,
                self.query_timeout,
                Some("waiting for query concurrency permit"),
            );
            self.warn_query_timeout(operation, &error);
            return Err(error);
        };
        let blocking_guard = self.blocking_guard_for_operation(operation);
        if let Err(error) = blocking_guard.acquire(operation) {
            self.warn_query_timeout(operation, &error);
            return Err(error);
        }
        let blocking_query_permit = DatalensBlockingQueryPermit {
            guard: blocking_guard,
        };
        let (sender, receiver) = mpsc::sync_channel(1);
        let client = self.client.clone();
        let spawn_result = std::thread::Builder::new()
            .name(format!("degov-datalens-{operation}"))
            .spawn(move || {
                let _blocking_query_permit = blocking_query_permit;
                let _permit = permit;
                let result = run(client);
                let _ = sender.send(result);
            });

        if let Err(error) = spawn_result {
            return Err(DatalensSdkError::Decode(format!(
                "spawn Datalens {operation} worker: {error}"
            )));
        }

        match receiver.recv_timeout(remaining_timeout) {
            Ok(result) => result,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                let error = datalens_query_timeout_error(operation, self.query_timeout, None);
                self.warn_query_timeout(operation, &error);
                Err(error)
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => Err(DatalensSdkError::Decode(format!(
                "Datalens {operation} worker stopped before returning a response"
            ))),
        }
    }

    fn acquire_query_concurrency_permit(
        &self,
        operation: &str,
    ) -> Result<DatalensQueryConcurrencyAcquire, DatalensError> {
        if operation == "head" {
            return Ok(DatalensQueryConcurrencyAcquire::Acquired(None));
        }

        let Some(gate) = self.query_gate.as_ref() else {
            return Ok(DatalensQueryConcurrencyAcquire::Acquired(None));
        };

        let Some(permit) = gate.acquire_timeout(&self.query_key, self.query_timeout)? else {
            warn!(
                "Datalens process-local {operation} concurrency permit timed out chain_family={} chain_name={} chain_network_id={} timeout_ms={}",
                self.query_key.family,
                self.query_key.configured_name,
                self.query_key.log_network_id(),
                self.query_timeout.as_millis()
            );
            return Ok(DatalensQueryConcurrencyAcquire::TimedOut);
        };
        info!(
            "Datalens process-local {operation} concurrency permit acquired chain_family={} chain_name={} chain_network_id={} wait_ms={} process_in_flight={} chain_in_flight={}",
            self.query_key.family,
            self.query_key.configured_name,
            self.query_key.log_network_id(),
            permit.wait_duration.as_millis(),
            permit.global_in_flight,
            permit.chain_in_flight
        );
        Ok(DatalensQueryConcurrencyAcquire::Acquired(Some(permit)))
    }

    fn warn_query_timeout(&self, operation: &str, error: &DatalensSdkError) {
        warn!(
            "Datalens {operation} deadline fired chain_family={} chain_name={} chain_network_id={} timeout_ms={} error={}",
            self.query_key.family,
            self.query_key.configured_name,
            self.query_key.log_network_id(),
            self.query_timeout.as_millis(),
            error
        );
    }

    fn blocking_guard_for_operation(&self, operation: &str) -> Arc<DatalensBlockingQueryGuard> {
        if operation == "head" {
            self.blocking_head_guard.clone()
        } else {
            self.blocking_query_guard.clone()
        }
    }
}

fn blocking_query_guard_for_config(
    config: &DatalensConfig,
    operation: &'static str,
) -> Result<Arc<DatalensBlockingQueryGuard>, DatalensError> {
    static BLOCKING_QUERY_GUARDS: OnceLock<
        Mutex<HashMap<DatalensBlockingQueryKey, Arc<DatalensBlockingQueryGuard>>>,
    > = OnceLock::new();

    let key = DatalensBlockingQueryKey::from_config(config, operation);
    let guards = BLOCKING_QUERY_GUARDS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut guards = guards.lock().map_err(|_| {
        DatalensError::Query("Datalens blocking query guard lock poisoned".to_owned())
    })?;
    Ok(guards
        .entry(key)
        .or_insert_with(|| Arc::new(DatalensBlockingQueryGuard::new()))
        .clone())
}

fn head_cache_entry_for_config(
    config: &DatalensConfig,
    finality: &'static str,
) -> Result<Arc<DatalensHeadCacheEntry>, DatalensError> {
    static HEAD_CACHE_ENTRIES: OnceLock<
        Mutex<HashMap<DatalensHeadCacheKey, Arc<DatalensHeadCacheEntry>>>,
    > = OnceLock::new();

    let key = DatalensHeadCacheKey::from_config(config, finality);
    let entries = HEAD_CACHE_ENTRIES.get_or_init(|| Mutex::new(HashMap::new()));
    let mut entries = entries
        .lock()
        .map_err(|_| DatalensError::Query("Datalens head cache lock poisoned".to_owned()))?;
    Ok(entries
        .entry(key)
        .or_insert_with(|| Arc::new(DatalensHeadCacheEntry::new()))
        .clone())
}

fn acquire_head_cache(
    entry: &DatalensHeadCacheEntry,
    started_at: Instant,
    timeout: Duration,
) -> Result<DatalensHeadCacheAcquire, DatalensSdkError> {
    let mut state = entry
        .state
        .lock()
        .map_err(|_| DatalensSdkError::Decode("Datalens head cache lock poisoned".to_owned()))?;
    let mut waited_for_in_flight = false;

    loop {
        if let Some(cached) = state.cached.as_ref()
            && cached.cached_at.elapsed() <= HEAD_HEIGHT_CACHE_TTL
        {
            return Ok(DatalensHeadCacheAcquire::Cached(cached.height));
        }

        if !state.in_flight {
            if waited_for_in_flight {
                return Ok(DatalensHeadCacheAcquire::TimedOut);
            }
            state.in_flight = true;
            return Ok(DatalensHeadCacheAcquire::Fetch);
        }

        waited_for_in_flight = true;
        let Some(remaining) = timeout.checked_sub(started_at.elapsed()) else {
            return Ok(DatalensHeadCacheAcquire::TimedOut);
        };
        if remaining.is_zero() {
            return Ok(DatalensHeadCacheAcquire::TimedOut);
        }
        let (next_state, wait_result) =
            entry.ready.wait_timeout(state, remaining).map_err(|_| {
                DatalensSdkError::Decode("Datalens head cache lock poisoned".to_owned())
            })?;
        state = next_state;
        if wait_result.timed_out() {
            return Ok(DatalensHeadCacheAcquire::TimedOut);
        }
    }
}

fn finish_head_cache_fetch(entry: &DatalensHeadCacheEntry, height: Option<i64>) {
    if let Ok(mut state) = entry.state.lock() {
        if let Some(height) = height {
            state.cached = Some(DatalensHeadCacheValue {
                height,
                cached_at: Instant::now(),
            });
        }
        state.in_flight = false;
        entry.ready.notify_all();
    }
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
    DatalensSdkError::Decode(message)
}

fn block_on_current_thread<F, T>(future: F) -> Result<T, DatalensSdkError>
where
    F: std::future::Future<Output = Result<T, DatalensSdkError>>,
{
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| DatalensSdkError::Decode(error.to_string()))?;
    runtime.block_on(future)
}

impl DatalensNativeReader for DatalensNativeClient {
    fn service_readiness(&self) -> Result<ServiceReadiness, DatalensError> {
        self.head_height_uncached(&self.chain_name, HeadKind::Safe)
            .map(|_| ServiceReadiness {
                native_graphql_ready: true,
            })
            .map_err(|error| DatalensError::Readiness(error.to_string()))
    }
}

impl DatalensLogQueryReader for DatalensNativeClient {
    fn query_logs(
        &mut self,
        request: &crate::DaoLogRequest,
    ) -> Result<crate::DatalensLogQueryResult, DatalensError> {
        self.query_with_deadline(request.clone())
            .map_err(|error| query_error(self, "query", error))
    }
}

impl DatalensProvisionalLogQueryReader for DatalensNativeClient {
    fn query_provisional_logs(
        &mut self,
        request: &crate::DaoLogRequest,
    ) -> Result<DatalensProvisionalLogQueryResult, DatalensError> {
        self.query_provisional_with_deadline(request.clone())
            .map_err(|error| query_error(self, "provisional query", error))
    }
}

fn query_error(
    client: &DatalensNativeClient,
    operation: &str,
    error: DatalensSdkError,
) -> DatalensError {
    let error_message = error.to_string();
    if datalens_query_error_is_current_head_race(&error_message) {
        info!(
            "Datalens {operation} skipped current head race error_class={} max_attempts={} error={}",
            classify_datalens_query_error(&error_message).as_str(),
            client.retry_config.max_attempts,
            error_message
        );
    } else {
        warn!(
            "Datalens {operation} failed error_class={} max_attempts={} error={}",
            classify_datalens_query_error(&error_message).as_str(),
            client.retry_config.max_attempts,
            error_message
        );
    }
    DatalensError::Query(error_message)
}

impl DatalensDurableHeadReader for DatalensNativeClient {
    fn durable_head_height(&mut self, config: &DatalensConfig) -> Result<i64, DatalensError> {
        self.head_height(config, "safe", HeadKind::Safe)
    }

    fn latest_head_height(&mut self, config: &DatalensConfig) -> Result<i64, DatalensError> {
        self.head_height(config, "latest", HeadKind::Latest)
    }
}

impl DatalensNativeClient {
    fn head_height_uncached(
        &self,
        chain_name: &str,
        kind: HeadKind,
    ) -> Result<u64, DatalensSdkError> {
        let chain_name = chain_name.to_owned();
        self.run_query_with_deadline("head", Instant::now(), move |client| {
            block_on_current_thread(async move {
                let chain = datalens_sdk::ChainName::new(chain_name)
                    .map_err(|error| DatalensSdkError::Decode(error.to_string()))?;
                let heads = client.heads(&chain).await?;
                Ok(kind.of(&heads))
            })
        })
    }

    fn head_height(
        &mut self,
        config: &DatalensConfig,
        finality: &'static str,
        kind: HeadKind,
    ) -> Result<i64, DatalensError> {
        let started_at = Instant::now();
        let cache_entry = head_cache_entry_for_config(config, finality)?;
        match acquire_head_cache(&cache_entry, started_at, self.query_timeout)
            .map_err(|error| DatalensError::Query(error.to_string()))?
        {
            DatalensHeadCacheAcquire::Cached(height) => return Ok(height),
            DatalensHeadCacheAcquire::Fetch => {}
            DatalensHeadCacheAcquire::TimedOut => {
                let error = datalens_query_timeout_error(
                    "head",
                    self.query_timeout,
                    Some("waiting for head cache fill"),
                );
                self.warn_query_timeout("head", &error);
                return Err(DatalensError::Query(error.to_string()));
            }
        }

        let chain_name = config.chain.configured_name.clone();
        let response = self
            .run_query_with_deadline("head", started_at, move |client| {
                block_on_current_thread(async move {
                    let chain = datalens_sdk::ChainName::new(chain_name)
                        .map_err(|error| DatalensSdkError::Decode(error.to_string()))?;
                    client.heads(&chain).await
                })
            })
            .map_err(|error| {
                finish_head_cache_fetch(&cache_entry, None);
                DatalensError::Query(error.to_string())
            })?;

        let height_u64 = kind.of(&response);
        let height = i64::try_from(height_u64).map_err(|_| {
            finish_head_cache_fetch(&cache_entry, None);
            DatalensError::Query(format!(
                "Datalens chain head height {height_u64} exceeds supported indexer height"
            ))
        })?;
        finish_head_cache_fetch(&cache_entry, Some(height));
        Ok(height)
    }
}

pub fn verify_datalens_service(
    reader: &impl DatalensNativeReader,
) -> Result<ServiceReadiness, DatalensError> {
    let readiness = reader.service_readiness()?;
    if !readiness.native_graphql_ready {
        return Err(DatalensError::Readiness(
            "Datalens heads readiness was not confirmed".to_owned(),
        ));
    }
    Ok(readiness)
}
