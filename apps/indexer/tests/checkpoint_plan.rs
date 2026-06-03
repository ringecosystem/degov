use std::time::Duration;

use degov_datalens_indexer::{
    AdaptiveChunkFeedback, AdaptiveChunkSizer, AdaptiveChunkSizerConfig, CheckpointBlockRange,
    IndexerCheckpoint, IndexerCheckpointIdentity, plan_next_checkpoint_range,
};

fn checkpoint(next_block: i64) -> IndexerCheckpoint {
    IndexerCheckpoint {
        identity: IndexerCheckpointIdentity {
            dao_code: "demo-dao".to_owned(),
            chain_id: 1,
            contract_set_id: "demo-scope".to_owned(),
            stream_id: "governor-and-token-logs".to_owned(),
            data_source_version: "datalens-v1".to_owned(),
        },
        next_block,
        processed_height: None,
        target_height: None,
        updated_at: "1970-01-01 00:00:00+00".to_owned(),
        last_error: None,
        lock_owner: None,
        locked_at: None,
    }
}

#[test]
fn test_plan_next_checkpoint_range_limits_to_target_height() {
    let range = plan_next_checkpoint_range(&checkpoint(100), 25, 110)
        .expect("valid range")
        .expect("range");

    assert_eq!(
        range,
        CheckpointBlockRange {
            from_block: 100,
            to_block: 110,
        }
    );
}

#[test]
fn test_plan_next_checkpoint_range_returns_none_when_checkpoint_caught_up() {
    let range = plan_next_checkpoint_range(&checkpoint(111), 25, 110).expect("valid range");

    assert_eq!(range, None);
}

#[test]
fn test_adaptive_chunk_sizer_shrinks_for_dense_or_slow_chunks_and_grows_after_stable_chunks() {
    let mut sizer = AdaptiveChunkSizer::new(AdaptiveChunkSizerConfig {
        max_chunk_size: 16,
        min_chunk_size: 1,
        local_processing_shrink_threshold: Duration::from_millis(100),
        dense_returned_row_threshold: 10,
        sparse_returned_row_threshold: 2,
        stable_chunks_to_grow: 2,
    })
    .expect("valid adaptive chunk config");

    assert_eq!(sizer.current_chunk_size(), 16);

    sizer.record_chunk(AdaptiveChunkFeedback {
        returned_row_count: 11,
        local_processing_write_duration: Duration::from_millis(10),
    });
    assert_eq!(sizer.current_chunk_size(), 8);

    sizer.record_chunk(AdaptiveChunkFeedback {
        returned_row_count: 1,
        local_processing_write_duration: Duration::from_millis(120),
    });
    assert_eq!(sizer.current_chunk_size(), 4);

    sizer.record_chunk(AdaptiveChunkFeedback {
        returned_row_count: 1,
        local_processing_write_duration: Duration::from_millis(10),
    });
    assert_eq!(sizer.current_chunk_size(), 4);

    sizer.record_chunk(AdaptiveChunkFeedback {
        returned_row_count: 1,
        local_processing_write_duration: Duration::from_millis(10),
    });
    assert_eq!(sizer.current_chunk_size(), 8);

    sizer.record_chunk(AdaptiveChunkFeedback {
        returned_row_count: 1,
        local_processing_write_duration: Duration::from_millis(10),
    });
    sizer.record_chunk(AdaptiveChunkFeedback {
        returned_row_count: 1,
        local_processing_write_duration: Duration::from_millis(10),
    });
    assert_eq!(sizer.current_chunk_size(), 16);
}

#[test]
fn test_adaptive_chunk_sizer_plans_contiguous_checkpoint_ranges_after_resize() {
    let mut sizer = AdaptiveChunkSizer::new(AdaptiveChunkSizerConfig {
        max_chunk_size: 4,
        min_chunk_size: 1,
        local_processing_shrink_threshold: Duration::from_millis(100),
        dense_returned_row_threshold: 5,
        sparse_returned_row_threshold: 1,
        stable_chunks_to_grow: 1,
    })
    .expect("valid adaptive chunk config");
    let mut checkpoint = checkpoint(10);

    let first = sizer
        .plan_next_range(&checkpoint, 20)
        .expect("valid range")
        .expect("range");
    assert_eq!(
        first,
        CheckpointBlockRange {
            from_block: 10,
            to_block: 13,
        }
    );

    sizer.record_chunk(AdaptiveChunkFeedback {
        returned_row_count: 6,
        local_processing_write_duration: Duration::from_millis(10),
    });
    checkpoint.next_block = first.to_block + 1;

    let second = sizer
        .plan_next_range(&checkpoint, 20)
        .expect("valid range")
        .expect("range");
    assert_eq!(
        second,
        CheckpointBlockRange {
            from_block: 14,
            to_block: 15,
        }
    );

    sizer.record_chunk(AdaptiveChunkFeedback {
        returned_row_count: 0,
        local_processing_write_duration: Duration::from_millis(10),
    });
    checkpoint.next_block = second.to_block + 1;

    let third = sizer
        .plan_next_range(&checkpoint, 20)
        .expect("valid range")
        .expect("range");
    assert_eq!(
        third,
        CheckpointBlockRange {
            from_block: 16,
            to_block: 19,
        }
    );
}
