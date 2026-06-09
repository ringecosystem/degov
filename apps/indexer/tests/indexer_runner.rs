use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use datalens_sdk::native::QueryInput;
use degov_datalens_indexer::{
    AdaptiveChunkFeedback, AdaptiveChunkSizer, AdaptiveChunkSizerConfig, AdaptiveChunkSizingReason,
    BatchReadPlanConfig, ChainContracts, ChainFamily, ChainIdentityConfig, DaoContractAddresses,
    DaoEventDecodeError, DaoLogSource, DatalensConfig, DatalensError, DatalensFinality,
    DatalensLogQueryCacheSummary, DatalensLogQueryReader, DatalensLogQueryResult,
    DatalensWarmupEffectivenessAggregation, DatasetKeyConfig, DecodedDaoEvent,
    DecodedGovernorEvent, DecodedTokenEvent, GovernanceTokenStandard, InMemoryIndexerRunnerStore,
    IndexerCheckpointIdentity, IndexerEventDecoder, IndexerRunner, IndexerRunnerContexts,
    IndexerRunnerOptions, NormalizedEvmLog, QueryLimitConfig, SecretString, TokenProjectionContext,
    VoteCastEvent, VoteProjectionContext, page_rows,
};
use degov_datalens_indexer::{IndexerOnchainRefreshTick, OnchainRefreshTickReport};
use serde_json::{Value, json};

#[test]
fn test_page_rows_accepts_bare_array_response() {
    let rows = page_rows(json!([{"block_number": 1}, {"block_number": 2}]))
        .expect("bare rows are accepted");

    assert_eq!(rows.len(), 2);
}

#[test]
fn test_page_rows_accepts_live_datalens_nested_response() {
    let rows = page_rows(json!({
        "dataset_key": {
            "family": "Evm",
            "name": "logs"
        },
        "rows": {
            "dataset": "logs",
            "rows": [
                {"block_number": 5873379}
            ]
        }
    }))
    .expect("live Datalens nested rows are accepted");

    assert_eq!(rows, vec![json!({"block_number": 5873379})]);
}

#[test]
fn test_page_rows_rejects_malformed_response() {
    let error = page_rows(json!({"rows": {"dataset": "logs"}}))
        .expect_err("missing nested rows should fail");

    assert!(
        error
            .to_string()
            .contains("Datalens log query returned invalid rows payload")
    );
}

#[test]
fn test_runner_processes_multiple_chunks_and_advances_checkpoint_after_commits() {
    let mut runner = runner(
        vec![
            vec![
                row(1, 0, 0),
                row_at_address(1, 0, 1, &TOKEN.to_ascii_uppercase()),
            ],
            vec![row(2, 0, 0)],
        ],
        ScriptedDecoder,
    );

    let report = runner.run_to_target(2).expect("runner succeeds");

    assert_eq!(report.chunks_processed, 2);
    assert_eq!(report.last_progress.processed_height, Some(2));
    assert_eq!(report.last_progress.synced_percentage, 100.0);
    assert_eq!(report.last_progress.configured_start_block, 1);
    assert_eq!(
        report.last_progress.configured_range_synced_percentage,
        100.0
    );
    assert_eq!(report.last_progress.remaining_blocks, 0);
    assert!(report.last_progress.onchain_refresh_allowed);
    assert_eq!(
        runner.store().checkpoint().expect("checkpoint").next_block,
        3
    );
    assert_eq!(runner.store().commit_count(), 2);
    assert_eq!(
        runner
            .store()
            .vote_repository()
            .data_metric()
            .votes_weight_for_sum,
        "30"
    );
    assert_eq!(
        runner.store().token_repository().delegate_changed().len(),
        1
    );
}

#[test]
fn test_runner_reports_configured_range_progress_for_nonzero_start_block() {
    let mut options = options();
    options.start_block = 100;
    set_block_range_limit(&mut options, 10);
    let mut runner = runner_with_store(
        vec![vec![row(100, 0, 0)]],
        ScriptedDecoder,
        options,
        InMemoryIndexerRunnerStore::new(identity(), 100),
    );
    runner.request_shutdown_after_chunks(1);

    let report = runner.run_to_target(199).expect("runner succeeds");

    assert_eq!(report.chunks_processed, 1);
    assert_eq!(report.last_progress.processed_height, Some(109));
    assert_eq!(report.last_progress.target_height, 199);
    assert_eq!(report.last_progress.configured_start_block, 100);
    assert_eq!(report.last_progress.remaining_blocks, 90);
    assert_eq!(
        report.last_progress.configured_range_synced_percentage,
        10.0
    );
    assert_eq!(report.last_progress.eta_seconds, None);
}

#[test]
fn test_runner_updates_configured_range_progress_when_target_height_changes() {
    let mut options = options();
    set_block_range_limit(&mut options, 10);
    let store = InMemoryIndexerRunnerStore::new(identity(), 1);
    let mut runner = runner_with_store(
        vec![vec![row(1, 0, 0)], vec![row(11, 0, 0)]],
        ScriptedDecoder,
        options,
        store,
    );

    let first_report = runner.run_to_target(10).expect("first run succeeds");
    let second_report = runner.run_to_target(20).expect("second run succeeds");

    assert_eq!(first_report.last_progress.processed_height, Some(10));
    assert_eq!(first_report.last_progress.synced_percentage, 100.0);
    assert_eq!(
        first_report
            .last_progress
            .configured_range_synced_percentage,
        100.0
    );
    assert_eq!(second_report.last_progress.processed_height, Some(20));
    assert_eq!(second_report.last_progress.synced_percentage, 100.0);
    assert_eq!(
        second_report
            .last_progress
            .configured_range_synced_percentage,
        100.0
    );
    assert_eq!(second_report.last_progress.remaining_blocks, 0);
}

