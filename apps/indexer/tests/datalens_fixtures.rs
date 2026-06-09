use degov_datalens_indexer::{
    BatchReadPlanConfig, ChainContracts, ChainReadMethod, DecodedDaoEvent, DecodedGovernorEvent,
    DecodedTimelockEvent, DecodedTokenEvent, GovernanceTokenStandard,
    InMemoryTokenProjectionRepository, NormalizedEvmLog, ProposalProjectionContext,
    ProposalProjectionEvent, TimelockProjectionContext, TimelockProjectionEvent,
    TokenProjectionContext, TokenProjectionEvent, TokenProjectionRepository, VoteProjectionContext,
    VoteProjectionEvent, normalize_evm_log_rows, project_proposal_events, project_timelock_events,
    project_token_events, project_vote_events,
};
use serde_json::{Value, json};

mod support;
use support::fixtures::{DatalensFixture, load_datalens_fixture};

#[test]
fn test_load_datalens_fixture_normalizes_and_decodes_representative_raw_logs() {
    let fixture = load_datalens_fixture("known-dao-ranges").expect("fixture loads");

    assert_eq!(fixture.name, "known-dao-ranges");
    assert_eq!(fixture.dao_ranges.len(), 4);
    assert_eq!(fixture.expected_checkpoint.next_block, 10_010);
    assert_eq!(fixture.expected_duplicate_replay.unique_log_count, 16);
    assert_eq!(fixture.expected_duplicate_replay.replayed_log_count, 18);
    assert_eq!(
        fixture
            .expected_decoded_events()
            .expect("expected events")
            .len(),
        16
    );

    let mut decoded_names = Vec::new();
    for page in &fixture.pages {
        let logs =
            normalize_evm_log_rows(page.chain_id, page.rows.clone()).expect("raw rows normalize");
        for log in logs {
            let decoded = fixture
                .decode_log(page, &log)
                .expect("fixture log decodes from raw row");
            decoded_names.push(event_name(&decoded).to_owned());
        }
    }

    assert_eq!(
        decoded_names,
        fixture
            .expected_decoded_events()
            .expect("expected events")
            .into_iter()
            .map(|event| event.event)
            .collect::<Vec<_>>()
    );

    let replay_rows = fixture
        .duplicate_replay_rows()
        .expect("duplicate replay rows");
    let replay_logs = normalize_evm_log_rows(1, replay_rows).expect("duplicate replay normalizes");

    assert_eq!(
        replay_logs.len(),
        fixture.expected_duplicate_replay.unique_log_count
    );
    for id in &fixture.expected_duplicate_replay.duplicate_log_ids {
        assert!(
            replay_logs.iter().any(|log| &log.id == id),
            "expected duplicate id {id} to survive dedupe"
        );
    }
}

#[test]
fn test_known_dao_range_fixture_expected_snapshot_documents_output_tables() {
    let fixture = load_datalens_fixture("known-dao-ranges").expect("fixture loads");
    let expected = fixture.expected_decoded_events().expect("expected events");

    assert_eq!(
        expected
            .iter()
            .map(|event| event.event.as_str())
            .collect::<Vec<_>>(),
        vec![
            "ProposalCreated",
            "VoteCast",
            "ProposalQueued",
            "ProposalExtended",
            "ProposalExecuted",
            "DelegateChanged",
            "DelegateVotesChanged",
            "Transfer(ERC20)",
            "Transfer(ERC721)",
            "CallScheduled",
            "CallSalt",
            "RoleGranted",
            "CallExecuted",
            "MinDelayChange",
            "Cancelled",
            "RoleRevoked",
        ]
    );

    assert!(
        expected
            .iter()
            .any(|event| event.table == "proposal_created")
    );
    assert!(expected.iter().any(|event| event.table == "vote_cast"));
    assert!(
        expected
            .iter()
            .any(|event| event.table == "token_transfers")
    );
    assert!(
        expected
            .iter()
            .any(|event| event.table == "timelock_operations")
    );

    let projected = load_datalens_fixture("known-dao-ranges")
        .expect("fixture loads")
        .expected_projected_outputs()
        .expect("expected projected outputs");
    assert!(projected["token_erc20"]["delegate_mappings"].is_array());
    assert!(projected["token_erc20"]["delegates"].is_array());
    assert!(projected["token_erc20"]["contributors"].is_array());
    assert!(projected["token_erc20"]["data_metric_delta"].is_object());
}

