use std::collections::{BTreeMap, VecDeque};
use std::fmt;
use std::time::{Duration, Instant};

use log::{error, info, warn};
use thiserror::Error;

use crate::{
    ChainReadExecutionReport, ChainReadPlan, ChainReadPlanBuilder, ChainTool, CheckpointBlockRange,
    CheckpointError, DaoContractAddresses, DaoEventDecodeError, DaoLogSource, DatalensConfig,
    DatalensError, DatalensLogPage, DatalensLogQueryReader, DatalensQueryErrorClass,
    DatalensWarmupEffectivenessAggregation, DatalensWarmupEffectivenessLogFields, DecodedDaoEvent,
    GovernanceTokenStandard, InMemoryProposalProjectionRepository,
    InMemoryTimelockProjectionRepository, InMemoryTokenProjectionRepository,
    InMemoryVoteProjectionRepository, IndexerCheckpoint, IndexerCheckpointIdentity,
    NormalizedEvmLog, ProposalProjectionBatch, ProposalProjectionContext, ProposalProjectionEvent,
    ProposalProjectionRepository, ProposalTimestampBackfillCandidate,
    ProposalTimestampBackfillUpdate, TimelockProjectionBatch, TimelockProjectionContext,
    TimelockProjectionEvent, TimelockProjectionRepository, TimelockProposalLinkContext,
    TokenProjectionBatch, TokenProjectionContext, TokenProjectionEvent, TokenProjectionRepository,
    VoteProjectionBatch, VoteProjectionContext, VoteProjectionEvent, VoteProjectionRepository,
    classify_datalens_query_error, datalens_selector_fingerprint, decode_dao_log,
    fetch_dao_log_pages, normalize_evm_log_rows, plan_dao_log_queries, plan_next_checkpoint_range,
    plan_proposal_timestamp_backfill_updates, project_proposal_events,
    project_timelock_events_with_proposal_links, project_timelock_proposal_links,
    project_token_events, project_vote_events,
};

use crate::OnchainRefreshTickReport;
use crate::checkpoint::{RestoredAdaptiveChunkState, configured_range_progress};

#[derive(Clone, Debug)]
pub struct IndexerRunnerOptions {
    pub datalens_config: DatalensConfig,
    pub addresses: DaoContractAddresses,
    pub checkpoint_identity: IndexerCheckpointIdentity,
    pub start_block: i64,
    pub safe_height: Option<i64>,
    pub progress_refresh_lag_blocks: i64,
    pub adaptive_chunk_sizer: AdaptiveChunkSizerConfig,
    pub onchain_refresh_deferred_drain_enabled: bool,
    pub onchain_refresh_deferred_drain_batch_size: usize,
    pub proposal_timestamp_backfill: ProposalTimestampBackfillConfig,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ProposalTimestampBackfillConfig {
    pub enabled: bool,
    pub batch_size: usize,
}

impl Default for ProposalTimestampBackfillConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            batch_size: 100,
        }
    }
}

