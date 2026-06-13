use degov_datalens_indexer::{
    BlockReadMode, ChainReadExecutionReport, ChainReadKey, ChainReadMethod, ChainReadResult,
    ChainReadValue, ProposalTimestampBackfillCandidate, plan_proposal_timestamp_backfill_updates,
};

#[test]
fn test_plan_proposal_timestamp_backfill_updates_vote_end_and_state_epoch() {
    let updates = plan_proposal_timestamp_backfill_updates(
        &[blocknumber_candidate()],
        &ChainReadExecutionReport {
            results: vec![block_timestamp_result("16978023", "1680641927000")],
            ..ChainReadExecutionReport::default()
        },
    );

    assert_eq!(updates.len(), 1);
    assert_eq!(updates[0].proposal_ref, "proposal:ens:42");
    assert_eq!(updates[0].vote_start_timestamp, None);
    assert_eq!(
        updates[0].vote_end_timestamp.as_deref(),
        Some("1680641927000")
    );
}

#[test]
fn test_plan_proposal_timestamp_backfill_keeps_failed_reads_retryable() {
    let updates = plan_proposal_timestamp_backfill_updates(
        &[blocknumber_candidate()],
        &ChainReadExecutionReport::default(),
    );

    assert!(updates.is_empty());
}

#[test]
fn test_plan_proposal_timestamp_backfill_marks_exact_timestamp_read_resolved() {
    let updates = plan_proposal_timestamp_backfill_updates(
        &[blocknumber_candidate()],
        &ChainReadExecutionReport {
            results: vec![block_timestamp_result("16978023", "1680633647000")],
            ..ChainReadExecutionReport::default()
        },
    );

    assert_eq!(updates.len(), 1);
    assert_eq!(
        updates[0].vote_end_timestamp.as_deref(),
        Some("1680633647000")
    );
}

#[test]
fn test_plan_proposal_timestamp_backfill_ignores_timestamp_clock_proposals() {
    let mut candidate = blocknumber_candidate();
    candidate.clock_mode = "timestamp".to_owned();

    let updates = plan_proposal_timestamp_backfill_updates(
        &[candidate],
        &ChainReadExecutionReport {
            results: vec![block_timestamp_result("16978023", "1680641927000")],
            ..ChainReadExecutionReport::default()
        },
    );

    assert!(updates.is_empty());
}

fn blocknumber_candidate() -> ProposalTimestampBackfillCandidate {
    ProposalTimestampBackfillCandidate {
        proposal_ref: "proposal:ens:42".to_owned(),
        chain_id: 1,
        governor_address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_owned(),
        clock_mode: "blocknumber".to_owned(),
        vote_start: "16948023".to_owned(),
        vote_end: "16978023".to_owned(),
        vote_start_timestamp: "1680281927000".to_owned(),
        vote_end_timestamp: "1680633647000".to_owned(),
    }
}

fn block_timestamp_result(block_number: &str, timestamp: &str) -> ChainReadResult {
    ChainReadResult {
        read_index: 0,
        key: ChainReadKey {
            chain_id: 1,
            contract_address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_owned(),
            method: ChainReadMethod::BlockTimestamp,
            args: vec![block_number.to_owned()],
            block_mode: BlockReadMode::AtBlock(block_number.parse().expect("block number")),
        },
        value: ChainReadValue::Integer(timestamp.to_owned()),
    }
}