#[test]
fn test_known_dao_range_fixture_matches_decoded_payload_and_projected_output_snapshots() {
    let fixture = load_datalens_fixture("known-dao-ranges").expect("fixture loads");
    let decoded = decode_fixture_events(&fixture);
    let decoded_payloads = decoded_payload_snapshot(&decoded);
    let projected_outputs = projected_output_snapshot(&decoded);

    assert_eq!(
        decoded_payloads,
        fixture
            .expected_decoded_payloads()
            .expect("expected decoded payloads")
    );
    assert_eq!(
        projected_outputs,
        fixture
            .expected_projected_outputs()
            .expect("expected projected outputs")
    );
}

#[derive(Clone)]
struct DecodedFixtureEvent {
    dao_code: String,
    token_standard: Option<GovernanceTokenStandard>,
    log: NormalizedEvmLog,
    event: DecodedDaoEvent,
}

fn decode_fixture_events(fixture: &DatalensFixture) -> Vec<DecodedFixtureEvent> {
    let mut decoded = Vec::new();
    for page in &fixture.pages {
        let logs =
            normalize_evm_log_rows(page.chain_id, page.rows.clone()).expect("raw rows normalize");
        for log in logs {
            decoded.push(DecodedFixtureEvent {
                dao_code: page.dao_code.clone(),
                token_standard: page.token_standard.map(GovernanceTokenStandard::from),
                event: fixture
                    .decode_log(page, &log)
                    .expect("fixture log decodes from raw row"),
                log,
            });
        }
    }
    decoded
}

