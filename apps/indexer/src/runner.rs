use std::collections::{BTreeMap, VecDeque};
use std::fmt;
use std::time::{Duration, Instant};

use log::{error, info};
use thiserror::Error;

use crate::{
    CheckpointBlockRange, CheckpointError, DaoContractAddresses, DaoEventDecodeError, DaoLogSource,
    DatalensConfig, DatalensError, DatalensLogPage, DatalensLogQueryReader, DecodedDaoEvent,
    GovernanceTokenStandard, InMemoryProposalProjectionRepository,
    InMemoryTimelockProjectionRepository, InMemoryTokenProjectionRepository,
    InMemoryVoteProjectionRepository, IndexerCheckpoint, IndexerCheckpointIdentity,
    NormalizedEvmLog, ProposalProjectionBatch, ProposalProjectionContext, ProposalProjectionEvent,
    ProposalProjectionRepository, TimelockProjectionBatch, TimelockProjectionContext,
    TimelockProjectionEvent, TimelockProjectionRepository, TimelockProposalLinkContext,
    TokenProjectionBatch, TokenProjectionContext, TokenProjectionEvent, TokenProjectionRepository,
    VoteProjectionBatch, VoteProjectionContext, VoteProjectionEvent, VoteProjectionRepository,
    decode_dao_log, fetch_dao_log_pages, normalize_evm_log_rows, plan_dao_log_queries,
    plan_next_checkpoint_range, project_proposal_events,
    project_timelock_events_with_proposal_links, project_token_events, project_vote_events,
};

#[derive(Clone, Debug)]
pub struct IndexerRunnerOptions {
    pub datalens_config: DatalensConfig,
    pub addresses: DaoContractAddresses,
    pub checkpoint_identity: IndexerCheckpointIdentity,
    pub start_block: i64,
    pub safe_height: Option<i64>,
    pub progress_refresh_lag_blocks: i64,
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
    pub max_chunk_size: u32,
    pub min_chunk_size: u32,
    pub local_processing_shrink_threshold: Duration,
    pub dense_returned_row_threshold: usize,
    pub sparse_returned_row_threshold: usize,
    pub stable_chunks_to_grow: u32,
}