#[test]
fn test_runner_reports_unavailable_eta_with_insufficient_samples() {
    let mut runner = runner(vec![vec![row(1, 0, 0)]], ScriptedDecoder);
    runner.request_shutdown_after_chunks(1);

    let report = runner.run_to_target(3).expect("runner stops cleanly");

    assert_eq!(report.chunks_processed, 1);
    assert_eq!(report.last_progress.remaining_blocks, 2);
    assert_eq!(report.last_progress.current_rate_blocks_per_second, None);
    assert_eq!(report.last_progress.eta_seconds, None);
}

#[test]
fn test_runner_reports_eta_after_enough_progress_samples() {
    let mut runner = runner(
        vec![vec![row(1, 0, 0)], vec![row(2, 0, 0)]],
        ScriptedDecoder,
    );
    runner.request_shutdown_after_chunks(2);

    let report = runner.run_to_target(4).expect("runner stops cleanly");

    assert_eq!(report.chunks_processed, 2);
    assert_eq!(report.last_progress.remaining_blocks, 2);
    assert!(
        report
            .last_progress
            .current_rate_blocks_per_second
            .is_some_and(|rate| rate > 0.0)
    );
    assert!(
        report
            .last_progress
            .eta_seconds
            .is_some_and(|eta| eta > 0.0)
    );
}

#[test]
fn test_runner_skips_removed_logs_before_decode_and_still_advances_checkpoint() {
    let mut runner = runner_with_decoder(
        vec![vec![removed_row(1, 0, 0)]],
        RejectRemovedDecoder,
        options(),
    );

    let report = runner.run_to_target(1).expect("runner succeeds");

    assert_eq!(report.chunks_processed, 1);
    assert_eq!(
        runner.store().checkpoint().expect("checkpoint").next_block,
        2
    );
    assert_eq!(runner.store().commit_count(), 1);
    assert_eq!(
        runner.store().vote_repository().data_metric().votes_count,
        0
    );
}

#[test]
fn test_runner_keeps_checkpoint_unchanged_when_transaction_fails() {
    let mut runner = runner(vec![vec![row(1, 0, 0)]], ScriptedDecoder);
    runner
        .store_mut()
        .fail_next_commit("projection write failed");

    let error = runner.run_to_target(1).expect_err("commit fails");

    assert!(error.to_string().contains("projection write failed"));
    assert_eq!(
        runner.store().checkpoint().expect("checkpoint").next_block,
        1
    );
    assert_eq!(runner.store().commit_count(), 0);
    assert_eq!(
        runner.store().vote_repository().data_metric().votes_count,
        0
    );
}

#[test]
fn test_runner_rolls_back_when_projection_write_fails() {
    let tick_blocks = Arc::new(Mutex::new(Vec::new()));
    let tick = RecordingOnchainRefreshTick {
        blocks: Arc::clone(&tick_blocks),
    };
    let mut runner =
        runner(vec![vec![row(1, 0, 0)]], ScriptedDecoder).with_onchain_refresh_tick(Box::new(tick));
    runner
        .store_mut()
        .fail_next_apply("projection write failed");

    let error = runner.run_to_target(1).expect_err("projection write fails");

    assert!(error.to_string().contains("projection write failed"));
    assert_eq!(
        runner.store().checkpoint().expect("checkpoint").next_block,
        1
    );
    assert_eq!(runner.store().commit_count(), 0);
    assert_eq!(runner.store().rollback_count(), 1);
    assert_eq!(*tick_blocks.lock().expect("tick blocks"), Vec::<i64>::new());
}

#[test]
fn test_runner_runs_onchain_refresh_tick_after_chunk_commit() {
    let tick_blocks = Arc::new(Mutex::new(Vec::new()));
    let tick = RecordingOnchainRefreshTick {
        blocks: Arc::clone(&tick_blocks),
    };
    let mut runner =
        runner(vec![vec![row(1, 0, 0)]], ScriptedDecoder).with_onchain_refresh_tick(Box::new(tick));

    runner.run_to_target(1).expect("runner succeeds");

    assert_eq!(*tick_blocks.lock().expect("tick blocks"), vec![1]);
    assert_eq!(runner.store().commit_count(), 1);
}

#[test]
fn test_runner_drains_deferred_onchain_refresh_with_configured_budget_after_chunk_commit() {
    let mut options = options();
    options.onchain_refresh_deferred_drain_batch_size = 1_000;
    let mut runner = runner_with_decoder(vec![vec![row(1, 0, 0)]], ScriptedDecoder, options);

    runner.run_to_target(1).expect("runner succeeds");

    assert_eq!(runner.store().deferred_drain_requests(), &[1_000]);
}

#[test]
fn test_runner_does_not_run_onchain_refresh_tick_when_chunk_commit_fails() {
    let tick_blocks = Arc::new(Mutex::new(Vec::new()));
    let tick = RecordingOnchainRefreshTick {
        blocks: Arc::clone(&tick_blocks),
    };
    let mut runner =
        runner(vec![vec![row(1, 0, 0)]], ScriptedDecoder).with_onchain_refresh_tick(Box::new(tick));
    runner
        .store_mut()
        .fail_next_commit("projection write failed");

    runner.run_to_target(1).expect_err("commit fails");

    assert_eq!(*tick_blocks.lock().expect("tick blocks"), Vec::<i64>::new());
    assert_eq!(runner.store().commit_count(), 0);
}