fn decoded_payload_snapshot(events: &[DecodedFixtureEvent]) -> Value {
    Value::Array(
        events
            .iter()
            .map(|event| match &event.event {
                DecodedDaoEvent::Governor(DecodedGovernorEvent::ProposalCreated(payload)) => {
                    json!({
                        "dao_code": event.dao_code,
                        "event": "ProposalCreated",
                        "log_id": event.log.id,
                        "proposal_id": payload.proposal_id,
                        "proposer": payload.proposer,
                        "targets": payload.targets,
                        "values": payload.values,
                        "signatures": payload.signatures,
                        "calldatas": payload.calldatas,
                        "vote_start": payload.vote_start,
                        "vote_end": payload.vote_end,
                        "description": payload.description,
                    })
                }
                DecodedDaoEvent::Governor(DecodedGovernorEvent::VoteCast(payload)) => json!({
                    "dao_code": event.dao_code,
                    "event": "VoteCast",
                    "log_id": event.log.id,
                    "voter": payload.voter,
                    "proposal_id": payload.proposal_id,
                    "support": payload.support,
                    "weight": payload.weight,
                    "reason": payload.reason,
                }),
                DecodedDaoEvent::Governor(DecodedGovernorEvent::ProposalQueued(payload)) => json!({
                    "dao_code": event.dao_code,
                    "event": "ProposalQueued",
                    "log_id": event.log.id,
                    "proposal_id": payload.proposal_id,
                    "eta_seconds": payload.eta_seconds,
                }),
                DecodedDaoEvent::Governor(DecodedGovernorEvent::ProposalExtended(payload)) => {
                    json!({
                        "dao_code": event.dao_code,
                        "event": "ProposalExtended",
                        "log_id": event.log.id,
                        "proposal_id": payload.proposal_id,
                        "extended_deadline": payload.extended_deadline,
                    })
                }
                DecodedDaoEvent::Governor(DecodedGovernorEvent::ProposalExecuted(payload)) => {
                    json!({
                        "dao_code": event.dao_code,
                        "event": "ProposalExecuted",
                        "log_id": event.log.id,
                        "proposal_id": payload.proposal_id,
                    })
                }
                DecodedDaoEvent::Token(DecodedTokenEvent::DelegateChanged(payload)) => json!({
                    "dao_code": event.dao_code,
                    "event": "DelegateChanged",
                    "log_id": event.log.id,
                    "delegator": payload.delegator,
                    "from_delegate": payload.from_delegate,
                    "to_delegate": payload.to_delegate,
                }),
                DecodedDaoEvent::Token(DecodedTokenEvent::DelegateVotesChanged(payload)) => json!({
                    "dao_code": event.dao_code,
                    "event": "DelegateVotesChanged",
                    "log_id": event.log.id,
                    "delegate": payload.delegate,
                    "previous_votes": payload.previous_votes,
                    "new_votes": payload.new_votes,
                }),
                DecodedDaoEvent::Token(DecodedTokenEvent::Transfer(payload)) => json!({
                    "dao_code": event.dao_code,
                    "event": event_name(&event.event),
                    "log_id": event.log.id,
                    "from": payload.from,
                    "to": payload.to,
                    "value": payload.value,
                    "standard": event.token_standard.map(token_standard_name),
                }),
                DecodedDaoEvent::Timelock(DecodedTimelockEvent::CallScheduled(payload)) => json!({
                    "dao_code": event.dao_code,
                    "event": "CallScheduled",
                    "log_id": event.log.id,
                    "id": payload.id,
                    "index": payload.index,
                    "target": payload.target,
                    "value": payload.value,
                    "data": payload.data,
                    "predecessor": payload.predecessor,
                    "delay": payload.delay,
                }),
                DecodedDaoEvent::Timelock(DecodedTimelockEvent::CallSalt(payload)) => json!({
                    "dao_code": event.dao_code,
                    "event": "CallSalt",
                    "log_id": event.log.id,
                    "id": payload.id,
                    "salt": payload.salt,
                }),
                DecodedDaoEvent::Timelock(DecodedTimelockEvent::RoleGranted(payload)) => json!({
                    "dao_code": event.dao_code,
                    "event": "RoleGranted",
                    "log_id": event.log.id,
                    "role": payload.role,
                    "account": payload.account,
                    "sender": payload.sender,
                }),
                DecodedDaoEvent::Timelock(DecodedTimelockEvent::CallExecuted(payload)) => json!({
                    "dao_code": event.dao_code,
                    "event": "CallExecuted",
                    "log_id": event.log.id,
                    "id": payload.id,
                    "index": payload.index,
                    "target": payload.target,
                    "value": payload.value,
                    "data": payload.data,
                }),
                DecodedDaoEvent::Timelock(DecodedTimelockEvent::MinDelayChange(payload)) => json!({
                    "dao_code": event.dao_code,
                    "event": "MinDelayChange",
                    "log_id": event.log.id,
                    "old_value": payload.old_value,
                    "new_value": payload.new_value,
                }),
                DecodedDaoEvent::Timelock(DecodedTimelockEvent::Cancelled(payload)) => json!({
                    "dao_code": event.dao_code,
                    "event": "Cancelled",
                    "log_id": event.log.id,
                    "id": payload.id,
                }),
                DecodedDaoEvent::Timelock(DecodedTimelockEvent::RoleRevoked(payload)) => json!({
                    "dao_code": event.dao_code,
                    "event": "RoleRevoked",
                    "log_id": event.log.id,
                    "role": payload.role,
                    "account": payload.account,
                    "sender": payload.sender,
                }),
                other => json!({
                    "dao_code": event.dao_code,
                    "event": event_name(other),
                    "log_id": event.log.id,
                }),
            })
            .collect(),
    )
}