impl AdaptiveChunkSizerConfig {
    pub fn for_max_chunk_size(max_chunk_size: u32) -> Self {
        Self {
            max_chunk_size,
            min_chunk_size: 1,
            local_processing_shrink_threshold: Duration::from_secs(10),
            dense_returned_row_threshold: 5_000,
            sparse_returned_row_threshold: 100,
            stable_chunks_to_grow: 2,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AdaptiveChunkFeedback {
    pub returned_row_count: usize,
    pub local_processing_write_duration: Duration,
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
    StableSparseRange,
    Hold,
}

impl fmt::Display for AdaptiveChunkSizingReason {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::DenseReturnedRows => formatter.write_str("dense_returned_rows"),
            Self::SlowLocalProcessing => formatter.write_str("slow_local_processing"),
            Self::StableSparseRange => formatter.write_str("stable_sparse_range"),
            Self::Hold => formatter.write_str("hold"),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdaptiveChunkSizer {
    config: AdaptiveChunkSizerConfig,
    current_chunk_size: u32,
    stable_chunks: u32,
}

impl AdaptiveChunkSizer {
    pub fn new(config: AdaptiveChunkSizerConfig) -> Result<Self, CheckpointError> {
        if config.max_chunk_size == 0 || config.min_chunk_size == 0 {
            return Err(CheckpointError::InvalidRangeLimit);
        }
        if config.min_chunk_size > config.max_chunk_size {
            return Err(CheckpointError::InvalidRangeLimit);
        }

        Ok(Self {
            config,
            current_chunk_size: config.max_chunk_size,
            stable_chunks: 0,
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
        let dense_range = feedback.returned_row_count >= self.config.dense_returned_row_threshold;
        let slow_local_processing = feedback.local_processing_write_duration
            > self.config.local_processing_shrink_threshold;

        let reason = if slow_local_processing || dense_range {
            self.stable_chunks = 0;
            self.current_chunk_size = (self.current_chunk_size / 2).max(self.config.min_chunk_size);
            if slow_local_processing {
                AdaptiveChunkSizingReason::SlowLocalProcessing
            } else {
                AdaptiveChunkSizingReason::DenseReturnedRows
            }
        } else if feedback.returned_row_count <= self.config.sparse_returned_row_threshold {
            self.stable_chunks = self.stable_chunks.saturating_add(1);
            if self.stable_chunks >= self.config.stable_chunks_to_grow {
                self.stable_chunks = 0;
                self.current_chunk_size = self
                    .current_chunk_size
                    .saturating_mul(2)
                    .min(self.config.max_chunk_size);
                AdaptiveChunkSizingReason::StableSparseRange
            } else {
                AdaptiveChunkSizingReason::Hold
            }
        } else {
            self.stable_chunks = 0;
            AdaptiveChunkSizingReason::Hold
        };

        AdaptiveChunkSizingDecision {
            previous_chunk_size,
            current_chunk_size: self.current_chunk_size,
            reason,
        }
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

    fn commit(self) -> Result<(), Self::Error>;
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
}

struct ChunkProcessingResult {
    batch: IndexerProjectionBatch,
    metrics: ChunkProcessingMetrics,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
struct ChunkProcessingMetrics {
    datalens_request_count: usize,
    returned_row_count: usize,
    decoded_count: usize,
    projection_event_counts: ProjectionEventCounts,
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

    pub fn run_to_target(
        &mut self,
        target_height: i64,
    ) -> Result<IndexerRunnerReport, IndexerRunnerError> {
        let effective_target = self
            .options
            .safe_height
            .map_or(target_height, |safe_height| safe_height.min(target_height));
        let mut chunk_sizer =
            AdaptiveChunkSizer::new(AdaptiveChunkSizerConfig::for_max_chunk_size(
                self.options.datalens_config.query_limits.block_range_limit,
            ))?;
        let mut chunks_processed = 0;
        let mut checkpoint = self
            .store
            .read_or_create_checkpoint(&self.options.checkpoint_identity, self.options.start_block)
            .map_err(to_checkpoint_error)?;
        let checkpoint_choice = if checkpoint.next_block > self.options.start_block {
            "resume"
        } else {
            "start"
        };
        info!(
            "Datalens indexer checkpoint selected dao_code={} chain_id={} contract_set_id={} start_block={} next_block={} checkpoint_choice={}",
            self.options.checkpoint_identity.dao_code,
            self.options.checkpoint_identity.chain_id,
            self.options.checkpoint_identity.contract_set_id,
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
                        self.options.progress_refresh_lag_blocks,
                    ),
                });
            };

            info!(
                "processing Datalens indexer chunk dao_code={} chain_id={} contract_set_id={} from_block={} to_block={} target_height={} chunk_size={}",
                self.options.checkpoint_identity.dao_code,
                self.options.checkpoint_identity.chain_id,
                self.options.checkpoint_identity.contract_set_id,
                range.from_block,
                range.to_block,
                effective_target,
                chunk_sizer.current_chunk_size()
            );

            let chunk_started_at = Instant::now();
            let processing = match self.process_range(range, effective_target) {
                Ok(processing) => processing,
                Err(error) => {
                    error!(
                        "Datalens indexer chunk failed before transaction dao_code={} chain_id={} contract_set_id={} from_block={} to_block={} target_height={} chunk_size={} datalens_retry_attempts=unavailable error={}",
                        self.options.checkpoint_identity.dao_code,
                        self.options.checkpoint_identity.chain_id,
                        self.options.checkpoint_identity.contract_set_id,
                        range.from_block,
                        range.to_block,
                        effective_target,
                        chunk_sizer.current_chunk_size(),
                        error
                    );
                    return Err(error);
                }
            };
            let dao_code = self.options.checkpoint_identity.dao_code.clone();
            let chain_id = self.options.checkpoint_identity.chain_id;
            let checkpoint_next_block_before = checkpoint.next_block;
            let write_started_at = Instant::now();
            let mut transaction = self
                .store
                .begin_transaction()
                .map_err(|error| transaction_error(&dao_code, chain_id, range, error))?;
            transaction
                .apply_projection_batch(&processing.batch)
                .map_err(|error| transaction_error(&dao_code, chain_id, range, error))?;
            transaction
                .advance_checkpoint(
                    &self.options.checkpoint_identity,
                    range.to_block,
                    Some(effective_target),
                )
                .map_err(|error| transaction_error(&dao_code, chain_id, range, error))?;
            transaction
                .commit()
                .map_err(|error| transaction_error(&dao_code, chain_id, range, error))?;
            let write_duration = write_started_at.elapsed();

            chunks_processed += 1;
            let local_processing_write_duration = processing.metrics.decode_duration
                + processing.metrics.project_duration
                + write_duration;
            let sizing_decision = chunk_sizer.record_chunk(AdaptiveChunkFeedback {
                returned_row_count: processing.metrics.returned_row_count,
                local_processing_write_duration,
            });
            let chunk_progress = progress(
                Some(range.to_block),
                effective_target,
                self.options.progress_refresh_lag_blocks,
            );
            info!(
                "Datalens indexer chunk observed dao_code={} chain_id={} contract_set_id={} from_block={} to_block={} target_height={} chunk_size={} datalens_request_count={} returned_row_count={} decoded_count={} projection_proposal_events={} projection_vote_events={} projection_token_events={} projection_timelock_events={} read_duration_ms={} decode_duration_ms={} project_duration_ms={} write_duration_ms={} local_processing_write_duration_ms={} total_duration_ms={} checkpoint_next_block_before={} checkpoint_advanced_to={} checkpoint_next_block_after={} synced_percentage={:.2} datalens_retry_attempts=unavailable adaptive_chunk_size_before={} adaptive_chunk_size_after={} adaptive_reason={}",
                self.options.checkpoint_identity.dao_code,
                self.options.checkpoint_identity.chain_id,
                self.options.checkpoint_identity.contract_set_id,
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
                sizing_decision.previous_chunk_size,
                sizing_decision.current_chunk_size,
                sizing_decision.reason
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
        let pages = fetch_dao_log_pages(&mut self.reader, &plans)?;
        let read_duration = read_started_at.elapsed();
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
                .map(|source| (source.address.to_ascii_lowercase(), source.source))
                .collect::<BTreeMap<_, _>>();
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
                let Some(source) = sources.get(&log.address).copied() else {
                    return Err(IndexerRunnerError::Normalize(format!(
                        "Datalens log address {} was not part of the DAO log query plan",
                        log.address
                    )));
                };
                let token_standard = (source == DaoLogSource::GovernorToken)
                    .then_some(self.options.addresses.governor_token_standard);
                let event = self.decoder.decode(
                    &self.options.checkpoint_identity.dao_code,
                    source,
                    token_standard,
                    &log,
                )?;
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
        let proposal = self
            .contexts
            .proposal
            .as_ref()
            .filter(|_| !proposal_events.is_empty())
            .map(|context| project_proposal_events(context, proposal_events))
            .transpose()
            .map_err(|error| IndexerRunnerError::Projection(format!("{error:?}")))?;
        let vote = (!vote_events.is_empty())
            .then(|| project_vote_events(&self.contexts.vote, vote_events))
            .transpose()
            .map_err(|error| IndexerRunnerError::Projection(format!("{error:?}")))?;
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
        let timelock = if let Some(context) = self
            .contexts
            .timelock
            .as_ref()
            .filter(|_| !timelock_events.is_empty())
            .cloned()
        {
            let mut proposal_links = self
                .store
                .timelock_proposal_link_context(&context, &timelock_events, proposal.as_ref())
                .map_err(|error| IndexerRunnerError::Projection(error.to_string()))?;
            if let Some(proposal) = &proposal {
                proposal_links.extend(TimelockProposalLinkContext::from_proposal_batch(proposal));
            }
            Some(
                project_timelock_events_with_proposal_links(
                    &context,
                    &proposal_links,
                    timelock_events,
                )
                .map_err(|error| IndexerRunnerError::Projection(format!("{error:?}")))?,
            )
        } else {
            None
        };

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
    refresh_lag_blocks: i64,
) -> IndexerRunnerProgress {
    let synced_percentage = if target_height <= 0 {
        100.0
    } else {
        processed_height
            .map(|height| ((height as f64 / target_height as f64) * 100.0).min(100.0))
            .unwrap_or(0.0)
    };
    let onchain_refresh_allowed = processed_height
        .map(|height| height.saturating_add(refresh_lag_blocks) >= target_height)
        .unwrap_or(false);

    IndexerRunnerProgress {
        processed_height,
        target_height,
        synced_percentage,
        onchain_refresh_allowed,
    }
}

fn to_checkpoint_error(error: impl fmt::Display) -> IndexerRunnerError {
    IndexerRunnerError::Transaction(error.to_string())
}

fn transaction_error(
    dao_code: &str,
    chain_id: i32,
    range: CheckpointBlockRange,
    error: impl fmt::Display,
) -> IndexerRunnerError {
    error!(
        "Datalens indexer chunk transaction failed; checkpoint was not advanced dao_code={} chain_id={} from_block={} to_block={} error={}",
        dao_code, chain_id, range.from_block, range.to_block, error
    );
    IndexerRunnerError::Transaction(error.to_string())
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
    commit_failures: VecDeque<String>,
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
            commit_failures: VecDeque::new(),
        }
    }

    pub fn checkpoint(&self) -> Option<&IndexerCheckpoint> {
        self.checkpoint.as_ref()
    }

    pub fn commit_count(&self) -> u64 {
        self.commit_count
    }

    pub fn fail_next_commit(&mut self, message: impl Into<String>) {
        self.commit_failures.push_back(message.into());
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
}

fn checkpoint(identity: IndexerCheckpointIdentity, start_block: i64) -> IndexerCheckpoint {
    IndexerCheckpoint {
        identity,
        next_block: start_block,
        processed_height: None,
        target_height: None,
        updated_at: "in-memory".to_owned(),
        last_error: None,
        lock_owner: None,
        locked_at: None,
    }
}