#[test]
fn test_runner_keeps_checkpoint_unchanged_when_datalens_query_fails() {
    let mut runner = IndexerRunner::new(
        options(),
        contexts(),
        FailingDatalensReader,
        InMemoryIndexerRunnerStore::new(identity(), 1),
        ScriptedDecoder,
    );

    let error = runner.run_to_target(1).expect_err("query fails");

    assert!(error.to_string().contains("rate_limited"));
    assert_eq!(
        runner.store().checkpoint().expect("checkpoint").next_block,
        1
    );
    assert_eq!(runner.store().commit_count(), 0);
    assert_eq!(
        runner.store().vote_repository().data_metric().votes_count,
        0
    );
}

#[test]
fn test_runner_splits_provider_limit_range_and_advances_checkpoint_after_subranges() {
    let mut options = options();
    set_block_range_limit(&mut options, 1_000);
    let observed_ranges = Arc::new(Mutex::new(Vec::new()));
    let reader = ProviderLimitDatalensReader::new(500, observed_ranges.clone());
    let mut runner = IndexerRunner::new(
        options,
        contexts(),
        reader,
        InMemoryIndexerRunnerStore::new(identity(), 1),
        ScriptedDecoder,
    );

    let report = runner.run_to_target(1_000).expect("runner succeeds");

    assert_eq!(report.chunks_processed, 2);
    assert_eq!(
        runner.store().checkpoint().expect("checkpoint").next_block,
        1_001
    );
    assert_eq!(runner.store().commit_count(), 2);
    assert_eq!(
        *observed_ranges.lock().expect("observed ranges"),
        vec![(1, 1_000), (1, 500), (501, 1_000)]
    );
}

#[test]
fn test_runner_fails_single_block_provider_limit_without_advancing_checkpoint() {
    let mut options = options();
    set_block_range_limit(&mut options, 1);
    let observed_ranges = Arc::new(Mutex::new(Vec::new()));
    let reader = ProviderLimitDatalensReader::new(0, observed_ranges.clone());
    let mut runner = IndexerRunner::new(
        options,
        contexts(),
        reader,
        InMemoryIndexerRunnerStore::new(identity(), 1),
        ScriptedDecoder,
    );

    let error = runner
        .run_to_target(1)
        .expect_err("single-block provider limit fails");

    assert!(error.to_string().contains("provider_limit"));
    assert_eq!(
        runner.store().checkpoint().expect("checkpoint").next_block,
        1
    );
    assert_eq!(runner.store().commit_count(), 0);
    assert_eq!(
        *observed_ranges.lock().expect("observed ranges"),
        vec![(1, 1)]
    );
}

#[test]
fn test_adaptive_chunk_sizer_grows_after_consecutive_full_cache_hits() {
    let mut sizer = AdaptiveChunkSizer::new(adaptive_config(100, 400)).expect("sizer");

    let first = sizer.record_chunk(adaptive_feedback_with_rows(
        cache_full_hit(),
        Duration::from_millis(50),
        1_000,
    ));
    let second = sizer.record_chunk(adaptive_feedback_with_rows(
        cache_full_hit(),
        Duration::from_millis(50),
        1_000,
    ));

    assert_eq!(first.current_chunk_size, 100);
    assert_eq!(first.reason, AdaptiveChunkSizingReason::Hold);
    assert_eq!(second.previous_chunk_size, 100);
    assert_eq!(second.current_chunk_size, 200);
    assert_eq!(second.reason, AdaptiveChunkSizingReason::StableFullHit);
}

#[test]
fn test_adaptive_chunk_sizer_grows_after_consecutive_fast_chunks() {
    let mut sizer = AdaptiveChunkSizer::new(adaptive_config(100, 400)).expect("sizer");

    sizer.record_chunk(adaptive_feedback(
        cache_unavailable(),
        Duration::from_millis(20),
    ));
    let decision = sizer.record_chunk(adaptive_feedback(
        cache_unavailable(),
        Duration::from_millis(20),
    ));

    assert_eq!(decision.current_chunk_size, 200);
    assert_eq!(decision.reason, AdaptiveChunkSizingReason::StableFastChunk);
}

#[test]
fn test_adaptive_chunk_sizer_fast_cache_fill_recovers_and_grows() {
    let mut sizer = AdaptiveChunkSizer::new(adaptive_config(100, 400)).expect("sizer");

    let first = sizer.record_chunk(adaptive_feedback(
        cache_partial_hit(),
        Duration::from_millis(50),
    ));
    let second = sizer.record_chunk(adaptive_feedback(cache_miss(), Duration::from_millis(50)));
    let third = sizer.record_chunk(adaptive_feedback(
        cache_provider_fill(),
        Duration::from_millis(50),
    ));
    let fourth = sizer.record_chunk(adaptive_feedback(
        cache_provider_fill(),
        Duration::from_millis(50),
    ));

    assert_eq!(first.current_chunk_size, 100);
    assert_eq!(first.reason, AdaptiveChunkSizingReason::FastCacheFill);
    assert_eq!(second.current_chunk_size, 200);
    assert_eq!(
        second.reason,
        AdaptiveChunkSizingReason::StableFastCacheFill
    );
    assert_eq!(third.current_chunk_size, 200);
    assert_eq!(third.reason, AdaptiveChunkSizingReason::FastCacheFill);
    assert_eq!(fourth.current_chunk_size, 400);
    assert_eq!(
        fourth.reason,
        AdaptiveChunkSizingReason::StableFastCacheFill
    );
}

