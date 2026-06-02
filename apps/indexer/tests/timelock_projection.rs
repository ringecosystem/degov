use degov_datalens_indexer::{
    BatchReadPlanConfig, CallExecutedEvent, CallSaltEvent, CallScheduledEvent, ChainContracts,
    ChainReadExecutionReport, ChainReadKey, ChainReadMethod, ChainReadResult, ChainReadValue,
    DecodedTimelockEvent, NormalizedEvmLog, ParameterChangeEvent, ReadRequirement,
    RoleAccountEvent, RoleAdminChangedEvent, TimelockOperationIdEvent, TimelockProjectionContext,
    TimelockProjectionError, TimelockProjectionEvent, TimelockProjectionRepository,
    project_timelock_events,
};
use serde_json::json;

#[test]
fn test_project_timelock_scheduled_executed_and_cancelled_operations() {
    let batch = project_timelock_events(
        &context(),
        vec![
            TimelockProjectionEvent {
                log: log(10, 0, 2),
                event: DecodedTimelockEvent::CallScheduled(CallScheduledEvent {
                    id: operation_id(),
                    index: "0".to_owned(),
                    target: "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC".to_owned(),
                    value: "100".to_owned(),
                    data: "0x1234".to_owned(),
                    predecessor: predecessor_id(),
                    delay: "3600".to_owned(),
                }),
            },
            TimelockProjectionEvent {
                log: log(10, 0, 1),
                event: DecodedTimelockEvent::CallSalt(CallSaltEvent {
                    id: operation_id(),
                    salt: salt_id(),
                }),
            },
            TimelockProjectionEvent {
                log: log(11, 1, 0),
                event: DecodedTimelockEvent::CallExecuted(CallExecutedEvent {
                    id: operation_id(),
                    index: "0".to_owned(),
                    target: "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC".to_owned(),
                    value: "100".to_owned(),
                    data: "0x1234".to_owned(),
                }),
            },
            TimelockProjectionEvent {
                log: log(12, 0, 0),
                event: DecodedTimelockEvent::Cancelled(TimelockOperationIdEvent {
                    id: operation_id(),
                }),
            },
        ],
    )
    .expect("projection succeeds");

    assert_eq!(
        batch.event_order,
        vec![
            "evm:1:10:0xtx10:0:1".to_owned(),
            "evm:1:10:0xtx10:0:2".to_owned(),
            "evm:1:11:0xtx11:1:0".to_owned(),
            "evm:1:12:0xtx12:0:0".to_owned(),
        ]
    );
    assert_eq!(batch.timelock_operations.len(), 1);
    assert_eq!(batch.timelock_calls.len(), 1);
    assert_eq!(batch.timelock_operation_hints.len(), 4);

    let operation = &batch.timelock_operations[0];
    assert_eq!(
        operation.id,
        format!(
            "timelock-operation:1:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:0x2222222222222222222222222222222222222222:{}",
            operation_id()
        )
    );
    assert_eq!(operation.operation_id, operation_id());
    assert_eq!(operation.timelock_type, "TimelockController");
    assert_eq!(
        operation.predecessor.as_deref(),
        Some(predecessor_id().as_str())
    );
    assert_eq!(operation.salt.as_deref(), Some(salt_id().as_str()));
    assert_eq!(operation.state, "Cancelled");
    assert_eq!(operation.call_count, Some(1));
    assert_eq!(operation.executed_call_count, Some(1));
    assert_eq!(operation.delay_seconds.as_deref(), Some("3600"));
    assert_eq!(operation.ready_at.as_deref(), Some("1700003600"));
    assert_eq!(operation.queued_block_number.as_deref(), Some("10"));
    assert_eq!(operation.executed_block_number.as_deref(), Some("11"));
    assert_eq!(operation.cancelled_block_number.as_deref(), Some("12"));

    let call = &batch.timelock_calls[0];
    assert_eq!(call.id, format!("{}:call:0", operation.id));
    assert_eq!(call.operation_ref, operation.id);
    assert_eq!(call.action_index, 0);
    assert_eq!(call.target, "0xcccccccccccccccccccccccccccccccccccccccc");
    assert_eq!(call.value, "100");
    assert_eq!(call.data, "0x1234");
    assert_eq!(call.state, "Executed");
    assert_eq!(call.scheduled_block_number.as_deref(), Some("10"));
    assert_eq!(call.executed_block_number.as_deref(), Some("11"));

    assert_eq!(batch.chain_read_plan.metrics.requested_reads, 4);
    assert_eq!(batch.chain_read_plan.metrics.deduped_reads, 3);
    assert_eq!(batch.chain_read_plan.reads.len(), 1);
    assert_eq!(
        batch.chain_read_plan.reads[0].requirement,
        ReadRequirement::Required
    );
    assert_eq!(
        batch.chain_read_plan.reads[0].key.method,
        ChainReadMethod::TimelockOperationState
    );
    assert_eq!(
        batch.chain_read_plan.reads[0].key.args,
        vec![operation_id()]
    );
    assert_eq!(
        batch.chain_read_plan.reads[0].metadata.operation_ids,
        [operation_id()].into()
    );
    assert_eq!(
        batch.chain_read_plan.reads[0].activity_blocks,
        vec![10, 11, 12]
    );
}