#[derive(Clone, Debug)]
pub struct IndexerRunnerContexts {
    pub vote: VoteProjectionContext,
    pub token: TokenProjectionContext,
    pub proposal: Option<ProposalProjectionContext>,
    pub timelock: Option<TimelockProjectionContext>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct IndexerRunnerProgress {
    pub processed_height: Option<i64>,
    pub target_height: i64,
    pub synced_percentage: f64,
    pub configured_start_block: i64,
    pub remaining_blocks: i64,
    pub configured_range_synced_percentage: f64,
    pub current_rate_blocks_per_second: Option<f64>,
    pub eta_seconds: Option<f64>,
    pub onchain_refresh_allowed: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct IndexerRunnerReport {
    pub chunks_processed: u64,
    pub shutdown_requested: bool,
    pub last_progress: IndexerRunnerProgress,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AdaptiveChunkSizerConfig {
    pub initial_chunk_size: u32,
    pub max_chunk_size: u32,
    pub min_chunk_size: u32,
    pub transient_query_failure_min_chunk_size: u32,
    pub full_hit_dense_floor: u32,
    pub local_processing_shrink_threshold: Duration,
    pub fast_chunk_duration_threshold: Duration,
    pub high_query_duration_threshold: Duration,
    pub cache_fill_high_duration_threshold: Duration,
    pub dense_returned_row_threshold: usize,
    pub sparse_returned_row_threshold: usize,
    pub stable_chunks_to_grow: u32,
    pub unstable_chunks_to_shrink: u32,
    pub shrink_factor_percent: u32,
}

impl AdaptiveChunkSizerConfig {
    pub fn for_max_chunk_size(max_chunk_size: u32) -> Self {
        Self {
            initial_chunk_size: max_chunk_size,
            max_chunk_size,
            min_chunk_size: 100,
            transient_query_failure_min_chunk_size: 1,
            full_hit_dense_floor: 1_000.min(max_chunk_size),
            local_processing_shrink_threshold: Duration::from_secs(10),
            fast_chunk_duration_threshold: Duration::from_secs(1),
            high_query_duration_threshold: Duration::from_secs(10),
            cache_fill_high_duration_threshold: Duration::from_secs(3),
            dense_returned_row_threshold: 5_000,
            sparse_returned_row_threshold: 100,
            stable_chunks_to_grow: 2,
            unstable_chunks_to_shrink: 2,
            shrink_factor_percent: 50,
        }
    }

    pub fn capped_to_block_range_limit(mut self, block_range_limit: u32) -> Self {
        self.max_chunk_size = self.max_chunk_size.min(block_range_limit);
        self.min_chunk_size = self.min_chunk_size.min(self.max_chunk_size);
        self.full_hit_dense_floor = self.full_hit_dense_floor.min(self.max_chunk_size);
        self.transient_query_failure_min_chunk_size = self
            .transient_query_failure_min_chunk_size
            .min(self.max_chunk_size);
        self.initial_chunk_size = self.initial_chunk_size.min(self.max_chunk_size);
        self.initial_chunk_size = self.initial_chunk_size.max(self.min_chunk_size);
        self
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdaptiveChunkFeedback {
    pub returned_row_count: usize,
    pub local_processing_write_duration: Duration,
    pub read_duration: Duration,
    pub warmup_effectiveness: DatalensWarmupEffectivenessAggregation,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AdaptiveChunkSizingDecision {
    pub previous_chunk_size: u32,
    pub current_chunk_size: u32,
    pub reason: AdaptiveChunkSizingReason,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AdaptiveChunkSizingReason {
    DenseReturnedRows,
    SlowLocalProcessing,
    HighQueryDuration,
    ProviderLimit,
    StableSparseRange,
    StableFullHit,
    StableFastChunk,
    FastCacheFill,
    StableFastCacheFill,
    SlowCacheFillHold,
    RepeatedSlowCacheFill,
    Hold,
}

impl fmt::Display for AdaptiveChunkSizingReason {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::DenseReturnedRows => formatter.write_str("dense_returned_rows"),
            Self::SlowLocalProcessing => formatter.write_str("slow_local_processing"),
            Self::HighQueryDuration => formatter.write_str("high_query_duration"),
            Self::ProviderLimit => formatter.write_str("provider_limit"),
            Self::StableSparseRange => formatter.write_str("stable_sparse_range"),
            Self::StableFullHit => formatter.write_str("stable_full_hit"),
            Self::StableFastChunk => formatter.write_str("stable_fast_chunk"),
            Self::FastCacheFill => formatter.write_str("fast_cache_fill"),
            Self::StableFastCacheFill => formatter.write_str("stable_fast_cache_fill"),
            Self::SlowCacheFillHold => formatter.write_str("slow_cache_fill_hold"),
            Self::RepeatedSlowCacheFill => formatter.write_str("repeated_slow_cache_fill"),
            Self::Hold => formatter.write_str("hold"),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdaptiveChunkSizer {
    config: AdaptiveChunkSizerConfig,
    current_chunk_size: u32,
    stable_chunks: u32,
    unstable_chunks: u32,
}

impl AdaptiveChunkSizer {
    pub fn new(config: AdaptiveChunkSizerConfig) -> Result<Self, CheckpointError> {
        Self::new_with_current_chunk_size(config, config.initial_chunk_size)
    }

    pub fn new_restored(
        config: AdaptiveChunkSizerConfig,
        restored: RestoredAdaptiveChunkState,
    ) -> Result<Self, CheckpointError> {
        let current_chunk_size = match restored
            .current_chunk_size
            .filter(|chunk_size| *chunk_size > 0)
        {
            Some(chunk_size) if chunk_size < config.min_chunk_size => config.min_chunk_size,
            Some(chunk_size) if chunk_size > config.max_chunk_size => config.max_chunk_size,
            Some(chunk_size) => chunk_size,
            None => config.initial_chunk_size,
        };

        Self::new_with_current_chunk_size(config, current_chunk_size)
    }

    fn new_with_current_chunk_size(
        config: AdaptiveChunkSizerConfig,
        current_chunk_size: u32,
    ) -> Result<Self, CheckpointError> {
        if config.initial_chunk_size == 0
            || config.max_chunk_size == 0
            || config.min_chunk_size == 0
            || config.transient_query_failure_min_chunk_size == 0
            || config.full_hit_dense_floor == 0
        {
            return Err(CheckpointError::InvalidRangeLimit);
        }
        if config.min_chunk_size > config.max_chunk_size {
            return Err(CheckpointError::InvalidRangeLimit);
        }
        if config.full_hit_dense_floor < config.min_chunk_size
            || config.full_hit_dense_floor > config.max_chunk_size
        {
            return Err(CheckpointError::InvalidRangeLimit);
        }
        if config.transient_query_failure_min_chunk_size > config.max_chunk_size {
            return Err(CheckpointError::InvalidRangeLimit);
        }
        if config.initial_chunk_size < config.min_chunk_size
            || config.initial_chunk_size > config.max_chunk_size
        {
            return Err(CheckpointError::InvalidRangeLimit);
        }
        if current_chunk_size < config.min_chunk_size || current_chunk_size > config.max_chunk_size
        {
            return Err(CheckpointError::InvalidRangeLimit);
        }
        if config.stable_chunks_to_grow == 0 || config.unstable_chunks_to_shrink == 0 {
            return Err(CheckpointError::InvalidRangeLimit);
        }
        if config.shrink_factor_percent == 0 || config.shrink_factor_percent >= 100 {
            return Err(CheckpointError::InvalidRangeLimit);
        }

        Ok(Self {
            config,
            current_chunk_size,
            stable_chunks: 0,
            unstable_chunks: 0,
        })
    }

    pub fn current_chunk_size(&self) -> u32 {
        self.current_chunk_size
    }

    pub fn plan_next_range(
        &self,
        checkpoint: &IndexerCheckpoint,
        target_height: i64,
    ) -> Result<Option<CheckpointBlockRange>, CheckpointError> {
        plan_next_checkpoint_range(checkpoint, self.current_chunk_size, target_height)
    }

    pub fn record_chunk(&mut self, feedback: AdaptiveChunkFeedback) -> AdaptiveChunkSizingDecision {
        let previous_chunk_size = self.current_chunk_size;
        let full_cache_hit = feedback.has_only_full_cache_hits();
        let dense_range = feedback.returned_row_count >= self.config.dense_returned_row_threshold
            && !full_cache_hit;
        let slow_local_processing = feedback.local_processing_write_duration
            > self.config.local_processing_shrink_threshold;
        let high_query_duration = feedback.read_duration
            > self.config.high_query_duration_threshold
            || feedback
                .warmup_effectiveness
                .query_duration_max()
                .is_some_and(|duration| duration > self.config.high_query_duration_threshold);
        let cache_fill = feedback.has_cache_fill();
        let fast_chunk = feedback.is_fast(&self.config);
        let slow_cache_fill = cache_fill && feedback.is_slow_cache_fill(&self.config);
        let stable_growth_reason = feedback.stable_growth_reason(&self.config);
        let sparse_range = feedback.returned_row_count <= self.config.sparse_returned_row_threshold;
        let sparse_full_hit_with_fast_write = full_cache_hit
            && sparse_range
            && feedback.local_processing_write_duration
                <= self.config.fast_chunk_duration_threshold;
        let stable_growth_candidate = match stable_growth_reason {
            AdaptiveChunkSizingReason::StableFullHit => sparse_full_hit_with_fast_write,
            AdaptiveChunkSizingReason::StableFastChunk => !cache_fill,
            AdaptiveChunkSizingReason::StableSparseRange => sparse_range && !cache_fill,
            _ => false,
        };

        let reason = if slow_local_processing || high_query_duration || dense_range {
            self.stable_chunks = 0;
            self.unstable_chunks = 0;
            let shrink_floor = if slow_local_processing && !high_query_duration && full_cache_hit {
                self.config.full_hit_dense_floor
            } else {
                self.config.min_chunk_size
            };
            self.shrink_current_chunk_size_to(shrink_floor);
            if slow_local_processing {
                AdaptiveChunkSizingReason::SlowLocalProcessing
            } else if high_query_duration {
                AdaptiveChunkSizingReason::HighQueryDuration
            } else {
                AdaptiveChunkSizingReason::DenseReturnedRows
            }
        } else if slow_cache_fill {
            self.unstable_chunks = self.unstable_chunks.saturating_add(1);
            if self.unstable_chunks >= self.config.unstable_chunks_to_shrink {
                self.unstable_chunks = 0;
                self.stable_chunks = 0;
                self.shrink_current_chunk_size();
                AdaptiveChunkSizingReason::RepeatedSlowCacheFill
            } else {
                self.stable_chunks = 0;
                AdaptiveChunkSizingReason::SlowCacheFillHold
            }
        } else if cache_fill && fast_chunk {
            self.stable_chunks = 0;
            self.unstable_chunks = 0;
            AdaptiveChunkSizingReason::FastCacheFill
        } else if stable_growth_candidate {
            self.stable_chunks = self.stable_chunks.saturating_add(1);
            self.unstable_chunks = 0;
            if self.stable_chunks >= self.config.stable_chunks_to_grow {
                self.stable_chunks = 0;
                self.current_chunk_size = self
                    .current_chunk_size
                    .saturating_mul(2)
                    .min(self.config.max_chunk_size);
                stable_growth_reason
            } else {
                AdaptiveChunkSizingReason::Hold
            }
        } else {
            self.stable_chunks = 0;
            self.unstable_chunks = 0;
            AdaptiveChunkSizingReason::Hold
        };

        AdaptiveChunkSizingDecision {
            previous_chunk_size,
            current_chunk_size: self.current_chunk_size,
            reason,
        }
    }

    pub fn record_provider_limit(
        &mut self,
        failed_range_block_count: u32,
    ) -> AdaptiveChunkSizingDecision {
        let previous_chunk_size = self.current_chunk_size;
        self.stable_chunks = 0;
        self.unstable_chunks = 0;
        self.current_chunk_size = shrink_chunk_size(
            failed_range_block_count,
            self.config.min_chunk_size,
            self.config.shrink_factor_percent,
        )
        .max(self.config.min_chunk_size)
        .min(previous_chunk_size);

        AdaptiveChunkSizingDecision {
            previous_chunk_size,
            current_chunk_size: self.current_chunk_size,
            reason: AdaptiveChunkSizingReason::ProviderLimit,
        }
    }

    pub fn record_transient_query_failure(
        &mut self,
        failed_range_block_count: u32,
    ) -> Option<(u32, u32)> {
        if failed_range_block_count <= self.config.transient_query_failure_min_chunk_size {
            return None;
        }

        let previous_chunk_size = self.current_chunk_size;
        self.stable_chunks = 0;
        self.unstable_chunks = 0;
        self.current_chunk_size = failed_range_block_count
            .saturating_div(2)
            .max(self.config.transient_query_failure_min_chunk_size)
            .min(self.current_chunk_size);

        Some((previous_chunk_size, self.current_chunk_size))
    }

    fn shrink_current_chunk_size(&mut self) {
        self.shrink_current_chunk_size_to(self.config.min_chunk_size);
    }

    fn shrink_current_chunk_size_to(&mut self, min_chunk_size: u32) {
        self.current_chunk_size = shrink_chunk_size(
            self.current_chunk_size,
            min_chunk_size.min(self.current_chunk_size),
            self.config.shrink_factor_percent,
        );
    }
}

impl AdaptiveChunkFeedback {
    fn stable_growth_reason(&self, config: &AdaptiveChunkSizerConfig) -> AdaptiveChunkSizingReason {
        if self.has_full_cache_hit() {
            AdaptiveChunkSizingReason::StableFullHit
        } else if self.is_fast(config) {
            AdaptiveChunkSizingReason::StableFastChunk
        } else {
            AdaptiveChunkSizingReason::StableSparseRange
        }
    }

    fn has_full_cache_hit(&self) -> bool {
        self.warmup_effectiveness.full_hit_count > 0 && !self.has_cache_fill()
    }

    fn has_only_full_cache_hits(&self) -> bool {
        self.warmup_effectiveness.query_count > 0
            && self.warmup_effectiveness.full_hit_count == self.warmup_effectiveness.query_count
            && !self.has_cache_fill()
    }

    fn is_fast(&self, config: &AdaptiveChunkSizerConfig) -> bool {
        self.read_duration <= config.fast_chunk_duration_threshold
            && self.local_processing_write_duration <= config.fast_chunk_duration_threshold
            && self
                .warmup_effectiveness
                .query_duration_max()
                .is_none_or(|duration| duration <= config.fast_chunk_duration_threshold)
    }

    fn has_cache_fill(&self) -> bool {
        self.warmup_effectiveness.partial_hit_count > 0
            || self.warmup_effectiveness.miss_count > 0
            || self.warmup_effectiveness.provider_fill_range_count > 0
    }

    fn is_slow_cache_fill(&self, config: &AdaptiveChunkSizerConfig) -> bool {
        let threshold = config
            .cache_fill_high_duration_threshold
            .max(config.high_query_duration_threshold);
        self.read_duration > threshold
            || self
                .warmup_effectiveness
                .query_duration_max()
                .is_some_and(|duration| duration > threshold)
    }
}

fn shrink_chunk_size(chunk_size: u32, min_chunk_size: u32, shrink_factor_percent: u32) -> u32 {
    if chunk_size <= min_chunk_size {
        return min_chunk_size;
    }
    let shrunk = ((u64::from(chunk_size) * u64::from(shrink_factor_percent)) / 100)
        .try_into()
        .unwrap_or(u32::MAX);
    shrunk.max(min_chunk_size).min(chunk_size.saturating_sub(1))
}

impl ProgressRateEstimator {
    fn record(&mut self, processed_height: i64, recorded_at: Instant) {
        self.samples.push_back(ProgressRateSample {
            recorded_at,
            processed_height,
        });
        while self.samples.len() > 2 {
            self.samples.pop_front();
        }
    }

    fn blocks_per_second(&self) -> Option<f64> {
        let first = self.samples.front()?;
        let last = self.samples.back()?;
        if first.processed_height == last.processed_height {
            return None;
        }

        let elapsed_seconds = last
            .recorded_at
            .duration_since(first.recorded_at)
            .as_secs_f64();
        if elapsed_seconds <= 0.0 {
            return None;
        }

        let processed_blocks = last.processed_height.saturating_sub(first.processed_height);
        if processed_blocks <= 0 {
            return None;
        }

        Some(processed_blocks as f64 / elapsed_seconds)
    }
}

#[derive(Debug, Error)]
pub enum IndexerRunnerError {
    #[error("Datalens runner checkpoint error: {0}")]
    Checkpoint(#[from] CheckpointError),

    #[error("Datalens runner query error: {0}")]
    Datalens(#[from] DatalensError),

    #[error("Datalens runner EVM log normalization error: {0}")]
    Normalize(String),

    #[error("Datalens runner DAO event decode error: {0}")]
    Decode(#[from] DaoEventDecodeError),

    #[error("Datalens runner projection error: {0}")]
    Projection(String),

    #[error("Datalens runner transaction error: {0}")]
    Transaction(String),
}

pub trait IndexerEventDecoder: Clone {
    fn decode(
        &self,
        dao_code: &str,
        source: DaoLogSource,
        token_standard: Option<GovernanceTokenStandard>,
        log: &NormalizedEvmLog,
    ) -> Result<DecodedDaoEvent, DaoEventDecodeError>;
}

#[derive(Clone, Debug, Default)]
pub struct DaoEventDecoder;

impl IndexerEventDecoder for DaoEventDecoder {
    fn decode(
        &self,
        dao_code: &str,
        source: DaoLogSource,
        token_standard: Option<GovernanceTokenStandard>,
        log: &NormalizedEvmLog,
    ) -> Result<DecodedDaoEvent, DaoEventDecodeError> {
        decode_dao_log(dao_code, source, token_standard, log)
    }
}

pub trait IndexerRunnerStore {
    type Error: fmt::Display;
    type Transaction<'a>: IndexerRunnerTransaction<Error = Self::Error>
    where
        Self: 'a;

    fn read_or_create_checkpoint(
        &mut self,
        identity: &IndexerCheckpointIdentity,
        start_block: i64,
    ) -> Result<IndexerCheckpoint, Self::Error>;

    fn begin_transaction(&mut self) -> Result<Self::Transaction<'_>, Self::Error>;

    fn timelock_proposal_link_context(
        &mut self,
        _context: &TimelockProjectionContext,
        _events: &[TimelockProjectionEvent],
        _proposal: Option<&ProposalProjectionBatch>,
    ) -> Result<TimelockProposalLinkContext, Self::Error> {
        Ok(TimelockProposalLinkContext::default())
    }

    fn drain_deferred_onchain_refresh_tasks(
        &mut self,
        _max_rows: usize,
    ) -> Result<usize, Self::Error> {
        Ok(0)
    }

    fn read_proposal_timestamp_backfill_candidates(
        &mut self,
        _identity: &IndexerCheckpointIdentity,
        _processed_height: i64,
        _batch_size: usize,
    ) -> Result<Vec<ProposalTimestampBackfillCandidate>, Self::Error> {
        Ok(Vec::new())
    }

    fn update_proposal_timestamp_backfill(
        &mut self,
        _updates: &[ProposalTimestampBackfillUpdate],
    ) -> Result<u64, Self::Error> {
        Ok(0)
    }
}

pub trait IndexerRunnerTransaction {
    type Error: fmt::Display;

    fn apply_projection_batch(&mut self, batch: &IndexerProjectionBatch)
    -> Result<(), Self::Error>;

    fn advance_checkpoint(
        &mut self,
        identity: &IndexerCheckpointIdentity,
        processed_height: i64,
        target_height: Option<i64>,
    ) -> Result<(), Self::Error>;

    fn update_adaptive_chunk_state(
        &mut self,
        identity: &IndexerCheckpointIdentity,
        _adaptive_sizing_decision: &AdaptiveChunkSizingDecision,
    ) -> Result<(), Self::Error> {
        let _ = identity;
        Ok(())
    }

    fn commit(self) -> Result<(), Self::Error>;

    fn rollback(self) -> Result<(), Self::Error>;
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct IndexerProjectionBatch {
    pub proposal: Option<ProposalProjectionBatch>,
    pub vote: Option<VoteProjectionBatch>,
    pub token: Option<TokenProjectionBatch>,
    pub timelock: Option<TimelockProjectionBatch>,
}

pub struct IndexerRunner<R, S, D = DaoEventDecoder> {
    options: IndexerRunnerOptions,
    contexts: IndexerRunnerContexts,
    reader: R,
    store: S,
    decoder: D,
    shutdown_after_chunks: Option<u64>,
    onchain_refresh_tick: Option<Box<dyn IndexerOnchainRefreshTick>>,
    chain_tool: Option<Box<dyn ChainTool + Send + Sync>>,
}

pub trait IndexerOnchainRefreshTick: Send {
    fn run_after_chunk(&mut self, processed_block: i64)
    -> Result<OnchainRefreshTickReport, String>;
}

struct ChunkProcessingResult {
    batch: IndexerProjectionBatch,
    metrics: ChunkProcessingMetrics,
}

#[derive(Clone, Debug, Default)]
struct ProgressRateEstimator {
    samples: VecDeque<ProgressRateSample>,
}

#[derive(Clone, Copy, Debug)]
struct ProgressRateSample {
    recorded_at: Instant,
    processed_height: i64,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
struct ChunkProcessingMetrics {
    datalens_request_count: usize,
    returned_row_count: usize,
    decoded_count: usize,
    projection_event_counts: ProjectionEventCounts,
    warmup_effectiveness: DatalensWarmupEffectivenessAggregation,
    selector_fingerprint: String,
    read_duration: Duration,
    decode_duration: Duration,
    project_duration: Duration,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
struct ProjectionEventCounts {
    proposal: usize,
    vote: usize,
    token: usize,
    timelock: usize,
}

struct DecodedChunk {
    events: Vec<(NormalizedEvmLog, DecodedDaoEvent)>,
    returned_row_count: usize,
}

struct ProjectedChunk {
    batch: IndexerProjectionBatch,
    event_counts: ProjectionEventCounts,
}

impl<R, S, D> IndexerRunner<R, S, D>
where
    R: DatalensLogQueryReader,
    S: IndexerRunnerStore,
    D: IndexerEventDecoder,
{
    pub fn new(
        options: IndexerRunnerOptions,
        contexts: IndexerRunnerContexts,
        reader: R,
        store: S,
        decoder: D,
    ) -> Self {
        Self {
            options,
            contexts,
            reader,
            store,
            decoder,
            shutdown_after_chunks: None,
            onchain_refresh_tick: None,
            chain_tool: None,
        }
    }

    pub fn store(&self) -> &S {
        &self.store
    }

    pub fn store_mut(&mut self) -> &mut S {
        &mut self.store
    }

    pub fn request_shutdown_after_chunks(&mut self, chunks: u64) {
        self.shutdown_after_chunks = Some(chunks);
    }

    pub fn with_onchain_refresh_tick(mut self, tick: Box<dyn IndexerOnchainRefreshTick>) -> Self {
        self.onchain_refresh_tick = Some(tick);
        self
    }

    pub fn with_chain_tool(mut self, chain_tool: Box<dyn ChainTool + Send + Sync>) -> Self {
        self.chain_tool = Some(chain_tool);
        self
    }

    pub fn run_to_target(
        &mut self,
        target_height: i64,
    ) -> Result<IndexerRunnerReport, IndexerRunnerError> {
        let effective_target = self
            .options
            .safe_height
            .map_or(target_height, |safe_height| safe_height.min(target_height));
        let mut progress_rate = ProgressRateEstimator::default();
        let mut chunks_processed = 0;
        let mut provider_limit_count_since_summary = 0;
        let mut checkpoint = self
            .store
            .read_or_create_checkpoint(&self.options.checkpoint_identity, self.options.start_block)
            .map_err(to_checkpoint_error)?;
        let adaptive_chunk_sizer_config = self
            .options
            .adaptive_chunk_sizer
            .capped_to_block_range_limit(
                self.options.datalens_config.query_limits.block_range_limit,
            );
        let mut chunk_sizer = AdaptiveChunkSizer::new_restored(
            adaptive_chunk_sizer_config,
            checkpoint.restored_adaptive_chunk_state(),
        )?;
        let checkpoint_choice = if checkpoint.next_block > self.options.start_block {
            "resume"
        } else {
            "start"
        };
        info!(
            "Datalens indexer checkpoint selected dao_code={} chain_id={} contract_set_id={} stream_id={} data_source_version={} start_block={} next_block={} checkpoint_choice={}",
            self.options.checkpoint_identity.dao_code,
            self.options.checkpoint_identity.chain_id,
            self.options.checkpoint_identity.contract_set_id,
            self.options.checkpoint_identity.stream_id,
            self.options.checkpoint_identity.data_source_version,
            self.options.start_block,
            checkpoint.next_block,
            checkpoint_choice
        );

        loop {
            if self
                .shutdown_after_chunks
                .is_some_and(|limit| chunks_processed >= limit)
            {
                return Ok(IndexerRunnerReport {
                    chunks_processed,
                    shutdown_requested: true,
                    last_progress: progress(
                        checkpoint.processed_height,
                        effective_target,
                        self.options.start_block,
                        progress_rate.blocks_per_second(),
                        self.options.progress_refresh_lag_blocks,
                    ),
                });
            }

            let Some(range) = chunk_sizer.plan_next_range(&checkpoint, effective_target)? else {
                return Ok(IndexerRunnerReport {
                    chunks_processed,
                    shutdown_requested: false,
                    last_progress: progress(
                        checkpoint.processed_height,
                        effective_target,
                        self.options.start_block,
                        progress_rate.blocks_per_second(),
                        self.options.progress_refresh_lag_blocks,
                    ),
                });
            };

            info!(
                "processing Datalens indexer chunk dao_code={} chain_id={} contract_set_id={} stream_id={} data_source_version={} from_block={} to_block={} target_height={} chunk_size={}",
                self.options.checkpoint_identity.dao_code,
                self.options.checkpoint_identity.chain_id,
                self.options.checkpoint_identity.contract_set_id,
                self.options.checkpoint_identity.stream_id,
                self.options.checkpoint_identity.data_source_version,
                range.from_block,
                range.to_block,
                effective_target,
                chunk_sizer.current_chunk_size()
            );

            let chunk_started_at = Instant::now();
            let processing = match self.process_range(range, effective_target) {
                Ok(processing) => processing,
                Err(error) => {
                    let failed_range_block_count = range_block_count(range);
                    if is_provider_limit_error(&error) && failed_range_block_count > 1 {
                        provider_limit_count_since_summary += 1;
                        let sizing_decision =
                            chunk_sizer.record_provider_limit(failed_range_block_count);
                        let retry_to_block = range
                            .from_block
                            .saturating_add(i64::from(sizing_decision.current_chunk_size))
                            .saturating_sub(1)
                            .min(range.to_block);
                        warn!(
                            "Datalens indexer chunk provider limit split dao_code={} chain_id={} contract_set_id={} stream_id={} data_source_version={} from_block={} previous_to_block={} retry_to_block={} previous_chunk_size={} new_chunk_size={} reason={} adaptive_cache_summary=unavailable duration_ms={}",
                            self.options.checkpoint_identity.dao_code,
                            self.options.checkpoint_identity.chain_id,
                            self.options.checkpoint_identity.contract_set_id,
                            self.options.checkpoint_identity.stream_id,
                            self.options.checkpoint_identity.data_source_version,
                            range.from_block,
                            range.to_block,
                            retry_to_block,
                            sizing_decision.previous_chunk_size,
                            sizing_decision.current_chunk_size,
                            sizing_decision.reason,
                            chunk_started_at.elapsed().as_millis()
                        );
                        continue;
                    }
                    if let Some(error_class) = datalens_query_error_class(&error)
                        .filter(|error_class| *error_class == DatalensQueryErrorClass::Transient)
                    {
                        if let Some((previous_chunk_size, new_chunk_size)) =
                            chunk_sizer.record_transient_query_failure(failed_range_block_count)
                        {
                            let retry_to_block = range
                                .from_block
                                .saturating_add(i64::from(new_chunk_size))
                                .saturating_sub(1)
                                .min(range.to_block)
                                .max(range.from_block);
                            warn!(
                                "Datalens indexer chunk transient split dao_code={} chain_id={} contract_set_id={} stream_id={} data_source_version={} from_block={} previous_to_block={} retry_to_block={} previous_chunk_size={} new_chunk_size={} error_class={} error={} duration_ms={}",
                                self.options.checkpoint_identity.dao_code,
                                self.options.checkpoint_identity.chain_id,
                                self.options.checkpoint_identity.contract_set_id,
                                self.options.checkpoint_identity.stream_id,
                                self.options.checkpoint_identity.data_source_version,
                                range.from_block,
                                range.to_block,
                                retry_to_block,
                                previous_chunk_size,
                                new_chunk_size,
                                error_class.as_str(),
                                error,
                                chunk_started_at.elapsed().as_millis()
                            );
                            continue;
                        }
                    }

                    error!(
                        "Datalens indexer chunk failed before transaction dao_code={} chain_id={} contract_set_id={} stream_id={} data_source_version={} from_block={} to_block={} target_height={} chunk_size={} datalens_retry_attempts=unavailable error={}",
                        self.options.checkpoint_identity.dao_code,
                        self.options.checkpoint_identity.chain_id,
                        self.options.checkpoint_identity.contract_set_id,
                        self.options.checkpoint_identity.stream_id,
                        self.options.checkpoint_identity.data_source_version,
                        range.from_block,
                        range.to_block,
                        effective_target,
                        chunk_sizer.current_chunk_size(),
                        error
                    );
                    return Err(error);
                }
            };
            let checkpoint_identity = self.options.checkpoint_identity.clone();
            let checkpoint_next_block_before = checkpoint.next_block;
            let write_started_at = Instant::now();
            let mut transaction = self
                .store
                .begin_transaction()
                .map_err(|error| transaction_error(&checkpoint_identity, range, error))?;
            if let Err(error) = transaction.apply_projection_batch(&processing.batch) {
                return Err(rollback_transaction_after_error(
                    &checkpoint_identity,
                    range,
                    transaction,
                    error,
                ));
            }
            if let Err(error) = transaction.advance_checkpoint(
                &self.options.checkpoint_identity,
                range.to_block,
                Some(effective_target),
            ) {
                return Err(rollback_transaction_after_error(
                    &checkpoint_identity,
                    range,
                    transaction,
                    error,
                ));
            }
            let local_processing_write_duration = processing.metrics.decode_duration
                + processing.metrics.project_duration
                + write_started_at.elapsed();
            let sizing_decision = chunk_sizer.record_chunk(AdaptiveChunkFeedback {
                returned_row_count: processing.metrics.returned_row_count,
                local_processing_write_duration,
                read_duration: processing.metrics.read_duration,
                warmup_effectiveness: processing.metrics.warmup_effectiveness.clone(),
            });
            if let Err(error) = transaction
                .update_adaptive_chunk_state(&self.options.checkpoint_identity, &sizing_decision)
            {
                return Err(rollback_transaction_after_error(
                    &checkpoint_identity,
                    range,
                    transaction,
                    error,
                ));
            }
            transaction
                .commit()
                .map_err(|error| transaction_error(&checkpoint_identity, range, error))?;
            let write_duration = write_started_at.elapsed();
            let (deferred_drain_count, deferred_drain_duration) =
                self.drain_deferred_onchain_refresh_tasks(range);
            self.run_proposal_timestamp_backfill(range.to_block);
            self.run_onchain_refresh_tick(range.to_block);

            chunks_processed += 1;
            progress_rate.record(range.to_block, Instant::now());
            let chunk_progress = progress(
                Some(range.to_block),
                effective_target,
                self.options.start_block,
                progress_rate.blocks_per_second(),
                self.options.progress_refresh_lag_blocks,
            );
            info!(
                "Datalens indexer chunk observed dao_code={} chain_id={} contract_set_id={} stream_id={} data_source_version={} configured_start_block={} from_block={} to_block={} target_height={} chunk_size={} datalens_request_count={} returned_row_count={} decoded_count={} projection_proposal_events={} projection_vote_events={} projection_token_events={} projection_timelock_events={} read_duration_ms={} decode_duration_ms={} project_duration_ms={} write_duration_ms={} local_processing_write_duration_ms={} total_duration_ms={} checkpoint_next_block_before={} checkpoint_advanced_to={} checkpoint_next_block_after={} synced_percentage={:.2} configured_range_synced_percentage={:.2} remaining_blocks={} current_rate_blocks_per_second={} eta_seconds={} datalens_retry_attempts=unavailable adaptive_chunk_size_before={} adaptive_chunk_size_after={} adaptive_reason={} adaptive_cache_full_hit_count={} adaptive_cache_partial_hit_count={} adaptive_cache_miss_count={} adaptive_cache_provider_fill_range_count={} adaptive_query_duration_max_ms={} onchain_refresh_deferred_drain_enabled={} onchain_refresh_deferred_drain_batch_size={} onchain_refresh_deferred_drain_count={} onchain_refresh_deferred_drain_duration_ms={}",
                self.options.checkpoint_identity.dao_code,
                self.options.checkpoint_identity.chain_id,
                self.options.checkpoint_identity.contract_set_id,
                self.options.checkpoint_identity.stream_id,
                self.options.checkpoint_identity.data_source_version,
                chunk_progress.configured_start_block,
                range.from_block,
                range.to_block,
                effective_target,
                sizing_decision.previous_chunk_size,
                processing.metrics.datalens_request_count,
                processing.metrics.returned_row_count,
                processing.metrics.decoded_count,
                processing.metrics.projection_event_counts.proposal,
                processing.metrics.projection_event_counts.vote,
                processing.metrics.projection_event_counts.token,
                processing.metrics.projection_event_counts.timelock,
                processing.metrics.read_duration.as_millis(),
                processing.metrics.decode_duration.as_millis(),
                processing.metrics.project_duration.as_millis(),
                write_duration.as_millis(),
                local_processing_write_duration.as_millis(),
                chunk_started_at.elapsed().as_millis(),
                checkpoint_next_block_before,
                range.to_block,
                range.to_block + 1,
                chunk_progress.synced_percentage,
                chunk_progress.configured_range_synced_percentage,
                chunk_progress.remaining_blocks,
                optional_f64_log_value(chunk_progress.current_rate_blocks_per_second),
                optional_f64_log_value(chunk_progress.eta_seconds),
                sizing_decision.previous_chunk_size,
                sizing_decision.current_chunk_size,
                sizing_decision.reason,
                processing.metrics.warmup_effectiveness.full_hit_count,
                processing.metrics.warmup_effectiveness.partial_hit_count,
                processing.metrics.warmup_effectiveness.miss_count,
                processing
                    .metrics
                    .warmup_effectiveness
                    .provider_fill_range_count,
                optional_u128_log_value(
                    processing
                        .metrics
                        .warmup_effectiveness
                        .query_duration_max_ms()
                ),
                self.options.onchain_refresh_deferred_drain_enabled,
                self.options.onchain_refresh_deferred_drain_batch_size,
                deferred_drain_count,
                deferred_drain_duration.as_millis()
            );
            let mut warmup_effectiveness_aggregation =
                processing.metrics.warmup_effectiveness.clone();
            warmup_effectiveness_aggregation
                .record_provider_limits(provider_limit_count_since_summary);
            provider_limit_count_since_summary = 0;
            let warmup_effectiveness = DatalensWarmupEffectivenessLogFields::from_aggregation(
                &self.options.checkpoint_identity,
                processing.metrics.selector_fingerprint.clone(),
                Some(checkpoint_next_block_before),
                Some(range.to_block),
                &warmup_effectiveness_aggregation,
            );
            info!(
                "Datalens follow_query warmup effectiveness summary dao_code={} chain_id={} contract_set_id={} selector_fingerprint={} query_watermark={} current_checkpoint={} full_hit_count={} partial_hit_count={} miss_count={} empty_count={} unavailable_count={} provider_fill_range_count={} provider_limit_count={} query_duration_min_ms={} query_duration_avg_ms={} query_duration_max_ms={}",
                warmup_effectiveness.dao_code,
                warmup_effectiveness.chain_id,
                warmup_effectiveness.contract_set_id,
                warmup_effectiveness.selector_fingerprint,
                optional_i64_log_value(warmup_effectiveness.query_watermark),
                optional_i64_log_value(warmup_effectiveness.current_checkpoint),
                warmup_effectiveness.full_hit_count,
                warmup_effectiveness.partial_hit_count,
                warmup_effectiveness.miss_count,
                warmup_effectiveness.empty_count,
                warmup_effectiveness.unavailable_count,
                warmup_effectiveness.provider_fill_range_count,
                warmup_effectiveness.provider_limit_count,
                optional_u128_log_value(warmup_effectiveness.query_duration_min_ms),
                optional_u128_log_value(warmup_effectiveness.query_duration_avg_ms),
                optional_u128_log_value(warmup_effectiveness.query_duration_max_ms)
            );
            checkpoint = self
                .store
                .read_or_create_checkpoint(
                    &self.options.checkpoint_identity,
                    self.options.start_block,
                )
                .map_err(to_checkpoint_error)?;
        }
    }

    fn run_onchain_refresh_tick(&mut self, processed_block: i64) {
        let Some(tick) = self.onchain_refresh_tick.as_mut() else {
            return;
        };

        match tick.run_after_chunk(processed_block) {
            Ok(report) => info!(
                "Datalens indexer onchain refresh tick completed dao_code={} chain_id={} contract_set_id={} stream_id={} data_source_version={} processed_block={} processed={} claimed={} completed={} failed={} skipped_tasks={} rpc_error_failures={} validation_failures={} db_update_failures={} cache_hits={} debounced_tasks={} skipped_reason={} duration_ms={} task_budget_hit={} duration_budget_hit={} backlog={}",
                self.options.checkpoint_identity.dao_code,
                self.options.checkpoint_identity.chain_id,
                self.options.checkpoint_identity.contract_set_id,
                self.options.checkpoint_identity.stream_id,
                self.options.checkpoint_identity.data_source_version,
                processed_block,
                report.processed,
                report.claimed,
                report.completed,
                report.failed,
                report.skipped_tasks,
                report.rpc_error_failures,
                report.validation_failures,
                report.db_update_failures,
                report.cache_hits,
                report.debounced_tasks,
                report
                    .skipped
                    .map(|reason| reason.to_string())
                    .unwrap_or_else(|| "none".to_owned()),
                report.duration.as_millis(),
                report.task_budget_hit,
                report.duration_budget_hit,
                report
                    .backlog
                    .map(|backlog| backlog.to_string())
                    .unwrap_or_else(|| "unknown".to_owned())
            ),
            Err(error) => warn!(
                "Datalens indexer onchain refresh tick failed dao_code={} chain_id={} contract_set_id={} stream_id={} data_source_version={} processed_block={} error={}",
                self.options.checkpoint_identity.dao_code,
                self.options.checkpoint_identity.chain_id,
                self.options.checkpoint_identity.contract_set_id,
                self.options.checkpoint_identity.stream_id,
                self.options.checkpoint_identity.data_source_version,
                processed_block,
                error
            ),
        }
    }

    fn drain_deferred_onchain_refresh_tasks(
        &mut self,
        range: CheckpointBlockRange,
    ) -> (usize, Duration) {
        if !self.options.onchain_refresh_deferred_drain_enabled {
            return (0, Duration::ZERO);
        }

        let started_at = Instant::now();
        let count = match self.store.drain_deferred_onchain_refresh_tasks(
            self.options.onchain_refresh_deferred_drain_batch_size,
        ) {
            Ok(count) => count,
            Err(error) => {
                warn!(
                    "Datalens indexer deferred onchain refresh drain failed after checkpoint commit dao_code={} chain_id={} contract_set_id={} stream_id={} data_source_version={} from_block={} to_block={} error={}",
                    self.options.checkpoint_identity.dao_code,
                    self.options.checkpoint_identity.chain_id,
                    self.options.checkpoint_identity.contract_set_id,
                    self.options.checkpoint_identity.stream_id,
                    self.options.checkpoint_identity.data_source_version,
                    range.from_block,
                    range.to_block,
                    error
                );
                0
            }
        };

        (count, started_at.elapsed())
    }

    fn run_proposal_timestamp_backfill(&mut self, processed_block: i64) {
        let config = self.options.proposal_timestamp_backfill;
        if !config.enabled || config.batch_size == 0 {
            return;
        }
        let Some(context) = self.contexts.proposal.as_ref() else {
            return;
        };
        if self.chain_tool.is_none() {
            return;
        }

        let started_at = Instant::now();
        let candidates = match self.store.read_proposal_timestamp_backfill_candidates(
            &self.options.checkpoint_identity,
            processed_block,
            config.batch_size,
        ) {
            Ok(candidates) => candidates,
            Err(error) => {
                warn!(
                    "Datalens indexer proposal timestamp backfill candidate read failed dao_code={} chain_id={} contract_set_id={} stream_id={} data_source_version={} processed_block={} error={}",
                    self.options.checkpoint_identity.dao_code,
                    self.options.checkpoint_identity.chain_id,
                    self.options.checkpoint_identity.contract_set_id,
                    self.options.checkpoint_identity.stream_id,
                    self.options.checkpoint_identity.data_source_version,
                    processed_block,
                    error
                );
                return;
            }
        };
        if candidates.is_empty() {
            return;
        }

        let mut builder = ChainReadPlanBuilder::new(
            self.options.checkpoint_identity.chain_id,
            context.contracts.clone(),
            context.read_plan_config,
        );
        for candidate in &candidates {
            if candidate.clock_mode != "blocknumber" {
                continue;
            }
            if candidate
                .vote_start
                .parse::<i64>()
                .is_ok_and(|block| block <= processed_block)
            {
                builder.add_optional_block_timestamp_read(&candidate.vote_start);
            }
            if candidate
                .vote_end
                .parse::<i64>()
                .is_ok_and(|block| block <= processed_block)
            {
                builder.add_optional_block_timestamp_read(&candidate.vote_end);
            }
        }

        let plan = builder.build();
        let Some(report) = self.execute_proposal_timestamp_backfill_read_plan(&plan) else {
            return;
        };
        let updates = plan_proposal_timestamp_backfill_updates(&candidates, &report);
        let updated_rows = match self.store.update_proposal_timestamp_backfill(&updates) {
            Ok(rows) => rows,
            Err(error) => {
                warn!(
                    "Datalens indexer proposal timestamp backfill update failed dao_code={} chain_id={} contract_set_id={} stream_id={} data_source_version={} processed_block={} candidates={} updates={} error={}",
                    self.options.checkpoint_identity.dao_code,
                    self.options.checkpoint_identity.chain_id,
                    self.options.checkpoint_identity.contract_set_id,
                    self.options.checkpoint_identity.stream_id,
                    self.options.checkpoint_identity.data_source_version,
                    processed_block,
                    candidates.len(),
                    updates.len(),
                    error
                );
                return;
            }
        };

        info!(
            "Datalens indexer proposal timestamp backfill completed dao_code={} chain_id={} contract_set_id={} stream_id={} data_source_version={} processed_block={} candidates={} updates={} updated_rows={} optional_failures={} duration_ms={}",
            self.options.checkpoint_identity.dao_code,
            self.options.checkpoint_identity.chain_id,
            self.options.checkpoint_identity.contract_set_id,
            self.options.checkpoint_identity.stream_id,
            self.options.checkpoint_identity.data_source_version,
            processed_block,
            candidates.len(),
            updates.len(),
            updated_rows,
            report.partial_failures.optional_failures.len(),
            started_at.elapsed().as_millis()
        );
    }

    fn execute_proposal_timestamp_backfill_read_plan(
        &self,
        plan: &ChainReadPlan,
    ) -> Option<ChainReadExecutionReport> {
        if plan.reads.is_empty() {
            return None;
        }
        let Some(chain_tool) = self.chain_tool.as_ref() else {
            return None;
        };

        match chain_tool.execute_read_plan(plan) {
            Ok(report) => Some(report),
            Err(failures) if failures.can_commit_projection_writes() => {
                Some(ChainReadExecutionReport {
                    partial_failures: failures,
                    ..ChainReadExecutionReport::default()
                })
            }
            Err(failures) => {
                warn!(
                    "Datalens indexer proposal timestamp backfill reads failed dao_code={} chain_id={} contract_set_id={} stream_id={} data_source_version={} failures={:?}",
                    self.options.checkpoint_identity.dao_code,
                    self.options.checkpoint_identity.chain_id,
                    self.options.checkpoint_identity.contract_set_id,
                    self.options.checkpoint_identity.stream_id,
                    self.options.checkpoint_identity.data_source_version,
                    failures
                );
                None
            }
        }
    }

    fn process_range(
        &mut self,
        range: CheckpointBlockRange,
        target_height: i64,
    ) -> Result<ChunkProcessingResult, IndexerRunnerError> {
        let read_started_at = Instant::now();
        let plans = plan_dao_log_queries(
            &self.options.datalens_config,
            &self.options.addresses,
            range.from_block,
            range.to_block,
        )?;
        let datalens_request_count = plans.len();
        let selector_fingerprint = plans
            .first()
            .map(|plan| datalens_selector_fingerprint(&plan.input.selector))
            .unwrap_or_else(|| "unavailable".to_owned());
        let pages = fetch_dao_log_pages(&mut self.reader, &plans)?;
        let read_duration = read_started_at.elapsed();
        let mut warmup_effectiveness = DatalensWarmupEffectivenessAggregation::new();
        for page in &pages {
            warmup_effectiveness.record_query(page.cache.clone(), page.query_duration);
        }
        let decode_started_at = Instant::now();
        let decoded = self.decode_pages(pages)?;
        let decode_duration = decode_started_at.elapsed();
        let decoded_count = decoded.events.len();
        let returned_row_count = decoded.returned_row_count;
        let project_started_at = Instant::now();
        let projected = self.project_events(decoded.events, range, target_height)?;
        let project_duration = project_started_at.elapsed();

        Ok(ChunkProcessingResult {
            batch: projected.batch,
            metrics: ChunkProcessingMetrics {
                datalens_request_count,
                returned_row_count,
                decoded_count,
                projection_event_counts: projected.event_counts,
                warmup_effectiveness,
                selector_fingerprint,
                read_duration,
                decode_duration,
                project_duration,
            },
        })
    }

    fn decode_pages(
        &self,
        pages: Vec<DatalensLogPage>,
    ) -> Result<DecodedChunk, IndexerRunnerError> {
        let mut decoded = Vec::new();
        let mut returned_row_count = 0;
        for page in pages {
            let sources = page
                .plan
                .sources
                .iter()
                .fold(BTreeMap::new(), |mut sources, source| {
                    sources
                        .entry(source.address.to_ascii_lowercase())
                        .or_insert_with(Vec::new)
                        .push(source.source);
                    sources
                });
            let rows = page_rows(page.rows)?;
            returned_row_count += rows.len();
            let logs = normalize_evm_log_rows(self.options.checkpoint_identity.chain_id, rows)
                .map_err(|error| IndexerRunnerError::Normalize(error.to_string()))?;
            for log in logs {
                if log.removed {
                    info!(
                        "skipping removed Datalens EVM log before decode dao_code={} chain_id={} log_id={} block_number={}",
                        self.options.checkpoint_identity.dao_code,
                        self.options.checkpoint_identity.chain_id,
                        log.id,
                        log.block_number
                    );
                    continue;
                }
                let Some(candidate_sources) = sources.get(&log.address) else {
                    return Err(IndexerRunnerError::Normalize(format!(
                        "Datalens log address {} was not part of the DAO log query plan",
                        log.address
                    )));
                };
                let mut unsupported_event = None;
                let mut decoded_event = None;
                for source in candidate_sources {
                    let token_standard = (*source == DaoLogSource::GovernorToken)
                        .then_some(self.options.addresses.governor_token_standard);
                    let event = self.decoder.decode(
                        &self.options.checkpoint_identity.dao_code,
                        *source,
                        token_standard,
                        &log,
                    )?;
                    match event {
                        DecodedDaoEvent::UnsupportedTopic(_) => {
                            unsupported_event.get_or_insert(event);
                        }
                        _ => {
                            decoded_event = Some(event);
                            break;
                        }
                    }
                }
                let event = decoded_event
                    .or(unsupported_event)
                    .expect("candidate sources are present");
                decoded.push((log, event));
            }
        }
        decoded.sort_by_key(|(log, _)| (log.block_number, log.transaction_index, log.log_index));
        Ok(DecodedChunk {
            events: decoded,
            returned_row_count,
        })
    }

    fn project_events(
        &mut self,
        decoded: Vec<(NormalizedEvmLog, DecodedDaoEvent)>,
        range: CheckpointBlockRange,
        target_height: i64,
    ) -> Result<ProjectedChunk, IndexerRunnerError> {
        let mut proposal_events = Vec::new();
        let mut vote_events = Vec::new();
        let mut token_events = Vec::new();
        let mut timelock_events = Vec::new();

        for (log, event) in decoded {
            match event {
                DecodedDaoEvent::Governor(event) => {
                    if self.contexts.proposal.is_some() {
                        proposal_events.push(ProposalProjectionEvent {
                            log: log.clone(),
                            event: event.clone(),
                        });
                    }
                    vote_events.push(VoteProjectionEvent { log, event });
                }
                DecodedDaoEvent::Token(event) => {
                    token_events.push(TokenProjectionEvent { log, event });
                }
                DecodedDaoEvent::Timelock(event) => {
                    if self.contexts.timelock.is_some() {
                        timelock_events.push(TimelockProjectionEvent { log, event });
                    }
                }
                DecodedDaoEvent::UnsupportedTopic(_) => {}
            }
        }

        let event_counts = ProjectionEventCounts {
            proposal: proposal_events.len(),
            vote: vote_events.len(),
            token: token_events.len(),
            timelock: timelock_events.len(),
        };
        let mut proposal = self
            .contexts
            .proposal
            .as_ref()
            .filter(|_| !proposal_events.is_empty())
            .map(|context| project_proposal_events(context, proposal_events))
            .transpose()
            .map_err(|error| IndexerRunnerError::Projection(format!("{error:?}")))?;
        if let Some(proposal) = proposal.as_mut()
            && let Some(report) =
                self.execute_chain_read_plan("proposal", &proposal.chain_read_plan)?
        {
            proposal.apply_chain_read_execution_report(&report);
        }

        let vote = (!vote_events.is_empty())
            .then(|| project_vote_events(&self.contexts.vote, vote_events))
            .transpose()
            .map_err(|error| IndexerRunnerError::Projection(format!("{error:?}")))?;
        if let Some(vote) = vote.as_ref() {
            let _ = self.execute_chain_read_plan("vote", &vote.chain_read_plan)?;
        }

        let token_context = TokenProjectionContext {
            from_block: u64::try_from(range.from_block).unwrap_or_default(),
            to_block: u64::try_from(range.to_block).unwrap_or_default(),
            target_height: u64::try_from(target_height).ok(),
            ..self.contexts.token.clone()
        };
        let token = (!token_events.is_empty())
            .then(|| project_token_events(&token_context, token_events))
            .transpose()
            .map_err(|error| IndexerRunnerError::Projection(format!("{error:?}")))?;
        let mut timelock = if let Some(context) = self
            .contexts
            .timelock
            .as_ref()
            .cloned()
            .filter(|_| !timelock_events.is_empty() || proposal.is_some())
        {
            let mut proposal_links = self
                .store
                .timelock_proposal_link_context(&context, &timelock_events, proposal.as_ref())
                .map_err(|error| IndexerRunnerError::Projection(error.to_string()))?;
            if let Some(proposal) = &proposal {
                proposal_links.extend(TimelockProposalLinkContext::from_proposal_batch(proposal));
            }
            if timelock_events.is_empty() {
                (!proposal_links.is_empty())
                    .then(|| project_timelock_proposal_links(&context, &proposal_links))
                    .transpose()
                    .map_err(|error| IndexerRunnerError::Projection(format!("{error:?}")))?
            } else {
                Some(
                    project_timelock_events_with_proposal_links(
                        &context,
                        &proposal_links,
                        timelock_events,
                    )
                    .map_err(|error| IndexerRunnerError::Projection(format!("{error:?}")))?,
                )
            }
        } else {
            None
        };
        if let Some(timelock) = timelock.as_mut()
            && let Some(report) =
                self.execute_chain_read_plan("timelock", &timelock.chain_read_plan)?
        {
            timelock.apply_chain_read_execution_report(&report);
        }

        Ok(ProjectedChunk {
            batch: IndexerProjectionBatch {
                proposal,
                vote,
                token,
                timelock,
            },
            event_counts,
        })
    }

    fn execute_chain_read_plan(
        &self,
        domain: &str,
        plan: &ChainReadPlan,
    ) -> Result<Option<ChainReadExecutionReport>, IndexerRunnerError> {
        if plan.reads.is_empty() {
            return Ok(None);
        }
        let Some(chain_tool) = self.chain_tool.as_ref() else {
            return Ok(None);
        };

        match chain_tool.execute_read_plan(plan) {
            Ok(report) => Ok(Some(report)),
            Err(failures) if failures.can_commit_projection_writes() => {
                Ok(Some(ChainReadExecutionReport {
                    partial_failures: failures,
                    ..ChainReadExecutionReport::default()
                }))
            }
            Err(failures) => Err(IndexerRunnerError::Projection(format!(
                "{domain} chain reads failed: {failures:?}"
            ))),
        }
    }
}

pub fn page_rows(rows: serde_json::Value) -> Result<Vec<serde_json::Value>, IndexerRunnerError> {
    match rows {
        serde_json::Value::Array(rows) => Ok(rows),
        serde_json::Value::Object(mut object) => {
            let Some(rows) = object.remove("rows") else {
                return Err(invalid_rows_payload_error(serde_json::Value::Object(
                    object,
                )));
            };

            match rows {
                serde_json::Value::Array(rows) => Ok(rows),
                serde_json::Value::Object(mut rows_object) => match rows_object.remove("rows") {
                    Some(serde_json::Value::Array(rows)) => Ok(rows),
                    Some(other) => Err(invalid_rows_payload_error(other)),
                    None => Err(invalid_rows_payload_error(serde_json::Value::Object(
                        rows_object,
                    ))),
                },
                other => Err(invalid_rows_payload_error(other)),
            }
        }
        other => Err(IndexerRunnerError::Normalize(format!(
            "Datalens log query returned invalid rows payload: {other}"
        ))),
    }
}

fn invalid_rows_payload_error(value: serde_json::Value) -> IndexerRunnerError {
    IndexerRunnerError::Normalize(format!(
        "Datalens log query returned invalid rows payload: {value}"
    ))
}

fn progress(
    processed_height: Option<i64>,
    target_height: i64,
    configured_start_block: i64,
    current_rate_blocks_per_second: Option<f64>,
    refresh_lag_blocks: i64,
) -> IndexerRunnerProgress {
    let synced_percentage = if target_height <= 0 {
        100.0
    } else {
        processed_height
            .map(|height| ((height as f64 / target_height as f64) * 100.0).min(100.0))
            .unwrap_or(0.0)
    };
    let configured_progress =
        configured_range_progress(processed_height, configured_start_block, target_height);
    let eta_seconds = current_rate_blocks_per_second.and_then(|rate| {
        (rate > 0.0).then_some(configured_progress.remaining_blocks as f64 / rate)
    });
    let onchain_refresh_allowed = processed_height
        .map(|height| height.saturating_add(refresh_lag_blocks) >= target_height)
        .unwrap_or(false);

    IndexerRunnerProgress {
        processed_height,
        target_height,
        synced_percentage,
        configured_start_block,
        remaining_blocks: configured_progress.remaining_blocks,
        configured_range_synced_percentage: configured_progress.synced_percentage,
        current_rate_blocks_per_second,
        eta_seconds,
        onchain_refresh_allowed,
    }
}

fn optional_f64_log_value(value: Option<f64>) -> String {
    value
        .map(|value| format!("{value:.2}"))
        .unwrap_or_else(|| "null".to_owned())
}

fn optional_i64_log_value(value: Option<i64>) -> String {
    value
        .map(|value| value.to_string())
        .unwrap_or_else(|| "unavailable".to_owned())
}

fn optional_u128_log_value(value: Option<u128>) -> String {
    value
        .map(|value| value.to_string())
        .unwrap_or_else(|| "unavailable".to_owned())
}

fn to_checkpoint_error(error: impl fmt::Display) -> IndexerRunnerError {
    IndexerRunnerError::Transaction(error.to_string())
}

fn transaction_error(
    identity: &IndexerCheckpointIdentity,
    range: CheckpointBlockRange,
    error: impl fmt::Display,
) -> IndexerRunnerError {
    error!(
        "Datalens indexer chunk transaction failed; checkpoint was not advanced dao_code={} chain_id={} contract_set_id={} stream_id={} data_source_version={} from_block={} to_block={} error={}",
        identity.dao_code,
        identity.chain_id,
        identity.contract_set_id,
        identity.stream_id,
        identity.data_source_version,
        range.from_block,
        range.to_block,
        error
    );
    IndexerRunnerError::Transaction(error.to_string())
}

fn rollback_transaction_after_error<T>(
    identity: &IndexerCheckpointIdentity,
    range: CheckpointBlockRange,
    transaction: T,
    error: impl fmt::Display,
) -> IndexerRunnerError
where
    T: IndexerRunnerTransaction,
    T::Error: fmt::Display,
{
    let message = error.to_string();
    if let Err(rollback_error) = transaction.rollback() {
        error!(
            "Datalens indexer chunk transaction rollback failed dao_code={} chain_id={} contract_set_id={} stream_id={} data_source_version={} from_block={} to_block={} error={} rollback_error={}",
            identity.dao_code,
            identity.chain_id,
            identity.contract_set_id,
            identity.stream_id,
            identity.data_source_version,
            range.from_block,
            range.to_block,
            message,
            rollback_error
        );
        return IndexerRunnerError::Transaction(format!(
            "{message}; rollback failed: {rollback_error}"
        ));
    }

    transaction_error(identity, range, message)
}

fn range_block_count(range: CheckpointBlockRange) -> u32 {
    range
        .to_block
        .saturating_sub(range.from_block)
        .saturating_add(1)
        .try_into()
        .unwrap_or(u32::MAX)
}

fn is_provider_limit_error(error: &IndexerRunnerError) -> bool {
    datalens_query_error_class(error) == Some(DatalensQueryErrorClass::ProviderLimit)
}

fn datalens_query_error_class(error: &IndexerRunnerError) -> Option<DatalensQueryErrorClass> {
    let IndexerRunnerError::Datalens(DatalensError::Query(message)) = error else {
        return None;
    };

    Some(classify_datalens_query_error(message))
}

#[derive(Clone, Debug, Eq, Error, PartialEq)]
#[error("{message}")]
pub struct InMemoryIndexerRunnerStoreError {
    message: String,
}

impl InMemoryIndexerRunnerStoreError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InMemoryIndexerRunnerStore {
    checkpoint: Option<IndexerCheckpoint>,
    proposal_repository: InMemoryProposalProjectionRepository,
    vote_repository: InMemoryVoteProjectionRepository,
    token_repository: InMemoryTokenProjectionRepository,
    timelock_repository: InMemoryTimelockProjectionRepository,
    commit_count: u64,
    rollback_count: u64,
    deferred_drain_requests: Vec<usize>,
    proposal_timestamp_backfill_candidates: Vec<ProposalTimestampBackfillCandidate>,
    proposal_timestamp_backfill_updates: Vec<ProposalTimestampBackfillUpdate>,
    proposal_timestamp_backfill_requests: Vec<(i64, usize)>,
    apply_failures: VecDeque<String>,
    commit_failures: VecDeque<String>,
    checkpoint_advance_delay: Option<Duration>,
}

impl InMemoryIndexerRunnerStore {
    pub fn new(identity: IndexerCheckpointIdentity, start_block: i64) -> Self {
        Self {
            checkpoint: Some(checkpoint(identity, start_block)),
            proposal_repository: InMemoryProposalProjectionRepository::default(),
            vote_repository: InMemoryVoteProjectionRepository::default(),
            token_repository: InMemoryTokenProjectionRepository::default(),
            timelock_repository: InMemoryTimelockProjectionRepository::default(),
            commit_count: 0,
            rollback_count: 0,
            deferred_drain_requests: Vec::new(),
            proposal_timestamp_backfill_candidates: Vec::new(),
            proposal_timestamp_backfill_updates: Vec::new(),
            proposal_timestamp_backfill_requests: Vec::new(),
            apply_failures: VecDeque::new(),
            commit_failures: VecDeque::new(),
            checkpoint_advance_delay: None,
        }
    }

    pub fn checkpoint(&self) -> Option<&IndexerCheckpoint> {
        self.checkpoint.as_ref()
    }

    pub fn commit_count(&self) -> u64 {
        self.commit_count
    }

    pub fn rollback_count(&self) -> u64 {
        self.rollback_count
    }

    pub fn deferred_drain_requests(&self) -> &[usize] {
        &self.deferred_drain_requests
    }

    pub fn set_proposal_timestamp_backfill_candidates(
        &mut self,
        candidates: Vec<ProposalTimestampBackfillCandidate>,
    ) {
        self.proposal_timestamp_backfill_candidates = candidates;
    }

    pub fn proposal_timestamp_backfill_updates(&self) -> &[ProposalTimestampBackfillUpdate] {
        &self.proposal_timestamp_backfill_updates
    }

    pub fn proposal_timestamp_backfill_requests(&self) -> &[(i64, usize)] {
        &self.proposal_timestamp_backfill_requests
    }

    pub fn fail_next_apply(&mut self, message: impl Into<String>) {
        self.apply_failures.push_back(message.into());
    }

    pub fn fail_next_commit(&mut self, message: impl Into<String>) {
        self.commit_failures.push_back(message.into());
    }

    pub fn delay_next_checkpoint_advance(&mut self, duration: Duration) {
        self.checkpoint_advance_delay = Some(duration);
    }

    pub fn rewind_next_block_for_replay(&mut self, next_block: i64) {
        if let Some(checkpoint) = &mut self.checkpoint {
            checkpoint.next_block = next_block;
        }
    }

    pub fn proposal_repository(&self) -> &InMemoryProposalProjectionRepository {
        &self.proposal_repository
    }

    pub fn vote_repository(&self) -> &InMemoryVoteProjectionRepository {
        &self.vote_repository
    }

    pub fn token_repository(&self) -> &InMemoryTokenProjectionRepository {
        &self.token_repository
    }

    pub fn timelock_repository(&self) -> &InMemoryTimelockProjectionRepository {
        &self.timelock_repository
    }
}

impl IndexerRunnerStore for InMemoryIndexerRunnerStore {
    type Error = InMemoryIndexerRunnerStoreError;
    type Transaction<'a> = InMemoryIndexerRunnerTransaction<'a>;

    fn read_or_create_checkpoint(
        &mut self,
        identity: &IndexerCheckpointIdentity,
        start_block: i64,
    ) -> Result<IndexerCheckpoint, Self::Error> {
        if self.checkpoint.is_none() {
            self.checkpoint = Some(checkpoint(identity.clone(), start_block));
        }
        self.checkpoint
            .clone()
            .ok_or_else(|| InMemoryIndexerRunnerStoreError::new("checkpoint is missing"))
    }

    fn begin_transaction(&mut self) -> Result<Self::Transaction<'_>, Self::Error> {
        Ok(InMemoryIndexerRunnerTransaction {
            store: self,
            staged_checkpoint: None,
            proposal_repository: None,
            vote_repository: None,
            token_repository: None,
            timelock_repository: None,
        })
    }

    fn timelock_proposal_link_context(
        &mut self,
        _context: &TimelockProjectionContext,
        _events: &[TimelockProjectionEvent],
        proposal: Option<&ProposalProjectionBatch>,
    ) -> Result<TimelockProposalLinkContext, Self::Error> {
        let mut links = TimelockProposalLinkContext::from_proposal_rows(
            self.proposal_repository.proposals().values(),
            self.proposal_repository.proposal_actions().values(),
        );
        if let Some(proposal) = proposal {
            links.extend(TimelockProposalLinkContext::from_queued_proposal_rows(
                proposal.proposal_queued.iter(),
                self.proposal_repository.proposals().values(),
                self.proposal_repository.proposal_actions().values(),
            ));
        }
        Ok(links)
    }

    fn drain_deferred_onchain_refresh_tasks(
        &mut self,
        max_rows: usize,
    ) -> Result<usize, Self::Error> {
        self.deferred_drain_requests.push(max_rows);
        Ok(0)
    }

    fn read_proposal_timestamp_backfill_candidates(
        &mut self,
        _identity: &IndexerCheckpointIdentity,
        processed_height: i64,
        batch_size: usize,
    ) -> Result<Vec<ProposalTimestampBackfillCandidate>, Self::Error> {
        self.proposal_timestamp_backfill_requests
            .push((processed_height, batch_size));
        Ok(self
            .proposal_timestamp_backfill_candidates
            .iter()
            .take(batch_size)
            .cloned()
            .collect())
    }

    fn update_proposal_timestamp_backfill(
        &mut self,
        updates: &[ProposalTimestampBackfillUpdate],
    ) -> Result<u64, Self::Error> {
        self.proposal_timestamp_backfill_updates
            .extend_from_slice(updates);
        Ok(updates.len() as u64)
    }
}

pub struct InMemoryIndexerRunnerTransaction<'a> {
    store: &'a mut InMemoryIndexerRunnerStore,
    staged_checkpoint: Option<IndexerCheckpoint>,
    proposal_repository: Option<InMemoryProposalProjectionRepository>,
    vote_repository: Option<InMemoryVoteProjectionRepository>,
    token_repository: Option<InMemoryTokenProjectionRepository>,
    timelock_repository: Option<InMemoryTimelockProjectionRepository>,
}

impl IndexerRunnerTransaction for InMemoryIndexerRunnerTransaction<'_> {
    type Error = InMemoryIndexerRunnerStoreError;

    fn apply_projection_batch(
        &mut self,
        batch: &IndexerProjectionBatch,
    ) -> Result<(), Self::Error> {
        if let Some(message) = self.store.apply_failures.pop_front() {
            return Err(InMemoryIndexerRunnerStoreError::new(message));
        }
        if let Some(batch) = &batch.proposal {
            let repository = self
                .proposal_repository
                .get_or_insert_with(|| self.store.proposal_repository.clone());
            repository.apply(batch).map_err(|error| {
                InMemoryIndexerRunnerStoreError::new(format!("proposal write failed: {error:?}"))
            })?;
        }
        if let Some(batch) = &batch.vote {
            let repository = self
                .vote_repository
                .get_or_insert_with(|| self.store.vote_repository.clone());
            repository.apply(batch).map_err(|error| {
                InMemoryIndexerRunnerStoreError::new(format!("vote write failed: {error:?}"))
            })?;
        }
        if let Some(batch) = &batch.token {
            let repository = self
                .token_repository
                .get_or_insert_with(|| self.store.token_repository.clone());
            repository.apply(batch).map_err(|error| {
                InMemoryIndexerRunnerStoreError::new(format!("token write failed: {error:?}"))
            })?;
        }
        if let Some(batch) = &batch.timelock {
            let repository = self
                .timelock_repository
                .get_or_insert_with(|| self.store.timelock_repository.clone());
            repository.apply(batch).map_err(|error| {
                InMemoryIndexerRunnerStoreError::new(format!("timelock write failed: {error:?}"))
            })?;
        }

        Ok(())
    }

    fn advance_checkpoint(
        &mut self,
        identity: &IndexerCheckpointIdentity,
        processed_height: i64,
        target_height: Option<i64>,
    ) -> Result<(), Self::Error> {
        self.advance_checkpoint_inner(identity, processed_height, target_height)
    }

    fn update_adaptive_chunk_state(
        &mut self,
        identity: &IndexerCheckpointIdentity,
        adaptive_sizing_decision: &AdaptiveChunkSizingDecision,
    ) -> Result<(), Self::Error> {
        let mut checkpoint = self
            .staged_checkpoint
            .take()
            .or_else(|| self.store.checkpoint.clone())
            .ok_or_else(|| InMemoryIndexerRunnerStoreError::new("checkpoint is missing"))?;
        if checkpoint.identity != *identity {
            return Err(InMemoryIndexerRunnerStoreError::new(
                "checkpoint identity mismatch",
            ));
        }
        checkpoint.adaptive_chunk_size = Some(adaptive_sizing_decision.current_chunk_size);
        checkpoint.adaptive_chunk_reason = Some(adaptive_sizing_decision.reason.to_string());
        checkpoint.adaptive_chunk_updated_at = Some("in-memory".to_owned());
        self.staged_checkpoint = Some(checkpoint);
        Ok(())
    }

    fn commit(mut self) -> Result<(), Self::Error> {
        if let Some(message) = self.store.commit_failures.pop_front() {
            return Err(InMemoryIndexerRunnerStoreError::new(message));
        }
        if let Some(repository) = self.proposal_repository.take() {
            self.store.proposal_repository = repository;
        }
        if let Some(repository) = self.vote_repository.take() {
            self.store.vote_repository = repository;
        }
        if let Some(repository) = self.token_repository.take() {
            self.store.token_repository = repository;
        }
        if let Some(repository) = self.timelock_repository.take() {
            self.store.timelock_repository = repository;
        }
        if let Some(checkpoint) = self.staged_checkpoint.take() {
            self.store.checkpoint = Some(checkpoint);
        }
        self.store.commit_count += 1;
        Ok(())
    }

    fn rollback(self) -> Result<(), Self::Error> {
        self.store.rollback_count += 1;
        Ok(())
    }
}

impl InMemoryIndexerRunnerTransaction<'_> {
    fn advance_checkpoint_inner(
        &mut self,
        identity: &IndexerCheckpointIdentity,
        processed_height: i64,
        target_height: Option<i64>,
    ) -> Result<(), InMemoryIndexerRunnerStoreError> {
        let mut checkpoint = self
            .store
            .checkpoint
            .clone()
            .ok_or_else(|| InMemoryIndexerRunnerStoreError::new("checkpoint is missing"))?;
        if checkpoint.identity != *identity {
            return Err(InMemoryIndexerRunnerStoreError::new(
                "checkpoint identity mismatch",
            ));
        }
        if let Some(delay) = self.store.checkpoint_advance_delay.take() {
            std::thread::sleep(delay);
        }
        checkpoint.processed_height = Some(
            checkpoint
                .processed_height
                .map_or(processed_height, |current| current.max(processed_height)),
        );
        checkpoint.next_block = checkpoint.next_block.max(processed_height + 1);
        checkpoint.target_height = match (checkpoint.target_height, target_height) {
            (Some(current), Some(next)) => Some(current.max(next)),
            (None, Some(next)) => Some(next),
            (current, None) => current,
        };
        checkpoint.last_error = None;
        self.staged_checkpoint = Some(checkpoint);
        Ok(())
    }
}

fn checkpoint(identity: IndexerCheckpointIdentity, start_block: i64) -> IndexerCheckpoint {
    IndexerCheckpoint {
        identity,
        next_block: start_block,
        processed_height: None,
        target_height: None,
        adaptive_chunk_size: None,
        adaptive_chunk_reason: None,
        adaptive_chunk_updated_at: None,
        updated_at: "in-memory".to_owned(),
        last_error: None,
        lock_owner: None,
        locked_at: None,
    }
}