#[test]
fn test_adaptive_chunk_sizer_cache_fill_above_high_duration_shrinks_immediately() {
    let mut sizer = AdaptiveChunkSizer::new(adaptive_config(100, 400)).expect("sizer");

    let high_cache_fill = sizer.record_chunk(adaptive_feedback(
        cache_partial_hit(),
        Duration::from_millis(1_500),
    ));

    assert_eq!(high_cache_fill.previous_chunk_size, 100);
    assert_eq!(high_cache_fill.current_chunk_size, 50);
    assert_eq!(
        high_cache_fill.reason,
        AdaptiveChunkSizingReason::HighQueryDuration
    );
}

#[test]
fn test_adaptive_chunk_sizer_provider_fill_below_high_duration_grows() {
    let mut sizer = AdaptiveChunkSizer::new(adaptive_config(100, 400)).expect("sizer");

    let first = sizer.record_chunk(adaptive_feedback(
        cache_partial_hit(),
        Duration::from_millis(800),
    ));
    let second = sizer.record_chunk(adaptive_feedback(
        cache_provider_fill(),
        Duration::from_millis(800),
    ));

    assert_eq!(first.previous_chunk_size, 100);
    assert!(first.current_chunk_size >= first.previous_chunk_size);
    assert_eq!(second.previous_chunk_size, first.current_chunk_size);
    assert_eq!(second.current_chunk_size, 200);
    assert_eq!(second.reason, AdaptiveChunkSizingReason::StableSparseRange);
}

#[test]
fn test_adaptive_chunk_sizer_high_duration_shrinks_immediately() {
    let mut sizer = AdaptiveChunkSizer::new(adaptive_config(100, 400)).expect("sizer");

    let high_duration = sizer.record_chunk(adaptive_feedback(
        cache_miss(),
        Duration::from_millis(1_500),
    ));

    assert_eq!(high_duration.current_chunk_size, 50);
    assert_eq!(
        high_duration.reason,
        AdaptiveChunkSizingReason::HighQueryDuration
    );
}

#[test]
fn test_adaptive_chunk_sizer_dense_rows_shrinks_immediately() {
    let mut sizer = AdaptiveChunkSizer::new(adaptive_config(100, 400)).expect("sizer");

    let dense = sizer.record_chunk(adaptive_feedback_with_rows(
        cache_full_hit(),
        Duration::from_millis(50),
        5_000,
    ));

    assert_eq!(dense.current_chunk_size, 50);
    assert_eq!(dense.reason, AdaptiveChunkSizingReason::DenseReturnedRows);
}

#[test]
fn test_adaptive_chunk_sizer_slow_local_processing_shrinks_immediately() {
    let mut sizer = AdaptiveChunkSizer::new(adaptive_config(100, 400)).expect("sizer");
    let mut feedback = adaptive_feedback(cache_full_hit(), Duration::from_millis(50));
    feedback.local_processing_write_duration = Duration::from_secs(11);

    let slow_local = sizer.record_chunk(feedback);

    assert_eq!(slow_local.current_chunk_size, 50);
    assert_eq!(
        slow_local.reason,
        AdaptiveChunkSizingReason::SlowLocalProcessing
    );
}

#[test]
fn test_adaptive_chunk_sizer_respects_min_and_max_caps() {
    let mut sizer = AdaptiveChunkSizer::new(adaptive_config(100, 200)).expect("sizer");

    sizer.record_chunk(adaptive_feedback(
        cache_full_hit(),
        Duration::from_millis(20),
    ));
    let maxed = sizer.record_chunk(adaptive_feedback(
        cache_full_hit(),
        Duration::from_millis(20),
    ));
    let shrunk = sizer.record_provider_limit(100);
    let minned = sizer.record_chunk(adaptive_feedback(
        cache_miss(),
        Duration::from_millis(1_500),
    ));

    assert_eq!(maxed.current_chunk_size, 200);
    assert_eq!(shrunk.current_chunk_size, 50);
    assert_eq!(minned.current_chunk_size, 50);
}

#[test]
fn test_adaptive_chunk_sizer_provider_limit_split_shrinks_without_growth() {
    let mut sizer = AdaptiveChunkSizer::new(adaptive_config(1_000, 1_000)).expect("sizer");

    let split = sizer.record_provider_limit(1_000);
    let hold = sizer.record_chunk(adaptive_feedback(
        cache_full_hit(),
        Duration::from_millis(20),
    ));

    assert_eq!(split.current_chunk_size, 500);
    assert_eq!(split.reason, AdaptiveChunkSizingReason::ProviderLimit);
    assert_eq!(hold.current_chunk_size, 500);
    assert_eq!(hold.reason, AdaptiveChunkSizingReason::Hold);
}

#[test]
fn test_runner_replay_over_same_range_does_not_double_count_business_totals() {
    let mut runner = runner(
        vec![vec![row(1, 0, 0)], vec![row(1, 0, 0)]],
        ScriptedDecoder,
    );

    runner.run_to_target(1).expect("first run succeeds");
    runner.store_mut().rewind_next_block_for_replay(1);
    runner.run_to_target(1).expect("replay succeeds");

    assert_eq!(
        runner.store().vote_repository().data_metric().votes_count,
        1
    );
    assert_eq!(
        runner
            .store()
            .vote_repository()
            .data_metric()
            .votes_weight_for_sum,
        "10"
    );
    assert_eq!(runner.store().commit_count(), 2);
    assert_eq!(
        runner.store().checkpoint().expect("checkpoint").next_block,
        2
    );
}