#[test]
fn test_project_timelock_role_and_min_delay_events() {
    let batch = project_timelock_events(
        &context(),
        vec![
            TimelockProjectionEvent {
                log: log(20, 0, 0),
                event: DecodedTimelockEvent::RoleGranted(RoleAccountEvent {
                    role: proposer_role(),
                    account: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB".to_owned(),
                    sender: "0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD".to_owned(),
                }),
            },
            TimelockProjectionEvent {
                log: log(21, 0, 0),
                event: DecodedTimelockEvent::RoleAdminChanged(RoleAdminChangedEvent {
                    role: proposer_role(),
                    previous_admin_role: admin_role(),
                    new_admin_role: executor_role(),
                }),
            },
            TimelockProjectionEvent {
                log: log(22, 0, 0),
                event: DecodedTimelockEvent::MinDelayChange(ParameterChangeEvent {
                    old_value: "3600".to_owned(),
                    new_value: "7200".to_owned(),
                }),
            },
        ],
    )
    .expect("projection succeeds");

    assert_eq!(batch.timelock_role_events.len(), 2);
    assert_eq!(batch.timelock_min_delay_changes.len(), 1);
    assert!(batch.chain_read_plan.reads.is_empty());

    let granted = &batch.timelock_role_events[0];
    assert_eq!(granted.event_name, "RoleGranted");
    assert_eq!(granted.role, proposer_role());
    assert_eq!(granted.role_label.as_deref(), Some("PROPOSER_ROLE"));
    assert_eq!(
        granted.account.as_deref(),
        Some("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
    );
    assert_eq!(
        granted.sender.as_deref(),
        Some("0xdddddddddddddddddddddddddddddddddddddddd")
    );

    let admin_changed = &batch.timelock_role_events[1];
    assert_eq!(admin_changed.event_name, "RoleAdminChanged");
    assert_eq!(
        admin_changed.previous_admin_role_label.as_deref(),
        Some("TIMELOCK_ADMIN_ROLE")
    );
    assert_eq!(
        admin_changed.new_admin_role_label.as_deref(),
        Some("EXECUTOR_ROLE")
    );

    let delay = &batch.timelock_min_delay_changes[0];
    assert_eq!(delay.old_duration, "3600");
    assert_eq!(delay.new_duration, "7200");
    assert_eq!(delay.block_number, "22");
}

#[test]
fn test_project_timelock_events_replays_idempotently() {
    let mut events = vec![
        TimelockProjectionEvent {
            log: log(10, 0, 0),
            event: DecodedTimelockEvent::CallScheduled(CallScheduledEvent {
                id: operation_id(),
                index: "0".to_owned(),
                target: "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC".to_owned(),
                value: "0".to_owned(),
                data: "0x".to_owned(),
                predecessor: predecessor_id(),
                delay: "60".to_owned(),
            }),
        },
        TimelockProjectionEvent {
            log: log(11, 0, 0),
            event: DecodedTimelockEvent::CallExecuted(CallExecutedEvent {
                id: operation_id(),
                index: "0".to_owned(),
                target: "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC".to_owned(),
                value: "0".to_owned(),
                data: "0x".to_owned(),
            }),
        },
    ];
    events.push(events[0].clone());
    events.push(events[1].clone());

    let batch = project_timelock_events(&context(), events).expect("projection succeeds");
    let mut repository = degov_datalens_indexer::InMemoryTimelockProjectionRepository::default();

    repository
        .apply(&batch)
        .expect("first projection write succeeds");
    repository
        .apply(&batch)
        .expect("replay projection write succeeds");

    assert_eq!(batch.timelock_operations.len(), 1);
    assert_eq!(batch.timelock_calls.len(), 1);
    assert_eq!(repository.timelock_operations().len(), 1);
    assert_eq!(repository.timelock_calls().len(), 1);
    assert_eq!(
        repository
            .timelock_operations()
            .values()
            .next()
            .expect("operation")
            .state,
        "Executed"
    );
}

#[test]
fn test_project_timelock_events_rejects_mixed_chain_input() {
    let mut second = log(11, 0, 0);
    second.chain_id = 2;

    let err = project_timelock_events(
        &context(),
        vec![
            TimelockProjectionEvent {
                log: log(10, 0, 0),
                event: DecodedTimelockEvent::Cancelled(TimelockOperationIdEvent {
                    id: operation_id(),
                }),
            },
            TimelockProjectionEvent {
                log: second,
                event: DecodedTimelockEvent::Cancelled(TimelockOperationIdEvent {
                    id: operation_id(),
                }),
            },
        ],
    )
    .expect_err("mixed chain input is rejected");

    assert_eq!(
        err,
        TimelockProjectionError::MixedChainIds {
            expected: 1,
            actual: 2,
            log_id: "evm:1:11:0xtx11:0:0".to_owned(),
        }
    );
}

#[test]
fn test_project_timelock_events_rejects_duplicate_log_id_with_conflicting_metadata() {
    let mut duplicate = log(10, 0, 0);
    duplicate.transaction_hash = "0xdifferent".to_owned();

    let err = project_timelock_events(
        &context(),
        vec![
            TimelockProjectionEvent {
                log: log(10, 0, 0),
                event: DecodedTimelockEvent::Cancelled(TimelockOperationIdEvent {
                    id: operation_id(),
                }),
            },
            TimelockProjectionEvent {
                log: duplicate,
                event: DecodedTimelockEvent::Cancelled(TimelockOperationIdEvent {
                    id: operation_id(),
                }),
            },
        ],
    )
    .expect_err("conflicting duplicate log metadata is rejected");

    assert_eq!(
        err,
        TimelockProjectionError::ConflictingDuplicateLog {
            log_id: "evm:1:10:0xtx10:0:0".to_owned(),
        }
    );
}

#[test]
fn test_apply_chain_read_execution_report_updates_operation_state() {
    let mut batch = project_timelock_events(
        &context(),
        vec![TimelockProjectionEvent {
            log: log(10, 0, 0),
            event: DecodedTimelockEvent::CallScheduled(CallScheduledEvent {
                id: operation_id(),
                index: "0".to_owned(),
                target: "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC".to_owned(),
                value: "0".to_owned(),
                data: "0x".to_owned(),
                predecessor: predecessor_id(),
                delay: "60".to_owned(),
            }),
        }],
    )
    .expect("projection succeeds");
    let report = ChainReadExecutionReport {
        results: vec![ChainReadResult {
            read_index: 0,
            key: ChainReadKey {
                chain_id: 1,
                contract_address: "0x2222222222222222222222222222222222222222".to_owned(),
                method: ChainReadMethod::TimelockOperationState,
                args: vec![operation_id()],
                block_mode: degov_datalens_indexer::BlockReadMode::Fresh,
            },
            value: ChainReadValue::Integer("2".to_owned()),
        }],
        ..ChainReadExecutionReport::default()
    };

    batch.apply_chain_read_execution_report(&report);

    assert_eq!(batch.timelock_operations[0].state, "Ready");
}

fn context() -> TimelockProjectionContext {
    TimelockProjectionContext {
        dao_code: "unit-dao".to_owned(),
        governor_address: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA".to_owned(),
        timelock_address: "0x2222222222222222222222222222222222222222".to_owned(),
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
        address: "0x2222222222222222222222222222222222222222".to_owned(),
        topics: vec![],
        data: "0x".to_owned(),
        removed: false,
        raw_payload: json!({ "blockNumber": block_number }),
    }
}

fn operation_id() -> String {
    "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0".to_owned()
}

fn predecessor_id() -> String {
    "0x0000000000000000000000000000000000000000000000000000000000000000".to_owned()
}

fn salt_id() -> String {
    "0x1111111111111111111111111111111111111111111111111111111111111111".to_owned()
}

fn proposer_role() -> String {
    "0xb09aa5aeb3702cfd50b6b62bc4532604938f21248a27a1dca736082b6819cc1c".to_owned()
}

fn executor_role() -> String {
    "0xd8aa0f3194971a2a116679f7c2090f6939c8d4e01a2a8d7e41d55e5351469e63".to_owned()
}

fn admin_role() -> String {
    "0x5f58e31ab30a808bd595a1846dfacf36fb5398db601a2c1f9395392a042330a0".to_owned()
}