fn projected_output_snapshot(events: &[DecodedFixtureEvent]) -> Value {
    let proposal_batch = project_proposal_events(
        &proposal_context(),
        events
            .iter()
            .filter_map(|event| match &event.event {
                DecodedDaoEvent::Governor(governor)
                    if !matches!(governor, DecodedGovernorEvent::VoteCast(_)) =>
                {
                    Some(ProposalProjectionEvent {
                        log: event.log.clone(),
                        event: governor.clone(),
                    })
                }
                _ => None,
            })
            .collect(),
    )
    .expect("proposal projection succeeds");
    let vote_batch = project_vote_events(
        &vote_context(),
        events
            .iter()
            .filter_map(|event| match &event.event {
                DecodedDaoEvent::Governor(DecodedGovernorEvent::VoteCast(vote)) => {
                    Some(VoteProjectionEvent {
                        log: event.log.clone(),
                        event: DecodedGovernorEvent::VoteCast(vote.clone()),
                    })
                }
                _ => None,
            })
            .collect(),
    )
    .expect("vote projection succeeds");
    let token_erc20_batch = project_token_events(
        &token_context(
            "ens-lisk-representative",
            "0x2222222222222222222222222222222222222222",
            GovernanceTokenStandard::Erc20,
            20_000,
            20_002,
        ),
        token_events(events, "ens-lisk-representative"),
    )
    .expect("ERC20 token projection succeeds");
    let token_erc721_batch = project_token_events(
        &token_context(
            "lisk-representative",
            "0x4444444444444444444444444444444444444444",
            GovernanceTokenStandard::Erc721,
            30_000,
            30_000,
        ),
        token_events(events, "lisk-representative"),
    )
    .expect("ERC721 token projection succeeds");
    let timelock_batch = project_timelock_events(
        &timelock_context(),
        events
            .iter()
            .filter_map(|event| match &event.event {
                DecodedDaoEvent::Timelock(timelock) => Some(TimelockProjectionEvent {
                    log: event.log.clone(),
                    event: timelock.clone(),
                }),
                _ => None,
            })
            .collect(),
    )
    .expect("timelock projection succeeds");

    json!({
        "proposal": {
            "event_order": proposal_batch.event_order,
            "proposal_created": proposal_batch.proposal_created.iter().map(|row| json!({
                "id": row.id,
                "proposal_id": row.proposal_id,
                "proposer": row.proposer,
                "vote_start": row.vote_start,
                "vote_end": row.vote_end,
                "description": row.description,
            })).collect::<Vec<_>>(),
            "proposals": proposal_batch.proposals.iter().map(|row| json!({
                "id": row.id,
                "proposal_id": row.proposal_id,
                "title": row.title,
                "description_body": row.description_body,
                "current_state": row.current_state,
                "proposal_eta": row.proposal_eta,
                "proposal_deadline": row.proposal_deadline,
                "executed_block_number": row.executed_block_number,
            })).collect::<Vec<_>>(),
            "proposal_actions": proposal_batch.proposal_actions.iter().map(|row| json!({
                "id": row.id,
                "proposal_id": row.proposal_id,
                "action_index": row.action_index,
                "target": row.target,
                "value": row.value,
                "signature": row.signature,
                "calldata": row.calldata,
            })).collect::<Vec<_>>(),
            "proposal_queued": proposal_batch.proposal_queued.iter().map(|row| json!({
                "id": row.id,
                "proposal_id": row.proposal_id,
                "eta_seconds": row.eta_seconds,
            })).collect::<Vec<_>>(),
            "proposal_deadline_extensions": proposal_batch.proposal_deadline_extensions.iter().map(|row| json!({
                "id": row.id,
                "proposal_id": row.proposal_id,
                "new_deadline": row.new_deadline,
            })).collect::<Vec<_>>(),
            "proposal_executed": proposal_batch.proposal_executed.iter().map(|row| json!({
                "id": row.id,
                "proposal_id": row.proposal_id,
            })).collect::<Vec<_>>(),
            "state_epochs": proposal_batch.proposal_state_epochs.iter().map(|row| json!({
                "id": row.id,
                "proposal_id": row.proposal_id,
                "state": row.state,
                "start_timepoint": row.start_timepoint,
            })).collect::<Vec<_>>(),
            "chain_read_metrics": {
                "requested_reads": proposal_batch.chain_read_plan.metrics.requested_reads,
                "deduped_reads": proposal_batch.chain_read_plan.metrics.deduped_reads,
            },
        },
        "vote": {
            "event_order": vote_batch.event_order,
            "vote_cast": vote_batch.vote_cast.iter().map(|row| json!({
                "id": row.id,
                "voter": row.voter,
                "proposal_id": row.proposal_id,
                "support": row.support,
                "weight": row.weight,
                "reason": row.reason,
            })).collect::<Vec<_>>(),
            "proposal_vote_totals": vote_batch.proposal_vote_totals.iter().map(|row| json!({
                "proposal_ref": row.proposal_ref,
                "proposal_id": row.proposal_id,
                "votes_count": row.votes_count,
                "votes_weight_for_sum": row.votes_weight_for_sum,
                "votes_weight_against_sum": row.votes_weight_against_sum,
                "votes_weight_abstain_sum": row.votes_weight_abstain_sum,
            })).collect::<Vec<_>>(),
            "data_metric_delta": {
                "votes_count": vote_batch.data_metric_delta.votes_count,
                "votes_weight_for_sum": vote_batch.data_metric_delta.votes_weight_for_sum,
                "votes_weight_against_sum": vote_batch.data_metric_delta.votes_weight_against_sum,
                "votes_weight_abstain_sum": vote_batch.data_metric_delta.votes_weight_abstain_sum,
            },
        },
        "token_erc20": token_projection_snapshot(token_erc20_batch),
        "token_erc721": token_projection_snapshot(token_erc721_batch),
        "timelock": {
            "event_order": timelock_batch.event_order,
            "operations": timelock_batch.timelock_operations.iter().map(|row| json!({
                "id": row.id,
                "operation_id": row.operation_id,
                "state": row.state,
                "call_count": row.call_count,
                "executed_call_count": row.executed_call_count,
                "delay_seconds": row.delay_seconds,
                "ready_at": row.ready_at,
                "salt": row.salt,
                "queued_block_number": row.queued_block_number,
                "executed_block_number": row.executed_block_number,
                "cancelled_block_number": row.cancelled_block_number,
            })).collect::<Vec<_>>(),
            "calls": timelock_batch.timelock_calls.iter().map(|row| json!({
                "id": row.id,
                "operation_id": row.operation_id,
                "action_index": row.action_index,
                "target": row.target,
                "value": row.value,
                "data": row.data,
                "state": row.state,
            })).collect::<Vec<_>>(),
            "role_events": timelock_batch.timelock_role_events.iter().map(|row| json!({
                "id": row.id,
                "event_name": row.event_name,
                "role": row.role,
                "role_label": row.role_label,
                "account": row.account,
                "sender": row.sender,
            })).collect::<Vec<_>>(),
            "min_delay_changes": timelock_batch.timelock_min_delay_changes.iter().map(|row| json!({
                "id": row.id,
                "old_duration": row.old_duration,
                "new_duration": row.new_duration,
            })).collect::<Vec<_>>(),
            "operation_hints": timelock_batch.timelock_operation_hints.iter().map(|row| json!({
                "id": row.id,
                "operation_id": row.operation_id,
                "event_name": row.event_name,
            })).collect::<Vec<_>>(),
            "chain_read_metrics": {
                "requested_reads": timelock_batch.chain_read_plan.metrics.requested_reads,
                "deduped_reads": timelock_batch.chain_read_plan.metrics.deduped_reads,
            },
        },
    })
}