#[test]
fn test_runner_stops_gracefully_between_chunks() {
    let mut runner = runner(
        vec![vec![row(1, 0, 0)], vec![row(2, 0, 0)]],
        ScriptedDecoder,
    );
    runner.request_shutdown_after_chunks(1);

    let report = runner.run_to_target(2).expect("runner stops cleanly");

    assert_eq!(report.chunks_processed, 1);
    assert!(report.shutdown_requested);
    assert_eq!(
        runner.store().checkpoint().expect("checkpoint").next_block,
        2
    );
    assert_eq!(runner.store().commit_count(), 1);
}

#[test]
fn test_runner_decodes_distinct_log_addresses_with_matching_sources() {
    let attempts = Arc::new(Mutex::new(Vec::new()));
    let mut runner = runner_with_decoder(
        vec![vec![
            row_at_address(1, 0, 0, GOVERNOR),
            row_at_address(1, 0, 1, TOKEN),
        ]],
        SourceMatchingDecoder::new(attempts.clone()),
        options(),
    );

    runner.run_to_target(1).expect("runner succeeds");

    assert_eq!(
        *attempts.lock().expect("attempts"),
        vec![DaoLogSource::Governor, DaoLogSource::GovernorToken]
    );
    assert_eq!(
        runner.store().vote_repository().data_metric().votes_count,
        1
    );
    assert_eq!(
        runner.store().token_repository().delegate_changed().len(),
        1
    );
}

#[test]
fn test_runner_decodes_duplicate_address_token_log_with_token_source() {
    let attempts = Arc::new(Mutex::new(Vec::new()));
    let mut runner = runner_with_decoder(
        vec![vec![row_at_address(1, 0, 1, GOVERNOR)]],
        SourceMatchingDecoder::new(attempts.clone()),
        duplicate_address_options(),
    );

    runner.run_to_target(1).expect("runner succeeds");

    assert_eq!(
        *attempts.lock().expect("attempts"),
        vec![DaoLogSource::Governor, DaoLogSource::GovernorToken]
    );
    assert_eq!(
        runner.store().token_repository().delegate_changed().len(),
        1
    );
}

#[test]
fn test_runner_keeps_duplicate_address_unsupported_topic_unsupported() {
    let attempts = Arc::new(Mutex::new(Vec::new()));
    let mut runner = runner_with_decoder(
        vec![vec![row_at_address(1, 0, 0, GOVERNOR)]],
        AlwaysUnsupportedDecoder::new(attempts.clone()),
        duplicate_address_options(),
    );

    runner.run_to_target(1).expect("runner succeeds");

    assert_eq!(
        *attempts.lock().expect("attempts"),
        vec![
            DaoLogSource::Governor,
            DaoLogSource::GovernorToken,
            DaoLogSource::Timelock
        ]
    );
    assert_eq!(
        runner.store().checkpoint().expect("checkpoint").next_block,
        2
    );
    assert_eq!(
        runner.store().vote_repository().data_metric().votes_count,
        0
    );
    assert_eq!(
        runner.store().token_repository().delegate_changed().len(),
        0
    );
}

struct ScriptedDatalensReader {
    rows: VecDeque<Vec<Value>>,
}

impl DatalensLogQueryReader for ScriptedDatalensReader {
    fn query_logs(&mut self, _input: QueryInput) -> Result<DatalensLogQueryResult, DatalensError> {
        Ok(DatalensLogQueryResult::rows_only(Value::Array(
            self.rows.pop_front().expect("scripted query response"),
        )))
    }
}

struct FailingDatalensReader;

impl DatalensLogQueryReader for FailingDatalensReader {
    fn query_logs(&mut self, _input: QueryInput) -> Result<DatalensLogQueryResult, DatalensError> {
        Err(DatalensError::Query(
            r#"datalens HTTP error 429: {"error":{"kind":"rate_limited","message":"rate limited"}}"#
                .to_owned(),
        ))
    }
}

struct RecordingOnchainRefreshTick {
    blocks: Arc<Mutex<Vec<i64>>>,
}

impl IndexerOnchainRefreshTick for RecordingOnchainRefreshTick {
    fn run_after_chunk(
        &mut self,
        processed_block: i64,
    ) -> Result<OnchainRefreshTickReport, String> {
        self.blocks
            .lock()
            .expect("tick blocks")
            .push(processed_block);

        Ok(OnchainRefreshTickReport {
            processed: 0,
            claimed: 0,
            completed: 0,
            failed: 0,
            skipped_tasks: 0,
            rpc_error_failures: 0,
            validation_failures: 0,
            db_update_failures: 0,
            cache_hits: 0,
            debounced_tasks: 0,
            duration: Duration::ZERO,
            task_budget_hit: false,
            duration_budget_hit: false,
            skipped: None,
            backlog: None,
        })
    }
}

struct ProviderLimitDatalensReader {
    max_successful_blocks: u64,
    observed_ranges: Arc<Mutex<Vec<(u64, u64)>>>,
}

