use degov_datalens_indexer::{
    BatchReadPlanConfig, ChainContracts, ChainReadMethod, DecodedGovernorEvent, NormalizedEvmLog,
    ReadRequirement, VoteCastEvent, VoteCastWithParamsEvent, VoteProjectionContext,
    VoteProjectionError, VoteProjectionEvent, VoteProjectionRepository, project_vote_events,
};
use serde_json::json;

#[test]
fn test_project_vote_events_preserves_vote_rows_groups_totals_and_signals() {
    let batch = project_vote_events(
        &context(),
        vec![
            VoteProjectionEvent {
                log: log(10, 0, 1),
                event: DecodedGovernorEvent::VoteCast(VoteCastEvent {
                    voter: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB".to_owned(),
                    proposal_id: "42".to_owned(),
                    support: 1,
                    weight: "100".to_owned(),
                    reason: "looks good".to_owned(),
                }),
            },
            VoteProjectionEvent {
                log: log(11, 0, 1),
                event: DecodedGovernorEvent::VoteCastWithParams(VoteCastWithParamsEvent {
                    voter: "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC".to_owned(),
                    proposal_id: "42".to_owned(),
                    support: 0,
                    weight: "25".to_owned(),
                    reason: "nope".to_owned(),
                    params: "0x1234".to_owned(),
                }),
            },
            VoteProjectionEvent {
                log: log(12, 0, 1),
                event: DecodedGovernorEvent::VoteCast(VoteCastEvent {
                    voter: "0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD".to_owned(),
                    proposal_id: "43".to_owned(),
                    support: 2,
                    weight: "7".to_owned(),
                    reason: String::new(),
                }),
            },
        ],
    )
    .expect("projection succeeds");

    assert_eq!(batch.vote_cast.len(), 2);
    assert_eq!(batch.vote_cast_with_params.len(), 1);
    assert_eq!(batch.vote_cast_groups.len(), 3);
    assert_eq!(batch.proposal_vote_totals.len(), 2);
    assert_eq!(batch.contributor_vote_signals.len(), 3);
    assert_eq!(batch.data_metric_delta.votes_count, 3);
    assert_eq!(batch.data_metric_delta.votes_with_params_count, 1);
    assert_eq!(batch.data_metric_delta.votes_without_params_count, 2);
    assert_eq!(batch.data_metric_delta.votes_weight_for_sum, "100");
    assert_eq!(batch.data_metric_delta.votes_weight_against_sum, "25");
    assert_eq!(batch.data_metric_delta.votes_weight_abstain_sum, "7");

    let vote = &batch.vote_cast[0];
    assert_eq!(vote.id, "evm:1:10:0xtx10:0:1");
    assert_eq!(vote.voter, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    assert_eq!(vote.proposal_id, "42");
    assert_eq!(vote.support, 1);
    assert_eq!(vote.weight, "100");
    assert_eq!(vote.reason, "looks good");
    assert_eq!(vote.block_number, "10");
    assert_eq!(vote.block_timestamp.as_deref(), Some("1700000010"));
    assert_eq!(vote.transaction_hash, "0xtx10");

    let param_vote = &batch.vote_cast_with_params[0];
    assert_eq!(param_vote.params, "0x1234");
    assert_eq!(batch.vote_cast_groups[1].kind, "vote-cast-with-params");
    assert_eq!(
        batch.vote_cast_groups[1].proposal_ref,
        "proposal:1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:42"
    );

    let proposal_42 = batch
        .proposal_vote_totals
        .iter()
        .find(|total| total.proposal_id == "42")
        .expect("proposal 42 total");
    assert_eq!(proposal_42.votes_count, 2);
    assert_eq!(proposal_42.votes_with_params_count, 1);
    assert_eq!(proposal_42.votes_without_params_count, 1);
    assert_eq!(proposal_42.votes_weight_for_sum, "100");
    assert_eq!(proposal_42.votes_weight_against_sum, "25");
    assert_eq!(proposal_42.votes_weight_abstain_sum, "0");

    assert_eq!(batch.chain_read_plan.metrics.requested_reads, 6);
    assert_eq!(batch.chain_read_plan.reads.len(), 6);
    for read in &batch.chain_read_plan.reads {
        assert_eq!(read.requirement, ReadRequirement::Required);
        assert!(
            matches!(
                read.key.method,
                ChainReadMethod::ProposalSnapshot
                    | ChainReadMethod::ProposalDeadline
                    | ChainReadMethod::State
            ),
            "unexpected read method: {:?}",
            read.key.method
        );
    }
}

#[test]
fn test_project_vote_events_replays_idempotently_and_sorts_by_log_position() {
    let mut events = vec![
        VoteProjectionEvent {
            log: log(12, 0, 1),
            event: vote_cast("42", 2, "5"),
        },
        VoteProjectionEvent {
            log: log(10, 0, 1),
            event: vote_cast("42", 1, "100"),
        },
        VoteProjectionEvent {
            log: log(11, 0, 1),
            event: vote_cast("42", 0, "25"),
        },
    ];
    events.push(events[0].clone());
    events.push(events[1].clone());

    let batch = project_vote_events(&context(), events).expect("projection succeeds");
    let mut repository = degov_datalens_indexer::InMemoryVoteProjectionRepository::default();

    repository.apply(&batch).expect("first write succeeds");
    repository.apply(&batch).expect("replay write succeeds");

    assert_eq!(
        batch.event_order,
        vec![
            "evm:1:10:0xtx10:0:1".to_owned(),
            "evm:1:11:0xtx11:0:1".to_owned(),
            "evm:1:12:0xtx12:0:1".to_owned(),
        ]
    );
    let total = repository
        .proposal_vote_totals()
        .get("proposal:1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:42")
        .expect("proposal total");
    assert_eq!(total.votes_count, 3);
    assert_eq!(total.votes_weight_for_sum, "100");
    assert_eq!(total.votes_weight_against_sum, "25");
    assert_eq!(total.votes_weight_abstain_sum, "5");
    assert_eq!(repository.data_metric().votes_count, 3);
}

#[test]
fn test_project_vote_events_dedupes_proposal_reads_once_per_affected_proposal() {
    let batch = project_vote_events(
        &context(),
        (0..50)
            .map(|index| VoteProjectionEvent {
                log: log(10 + index, 0, 1),
                event: vote_cast("42", 1, "1"),
            })
            .collect(),
    )
    .expect("projection succeeds");

    assert_eq!(batch.vote_cast_groups.len(), 50);
    assert_eq!(batch.proposal_vote_totals.len(), 1);
    assert_eq!(batch.chain_read_plan.metrics.requested_reads, 3);
    assert_eq!(batch.chain_read_plan.reads.len(), 3);
    for read in &batch.chain_read_plan.reads {
        assert_eq!(read.activity_blocks, vec![59]);
    }
}

#[test]
fn test_project_vote_events_rejects_conflicting_duplicate_log_metadata() {
    let mut duplicate = log(10, 0, 1);
    duplicate.transaction_hash = "0xdifferent".to_owned();

    let err = project_vote_events(
        &context(),
        vec![
            VoteProjectionEvent {
                log: log(10, 0, 1),
                event: vote_cast("42", 1, "100"),
            },
            VoteProjectionEvent {
                log: duplicate,
                event: vote_cast("42", 1, "100"),
            },
        ],
    )
    .expect_err("conflicting duplicate log is rejected");

    assert_eq!(
        err,
        VoteProjectionError::ConflictingDuplicateLog {
            log_id: "evm:1:10:0xtx10:0:1".to_owned(),
        }
    );
}

#[test]
fn test_project_vote_events_rejects_mixed_chain_input() {
    let mut second = log(11, 0, 1);
    second.chain_id = 2;

    let err = project_vote_events(
        &context(),
        vec![
            VoteProjectionEvent {
                log: log(10, 0, 1),
                event: vote_cast("42", 1, "100"),
            },
            VoteProjectionEvent {
                log: second,
                event: vote_cast("43", 1, "100"),
            },
        ],
    )
    .expect_err("mixed chain input is rejected");

    assert_eq!(
        err,
        VoteProjectionError::MixedChainIds {
            expected: 1,
            actual: 2,
            log_id: "evm:1:11:0xtx11:0:1".to_owned(),
        }
    );
}

fn context() -> VoteProjectionContext {
    VoteProjectionContext {
        dao_code: "unit-dao".to_owned(),
        governor_address: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA".to_owned(),
        contracts: ChainContracts {
            governor: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA".to_owned(),
            governor_token: "0x1111111111111111111111111111111111111111".to_owned(),
            timelock: "0x2222222222222222222222222222222222222222".to_owned(),
        },
        read_plan_config: BatchReadPlanConfig {
            max_concurrency: 4,
            multicall_batch_size: 10,
        },
    }
}

fn log(block_number: u64, transaction_index: u64, log_index: u64) -> NormalizedEvmLog {
    NormalizedEvmLog {
        id: format!("evm:1:{block_number}:0xtx{block_number}:{transaction_index}:{log_index}"),
        chain_id: 1,
        block_number,
        block_hash: format!("0xblock{block_number}"),
        block_timestamp_ms: Some((1_700_000_000 + block_number) * 1_000),
        transaction_hash: format!("0xtx{block_number}"),
        transaction_index,
        log_index,
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_owned(),
        topics: vec![],
        data: "0x".to_owned(),
        removed: false,
        raw_payload: json!({ "blockNumber": block_number }),
    }
}

fn vote_cast(proposal_id: &str, support: u8, weight: &str) -> DecodedGovernorEvent {
    DecodedGovernorEvent::VoteCast(VoteCastEvent {
        voter: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB".to_owned(),
        proposal_id: proposal_id.to_owned(),
        support,
        weight: weight.to_owned(),
        reason: String::new(),
    })
}
