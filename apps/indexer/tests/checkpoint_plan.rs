use degov_datalens_indexer::{
    CheckpointBlockRange, IndexerCheckpoint, IndexerCheckpointIdentity, plan_next_checkpoint_range,
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
