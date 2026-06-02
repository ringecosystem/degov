use degov_datalens_indexer::{
    BatchReadPlanConfig, BlockReadMode, ChainContracts, ChainReadExecutionReport, ChainReadKey,
    ChainReadMethod, ChainReadResult, ChainReadValue, DecodedGovernorEvent, NormalizedEvmLog,
    ProposalCreatedEvent, ProposalExtendedEvent, ProposalIdEvent, ProposalProjectionContext,
    ProposalProjectionError, ProposalProjectionEvent, ProposalProjectionRepository,
    ProposalQueuedEvent, ProposalStateWriteKind, ReadRequirement, project_proposal_events,
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
    )
    .expect("projection succeeds");

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
    assert_eq!(proposal.proposal_snapshot.as_deref(), Some("20"));
    assert_eq!(proposal.proposal_deadline.as_deref(), Some("40"));
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
    )
    .expect("projection succeeds");

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

    let batch = project_proposal_events(&context(), events).expect("projection succeeds");
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
    )
    .expect("projection succeeds");
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
    )
    .expect("projection succeeds");
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

#[test]
fn test_project_proposal_events_accepts_empty_input() {
    let batch = project_proposal_events(&context(), vec![]).expect("empty projection succeeds");

    assert!(batch.event_order.is_empty());
    assert!(batch.proposals.is_empty());
    assert!(batch.chain_read_plan.reads.is_empty());
}

#[test]
fn test_project_proposal_events_rejects_mixed_chain_input() {
    let mut second = log(11, 0, 1);
    second.chain_id = 2;

    let err = project_proposal_events(
        &context(),
        vec![
            ProposalProjectionEvent {
                log: log(10, 0, 1),
                event: proposal_created("42", "# Title\nBody"),
            },
            ProposalProjectionEvent {
                log: second,
                event: proposal_created("43", "# Other\nBody"),
            },
        ],
    )
    .expect_err("mixed chain input is rejected");

    assert_eq!(
        err,
        ProposalProjectionError::MixedChainIds {
            expected: 1,
            actual: 2,
            log_id: "evm:1:11:0xtx11:0:1".to_owned(),
        }
    );
}

#[test]
fn test_project_proposal_events_rejects_conflicting_duplicate_log_id() {
    let mut duplicate = log(10, 0, 1);
    duplicate.block_number = 11;

    let err = project_proposal_events(
        &context(),
        vec![
            ProposalProjectionEvent {
                log: log(10, 0, 1),
                event: proposal_created("42", "# Title\nBody"),
            },
            ProposalProjectionEvent {
                log: duplicate,
                event: proposal_created("43", "# Other\nBody"),
            },
        ],
    )
    .expect_err("conflicting duplicate log is rejected");

    assert_eq!(
        err,
        ProposalProjectionError::ConflictingDuplicateLog {
            log_id: "evm:1:10:0xtx10:0:1".to_owned(),
        }
    );
}

#[test]
fn test_project_proposal_events_rejects_duplicate_log_id_with_conflicting_metadata() {
    let mut duplicate = log(10, 0, 1);
    duplicate.transaction_hash = "0xdifferent".to_owned();

    let err = project_proposal_events(
        &context(),
        vec![
            ProposalProjectionEvent {
                log: log(10, 0, 1),
                event: proposal_created("42", "# Title\nBody"),
            },
            ProposalProjectionEvent {
                log: duplicate,
                event: proposal_created("42", "# Title\nBody"),
            },
        ],
    )
    .expect_err("conflicting duplicate log metadata is rejected");

    assert_eq!(
        err,
        ProposalProjectionError::ConflictingDuplicateLog {
            log_id: "evm:1:10:0xtx10:0:1".to_owned(),
        }
    );
}

#[test]
fn test_project_proposal_created_rejects_action_length_mismatch() {
    let err = project_proposal_events(
        &context(),
        vec![ProposalProjectionEvent {
            log: log(10, 0, 1),
            event: DecodedGovernorEvent::ProposalCreated(ProposalCreatedEvent {
                proposal_id: "42".to_owned(),
                proposer: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB".to_owned(),
                targets: vec!["0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC".to_owned()],
                values: vec![],
                signatures: vec!["".to_owned()],
                calldatas: vec!["0x".to_owned()],
                vote_start: "20".to_owned(),
                vote_end: "40".to_owned(),
                description: "# Title\nBody".to_owned(),
            }),
        }],
    )
    .expect_err("mismatched action vectors are rejected");

    assert_eq!(
        err,
        ProposalProjectionError::ActionLengthMismatch {
            proposal_id: "42".to_owned(),
            targets: 1,
            values: 0,
            signatures: 1,
            calldatas: 1,
        }
    );
}