impl ProviderLimitDatalensReader {
    fn new(max_successful_blocks: u64, observed_ranges: Arc<Mutex<Vec<(u64, u64)>>>) -> Self {
        Self {
            max_successful_blocks,
            observed_ranges,
        }
    }
}

impl DatalensLogQueryReader for ProviderLimitDatalensReader {
    fn query_logs(&mut self, input: QueryInput) -> Result<DatalensLogQueryResult, DatalensError> {
        let range = (input.range.start, input.range.end);
        self.observed_ranges
            .lock()
            .expect("observed ranges")
            .push(range);
        let block_count = input.range.end - input.range.start + 1;
        if block_count > self.max_successful_blocks {
            return Err(DatalensError::Query(
                r#"datalens HTTP error 429: {"error":{"kind":"provider_limit","message":"query returns too many logs, narrow your filter: 20000"}}"#
                    .to_owned(),
            ));
        }

        Ok(DatalensLogQueryResult::rows_only(Value::Array(Vec::new())))
    }
}

#[derive(Clone)]
struct ScriptedDecoder;

impl IndexerEventDecoder for ScriptedDecoder {
    fn decode(
        &self,
        _dao_code: &str,
        source: DaoLogSource,
        token_standard: Option<GovernanceTokenStandard>,
        log: &NormalizedEvmLog,
    ) -> Result<DecodedDaoEvent, DaoEventDecodeError> {
        match source {
            DaoLogSource::Governor => {
                assert_eq!(token_standard, None);
                Ok(DecodedDaoEvent::Governor(DecodedGovernorEvent::VoteCast(
                    VoteCastEvent {
                        voter: format!("0x{:040}", log.block_number),
                        proposal_id: "42".to_owned(),
                        support: 1,
                        weight: (log.block_number * 10).to_string(),
                        reason: String::new(),
                    },
                )))
            }
            DaoLogSource::GovernorToken => {
                assert_eq!(token_standard, Some(GovernanceTokenStandard::Erc20));
                Ok(DecodedDaoEvent::Token(DecodedTokenEvent::DelegateChanged(
                    degov_datalens_indexer::DelegateChangedEvent {
                        delegator: "0x0000000000000000000000000000000000000001".to_owned(),
                        from_delegate: "0x0000000000000000000000000000000000000000".to_owned(),
                        to_delegate: "0x0000000000000000000000000000000000000002".to_owned(),
                    },
                )))
            }
            DaoLogSource::Timelock => {
                assert_eq!(token_standard, None);
                Ok(DecodedDaoEvent::UnsupportedTopic(
                    degov_datalens_indexer::UnsupportedTopicEvent {
                        dao_code: "demo-dao".to_owned(),
                        source,
                        block_number: log.block_number,
                        transaction_hash: log.transaction_hash.clone(),
                        address: log.address.clone(),
                        topic0: log.topics[0].clone(),
                    },
                ))
            }
        }
    }
}

#[derive(Clone)]
struct RejectRemovedDecoder;

impl IndexerEventDecoder for RejectRemovedDecoder {
    fn decode(
        &self,
        _dao_code: &str,
        _source: DaoLogSource,
        _token_standard: Option<GovernanceTokenStandard>,
        log: &NormalizedEvmLog,
    ) -> Result<DecodedDaoEvent, DaoEventDecodeError> {
        assert!(!log.removed, "removed log reached decoder");
        Ok(DecodedDaoEvent::UnsupportedTopic(
            degov_datalens_indexer::UnsupportedTopicEvent {
                dao_code: "demo-dao".to_owned(),
                source: DaoLogSource::Governor,
                block_number: log.block_number,
                transaction_hash: log.transaction_hash.clone(),
                address: log.address.clone(),
                topic0: log.topics[0].clone(),
            },
        ))
    }
}

#[derive(Clone)]
struct SourceMatchingDecoder {
    attempts: Arc<Mutex<Vec<DaoLogSource>>>,
}

impl SourceMatchingDecoder {
    fn new(attempts: Arc<Mutex<Vec<DaoLogSource>>>) -> Self {
        Self { attempts }
    }
}

impl IndexerEventDecoder for SourceMatchingDecoder {
    fn decode(
        &self,
        _dao_code: &str,
        source: DaoLogSource,
        token_standard: Option<GovernanceTokenStandard>,
        log: &NormalizedEvmLog,
    ) -> Result<DecodedDaoEvent, DaoEventDecodeError> {
        self.attempts.lock().expect("attempts").push(source);
        match source {
            DaoLogSource::Governor if log.log_index == 0 && log.address == GOVERNOR => {
                assert_eq!(token_standard, None);
                Ok(DecodedDaoEvent::Governor(DecodedGovernorEvent::VoteCast(
                    VoteCastEvent {
                        voter: "0x0000000000000000000000000000000000000001".to_owned(),
                        proposal_id: "42".to_owned(),
                        support: 1,
                        weight: "10".to_owned(),
                        reason: String::new(),
                    },
                )))
            }
            DaoLogSource::GovernorToken => {
                assert_eq!(token_standard, Some(GovernanceTokenStandard::Erc20));
                Ok(DecodedDaoEvent::Token(DecodedTokenEvent::DelegateChanged(
                    degov_datalens_indexer::DelegateChangedEvent {
                        delegator: "0x0000000000000000000000000000000000000001".to_owned(),
                        from_delegate: "0x0000000000000000000000000000000000000000".to_owned(),
                        to_delegate: "0x0000000000000000000000000000000000000002".to_owned(),
                    },
                )))
            }
            _ => Ok(unsupported_topic(source, log)),
        }
    }
}

