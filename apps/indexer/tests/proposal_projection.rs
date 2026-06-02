use degov_datalens_indexer::{
    BatchReadPlanConfig, ChainContracts, ChainReadMethod, DecodedGovernorEvent, NormalizedEvmLog,
    ProposalCreatedEvent, ProposalExtendedEvent, ProposalIdEvent, ProposalProjectionContext,
    ProposalProjectionEvent, ProposalProjectionRepository, ProposalQueuedEvent,
    ProposalStateWriteKind, ReadRequirement, project_proposal_events,
};
use serde_json::json;

#[test]
fn test_project_proposal_created_builds_aggregate_actions_and_chain_reads() {
    let batch = project_proposal_events(
        &context(),
        vec![ProposalProjectionEvent {
            log: log(10, 2, 7),
            event: DecodedGovernorEvent::ProposalCreated(ProposalCreatedEvent {
                proposal_id: "42".to_owned(),
                proposer: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB".to_owned(),
                targets: vec![
                    "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC".to_owned(),
                    "0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD".to_owned(),
                ],
                values: vec!["100".to_owned(), "0".to_owned()],
                signatures: vec!["setFoo(uint256)".to_owned(), "".to_owned()],
                calldatas: vec!["0x1234".to_owned(), "0xabcd".to_owned()],
                vote_start: "20".to_owned(),
                vote_end: "40".to_owned(),
                description: "# Proposal title\n\nProposal body".to_owned(),
            }),
        }],
    );

    assert_eq!(batch.proposal_created.len(), 1);
    assert_eq!(batch.proposals.len(), 1);
    assert_eq!(batch.proposal_actions.len(), 2);
    assert_eq!(batch.proposal_state_epochs.len(), 1);

    let proposal = &batch.proposals[0];
    assert_eq!(
        proposal.id,
        "proposal:1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:42"
    );
    assert_eq!(proposal.proposal_id, "42");
    assert_eq!(
        proposal.proposer,
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    );
    assert_eq!(proposal.title, "Proposal title");
    assert_eq!(proposal.description_body, "Proposal body");
    assert_eq!(
        proposal.description_hash,
        "0x3bec3dfa58e028fdf10e56bebf69d18a3170b2897a2381164179670dd2fa0193"
    );
    assert_eq!(proposal.current_state.as_deref(), Some("Pending"));
    assert_eq!(proposal.block_timestamp, Some("1700000000".to_owned()));

    assert_eq!(batch.proposal_actions[0].action_index, 0);
    assert_eq!(
        batch.proposal_actions[0].target,
        "0xcccccccccccccccccccccccccccccccccccccccc"
    );
    assert_eq!(batch.proposal_actions[1].action_index, 1);
    assert_eq!(batch.proposal_state_epochs[0].state, "Pending");

    let methods = batch
        .chain_read_plan
        .reads
        .iter()
        .map(|read| {
            assert_eq!(read.requirement, ReadRequirement::Required);
            assert_eq!(read.metadata.proposal_ids, ["42".to_owned()].into());
            assert_eq!(read.activity_blocks, vec![10]);
            read.key.method
        })
        .collect::<Vec<_>>();
    assert_eq!(
        methods,
        vec![
            ChainReadMethod::ProposalSnapshot,
            ChainReadMethod::ProposalDeadline,
            ChainReadMethod::State,
        ]
    );
}

#[test]
fn test_project_proposal_lifecycle_events_builds_metadata_and_state_epochs() {
    let batch = project_proposal_events(
        &context(),
        vec![
            ProposalProjectionEvent {
                log: log(13, 0, 1),
                event: DecodedGovernorEvent::ProposalQueued(ProposalQueuedEvent {
                    proposal_id: "42".to_owned(),
                    eta_seconds: "1700000400".to_owned(),
                }),
            },
            ProposalProjectionEvent {
                log: log(14, 0, 1),
                event: DecodedGovernorEvent::ProposalExtended(ProposalExtendedEvent {
                    proposal_id: "42".to_owned(),
                    extended_deadline: "55".to_owned(),
                }),
            },
            ProposalProjectionEvent {
                log: log(15, 0, 1),
                event: DecodedGovernorEvent::ProposalExecuted(ProposalIdEvent {
                    proposal_id: "42".to_owned(),
                }),
            },
            ProposalProjectionEvent {
                log: log(16, 0, 1),
                event: DecodedGovernorEvent::ProposalCanceled(ProposalIdEvent {
                    proposal_id: "43".to_owned(),
                }),
            },
        ],
    );

    assert_eq!(batch.proposal_queued.len(), 1);
    assert_eq!(batch.proposal_extended.len(), 1);
    assert_eq!(batch.proposal_executed.len(), 1);
    assert_eq!(batch.proposal_canceled.len(), 1);
    assert_eq!(batch.proposal_deadline_extensions.len(), 1);

    let states = batch
        .proposal_state_epochs
        .iter()
        .map(|state| (state.proposal_id.as_str(), state.kind, state.state.as_str()))
        .collect::<Vec<_>>();
    assert_eq!(
        states,
        vec![
            ("42", ProposalStateWriteKind::Queued, "Queued"),
            ("42", ProposalStateWriteKind::Executed, "Executed"),
            ("43", ProposalStateWriteKind::Canceled, "Canceled"),
        ]
    );

    let queued = &batch.proposal_queued[0];
    assert_eq!(queued.proposal_id, "42");
    assert_eq!(queued.eta_seconds, "1700000400");

    let extension = &batch.proposal_deadline_extensions[0];
    assert_eq!(extension.proposal_id, "42");
    assert_eq!(extension.new_deadline, "55");

    assert_eq!(batch.chain_read_plan.metrics.requested_reads, 12);
    assert_eq!(batch.chain_read_plan.reads.len(), 6);
}