fn token_events(events: &[DecodedFixtureEvent], dao_code: &str) -> Vec<TokenProjectionEvent> {
    events
        .iter()
        .filter_map(|event| match &event.event {
            DecodedDaoEvent::Token(token) if event.dao_code == dao_code => {
                Some(TokenProjectionEvent {
                    log: event.log.clone(),
                    event: token.clone(),
                })
            }
            _ => None,
        })
        .collect()
}

fn token_projection_snapshot(batch: degov_datalens_indexer::TokenProjectionBatch) -> Value {
    let mut repository = InMemoryTokenProjectionRepository::default();
    repository
        .apply(&batch)
        .expect("token projection repository applies fixture batch");

    json!({
        "event_order": batch.event_order,
        "delegate_changed": batch.delegate_changed.iter().map(|row| json!({
            "id": row.id,
            "delegator": row.delegator,
            "from_delegate": row.from_delegate,
            "to_delegate": row.to_delegate,
        })).collect::<Vec<_>>(),
        "delegate_votes_changed": batch.delegate_votes_changed.iter().map(|row| json!({
            "id": row.id,
            "delegate": row.delegate,
            "previous_votes": row.previous_votes,
            "new_votes": row.new_votes,
        })).collect::<Vec<_>>(),
        "token_transfers": batch.token_transfers.iter().map(|row| json!({
            "id": row.id,
            "from": row.from,
            "to": row.to,
            "value": row.value,
            "standard": row.standard,
        })).collect::<Vec<_>>(),
        "delegate_rollings": batch.delegate_rollings.iter().map(|row| json!({
            "id": row.id,
            "delegator": row.delegator,
            "from_delegate": row.from_delegate,
            "to_delegate": row.to_delegate,
        })).collect::<Vec<_>>(),
        "delegate_mappings": repository.delegate_mappings().values().map(|row| json!({
            "id": row.id,
            "from": row.from,
            "to": row.to,
            "power": row.power,
        })).collect::<Vec<_>>(),
        "delegates": repository.delegates().values().map(|row| json!({
            "id": row.id,
            "from_delegate": row.from_delegate,
            "to_delegate": row.to_delegate,
            "is_current": row.is_current,
            "power": row.power,
        })).collect::<Vec<_>>(),
        "contributors": repository.contributors().values().map(|row| json!({
            "id": row.id,
            "last_vote_block_number": row.last_vote_block_number,
            "last_vote_timestamp": row.last_vote_timestamp,
            "power": row.power,
            "balance": row.balance,
            "delegates_count_all": row.delegates_count_all,
            "delegates_count_effective": row.delegates_count_effective,
        })).collect::<Vec<_>>(),
        "data_metric_delta": {
            "power_sum": repository.data_metric().power_sum,
            "member_count": repository.data_metric().member_count,
        },
        "reconcile_metrics": {
            "candidate_count": batch.reconcile_plan.metrics.candidate_count,
            "deduped_count": batch.reconcile_plan.metrics.deduped_count,
            "requested_reads": batch.reconcile_plan.chain_read_plan.metrics.requested_reads,
            "deduped_reads": batch.reconcile_plan.chain_read_plan.metrics.deduped_reads,
        },
    })
}