#[derive(Clone)]
struct AlwaysUnsupportedDecoder {
    attempts: Arc<Mutex<Vec<DaoLogSource>>>,
}

impl AlwaysUnsupportedDecoder {
    fn new(attempts: Arc<Mutex<Vec<DaoLogSource>>>) -> Self {
        Self { attempts }
    }
}

impl IndexerEventDecoder for AlwaysUnsupportedDecoder {
    fn decode(
        &self,
        _dao_code: &str,
        source: DaoLogSource,
        _token_standard: Option<GovernanceTokenStandard>,
        log: &NormalizedEvmLog,
    ) -> Result<DecodedDaoEvent, DaoEventDecodeError> {
        self.attempts.lock().expect("attempts").push(source);
        Ok(unsupported_topic(source, log))
    }
}

fn unsupported_topic(source: DaoLogSource, log: &NormalizedEvmLog) -> DecodedDaoEvent {
    DecodedDaoEvent::UnsupportedTopic(degov_datalens_indexer::UnsupportedTopicEvent {
        dao_code: "demo-dao".to_owned(),
        source,
        block_number: log.block_number,
        transaction_hash: log.transaction_hash.clone(),
        address: log.address.clone(),
        topic0: log.topics[0].clone(),
    })
}

fn runner(
    rows: Vec<Vec<Value>>,
    decoder: ScriptedDecoder,
) -> IndexerRunner<ScriptedDatalensReader, InMemoryIndexerRunnerStore, ScriptedDecoder> {
    runner_with_decoder(rows, decoder, options())
}

fn runner_with_decoder<D: IndexerEventDecoder>(
    rows: Vec<Vec<Value>>,
    decoder: D,
    options: IndexerRunnerOptions,
) -> IndexerRunner<ScriptedDatalensReader, InMemoryIndexerRunnerStore, D> {
    runner_with_store(
        rows,
        decoder,
        options,
        InMemoryIndexerRunnerStore::new(identity(), 1),
    )
}

fn runner_with_store<D: IndexerEventDecoder>(
    rows: Vec<Vec<Value>>,
    decoder: D,
    options: IndexerRunnerOptions,
    store: InMemoryIndexerRunnerStore,
) -> IndexerRunner<ScriptedDatalensReader, InMemoryIndexerRunnerStore, D> {
    IndexerRunner::new(
        options,
        contexts(),
        ScriptedDatalensReader {
            rows: VecDeque::from(rows),
        },
        store,
        decoder,
    )
}

fn options() -> IndexerRunnerOptions {
    IndexerRunnerOptions {
        datalens_config: DatalensConfig {
            endpoint: "https://datalens.example".to_owned(),
            application: "degov-test".to_owned(),
            bearer_token: SecretString::new("test-token"),
            timeout: Duration::from_secs(30),
            finality: DatalensFinality::DurableOnly,
            chain: ChainIdentityConfig {
                family: ChainFamily::Evm,
                configured_name: "ethereum".to_owned(),
                network_id: Some(1),
            },
            dataset: DatasetKeyConfig {
                family: "evm".to_owned(),
                name: "logs".to_owned(),
            },
            query_limits: QueryLimitConfig {
                block_range_limit: 1,
            },
            warmup: Default::default(),
            dao_contracts: Some(addresses()),
            chains: Vec::new(),
        },
        addresses: addresses(),
        checkpoint_identity: identity(),
        start_block: 1,
        safe_height: None,
        progress_refresh_lag_blocks: 0,
        adaptive_chunk_sizer: AdaptiveChunkSizerConfig::for_max_chunk_size(1),
        onchain_refresh_deferred_drain_batch_size: 100,
    }
}

fn adaptive_config(initial_chunk_size: u32, max_chunk_size: u32) -> AdaptiveChunkSizerConfig {
    AdaptiveChunkSizerConfig {
        initial_chunk_size,
        max_chunk_size,
        min_chunk_size: 50,
        fast_chunk_duration_threshold: Duration::from_millis(100),
        high_query_duration_threshold: Duration::from_millis(1_000),
        cache_fill_high_duration_threshold: Duration::from_millis(500),
        ..AdaptiveChunkSizerConfig::for_max_chunk_size(max_chunk_size)
    }
}

fn adaptive_feedback(
    warmup_effectiveness: DatalensWarmupEffectivenessAggregation,
    query_duration: Duration,
) -> AdaptiveChunkFeedback {
    adaptive_feedback_with_rows(warmup_effectiveness, query_duration, 0)
}

fn adaptive_feedback_with_rows(
    warmup_effectiveness: DatalensWarmupEffectivenessAggregation,
    query_duration: Duration,
    returned_row_count: usize,
) -> AdaptiveChunkFeedback {
    AdaptiveChunkFeedback {
        returned_row_count,
        local_processing_write_duration: Duration::from_millis(20),
        read_duration: query_duration,
        warmup_effectiveness,
    }
}

fn cache_full_hit() -> DatalensWarmupEffectivenessAggregation {
    cache_aggregation(DatalensLogQueryCacheSummary::from_datalens_cache_json(
        &json!({
            "hit_ranges": [{ "kind": "block", "start": 1, "end": 100 }],
            "missing_ranges": [],
            "provider_fill_ranges": []
        }),
    ))
}