#[test]
fn test_project_proposal_events_replays_idempotently_and_sorts_by_log_position() {
    let mut events = vec![
        ProposalProjectionEvent {
            log: log(12, 0, 1),
            event: DecodedGovernorEvent::ProposalQueued(ProposalQueuedEvent {
                proposal_id: "42".to_owned(),
                eta_seconds: "1700000400".to_owned(),
            }),
        },
        ProposalProjectionEvent {
            log: log(11, 0, 1),
            event: DecodedGovernorEvent::ProposalCreated(ProposalCreatedEvent {
                proposal_id: "42".to_owned(),
                proposer: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB".to_owned(),
                targets: vec!["0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC".to_owned()],
                values: vec!["0".to_owned()],
                signatures: vec!["".to_owned()],
                calldatas: vec!["0x".to_owned()],
                vote_start: "20".to_owned(),
                vote_end: "40".to_owned(),
                description: "Plain title".to_owned(),
            }),
        },
    ];
    events.push(events[0].clone());
    events.push(events[1].clone());

    let batch = project_proposal_events(&context(), events);
    let mut repository = degov_datalens_indexer::InMemoryProposalProjectionRepository::default();

    repository
        .apply(&batch)
        .expect("first projection write succeeds");
    repository
        .apply(&batch)
        .expect("replay projection write succeeds");

    assert_eq!(batch.proposal_created.len(), 1);
    assert_eq!(batch.proposal_queued.len(), 1);
    assert_eq!(
        batch.event_order,
        vec![
            "evm:1:11:0xtx11:0:1".to_owned(),
            "evm:1:12:0xtx12:0:1".to_owned()
        ]
    );
    assert_eq!(repository.proposals().len(), 1);
    assert_eq!(
        repository
            .proposals()
            .get("proposal:1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:42")
            .expect("proposal")
            .current_state
            .as_deref(),
        Some("Queued")
    );
}

#[test]
fn test_repository_preserves_lifecycle_metadata_when_identity_arrives_later() {
    let lifecycle_batch = project_proposal_events(
        &context(),
        vec![ProposalProjectionEvent {
            log: log(12, 0, 1),
            event: DecodedGovernorEvent::ProposalQueued(ProposalQueuedEvent {
                proposal_id: "42".to_owned(),
                eta_seconds: "1700000400".to_owned(),
            }),
        }],
    );
    let identity_batch = project_proposal_events(
        &context(),
        vec![ProposalProjectionEvent {
            log: log(11, 0, 1),
            event: DecodedGovernorEvent::ProposalCreated(ProposalCreatedEvent {
                proposal_id: "42".to_owned(),
                proposer: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB".to_owned(),
                targets: vec!["0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC".to_owned()],
                values: vec!["0".to_owned()],
                signatures: vec!["".to_owned()],
                calldatas: vec!["0x".to_owned()],
                vote_start: "20".to_owned(),
                vote_end: "40".to_owned(),
                description: "Plain title".to_owned(),
            }),
        }],
    );
    let mut repository = degov_datalens_indexer::InMemoryProposalProjectionRepository::default();

    repository
        .apply(&lifecycle_batch)
        .expect("lifecycle write succeeds");
    repository
        .apply(&identity_batch)
        .expect("identity write succeeds");

    let proposal = repository
        .proposals()
        .get("proposal:1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:42")
        .expect("proposal");

    assert_eq!(
        proposal.proposer,
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    );
    assert_eq!(proposal.current_state.as_deref(), Some("Queued"));
    assert_eq!(proposal.proposal_eta.as_deref(), Some("1700000400"));
}

fn context() -> ProposalProjectionContext {
    ProposalProjectionContext {
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
        block_timestamp_ms: Some(1_700_000_000_000 + block_number),
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