fn proposal_context() -> ProposalProjectionContext {
    ProposalProjectionContext {
        contract_set_id: "dao=demo-dao|chain=46|governor=0x1111111111111111111111111111111111111111|token=0x2222222222222222222222222222222222222222".to_owned(),
        dao_code: "demo-dao".to_owned(),
        governor_address: "0x1111111111111111111111111111111111111111".to_owned(),
        contracts: contracts("0x2222222222222222222222222222222222222222"),
        token_standard: GovernanceTokenStandard::Erc20,
        read_plan_config: read_plan_config(),
    }
}

fn vote_context() -> VoteProjectionContext {
    VoteProjectionContext {
        contract_set_id: "demo-scope".to_owned(),
        dao_code: "demo-dao".to_owned(),
        governor_address: "0x1111111111111111111111111111111111111111".to_owned(),
        contracts: contracts("0x2222222222222222222222222222222222222222"),
        read_plan_config: read_plan_config(),
    }
}

fn token_context(
    dao_code: &str,
    token_address: &str,
    token_standard: GovernanceTokenStandard,
    from_block: u64,
    to_block: u64,
) -> TokenProjectionContext {
    TokenProjectionContext {
        contract_set_id: "demo-scope".to_owned(),
        dao_code: dao_code.to_owned(),
        governor_address: "0x1111111111111111111111111111111111111111".to_owned(),
        token_address: token_address.to_owned(),
        contracts: contracts(token_address),
        token_standard,
        from_block,
        to_block,
        target_height: Some(to_block),
        read_plan_config: read_plan_config(),
        current_power_method: ChainReadMethod::GetVotes,
    }
}