fn cache_partial_hit() -> DatalensWarmupEffectivenessAggregation {
    cache_aggregation(DatalensLogQueryCacheSummary::from_datalens_cache_json(
        &json!({
            "hit_ranges": [{ "kind": "block", "start": 1, "end": 50 }],
            "missing_ranges": [{ "kind": "block", "start": 51, "end": 100 }],
            "provider_fill_ranges": [{ "kind": "block", "start": 51, "end": 100 }]
        }),
    ))
}

fn cache_miss() -> DatalensWarmupEffectivenessAggregation {
    cache_aggregation(DatalensLogQueryCacheSummary::from_datalens_cache_json(
        &json!({
            "hit_ranges": [],
            "missing_ranges": [{ "kind": "block", "start": 1, "end": 100 }],
            "provider_fill_ranges": [{ "kind": "block", "start": 1, "end": 100 }]
        }),
    ))
}

fn cache_provider_fill() -> DatalensWarmupEffectivenessAggregation {
    cache_aggregation(DatalensLogQueryCacheSummary::from_datalens_cache_json(
        &json!({
            "hit_ranges": [],
            "missing_ranges": [],
            "provider_fill_ranges": [{ "kind": "block", "start": 1, "end": 100 }]
        }),
    ))
}

fn cache_unavailable() -> DatalensWarmupEffectivenessAggregation {
    cache_aggregation(DatalensLogQueryCacheSummary::unavailable())
}

fn cache_aggregation(
    cache: DatalensLogQueryCacheSummary,
) -> DatalensWarmupEffectivenessAggregation {
    let mut aggregation = DatalensWarmupEffectivenessAggregation::new();
    aggregation.record_query(cache, Duration::from_millis(20));
    aggregation
}

fn duplicate_address_options() -> IndexerRunnerOptions {
    let mut options = options();
    options.addresses.governor_token = options.addresses.governor.clone();
    options.addresses.timelock = options.addresses.governor.clone();
    options.datalens_config.dao_contracts = Some(options.addresses.clone());
    options
}

fn set_block_range_limit(options: &mut IndexerRunnerOptions, block_range_limit: u32) {
    options.datalens_config.query_limits.block_range_limit = block_range_limit;
    options.adaptive_chunk_sizer = AdaptiveChunkSizerConfig::for_max_chunk_size(block_range_limit);
}

fn contexts() -> IndexerRunnerContexts {
    let contracts = ChainContracts {
        governor: "0x1111111111111111111111111111111111111111".to_owned(),
        governor_token: "0x2222222222222222222222222222222222222222".to_owned(),
        timelock: "0x3333333333333333333333333333333333333333".to_owned(),
    };
    let read_plan_config = BatchReadPlanConfig {
        max_concurrency: 10,
        multicall_batch_size: 100,
    };

    IndexerRunnerContexts {
        vote: VoteProjectionContext {
            contract_set_id: "demo-scope".to_owned(),
            dao_code: "demo-dao".to_owned(),
            governor_address: contracts.governor.clone(),
            contracts: contracts.clone(),
            read_plan_config,
        },
        token: TokenProjectionContext {
            contract_set_id: "demo-scope".to_owned(),
            dao_code: "demo-dao".to_owned(),
            governor_address: contracts.governor.clone(),
            token_address: contracts.governor_token.clone(),
            contracts,
            token_standard: GovernanceTokenStandard::Erc20,
            from_block: 1,
            to_block: 1,
            target_height: None,
            read_plan_config,
            current_power_method: degov_datalens_indexer::ChainReadMethod::GetVotes,
        },
        proposal: None,
        timelock: None,
    }
}

fn identity() -> IndexerCheckpointIdentity {
    IndexerCheckpointIdentity {
        dao_code: "demo-dao".to_owned(),
        chain_id: 1,
        contract_set_id: "demo-scope".to_owned(),
        stream_id: "datalens-native".to_owned(),
        data_source_version: "test".to_owned(),
    }
}

fn addresses() -> DaoContractAddresses {
    DaoContractAddresses {
        governor: "0x1111111111111111111111111111111111111111".to_owned(),
        governor_token: "0x2222222222222222222222222222222222222222".to_owned(),
        governor_token_standard: GovernanceTokenStandard::Erc20,
        timelock: "0x3333333333333333333333333333333333333333".to_owned(),
    }
}

fn row(block_number: u64, transaction_index: u64, log_index: u64) -> Value {
    row_at_address(block_number, transaction_index, log_index, GOVERNOR)
}

fn row_at_address(
    block_number: u64,
    transaction_index: u64,
    log_index: u64,
    address: &str,
) -> Value {
    row_with_removed(block_number, transaction_index, log_index, address, false)
}

fn removed_row(block_number: u64, transaction_index: u64, log_index: u64) -> Value {
    row_with_removed(block_number, transaction_index, log_index, GOVERNOR, true)
}

fn row_with_removed(
    block_number: u64,
    transaction_index: u64,
    log_index: u64,
    address: &str,
    removed: bool,
) -> Value {
    json!({
        "block_number": block_number,
        "block_hash": format!("0xblock{block_number}"),
        "block_timestamp": 1_700_000_000 + block_number,
        "transaction_hash": format!("0xtx{block_number}"),
        "transaction_index": transaction_index,
        "log_index": log_index,
        "address": address,
        "topics": ["0x0000000000000000000000000000000000000000000000000000000000000000"],
        "data": "0x",
        "removed": removed
    })
}

const GOVERNOR: &str = "0x1111111111111111111111111111111111111111";
const TOKEN: &str = "0x2222222222222222222222222222222222222222";
