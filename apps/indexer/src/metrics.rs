use std::{
    collections::BTreeMap,
    fmt::Display,
    future::Future,
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use axum::{
    Router,
    extract::State,
    http::{HeaderValue, header},
    response::{IntoResponse, Response},
    routing::get,
};
use sqlx::{PgPool, Row};
use thiserror::Error;
use tokio::{sync::RwLock, task::JoinHandle, time};

use crate::{IndexerCheckpointIdentity, MetricsRuntimeConfig, runner::IndexerRunnerProgress};
use crate::{OnchainRefreshRunReport, OnchainRefreshTaskScope};

#[derive(Clone, Debug, Default, PartialEq)]
pub struct IndexerMetricsSnapshot {
    pub sync_rows: Vec<IndexerSyncMetricsRow>,
    pub onchain_backlog_rows: Vec<OnchainRefreshBacklogMetricsRow>,
    pub deferred_onchain_backlog_rows: Vec<OnchainRefreshBacklogMetricsRow>,
    pub chunk_runtime_rows: Vec<IndexerChunkRuntimeMetricsRow>,
    pub onchain_worker_rows: Vec<OnchainRefreshWorkerMetricsRow>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct MetricsCacheStatus {
    pub db_collection_enabled: bool,
    pub last_success_timestamp_seconds: Option<f64>,
    pub snapshot_age_seconds: Option<f64>,
    pub last_refresh_duration_seconds: Option<f64>,
    pub last_refresh_success: bool,
    pub refresh_errors_total: u64,
    pub stale: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct IndexerSyncMetricsRow {
    pub dao_code: String,
    pub chain_id: i32,
    pub contract_set_id: String,
    pub processed_height: Option<i64>,
    pub target_height: Option<i64>,
    pub provisional_height: Option<i64>,
    pub latest_height: Option<i64>,
    pub synced_percentage: Option<f64>,
    pub updated_timestamp_seconds: Option<f64>,
    pub last_error_present: bool,
    pub current_rate_blocks_per_second: Option<f64>,
    pub eta_seconds: Option<f64>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct OnchainRefreshBacklogMetricsRow {
    pub dao_code: String,
    pub chain_id: i32,
    pub contract_set_id: String,
    pub status: String,
    pub tasks: i64,
    pub ready_tasks: i64,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct IndexerChunkRuntimeMetricsRow {
    pub dao_code: String,
    pub chain_id: i32,
    pub contract_set_id: String,
    pub chunks_total: u64,
    pub datalens_requests_total: u64,
    pub cache_full_hit_total: u64,
    pub cache_partial_hit_total: u64,
    pub cache_miss_total: u64,
    pub cache_provider_fill_total: u64,
    pub chunk_duration_seconds_sum: f64,
    pub chunk_duration_seconds_count: u64,
    pub last_chunk_size: Option<u32>,
    pub current_chunk_size: Option<u32>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct IndexerChunkMetricsObservation {
    pub datalens_request_count: usize,
    pub cache_full_hit_count: usize,
    pub cache_partial_hit_count: usize,
    pub cache_miss_count: usize,
    pub cache_provider_fill_count: usize,
    pub chunk_duration_seconds: f64,
    pub last_chunk_size: u32,
    pub current_chunk_size: u32,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct OnchainRefreshWorkerMetricsRow {
    pub scope: String,
    pub dao_code: String,
    pub chain_id: String,
    pub contract_set_id: String,
    pub claimed_total: u64,
    pub completed_total: u64,
    pub failed_total: u64,
    pub skipped_total: u64,
    pub cache_hits_total: u64,
    pub data_metric_refreshes_total: u64,
    pub duration_seconds_sum: f64,
    pub duration_seconds_count: u64,
    pub last_backlog: Option<u64>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IndexerLatestHeadRecord {
    pub dao_code: String,
    pub chain_id: i32,
    pub contract_set_id: String,
    pub stream_id: String,
    pub data_source_version: String,
    pub latest_height: i64,
}

#[derive(Clone, Debug, Eq, PartialEq, Ord, PartialOrd)]
struct MetricsScopeKey {
    dao_code: String,
    chain_id: i32,
    contract_set_id: String,
}

#[derive(Clone, Debug, Default)]
struct RuntimeMetricsState {
    sync_rows: BTreeMap<MetricsScopeKey, RuntimeSyncMetricsRow>,
    chunk_rows: BTreeMap<MetricsScopeKey, IndexerChunkRuntimeMetricsRow>,
    onchain_worker_rows: BTreeMap<OnchainWorkerMetricsScopeKey, OnchainRefreshWorkerMetricsRow>,
}

#[derive(Clone, Debug, Default)]
struct RuntimeSyncMetricsRow {
    current_rate_blocks_per_second: Option<f64>,
    eta_seconds: Option<f64>,
}

#[derive(Clone, Debug, Eq, PartialEq, Ord, PartialOrd)]
struct OnchainWorkerMetricsScopeKey {
    scope: String,
    dao_code: String,
    chain_id: String,
    contract_set_id: String,
}

static RUNTIME_METRICS: OnceLock<Mutex<RuntimeMetricsState>> = OnceLock::new();

#[derive(Clone, Debug)]
pub struct MetricsSnapshotCache {
    state: Arc<RwLock<MetricsSnapshotCacheState>>,
    db_collection_enabled: bool,
    stale_after: Duration,
}

#[derive(Clone, Debug, Default)]
struct MetricsSnapshotCacheState {
    db_snapshot: IndexerMetricsSnapshot,
    last_success_at: Option<Instant>,
    last_success_timestamp_seconds: Option<f64>,
    last_refresh_duration_seconds: Option<f64>,
    last_refresh_success: bool,
    refresh_errors_total: u64,
    last_error: Option<String>,
}

#[derive(Clone)]
struct MetricsServerState {
    pool: PgPool,
    cache: MetricsSnapshotCache,
    refresh_interval: Duration,
    refresh_timeout: Duration,
}

#[derive(Debug, Error)]
pub enum MetricsError {
    #[error("query indexer metrics")]
    Sqlx(#[from] sqlx::Error),
    #[error("bind DeGov indexer metrics endpoint")]
    Bind(#[source] std::io::Error),
}

pub async fn collect_prometheus_metrics(pool: &PgPool) -> Result<String, MetricsError> {
    let snapshot = collect_indexer_metrics_snapshot(pool).await?;
    Ok(render_prometheus_metrics(&snapshot))
}

impl MetricsSnapshotCache {
    pub fn new(db_collection_enabled: bool, stale_after: Duration) -> Self {
        Self {
            state: Arc::new(RwLock::new(MetricsSnapshotCacheState::default())),
            db_collection_enabled,
            stale_after,
        }
    }

    pub async fn refresh_with<F, Fut, E>(&self, collect: F)
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = Result<IndexerMetricsSnapshot, E>>,
        E: Display,
    {
        if !self.db_collection_enabled {
            return;
        }

        let started_at = Instant::now();
        match collect().await {
            Ok(mut snapshot) => {
                snapshot.chunk_runtime_rows.clear();
                snapshot.onchain_worker_rows.clear();
                let mut state = self.state.write().await;
                state.db_snapshot = snapshot;
                state.last_success_at = Some(Instant::now());
                state.last_success_timestamp_seconds = Some(unix_timestamp_seconds());
                state.last_refresh_duration_seconds = Some(started_at.elapsed().as_secs_f64());
                state.last_refresh_success = true;
                state.last_error = None;
            }
            Err(error) => {
                let mut state = self.state.write().await;
                state.last_refresh_duration_seconds = Some(started_at.elapsed().as_secs_f64());
                state.last_refresh_success = false;
                state.refresh_errors_total = state.refresh_errors_total.saturating_add(1);
                state.last_error = Some(error.to_string());
            }
        }
    }

    pub async fn snapshot(&self) -> (IndexerMetricsSnapshot, MetricsCacheStatus) {
        let state = self.state.read().await;
        let mut snapshot = state.db_snapshot.clone();
        let snapshot_age_seconds = state
            .last_success_at
            .map(|last_success_at| last_success_at.elapsed().as_secs_f64());
        let stale = self.db_collection_enabled
            && snapshot_age_seconds
                .map(|age| age > self.stale_after.as_secs_f64())
                .unwrap_or(true);
        let status = MetricsCacheStatus {
            db_collection_enabled: self.db_collection_enabled,
            last_success_timestamp_seconds: state.last_success_timestamp_seconds,
            snapshot_age_seconds,
            last_refresh_duration_seconds: state.last_refresh_duration_seconds,
            last_refresh_success: state.last_refresh_success,
            refresh_errors_total: state.refresh_errors_total,
            stale,
        };
        drop(state);

        snapshot.chunk_runtime_rows = collect_runtime_metrics(&mut snapshot.sync_rows);
        snapshot.onchain_worker_rows = collect_onchain_worker_runtime_metrics();
        (snapshot, status)
    }
}

pub async fn record_indexer_latest_head(
    pool: &PgPool,
    record: &IndexerLatestHeadRecord,
) -> Result<(), MetricsError> {
    sqlx::query(
        r#"
        INSERT INTO degov_indexer_latest_head (
          dao_code,
          chain_id,
          contract_set_id,
          stream_id,
          data_source_version,
          latest_height,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::NUMERIC(78, 0), now())
        ON CONFLICT (dao_code, chain_id, contract_set_id, stream_id, data_source_version)
        DO UPDATE SET
          latest_height = GREATEST(
            degov_indexer_latest_head.latest_height,
            EXCLUDED.latest_height
          ),
          updated_at = now()
        "#,
    )
    .bind(&record.dao_code)
    .bind(record.chain_id)
    .bind(&record.contract_set_id)
    .bind(&record.stream_id)
    .bind(&record.data_source_version)
    .bind(record.latest_height)
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn spawn_metrics_server(
    pool: PgPool,
    config: MetricsRuntimeConfig,
) -> Result<Option<JoinHandle<()>>, MetricsError> {
    if !config.enabled {
        return Ok(None);
    }

    let listener = tokio::net::TcpListener::bind(config.bind_address)
        .await
        .map_err(MetricsError::Bind)?;

    let state = MetricsServerState {
        pool,
        cache: MetricsSnapshotCache::new(config.db_collection_enabled, config.refresh_interval * 3),
        refresh_interval: config.refresh_interval,
        refresh_timeout: config.refresh_timeout,
    };
    if state.cache.db_collection_enabled {
        spawn_metrics_refresh_loop(state.clone());
    }

    let app = build_metrics_router(state);
    let bind_address = config.bind_address;
    log::info!("DeGov indexer metrics service listening bind_address={bind_address}");

    let handle = tokio::spawn(async move {
        if let Err(error) = axum::serve(listener, app).await {
            log::error!("DeGov indexer metrics service stopped with error: {error}");
        }
    });

    Ok(Some(handle))
}

fn build_metrics_router(state: MetricsServerState) -> Router {
    Router::new()
        .route("/metrics", get(metrics_handler))
        .with_state(state)
}

fn spawn_metrics_refresh_loop(state: MetricsServerState) {
    tokio::spawn(async move {
        refresh_metrics_cache(&state).await;
        loop {
            time::sleep(state.refresh_interval).await;
            refresh_metrics_cache(&state).await;
        }
    });
}

async fn refresh_metrics_cache(state: &MetricsServerState) {
    let pool = state.pool.clone();
    let timeout = state.refresh_timeout;
    state
        .cache
        .refresh_with(|| async move {
            match time::timeout(timeout, collect_db_metrics_snapshot(&pool)).await {
                Ok(result) => result.map_err(|error| error.to_string()),
                Err(_) => Err(format!(
                    "collect DeGov indexer metrics exceeded {}s timeout",
                    timeout.as_secs_f64()
                )),
            }
        })
        .await;
}

pub async fn collect_indexer_metrics_snapshot(
    pool: &PgPool,
) -> Result<IndexerMetricsSnapshot, MetricsError> {
    let mut snapshot = collect_db_metrics_snapshot(pool).await?;
    snapshot.chunk_runtime_rows = collect_runtime_metrics(&mut snapshot.sync_rows);
    snapshot.onchain_worker_rows = collect_onchain_worker_runtime_metrics();

    Ok(snapshot)
}

async fn collect_db_metrics_snapshot(
    pool: &PgPool,
) -> Result<IndexerMetricsSnapshot, MetricsError> {
    let sync_rows = collect_sync_metrics(pool).await?;
    let onchain_backlog_rows = collect_onchain_refresh_backlog_metrics(pool).await?;
    let deferred_onchain_backlog_rows =
        collect_deferred_onchain_refresh_backlog_metrics(pool).await?;

    Ok(IndexerMetricsSnapshot {
        sync_rows,
        onchain_backlog_rows,
        deferred_onchain_backlog_rows,
        ..Default::default()
    })
}

pub fn record_indexer_chunk_metrics(
    identity: &IndexerCheckpointIdentity,
    progress: &IndexerRunnerProgress,
    observation: IndexerChunkMetricsObservation,
) {
    let key = MetricsScopeKey {
        dao_code: identity.dao_code.clone(),
        chain_id: identity.chain_id,
        contract_set_id: identity.contract_set_id.clone(),
    };
    let mut state = runtime_metrics_state()
        .lock()
        .expect("runtime metrics mutex is not poisoned");
    state.sync_rows.insert(
        key.clone(),
        RuntimeSyncMetricsRow {
            current_rate_blocks_per_second: progress.current_rate_blocks_per_second,
            eta_seconds: progress.eta_seconds,
        },
    );
    let row =
        state
            .chunk_rows
            .entry(key.clone())
            .or_insert_with(|| IndexerChunkRuntimeMetricsRow {
                dao_code: key.dao_code.clone(),
                chain_id: key.chain_id,
                contract_set_id: key.contract_set_id.clone(),
                ..Default::default()
            });
    row.chunks_total = row.chunks_total.saturating_add(1);
    row.datalens_requests_total = row
        .datalens_requests_total
        .saturating_add(observation.datalens_request_count as u64);
    row.cache_full_hit_total = row
        .cache_full_hit_total
        .saturating_add(observation.cache_full_hit_count as u64);
    row.cache_partial_hit_total = row
        .cache_partial_hit_total
        .saturating_add(observation.cache_partial_hit_count as u64);
    row.cache_miss_total = row
        .cache_miss_total
        .saturating_add(observation.cache_miss_count as u64);
    row.cache_provider_fill_total = row
        .cache_provider_fill_total
        .saturating_add(observation.cache_provider_fill_count as u64);
    row.chunk_duration_seconds_sum += observation.chunk_duration_seconds;
    row.chunk_duration_seconds_count = row.chunk_duration_seconds_count.saturating_add(1);
    row.last_chunk_size = Some(observation.last_chunk_size);
    row.current_chunk_size = Some(observation.current_chunk_size);
}

pub fn record_onchain_refresh_worker_report(
    scope: Option<&OnchainRefreshTaskScope>,
    report: &OnchainRefreshRunReport,
) {
    let key = match scope {
        Some(scope) => OnchainWorkerMetricsScopeKey {
            scope: "contract_set".to_owned(),
            dao_code: scope.dao_code.clone(),
            chain_id: scope.chain_id.to_string(),
            contract_set_id: scope.contract_set_id.clone(),
        },
        None => OnchainWorkerMetricsScopeKey {
            scope: "global".to_owned(),
            dao_code: "global".to_owned(),
            chain_id: "global".to_owned(),
            contract_set_id: "global".to_owned(),
        },
    };

    let mut state = runtime_metrics_state()
        .lock()
        .expect("runtime metrics mutex is not poisoned");
    let row = state
        .onchain_worker_rows
        .entry(key.clone())
        .or_insert_with(|| OnchainRefreshWorkerMetricsRow {
            scope: key.scope.clone(),
            dao_code: key.dao_code.clone(),
            chain_id: key.chain_id.clone(),
            contract_set_id: key.contract_set_id.clone(),
            ..Default::default()
        });
    row.claimed_total = row.claimed_total.saturating_add(report.claimed as u64);
    row.completed_total = row.completed_total.saturating_add(report.completed as u64);
    row.failed_total = row.failed_total.saturating_add(report.failed as u64);
    row.skipped_total = row
        .skipped_total
        .saturating_add(report.skipped_tasks as u64);
    row.cache_hits_total = row
        .cache_hits_total
        .saturating_add(report.cache_hits as u64);
    row.data_metric_refreshes_total = row
        .data_metric_refreshes_total
        .saturating_add(report.data_metric_refreshes as u64);
    row.duration_seconds_sum += report.duration_ms as f64 / 1000.0;
    row.duration_seconds_count = row.duration_seconds_count.saturating_add(1);
    row.last_backlog = report.backlog;
}

async fn metrics_handler(State(state): State<MetricsServerState>) -> Response {
    let (snapshot, status) = state.cache.snapshot().await;
    let body = render_prometheus_metrics_with_status(&snapshot, &status);
    (
        [(
            header::CONTENT_TYPE,
            HeaderValue::from_static("text/plain; version=0.0.4; charset=utf-8"),
        )],
        body,
    )
        .into_response()
}

pub fn render_prometheus_metrics(snapshot: &IndexerMetricsSnapshot) -> String {
    render_prometheus_metrics_with_status(snapshot, &MetricsCacheStatus::default_for_legacy())
}

pub fn render_prometheus_metrics_with_status(
    snapshot: &IndexerMetricsSnapshot,
    status: &MetricsCacheStatus,
) -> String {
    let mut output = String::new();

    metric_header(
        &mut output,
        "degov_metrics_db_collection_enabled",
        "Whether this metrics endpoint collects DB-backed DeGov indexer metrics.",
        "gauge",
    );
    metric_header(
        &mut output,
        "degov_metrics_snapshot_last_success_timestamp_seconds",
        "Unix timestamp of the last successful DB-backed metrics snapshot refresh.",
        "gauge",
    );
    metric_header(
        &mut output,
        "degov_metrics_snapshot_age_seconds",
        "Seconds since the last successful DB-backed metrics snapshot refresh.",
        "gauge",
    );
    metric_header(
        &mut output,
        "degov_metrics_refresh_duration_seconds",
        "Duration of the most recent DB-backed metrics snapshot refresh.",
        "gauge",
    );
    metric_header(
        &mut output,
        "degov_metrics_refresh_success",
        "Whether the most recent DB-backed metrics snapshot refresh succeeded.",
        "gauge",
    );
    metric_header(
        &mut output,
        "degov_metrics_refresh_errors_total",
        "Failed DB-backed metrics snapshot refresh attempts.",
        "counter",
    );
    metric_header(
        &mut output,
        "degov_metrics_snapshot_stale",
        "Whether the DB-backed metrics snapshot is older than the configured freshness threshold.",
        "gauge",
    );
    metric_header(
        &mut output,
        "degov_indexer_processed_height",
        "Durable processed block height for a DeGov indexer contract set.",
        "gauge",
    );
    metric_header(
        &mut output,
        "degov_indexer_target_height",
        "Durable target block height for a DeGov indexer contract set.",
        "gauge",
    );
    metric_header(
        &mut output,
        "degov_indexer_provisional_height",
        "Highest fully covered provisional block height for a DeGov indexer contract set.",
        "gauge",
    );
    metric_header(
        &mut output,
        "degov_indexer_latest_height",
        "Latest observed Datalens head block height for a DeGov indexer contract set.",
        "gauge",
    );
    metric_header(
        &mut output,
        "degov_indexer_remaining_blocks",
        "Durable target blocks remaining for a DeGov indexer contract set.",
        "gauge",
    );
    metric_header(
        &mut output,
        "degov_indexer_latest_lag_blocks",
        "Blocks between the latest observed head and durable processed height.",
        "gauge",
    );
    metric_header(
        &mut output,
        "degov_indexer_synced_percent",
        "Durable sync percentage for a DeGov indexer contract set.",
        "gauge",
    );
    metric_header(
        &mut output,
        "degov_indexer_checkpoint_updated_timestamp_seconds",
        "Unix timestamp of the last durable checkpoint update.",
        "gauge",
    );
    metric_header(
        &mut output,
        "degov_indexer_last_error_present",
        "Whether the durable checkpoint has a last_error value.",
        "gauge",
    );
    metric_header(
        &mut output,
        "degov_indexer_current_rate_blocks_per_second",
        "Current durable sync speed in blocks per second.",
        "gauge",
    );
    metric_header(
        &mut output,
        "degov_indexer_eta_seconds",
        "Estimated seconds until durable target height is reached.",
        "gauge",
    );
    metric_header(
        &mut output,
        "degov_onchain_refresh_tasks",
        "Onchain refresh task count by status.",
        "gauge",
    );
    metric_header(
        &mut output,
        "degov_onchain_refresh_ready_tasks",
        "Onchain refresh task count ready to be claimed by status.",
        "gauge",
    );
    metric_header(
        &mut output,
        "degov_onchain_refresh_deferred_candidates",
        "Deferred onchain refresh candidate count.",
        "gauge",
    );
    metric_header(
        &mut output,
        "degov_onchain_refresh_ready_deferred_candidates",
        "Deferred onchain refresh candidate count ready to drain.",
        "gauge",
    );
    metric_header(
        &mut output,
        "degov_indexer_chunks_total",
        "Completed Datalens indexer chunks.",
        "counter",
    );
    metric_header(
        &mut output,
        "degov_indexer_datalens_requests_total",
        "Datalens requests issued while processing completed chunks.",
        "counter",
    );
    metric_header(
        &mut output,
        "degov_indexer_datalens_cache_ranges_total",
        "Datalens cache range outcomes observed while processing chunks.",
        "counter",
    );
    metric_header(
        &mut output,
        "degov_indexer_chunk_duration_seconds",
        "Completed Datalens indexer chunk duration summary.",
        "summary",
    );
    metric_header(
        &mut output,
        "degov_indexer_last_chunk_size",
        "Last requested durable chunk size.",
        "gauge",
    );
    metric_header(
        &mut output,
        "degov_indexer_current_chunk_size",
        "Current adaptive durable chunk size after the last completed chunk.",
        "gauge",
    );
    metric_header(
        &mut output,
        "degov_onchain_refresh_worker_tasks_total",
        "Onchain refresh worker task outcomes.",
        "counter",
    );
    metric_header(
        &mut output,
        "degov_onchain_refresh_worker_cache_hits_total",
        "Onchain refresh worker chain read cache hits.",
        "counter",
    );
    metric_header(
        &mut output,
        "degov_onchain_refresh_worker_data_metric_refreshes_total",
        "Onchain refresh worker data metric refreshes.",
        "counter",
    );
    metric_header(
        &mut output,
        "degov_onchain_refresh_worker_batch_duration_seconds",
        "Onchain refresh worker batch duration summary.",
        "summary",
    );
    metric_header(
        &mut output,
        "degov_onchain_refresh_worker_last_backlog",
        "Last observed onchain refresh worker backlog.",
        "gauge",
    );

    append_metric(
        &mut output,
        "degov_metrics_db_collection_enabled",
        &[],
        i64::from(status.db_collection_enabled),
    );
    append_optional_metric(
        &mut output,
        "degov_metrics_snapshot_last_success_timestamp_seconds",
        &[],
        status.last_success_timestamp_seconds,
    );
    append_optional_metric(
        &mut output,
        "degov_metrics_snapshot_age_seconds",
        &[],
        status.snapshot_age_seconds,
    );
    append_optional_metric(
        &mut output,
        "degov_metrics_refresh_duration_seconds",
        &[],
        status.last_refresh_duration_seconds,
    );
    append_metric(
        &mut output,
        "degov_metrics_refresh_success",
        &[],
        i64::from(status.last_refresh_success),
    );
    append_metric(
        &mut output,
        "degov_metrics_refresh_errors_total",
        &[],
        status.refresh_errors_total,
    );
    append_metric(
        &mut output,
        "degov_metrics_snapshot_stale",
        &[],
        i64::from(status.stale),
    );

    for row in &snapshot.sync_rows {
        let labels = sync_labels(row);
        append_optional_metric(
            &mut output,
            "degov_indexer_processed_height",
            &labels,
            row.processed_height,
        );
        append_optional_metric(
            &mut output,
            "degov_indexer_target_height",
            &labels,
            row.target_height,
        );
        append_optional_metric(
            &mut output,
            "degov_indexer_provisional_height",
            &labels,
            row.provisional_height,
        );
        append_optional_metric(
            &mut output,
            "degov_indexer_latest_height",
            &labels,
            row.latest_height,
        );
        if let (Some(target_height), Some(processed_height)) =
            (row.target_height, row.processed_height)
        {
            append_metric(
                &mut output,
                "degov_indexer_remaining_blocks",
                &labels,
                target_height.saturating_sub(processed_height),
            );
        }
        if let (Some(latest_height), Some(processed_height)) =
            (row.latest_height, row.processed_height)
        {
            append_metric(
                &mut output,
                "degov_indexer_latest_lag_blocks",
                &labels,
                latest_height.saturating_sub(processed_height),
            );
        }
        append_optional_metric(
            &mut output,
            "degov_indexer_synced_percent",
            &labels,
            row.synced_percentage,
        );
        append_optional_metric(
            &mut output,
            "degov_indexer_checkpoint_updated_timestamp_seconds",
            &labels,
            row.updated_timestamp_seconds,
        );
        append_metric(
            &mut output,
            "degov_indexer_last_error_present",
            &labels,
            i64::from(row.last_error_present),
        );
        append_optional_metric(
            &mut output,
            "degov_indexer_current_rate_blocks_per_second",
            &labels,
            row.current_rate_blocks_per_second,
        );
        append_optional_metric(
            &mut output,
            "degov_indexer_eta_seconds",
            &labels,
            row.eta_seconds,
        );
    }

    for row in &snapshot.onchain_backlog_rows {
        let labels = onchain_labels(row);
        append_metric(
            &mut output,
            "degov_onchain_refresh_tasks",
            &labels,
            row.tasks,
        );
        append_metric(
            &mut output,
            "degov_onchain_refresh_ready_tasks",
            &labels,
            row.ready_tasks,
        );
    }

    for row in &snapshot.deferred_onchain_backlog_rows {
        let labels = onchain_labels(row);
        append_metric(
            &mut output,
            "degov_onchain_refresh_deferred_candidates",
            &labels,
            row.tasks,
        );
        append_metric(
            &mut output,
            "degov_onchain_refresh_ready_deferred_candidates",
            &labels,
            row.ready_tasks,
        );
    }

    for row in &snapshot.chunk_runtime_rows {
        let labels = chunk_labels(row);
        append_metric(
            &mut output,
            "degov_indexer_chunks_total",
            &labels,
            row.chunks_total,
        );
        append_metric(
            &mut output,
            "degov_indexer_datalens_requests_total",
            &labels,
            row.datalens_requests_total,
        );
        append_metric(
            &mut output,
            "degov_indexer_datalens_cache_ranges_total",
            &cache_labels(row, "full_hit"),
            row.cache_full_hit_total,
        );
        append_metric(
            &mut output,
            "degov_indexer_datalens_cache_ranges_total",
            &cache_labels(row, "partial_hit"),
            row.cache_partial_hit_total,
        );
        append_metric(
            &mut output,
            "degov_indexer_datalens_cache_ranges_total",
            &cache_labels(row, "miss"),
            row.cache_miss_total,
        );
        append_metric(
            &mut output,
            "degov_indexer_datalens_cache_ranges_total",
            &cache_labels(row, "provider_fill"),
            row.cache_provider_fill_total,
        );
        append_metric(
            &mut output,
            "degov_indexer_chunk_duration_seconds_sum",
            &labels,
            row.chunk_duration_seconds_sum,
        );
        append_metric(
            &mut output,
            "degov_indexer_chunk_duration_seconds_count",
            &labels,
            row.chunk_duration_seconds_count,
        );
        append_optional_metric(
            &mut output,
            "degov_indexer_last_chunk_size",
            &labels,
            row.last_chunk_size,
        );
        append_optional_metric(
            &mut output,
            "degov_indexer_current_chunk_size",
            &labels,
            row.current_chunk_size,
        );
    }

    for row in &snapshot.onchain_worker_rows {
        append_metric(
            &mut output,
            "degov_onchain_refresh_worker_tasks_total",
            &worker_result_labels(row, "claimed"),
            row.claimed_total,
        );
        append_metric(
            &mut output,
            "degov_onchain_refresh_worker_tasks_total",
            &worker_result_labels(row, "completed"),
            row.completed_total,
        );
        append_metric(
            &mut output,
            "degov_onchain_refresh_worker_tasks_total",
            &worker_result_labels(row, "failed"),
            row.failed_total,
        );
        append_metric(
            &mut output,
            "degov_onchain_refresh_worker_tasks_total",
            &worker_result_labels(row, "skipped"),
            row.skipped_total,
        );
        append_metric(
            &mut output,
            "degov_onchain_refresh_worker_cache_hits_total",
            &worker_labels(row),
            row.cache_hits_total,
        );
        append_metric(
            &mut output,
            "degov_onchain_refresh_worker_data_metric_refreshes_total",
            &worker_labels(row),
            row.data_metric_refreshes_total,
        );
        append_metric(
            &mut output,
            "degov_onchain_refresh_worker_batch_duration_seconds_sum",
            &worker_labels(row),
            row.duration_seconds_sum,
        );
        append_metric(
            &mut output,
            "degov_onchain_refresh_worker_batch_duration_seconds_count",
            &worker_labels(row),
            row.duration_seconds_count,
        );
        append_optional_metric(
            &mut output,
            "degov_onchain_refresh_worker_last_backlog",
            &worker_labels(row),
            row.last_backlog,
        );
    }

    output
}

impl MetricsCacheStatus {
    fn default_for_legacy() -> Self {
        Self {
            db_collection_enabled: true,
            last_success_timestamp_seconds: None,
            snapshot_age_seconds: None,
            last_refresh_duration_seconds: None,
            last_refresh_success: true,
            refresh_errors_total: 0,
            stale: false,
        }
    }
}

fn unix_timestamp_seconds() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64()
}

fn collect_runtime_metrics(
    sync_rows: &mut [IndexerSyncMetricsRow],
) -> Vec<IndexerChunkRuntimeMetricsRow> {
    let state = runtime_metrics_state()
        .lock()
        .expect("runtime metrics mutex is not poisoned");
    for row in sync_rows {
        let key = MetricsScopeKey {
            dao_code: row.dao_code.clone(),
            chain_id: row.chain_id,
            contract_set_id: row.contract_set_id.clone(),
        };
        if let Some(runtime_row) = state.sync_rows.get(&key) {
            row.current_rate_blocks_per_second = runtime_row.current_rate_blocks_per_second;
            row.eta_seconds = runtime_row.eta_seconds;
        }
    }

    state.chunk_rows.values().cloned().collect()
}

fn runtime_metrics_state() -> &'static Mutex<RuntimeMetricsState> {
    RUNTIME_METRICS.get_or_init(|| Mutex::new(RuntimeMetricsState::default()))
}

fn collect_onchain_worker_runtime_metrics() -> Vec<OnchainRefreshWorkerMetricsRow> {
    runtime_metrics_state()
        .lock()
        .expect("runtime metrics mutex is not poisoned")
        .onchain_worker_rows
        .values()
        .cloned()
        .collect()
}

async fn collect_sync_metrics(pool: &PgPool) -> Result<Vec<IndexerSyncMetricsRow>, MetricsError> {
    let rows = sqlx::query(
        r#"
        SELECT
          checkpoint.dao_code,
          checkpoint.chain_id,
          checkpoint.contract_set_id,
          checkpoint.processed_height::BIGINT AS processed_height,
          checkpoint.target_height::BIGINT AS target_height,
          (
            SELECT MIN(selector_coverage.range_end_block)::BIGINT
            FROM (
              SELECT MAX(segment.range_end_block) AS range_end_block
              FROM degov_provisional_segment segment
              WHERE segment.status = 'available'
                AND segment.dao_code = checkpoint.dao_code
                AND segment.chain_id IS NOT DISTINCT FROM checkpoint.chain_id
                AND segment.contract_set_id = checkpoint.contract_set_id
              GROUP BY segment.source, segment.selector
            ) selector_coverage
          ) AS provisional_height,
          latest.latest_height::BIGINT AS latest_height,
          CASE
            WHEN checkpoint.target_height IS NULL THEN NULL
            WHEN checkpoint.target_height <= 0 THEN 100.0::DOUBLE PRECISION
            WHEN checkpoint.processed_height IS NULL THEN 0.0::DOUBLE PRECISION
            ELSE LEAST(
              (checkpoint.processed_height::DOUBLE PRECISION / checkpoint.target_height::DOUBLE PRECISION) * 100.0,
              100.0
            )
          END AS synced_percentage,
          EXTRACT(EPOCH FROM checkpoint.updated_at)::DOUBLE PRECISION AS updated_timestamp_seconds,
          checkpoint.last_error IS NOT NULL AS last_error_present
        FROM degov_indexer_checkpoint checkpoint
        LEFT JOIN degov_indexer_latest_head latest
          ON latest.dao_code = checkpoint.dao_code
         AND latest.chain_id = checkpoint.chain_id
         AND latest.contract_set_id = checkpoint.contract_set_id
         AND latest.stream_id = checkpoint.stream_id
         AND latest.data_source_version = checkpoint.data_source_version
        ORDER BY checkpoint.dao_code, checkpoint.chain_id, checkpoint.contract_set_id
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| IndexerSyncMetricsRow {
            dao_code: row.get("dao_code"),
            chain_id: row.get("chain_id"),
            contract_set_id: row.get("contract_set_id"),
            processed_height: row.get("processed_height"),
            target_height: row.get("target_height"),
            provisional_height: row.get("provisional_height"),
            latest_height: row.get("latest_height"),
            synced_percentage: row.get("synced_percentage"),
            updated_timestamp_seconds: row.get("updated_timestamp_seconds"),
            last_error_present: row.get("last_error_present"),
            current_rate_blocks_per_second: None,
            eta_seconds: None,
        })
        .collect())
}

async fn collect_onchain_refresh_backlog_metrics(
    pool: &PgPool,
) -> Result<Vec<OnchainRefreshBacklogMetricsRow>, MetricsError> {
    let rows = sqlx::query(
        r#"
        SELECT
          COALESCE(dao_code, '') AS dao_code,
          chain_id,
          contract_set_id,
          status,
          COUNT(*)::BIGINT AS tasks,
          COUNT(*) FILTER (
            WHERE next_run_at <= FLOOR(EXTRACT(EPOCH FROM now()) * 1000)::NUMERIC
          )::BIGINT AS ready_tasks
        FROM onchain_refresh_task
        GROUP BY dao_code, chain_id, contract_set_id, status
        ORDER BY dao_code, chain_id, contract_set_id, status
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| OnchainRefreshBacklogMetricsRow {
            dao_code: row.get("dao_code"),
            chain_id: row.get("chain_id"),
            contract_set_id: row.get("contract_set_id"),
            status: row.get("status"),
            tasks: row.get("tasks"),
            ready_tasks: row.get("ready_tasks"),
        })
        .collect())
}

async fn collect_deferred_onchain_refresh_backlog_metrics(
    pool: &PgPool,
) -> Result<Vec<OnchainRefreshBacklogMetricsRow>, MetricsError> {
    let rows = sqlx::query(
        r#"
        SELECT
          COALESCE(dao_code, '') AS dao_code,
          chain_id,
          contract_set_id,
          'deferred' AS status,
          COUNT(*)::BIGINT AS tasks,
          COUNT(*) FILTER (
            WHERE next_run_at <= FLOOR(EXTRACT(EPOCH FROM now()) * 1000)::NUMERIC
          )::BIGINT AS ready_tasks
        FROM onchain_refresh_deferred_candidate
        GROUP BY dao_code, chain_id, contract_set_id
        ORDER BY dao_code, chain_id, contract_set_id
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|row| OnchainRefreshBacklogMetricsRow {
            dao_code: row.get("dao_code"),
            chain_id: row.get("chain_id"),
            contract_set_id: row.get("contract_set_id"),
            status: row.get("status"),
            tasks: row.get("tasks"),
            ready_tasks: row.get("ready_tasks"),
        })
        .collect())
}

fn metric_header(output: &mut String, name: &str, help: &str, type_: &str) {
    output.push_str("# HELP ");
    output.push_str(name);
    output.push(' ');
    output.push_str(help);
    output.push('\n');
    output.push_str("# TYPE ");
    output.push_str(name);
    output.push(' ');
    output.push_str(type_);
    output.push('\n');
}

fn sync_labels(row: &IndexerSyncMetricsRow) -> Vec<(&'static str, String)> {
    vec![
        ("dao_code", row.dao_code.clone()),
        ("chain_id", row.chain_id.to_string()),
        ("contract_set_id", row.contract_set_id.clone()),
    ]
}

fn onchain_labels(row: &OnchainRefreshBacklogMetricsRow) -> Vec<(&'static str, String)> {
    vec![
        ("dao_code", row.dao_code.clone()),
        ("chain_id", row.chain_id.to_string()),
        ("contract_set_id", row.contract_set_id.clone()),
        ("status", row.status.clone()),
    ]
}

fn chunk_labels(row: &IndexerChunkRuntimeMetricsRow) -> Vec<(&'static str, String)> {
    vec![
        ("dao_code", row.dao_code.clone()),
        ("chain_id", row.chain_id.to_string()),
        ("contract_set_id", row.contract_set_id.clone()),
    ]
}

fn cache_labels(
    row: &IndexerChunkRuntimeMetricsRow,
    outcome: &'static str,
) -> Vec<(&'static str, String)> {
    let mut labels = chunk_labels(row);
    labels.push(("outcome", outcome.to_owned()));
    labels
}

fn worker_labels(row: &OnchainRefreshWorkerMetricsRow) -> Vec<(&'static str, String)> {
    vec![
        ("scope", row.scope.clone()),
        ("dao_code", row.dao_code.clone()),
        ("chain_id", row.chain_id.clone()),
        ("contract_set_id", row.contract_set_id.clone()),
    ]
}

fn worker_result_labels(
    row: &OnchainRefreshWorkerMetricsRow,
    result: &'static str,
) -> Vec<(&'static str, String)> {
    let mut labels = worker_labels(row);
    labels.push(("result", result.to_owned()));
    labels
}

fn append_optional_metric<T>(
    output: &mut String,
    name: &str,
    labels: &[(&str, String)],
    value: Option<T>,
) where
    T: std::fmt::Display,
{
    if let Some(value) = value {
        append_metric(output, name, labels, value);
    }
}

fn append_metric<T>(output: &mut String, name: &str, labels: &[(&str, String)], value: T)
where
    T: std::fmt::Display,
{
    output.push_str(name);
    output.push('{');
    for (index, (label, value)) in labels.iter().enumerate() {
        if index > 0 {
            output.push(',');
        }
        output.push_str(label);
        output.push_str("=\"");
        output.push_str(&escape_label_value(value));
        output.push('"');
    }
    output.push_str("} ");
    output.push_str(&value.to_string());
    output.push('\n');
}

fn escape_label_value(value: &str) -> String {
    value
        .replace('\\', r"\\")
        .replace('\n', r"\n")
        .replace('"', r#"\""#)
}