#[test]
fn test_proposal_extended_updates_deadline_and_previous_deadline_when_known() {
    let batch = project_proposal_events(
        &context(),
        vec![
            ProposalProjectionEvent {
                log: log(10, 0, 1),
                event: proposal_created("42", "# Title\nBody"),
            },
            ProposalProjectionEvent {
                log: log(11, 0, 1),
                event: DecodedGovernorEvent::ProposalExtended(ProposalExtendedEvent {
                    proposal_id: "42".to_owned(),
                    extended_deadline: "55".to_owned(),
                }),
            },
        ],
    )
    .expect("projection succeeds");

    assert_eq!(batch.proposals[0].proposal_deadline.as_deref(), Some("55"));
    assert_eq!(
        batch.proposal_deadline_extensions[0]
            .previous_deadline
            .as_deref(),
        Some("40")
    );
}

#[test]
fn test_proposal_extended_id_includes_stable_log_identity() {
    let batch = project_proposal_events(
        &context(),
        vec![
            ProposalProjectionEvent {
                log: log(11, 0, 1),
                event: DecodedGovernorEvent::ProposalExtended(ProposalExtendedEvent {
                    proposal_id: "42".to_owned(),
                    extended_deadline: "55".to_owned(),
                }),
            },
            ProposalProjectionEvent {
                log: log(12, 0, 1),
                event: DecodedGovernorEvent::ProposalExtended(ProposalExtendedEvent {
                    proposal_id: "42".to_owned(),
                    extended_deadline: "60".to_owned(),
                }),
            },
        ],
    )
    .expect("projection succeeds");

    assert_eq!(batch.proposal_deadline_extensions.len(), 2);
    assert_ne!(
        batch.proposal_deadline_extensions[0].id,
        batch.proposal_deadline_extensions[1].id
    );
}

#[test]
fn test_apply_chain_read_execution_report_updates_proposal_reads() {
    let mut batch = project_proposal_events(
        &context(),
        vec![ProposalProjectionEvent {
            log: log(10, 0, 1),
            event: proposal_created("42", "# Title\nBody"),
        }],
    )
    .expect("projection succeeds");
    let report = ChainReadExecutionReport {
        results: vec![
            read_result(
                ChainReadMethod::ProposalSnapshot,
                "42",
                ChainReadValue::Integer("21".to_owned()),
            ),
            read_result(
                ChainReadMethod::ProposalDeadline,
                "42",
                ChainReadValue::Integer("41".to_owned()),
            ),
            read_result(
                ChainReadMethod::State,
                "42",
                ChainReadValue::Integer("1".to_owned()),
            ),
        ],
        ..ChainReadExecutionReport::default()
    };

    batch.apply_chain_read_execution_report(&report);

    assert_eq!(batch.proposals[0].proposal_snapshot.as_deref(), Some("21"));
    assert_eq!(batch.proposals[0].proposal_deadline.as_deref(), Some("41"));
    assert_eq!(batch.proposals[0].current_state.as_deref(), Some("Active"));
}

#[test]
fn test_description_heading_single_newline_and_no_heading() {
    let heading = project_proposal_events(
        &context(),
        vec![ProposalProjectionEvent {
            log: log(10, 0, 1),
            event: proposal_created("42", "# Title\nBody"),
        }],
    )
    .expect("projection succeeds");
    let plain = project_proposal_events(
        &context(),
        vec![ProposalProjectionEvent {
            log: log(11, 0, 1),
            event: proposal_created("43", "Plain title\nPlain body"),
        }],
    )
    .expect("projection succeeds");

    assert_eq!(heading.proposals[0].title, "Title");
    assert_eq!(heading.proposals[0].description_body, "Body");
    assert_eq!(plain.proposals[0].title, "Plain title");
    assert_eq!(plain.proposals[0].description_body, "Plain body");
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

fn proposal_created(proposal_id: &str, description: &str) -> DecodedGovernorEvent {
    DecodedGovernorEvent::ProposalCreated(ProposalCreatedEvent {
        proposal_id: proposal_id.to_owned(),
        proposer: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB".to_owned(),
        targets: vec!["0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC".to_owned()],
        values: vec!["0".to_owned()],
        signatures: vec!["".to_owned()],
        calldatas: vec!["0x".to_owned()],
        vote_start: "20".to_owned(),
        vote_end: "40".to_owned(),
        description: description.to_owned(),
    })
}

fn read_result(
    method: ChainReadMethod,
    proposal_id: &str,
    value: ChainReadValue,
) -> ChainReadResult {
    ChainReadResult {
        read_index: 0,
        key: ChainReadKey {
            chain_id: 1,
            contract_address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_owned(),
            method,
            args: vec![proposal_id.to_owned()],
            block_mode: BlockReadMode::Fresh,
        },
        value,
    }
}