fn timelock_context() -> TimelockProjectionContext {
    TimelockProjectionContext {
        contract_set_id: "dao=timelock-heavy|chain=1|governor=0x1111111111111111111111111111111111111111|token=0x2222222222222222222222222222222222222222".to_owned(),
        dao_code: "timelock-heavy".to_owned(),
        governor_address: "0x1111111111111111111111111111111111111111".to_owned(),
        timelock_address: "0x3333333333333333333333333333333333333333".to_owned(),
        contracts: contracts("0x2222222222222222222222222222222222222222"),
        read_plan_config: read_plan_config(),
    }
}

fn contracts(token_address: &str) -> ChainContracts {
    ChainContracts {
        governor: "0x1111111111111111111111111111111111111111".to_owned(),
        governor_token: token_address.to_owned(),
        timelock: "0x3333333333333333333333333333333333333333".to_owned(),
    }
}

fn read_plan_config() -> BatchReadPlanConfig {
    BatchReadPlanConfig {
        max_concurrency: 4,
        multicall_batch_size: 10,
    }
}

fn token_standard_name(standard: GovernanceTokenStandard) -> &'static str {
    match standard {
        GovernanceTokenStandard::Erc20 => "erc20",
        GovernanceTokenStandard::Erc721 => "erc721",
    }
}

fn event_name(event: &DecodedDaoEvent) -> &'static str {
    match event {
        DecodedDaoEvent::Governor(event) => match event {
            DecodedGovernorEvent::ProposalCreated(_) => "ProposalCreated",
            DecodedGovernorEvent::ProposalQueued(_) => "ProposalQueued",
            DecodedGovernorEvent::ProposalExtended(_) => "ProposalExtended",
            DecodedGovernorEvent::ProposalExecuted(_) => "ProposalExecuted",
            DecodedGovernorEvent::VoteCast(_) => "VoteCast",
            event => event.event_name(),
        },
        DecodedDaoEvent::Token(DecodedTokenEvent::DelegateChanged(_)) => "DelegateChanged",
        DecodedDaoEvent::Token(DecodedTokenEvent::DelegateVotesChanged(_)) => {
            "DelegateVotesChanged"
        }
        DecodedDaoEvent::Token(DecodedTokenEvent::Transfer(event)) => match event.standard {
            GovernanceTokenStandard::Erc20 => "Transfer(ERC20)",
            GovernanceTokenStandard::Erc721 => "Transfer(ERC721)",
        },
        DecodedDaoEvent::Timelock(event) => match event {
            DecodedTimelockEvent::CallScheduled(_) => "CallScheduled",
            DecodedTimelockEvent::CallSalt(_) => "CallSalt",
            DecodedTimelockEvent::RoleGranted(_) => "RoleGranted",
            DecodedTimelockEvent::CallExecuted(_) => "CallExecuted",
            DecodedTimelockEvent::MinDelayChange(_) => "MinDelayChange",
            DecodedTimelockEvent::Cancelled(_) => "Cancelled",
            DecodedTimelockEvent::RoleRevoked(_) => "RoleRevoked",
            event => event.event_name(),
        },
        DecodedDaoEvent::UnsupportedTopic(_) => "UnsupportedTopic",
    }
}
