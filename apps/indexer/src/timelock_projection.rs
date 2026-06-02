use std::collections::BTreeMap;

use crate::{
    BatchReadPlanConfig, CallExecutedEvent, CallScheduledEvent, ChainContracts,
    ChainReadExecutionReport, ChainReadMethod, ChainReadPlan, ChainReadPlanBuilder,
    ChainReadReason, ChainReadValue, DecodedTimelockEvent, NormalizedEvmLog, ParameterChangeEvent,
    RoleAccountEvent, RoleAdminChangedEvent,
};

pub const TIMELOCK_POSTGRES_ADAPTER_GAP: &str = "Timelock projection write models and repository boundary are implemented; the concrete Postgres adapter is intentionally deferred.";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimelockProjectionContext {
    pub dao_code: String,
    pub governor_address: String,
    pub timelock_address: String,
    pub contracts: ChainContracts,
    pub read_plan_config: BatchReadPlanConfig,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TimelockProjectionEvent {
    pub log: NormalizedEvmLog,
    pub event: DecodedTimelockEvent,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimelockProjectionBatch {
    pub event_order: Vec<String>,
    pub timelock_operations: Vec<TimelockOperationWrite>,
    pub timelock_calls: Vec<TimelockCallWrite>,
    pub timelock_role_events: Vec<TimelockRoleEventWrite>,
    pub timelock_min_delay_changes: Vec<TimelockMinDelayChangeWrite>,
    pub timelock_operation_hints: Vec<TimelockOperationHintWrite>,
    pub chain_read_plan: ChainReadPlan,
}

impl TimelockProjectionBatch {
    pub fn apply_chain_read_execution_report(&mut self, report: &ChainReadExecutionReport) {
        let operation_indexes = self
            .timelock_operations
            .iter()
            .enumerate()
            .map(|(index, operation)| {
                (
                    (
                        operation.chain_id,
                        normalize_identifier(&operation.timelock_address),
                        normalize_identifier(&operation.operation_id),
                    ),
                    index,
                )
            })
            .collect::<BTreeMap<_, _>>();
        let mut results = report.results.iter().collect::<Vec<_>>();
        results.sort_by_key(|result| {
            (
                result.key.chain_id,
                result.key.contract_address.clone(),
                result.key.method,
                result.key.args.clone(),
                result.read_index,
            )
        });

        for result in results {
            let Some(operation_id) = result.key.args.first() else {
                continue;
            };
            let key = (
                result.key.chain_id,
                normalize_identifier(&result.key.contract_address),
                normalize_identifier(operation_id),
            );
            let Some(index) = operation_indexes.get(&key).copied() else {
                continue;
            };
            if result.key.method == ChainReadMethod::TimelockOperationState
                && let Some(state) = chain_read_operation_state(&result.value)
            {
                self.timelock_operations[index].state = state;
            }
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TimelockProjectionError {
    MixedChainIds {
        expected: i32,
        actual: i32,
        log_id: String,
    },
    ConflictingDuplicateLog {
        log_id: String,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimelockEventCommon {
    pub chain_id: i32,
    pub dao_code: String,
    pub governor_address: String,
    pub timelock_address: String,
    pub contract_address: String,
    pub log_index: u64,
    pub transaction_index: u64,
    pub block_number: String,
    pub block_timestamp: Option<String>,
    pub transaction_hash: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimelockOperationWrite {
    pub id: String,
    pub chain_id: i32,
    pub dao_code: String,
    pub governor_address: String,
    pub timelock_address: String,
    pub contract_address: String,
    pub log_index: u64,
    pub transaction_index: u64,
    pub proposal_ref: Option<String>,
    pub proposal_id: Option<String>,
    pub operation_id: String,
    pub timelock_type: String,
    pub predecessor: Option<String>,
    pub salt: Option<String>,
    pub state: String,
    pub call_count: Option<usize>,
    pub executed_call_count: Option<usize>,
    pub delay_seconds: Option<String>,
    pub ready_at: Option<String>,
    pub expires_at: Option<String>,
    pub queued_block_number: Option<String>,
    pub queued_block_timestamp: Option<String>,
    pub queued_transaction_hash: Option<String>,
    pub cancelled_block_number: Option<String>,
    pub cancelled_block_timestamp: Option<String>,
    pub cancelled_transaction_hash: Option<String>,
    pub executed_block_number: Option<String>,
    pub executed_block_timestamp: Option<String>,
    pub executed_transaction_hash: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimelockCallWrite {
    pub id: String,
    pub chain_id: i32,
    pub dao_code: String,
    pub governor_address: String,
    pub timelock_address: String,
    pub contract_address: String,
    pub log_index: u64,
    pub transaction_index: u64,
    pub operation_id: String,
    pub operation_ref: String,
    pub proposal_ref: Option<String>,
    pub proposal_id: Option<String>,
    pub proposal_action_id: Option<String>,
    pub proposal_action_index: Option<usize>,
    pub action_index: usize,
    pub target: String,
    pub value: String,
    pub data: String,
    pub predecessor: Option<String>,
    pub delay_seconds: Option<String>,
    pub state: String,
    pub scheduled_block_number: Option<String>,
    pub scheduled_block_timestamp: Option<String>,
    pub scheduled_transaction_hash: Option<String>,
    pub executed_block_number: Option<String>,
    pub executed_block_timestamp: Option<String>,
    pub executed_transaction_hash: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimelockRoleEventWrite {
    pub id: String,
    pub chain_id: i32,
    pub dao_code: String,
    pub governor_address: String,
    pub timelock_address: String,
    pub contract_address: String,
    pub log_index: u64,
    pub transaction_index: u64,
    pub event_name: String,
    pub role: String,
    pub role_label: Option<String>,
    pub account: Option<String>,
    pub sender: Option<String>,
    pub previous_admin_role: Option<String>,
    pub previous_admin_role_label: Option<String>,
    pub new_admin_role: Option<String>,
    pub new_admin_role_label: Option<String>,
    pub block_number: String,
    pub block_timestamp: Option<String>,
    pub transaction_hash: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimelockMinDelayChangeWrite {
    pub id: String,
    pub chain_id: i32,
    pub dao_code: String,
    pub governor_address: String,
    pub timelock_address: String,
    pub contract_address: String,
    pub log_index: u64,
    pub transaction_index: u64,
    pub old_duration: String,
    pub new_duration: String,
    pub block_number: String,
    pub block_timestamp: Option<String>,
    pub transaction_hash: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimelockOperationHintWrite {
    pub id: String,
    pub common: TimelockEventCommon,
    pub operation_id: String,
    pub event_name: String,
}

pub trait TimelockProjectionRepository {
    type Error;

    fn apply(&mut self, batch: &TimelockProjectionBatch) -> Result<(), Self::Error>;
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct InMemoryTimelockProjectionRepository {
    timelock_operations: BTreeMap<String, TimelockOperationWrite>,
    timelock_calls: BTreeMap<String, TimelockCallWrite>,
    timelock_role_events: BTreeMap<String, TimelockRoleEventWrite>,
    timelock_min_delay_changes: BTreeMap<String, TimelockMinDelayChangeWrite>,
    timelock_operation_hints: BTreeMap<String, TimelockOperationHintWrite>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TimelockRepositoryWriteError {}

impl InMemoryTimelockProjectionRepository {
    pub fn timelock_operations(&self) -> &BTreeMap<String, TimelockOperationWrite> {
        &self.timelock_operations
    }

    pub fn timelock_calls(&self) -> &BTreeMap<String, TimelockCallWrite> {
        &self.timelock_calls
    }
}

impl TimelockProjectionRepository for InMemoryTimelockProjectionRepository {
    type Error = TimelockRepositoryWriteError;

    fn apply(&mut self, batch: &TimelockProjectionBatch) -> Result<(), Self::Error> {
        extend_map(
            &mut self.timelock_operations,
            &batch.timelock_operations,
            |row| row.id.clone(),
        );
        extend_map(&mut self.timelock_calls, &batch.timelock_calls, |row| {
            row.id.clone()
        });
        extend_map(
            &mut self.timelock_role_events,
            &batch.timelock_role_events,
            |row| row.id.clone(),
        );
        extend_map(
            &mut self.timelock_min_delay_changes,
            &batch.timelock_min_delay_changes,
            |row| row.id.clone(),
        );
        extend_map(
            &mut self.timelock_operation_hints,
            &batch.timelock_operation_hints,
            |row| row.id.clone(),
        );

        Ok(())
    }
}

pub fn project_timelock_events(
    context: &TimelockProjectionContext,
    events: Vec<TimelockProjectionEvent>,
) -> Result<TimelockProjectionBatch, TimelockProjectionError> {
    let governor_address = normalize_identifier(&context.governor_address);
    let timelock_address = normalize_identifier(&context.timelock_address);
    let chain_id = validate_chain_ids(&events)?;
    let mut builder = ChainReadPlanBuilder::new(
        chain_id,
        context.contracts.clone(),
        context.read_plan_config,
    );
    let mut deduped: BTreeMap<String, TimelockProjectionEvent> = BTreeMap::new();

    for event in events {
        if let Some(stored) = deduped.get(&event.log.id) {
            if stored != &event {
                return Err(TimelockProjectionError::ConflictingDuplicateLog {
                    log_id: event.log.id,
                });
            }
            continue;
        }
        deduped.insert(event.log.id.clone(), event);
    }

    let mut event_order = Vec::new();
    let mut operations = BTreeMap::new();
    let mut calls = BTreeMap::new();
    let mut role_events = BTreeMap::new();
    let mut min_delay_changes = BTreeMap::new();
    let mut operation_hints = BTreeMap::new();

    let mut ordered = deduped.into_values().collect::<Vec<_>>();
    ordered.sort_by_key(|event| {
        (
            event.log.block_number,
            event.log.transaction_index,
            event.log.log_index,
            event.log.id.clone(),
        )
    });

    for input in ordered {
        event_order.push(input.log.id.clone());
        let common = common(context, &governor_address, &timelock_address, &input.log);
        if let Some(operation_id) = operation_id(&input.event) {
            builder.add_timelock_operation_refresh(
                operation_id,
                input.log.block_number,
                ChainReadReason::TimelockLifecycleRefresh,
            );
            operation_hints.insert(
                format!("{}:hint:{}", input.log.id, input.event.event_name()),
                operation_hint_write(&input.log.id, common.clone(), operation_id, &input.event),
            );
        }

        match &input.event {
            DecodedTimelockEvent::CallScheduled(event) => {
                let operation_id = normalize_identifier(&event.id);
                let operation_ref = operation_ref(&common, &operation_id);
                let call = scheduled_call_write(&common, &operation_ref, event);
                calls
                    .entry(call.id.clone())
                    .and_modify(|stored: &mut TimelockCallWrite| stored.merge(&call))
                    .or_insert(call);
                let operation = scheduled_operation_write(&common, event);
                operations
                    .entry(operation.id.clone())
                    .and_modify(|stored: &mut TimelockOperationWrite| stored.merge(&operation))
                    .or_insert(operation);
            }
            DecodedTimelockEvent::CallExecuted(event) => {
                let operation_id = normalize_identifier(&event.id);
                let operation_ref = operation_ref(&common, &operation_id);
                let call = executed_call_write(&common, &operation_ref, event);
                calls
                    .entry(call.id.clone())
                    .and_modify(|stored: &mut TimelockCallWrite| stored.merge(&call))
                    .or_insert(call);
                let operation = terminal_operation_write(&common, &operation_id, "Executed");
                operations
                    .entry(operation.id.clone())
                    .and_modify(|stored: &mut TimelockOperationWrite| stored.merge(&operation))
                    .or_insert(operation);
            }
            DecodedTimelockEvent::CallSalt(event) => {
                let operation_id = normalize_identifier(&event.id);
                let operation = salt_operation_write(&common, &operation_id, &event.salt);
                operations
                    .entry(operation.id.clone())
                    .and_modify(|stored: &mut TimelockOperationWrite| stored.merge(&operation))
                    .or_insert(operation);
            }
            DecodedTimelockEvent::Cancelled(event) => {
                let operation_id = normalize_identifier(&event.id);
                let operation = terminal_operation_write(&common, &operation_id, "Cancelled");
                operations
                    .entry(operation.id.clone())
                    .and_modify(|stored: &mut TimelockOperationWrite| stored.merge(&operation))
                    .or_insert(operation);
            }
            DecodedTimelockEvent::RoleGranted(event) => {
                let row = role_account_write(&input.log.id, &common, "RoleGranted", event);
                role_events.insert(row.id.clone(), row);
            }
            DecodedTimelockEvent::RoleRevoked(event) => {
                let row = role_account_write(&input.log.id, &common, "RoleRevoked", event);
                role_events.insert(row.id.clone(), row);
            }
            DecodedTimelockEvent::RoleAdminChanged(event) => {
                let row = role_admin_changed_write(&input.log.id, &common, event);
                role_events.insert(row.id.clone(), row);
            }
            DecodedTimelockEvent::MinDelayChange(event) => {
                let row = min_delay_change_write(&input.log.id, &common, event);
                min_delay_changes.insert(row.id.clone(), row);
            }
        }
    }

    Ok(TimelockProjectionBatch {
        event_order,
        timelock_operations: operations.into_values().collect(),
        timelock_calls: calls.into_values().collect(),
        timelock_role_events: role_events.into_values().collect(),
        timelock_min_delay_changes: min_delay_changes.into_values().collect(),
        timelock_operation_hints: operation_hints.into_values().collect(),
        chain_read_plan: builder.build(),
    })
}

fn common(
    context: &TimelockProjectionContext,
    governor_address: &str,
    timelock_address: &str,
    log: &NormalizedEvmLog,
) -> TimelockEventCommon {
    TimelockEventCommon {
        chain_id: log.chain_id,
        dao_code: context.dao_code.clone(),
        governor_address: governor_address.to_owned(),
        timelock_address: timelock_address.to_owned(),
        contract_address: normalize_identifier(&log.address),
        log_index: log.log_index,
        transaction_index: log.transaction_index,
        block_number: log.block_number.to_string(),
        block_timestamp: log
            .block_timestamp_ms
            .map(|timestamp| (timestamp / 1_000).to_string()),
        transaction_hash: normalize_identifier(&log.transaction_hash),
    }
}

fn scheduled_operation_write(
    common: &TimelockEventCommon,
    event: &CallScheduledEvent,
) -> TimelockOperationWrite {
    let operation_id = normalize_identifier(&event.id);
    let ready_at = common
        .block_timestamp
        .as_deref()
        .and_then(|timestamp| add_decimal_strings(timestamp, &event.delay));

    TimelockOperationWrite {
        id: operation_ref(common, &operation_id),
        chain_id: common.chain_id,
        dao_code: common.dao_code.clone(),
        governor_address: common.governor_address.clone(),
        timelock_address: common.timelock_address.clone(),
        contract_address: common.contract_address.clone(),
        log_index: common.log_index,
        transaction_index: common.transaction_index,
        proposal_ref: None,
        proposal_id: None,
        operation_id,
        timelock_type: "TimelockController".to_owned(),
        predecessor: Some(normalize_identifier(&event.predecessor)),
        salt: None,
        state: "Queued".to_owned(),
        call_count: Some(1),
        executed_call_count: None,
        delay_seconds: Some(event.delay.clone()),
        ready_at,
        expires_at: None,
        queued_block_number: Some(common.block_number.clone()),
        queued_block_timestamp: common.block_timestamp.clone(),
        queued_transaction_hash: Some(common.transaction_hash.clone()),
        cancelled_block_number: None,
        cancelled_block_timestamp: None,
        cancelled_transaction_hash: None,
        executed_block_number: None,
        executed_block_timestamp: None,
        executed_transaction_hash: None,
    }
}

fn salt_operation_write(
    common: &TimelockEventCommon,
    operation_id: &str,
    salt: &str,
) -> TimelockOperationWrite {
    let mut operation = operation_stub(common, operation_id, "Queued");
    operation.salt = Some(normalize_identifier(salt));
    operation
}

fn terminal_operation_write(
    common: &TimelockEventCommon,
    operation_id: &str,
    state: &str,
) -> TimelockOperationWrite {
    let mut operation = operation_stub(common, operation_id, state);
    match state {
        "Executed" => {
            operation.executed_call_count = Some(1);
            operation.executed_block_number = Some(common.block_number.clone());
            operation.executed_block_timestamp = common.block_timestamp.clone();
            operation.executed_transaction_hash = Some(common.transaction_hash.clone());
        }
        "Cancelled" => {
            operation.cancelled_block_number = Some(common.block_number.clone());
            operation.cancelled_block_timestamp = common.block_timestamp.clone();
            operation.cancelled_transaction_hash = Some(common.transaction_hash.clone());
        }
        _ => {}
    }
    operation
}

fn operation_stub(
    common: &TimelockEventCommon,
    operation_id: &str,
    state: &str,
) -> TimelockOperationWrite {
    TimelockOperationWrite {
        id: operation_ref(common, operation_id),
        chain_id: common.chain_id,
        dao_code: common.dao_code.clone(),
        governor_address: common.governor_address.clone(),
        timelock_address: common.timelock_address.clone(),
        contract_address: common.contract_address.clone(),
        log_index: common.log_index,
        transaction_index: common.transaction_index,
        proposal_ref: None,
        proposal_id: None,
        operation_id: normalize_identifier(operation_id),
        timelock_type: "TimelockController".to_owned(),
        predecessor: None,
        salt: None,
        state: state.to_owned(),
        call_count: None,
        executed_call_count: None,
        delay_seconds: None,
        ready_at: None,
        expires_at: None,
        queued_block_number: None,
        queued_block_timestamp: None,
        queued_transaction_hash: None,
        cancelled_block_number: None,
        cancelled_block_timestamp: None,
        cancelled_transaction_hash: None,
        executed_block_number: None,
        executed_block_timestamp: None,
        executed_transaction_hash: None,
    }
}

fn scheduled_call_write(
    common: &TimelockEventCommon,
    operation_ref: &str,
    event: &CallScheduledEvent,
) -> TimelockCallWrite {
    TimelockCallWrite {
        id: call_ref(operation_ref, &event.index),
        chain_id: common.chain_id,
        dao_code: common.dao_code.clone(),
        governor_address: common.governor_address.clone(),
        timelock_address: common.timelock_address.clone(),
        contract_address: common.contract_address.clone(),
        log_index: common.log_index,
        transaction_index: common.transaction_index,
        operation_id: normalize_identifier(&event.id),
        operation_ref: operation_ref.to_owned(),
        proposal_ref: None,
        proposal_id: None,
        proposal_action_id: None,
        proposal_action_index: None,
        action_index: parse_usize(&event.index),
        target: normalize_identifier(&event.target),
        value: event.value.clone(),
        data: event.data.clone(),
        predecessor: Some(normalize_identifier(&event.predecessor)),
        delay_seconds: Some(event.delay.clone()),
        state: "Scheduled".to_owned(),
        scheduled_block_number: Some(common.block_number.clone()),
        scheduled_block_timestamp: common.block_timestamp.clone(),
        scheduled_transaction_hash: Some(common.transaction_hash.clone()),
        executed_block_number: None,
        executed_block_timestamp: None,
        executed_transaction_hash: None,
    }
}

fn executed_call_write(
    common: &TimelockEventCommon,
    operation_ref: &str,
    event: &CallExecutedEvent,
) -> TimelockCallWrite {
    TimelockCallWrite {
        id: call_ref(operation_ref, &event.index),
        chain_id: common.chain_id,
        dao_code: common.dao_code.clone(),
        governor_address: common.governor_address.clone(),
        timelock_address: common.timelock_address.clone(),
        contract_address: common.contract_address.clone(),
        log_index: common.log_index,
        transaction_index: common.transaction_index,
        operation_id: normalize_identifier(&event.id),
        operation_ref: operation_ref.to_owned(),
        proposal_ref: None,
        proposal_id: None,
        proposal_action_id: None,
        proposal_action_index: None,
        action_index: parse_usize(&event.index),
        target: normalize_identifier(&event.target),
        value: event.value.clone(),
        data: event.data.clone(),
        predecessor: None,
        delay_seconds: None,
        state: "Executed".to_owned(),
        scheduled_block_number: None,
        scheduled_block_timestamp: None,
        scheduled_transaction_hash: None,
        executed_block_number: Some(common.block_number.clone()),
        executed_block_timestamp: common.block_timestamp.clone(),
        executed_transaction_hash: Some(common.transaction_hash.clone()),
    }
}

fn role_account_write(
    log_id: &str,
    common: &TimelockEventCommon,
    event_name: &str,
    event: &RoleAccountEvent,
) -> TimelockRoleEventWrite {
    let role = normalize_identifier(&event.role);
    TimelockRoleEventWrite {
        id: log_id.to_owned(),
        chain_id: common.chain_id,
        dao_code: common.dao_code.clone(),
        governor_address: common.governor_address.clone(),
        timelock_address: common.timelock_address.clone(),
        contract_address: common.contract_address.clone(),
        log_index: common.log_index,
        transaction_index: common.transaction_index,
        event_name: event_name.to_owned(),
        role: role.clone(),
        role_label: role_label(&role).map(str::to_owned),
        account: Some(normalize_identifier(&event.account)),
        sender: Some(normalize_identifier(&event.sender)),
        previous_admin_role: None,
        previous_admin_role_label: None,
        new_admin_role: None,
        new_admin_role_label: None,
        block_number: common.block_number.clone(),
        block_timestamp: common.block_timestamp.clone(),
        transaction_hash: common.transaction_hash.clone(),
    }
}

fn role_admin_changed_write(
    log_id: &str,
    common: &TimelockEventCommon,
    event: &RoleAdminChangedEvent,
) -> TimelockRoleEventWrite {
    let role = normalize_identifier(&event.role);
    let previous_admin_role = normalize_identifier(&event.previous_admin_role);
    let new_admin_role = normalize_identifier(&event.new_admin_role);

    TimelockRoleEventWrite {
        id: log_id.to_owned(),
        chain_id: common.chain_id,
        dao_code: common.dao_code.clone(),
        governor_address: common.governor_address.clone(),
        timelock_address: common.timelock_address.clone(),
        contract_address: common.contract_address.clone(),
        log_index: common.log_index,
        transaction_index: common.transaction_index,
        event_name: "RoleAdminChanged".to_owned(),
        role: role.clone(),
        role_label: role_label(&role).map(str::to_owned),
        account: None,
        sender: None,
        previous_admin_role: Some(previous_admin_role.clone()),
        previous_admin_role_label: role_label(&previous_admin_role).map(str::to_owned),
        new_admin_role: Some(new_admin_role.clone()),
        new_admin_role_label: role_label(&new_admin_role).map(str::to_owned),
        block_number: common.block_number.clone(),
        block_timestamp: common.block_timestamp.clone(),
        transaction_hash: common.transaction_hash.clone(),
    }
}

fn min_delay_change_write(
    log_id: &str,
    common: &TimelockEventCommon,
    event: &ParameterChangeEvent,
) -> TimelockMinDelayChangeWrite {
    TimelockMinDelayChangeWrite {
        id: log_id.to_owned(),
        chain_id: common.chain_id,
        dao_code: common.dao_code.clone(),
        governor_address: common.governor_address.clone(),
        timelock_address: common.timelock_address.clone(),
        contract_address: common.contract_address.clone(),
        log_index: common.log_index,
        transaction_index: common.transaction_index,
        old_duration: event.old_value.clone(),
        new_duration: event.new_value.clone(),
        block_number: common.block_number.clone(),
        block_timestamp: common.block_timestamp.clone(),
        transaction_hash: common.transaction_hash.clone(),
    }
}

fn operation_hint_write(
    log_id: &str,
    common: TimelockEventCommon,
    operation_id: &str,
    event: &DecodedTimelockEvent,
) -> TimelockOperationHintWrite {
    TimelockOperationHintWrite {
        id: format!("{log_id}:operation-hint"),
        common,
        operation_id: normalize_identifier(operation_id),
        event_name: event.event_name().to_owned(),
    }
}

impl TimelockOperationWrite {
    fn merge(&mut self, next: &Self) {
        self.contract_address = next.contract_address.clone();
        self.log_index = next.log_index;
        self.transaction_index = next.transaction_index;
        self.predecessor = next.predecessor.clone().or(self.predecessor.clone());
        self.salt = next.salt.clone().or(self.salt.clone());
        self.state = merge_operation_state(&self.state, &next.state);
        self.call_count = merge_sum(self.call_count, next.call_count);
        self.executed_call_count = merge_sum(self.executed_call_count, next.executed_call_count);
        self.delay_seconds = next.delay_seconds.clone().or(self.delay_seconds.clone());
        self.ready_at = next.ready_at.clone().or(self.ready_at.clone());
        self.expires_at = next.expires_at.clone().or(self.expires_at.clone());
        self.queued_block_number = next
            .queued_block_number
            .clone()
            .or(self.queued_block_number.clone());
        self.queued_block_timestamp = next
            .queued_block_timestamp
            .clone()
            .or(self.queued_block_timestamp.clone());
        self.queued_transaction_hash = next
            .queued_transaction_hash
            .clone()
            .or(self.queued_transaction_hash.clone());
        self.cancelled_block_number = next
            .cancelled_block_number
            .clone()
            .or(self.cancelled_block_number.clone());
        self.cancelled_block_timestamp = next
            .cancelled_block_timestamp
            .clone()
            .or(self.cancelled_block_timestamp.clone());
        self.cancelled_transaction_hash = next
            .cancelled_transaction_hash
            .clone()
            .or(self.cancelled_transaction_hash.clone());
        self.executed_block_number = next
            .executed_block_number
            .clone()
            .or(self.executed_block_number.clone());
        self.executed_block_timestamp = next
            .executed_block_timestamp
            .clone()
            .or(self.executed_block_timestamp.clone());
        self.executed_transaction_hash = next
            .executed_transaction_hash
            .clone()
            .or(self.executed_transaction_hash.clone());
    }
}

impl TimelockCallWrite {
    fn merge(&mut self, next: &Self) {
        self.contract_address = next.contract_address.clone();
        self.log_index = next.log_index;
        self.transaction_index = next.transaction_index;
        self.target = next.target.clone();
        self.value = next.value.clone();
        self.data = next.data.clone();
        self.predecessor = next.predecessor.clone().or(self.predecessor.clone());
        self.delay_seconds = next.delay_seconds.clone().or(self.delay_seconds.clone());
        self.state = merge_call_state(&self.state, &next.state);
        self.scheduled_block_number = next
            .scheduled_block_number
            .clone()
            .or(self.scheduled_block_number.clone());
        self.scheduled_block_timestamp = next
            .scheduled_block_timestamp
            .clone()
            .or(self.scheduled_block_timestamp.clone());
        self.scheduled_transaction_hash = next
            .scheduled_transaction_hash
            .clone()
            .or(self.scheduled_transaction_hash.clone());
        self.executed_block_number = next
            .executed_block_number
            .clone()
            .or(self.executed_block_number.clone());
        self.executed_block_timestamp = next
            .executed_block_timestamp
            .clone()
            .or(self.executed_block_timestamp.clone());
        self.executed_transaction_hash = next
            .executed_transaction_hash
            .clone()
            .or(self.executed_transaction_hash.clone());
    }
}

fn validate_chain_ids(events: &[TimelockProjectionEvent]) -> Result<i32, TimelockProjectionError> {
    let Some(first) = events.first() else {
        return Ok(0);
    };
    for event in events.iter().skip(1) {
        if event.log.chain_id != first.log.chain_id {
            return Err(TimelockProjectionError::MixedChainIds {
                expected: first.log.chain_id,
                actual: event.log.chain_id,
                log_id: event.log.id.clone(),
            });
        }
    }
    Ok(first.log.chain_id)
}

fn operation_id(event: &DecodedTimelockEvent) -> Option<&str> {
    match event {
        DecodedTimelockEvent::CallScheduled(event) => Some(&event.id),
        DecodedTimelockEvent::CallExecuted(event) => Some(&event.id),
        DecodedTimelockEvent::CallSalt(event) => Some(&event.id),
        DecodedTimelockEvent::Cancelled(event) => Some(&event.id),
        _ => None,
    }
}

fn operation_ref(common: &TimelockEventCommon, operation_id: &str) -> String {
    format!(
        "timelock-operation:{}:{}:{}:{}",
        common.chain_id,
        common.governor_address,
        common.timelock_address,
        normalize_identifier(operation_id)
    )
}

fn call_ref(operation_ref: &str, index: &str) -> String {
    format!("{operation_ref}:call:{}", parse_usize(index))
}

fn normalize_identifier(value: &str) -> String {
    value.to_ascii_lowercase()
}

fn parse_usize(value: &str) -> usize {
    value.parse::<usize>().unwrap_or_default()
}

fn add_decimal_strings(left: &str, right: &str) -> Option<String> {
    Some((left.parse::<u128>().ok()? + right.parse::<u128>().ok()?).to_string())
}

fn merge_sum(left: Option<usize>, right: Option<usize>) -> Option<usize> {
    match (left, right) {
        (Some(left), Some(right)) => Some(left + right),
        (Some(value), None) | (None, Some(value)) => Some(value),
        (None, None) => None,
    }
}

fn merge_operation_state(left: &str, right: &str) -> String {
    if operation_state_rank(right) >= operation_state_rank(left) {
        right.to_owned()
    } else {
        left.to_owned()
    }
}

fn operation_state_rank(state: &str) -> u8 {
    match state {
        "Unset" => 0,
        "Waiting" | "Queued" => 1,
        "Ready" => 2,
        "Done" | "Executed" => 3,
        "Cancelled" => 4,
        _ => 0,
    }
}

fn merge_call_state(left: &str, right: &str) -> String {
    if call_state_rank(right) >= call_state_rank(left) {
        right.to_owned()
    } else {
        left.to_owned()
    }
}

fn call_state_rank(state: &str) -> u8 {
    match state {
        "Scheduled" => 1,
        "Executed" => 2,
        _ => 0,
    }
}

fn chain_read_operation_state(value: &ChainReadValue) -> Option<String> {
    match value {
        ChainReadValue::Integer(value) => Some(
            match value.as_str() {
                "0" => "Unset",
                "1" => "Waiting",
                "2" => "Ready",
                "3" => "Done",
                state => state,
            }
            .to_owned(),
        ),
        ChainReadValue::String(value) => Some(value.clone()),
        _ => None,
    }
}

fn role_label(role: &str) -> Option<&'static str> {
    match role {
        "0x0000000000000000000000000000000000000000000000000000000000000000" => {
            Some("DEFAULT_ADMIN_ROLE")
        }
        "0xb09aa5aeb3702cfd50b6b62bc4532604938f21248a27a1dca736082b6819cc1c" => {
            Some("PROPOSER_ROLE")
        }
        "0xd8aa0f3194971a2a116679f7c2090f6939c8d4e01a2a8d7e41d55e5351469e63" => {
            Some("EXECUTOR_ROLE")
        }
        "0x5f58e31ab30a808bd595a1846dfacf36fb5398db601a2c1f9395392a042330a0" => {
            Some("TIMELOCK_ADMIN_ROLE")
        }
        _ => None,
    }
}

fn extend_map<T: Clone>(map: &mut BTreeMap<String, T>, rows: &[T], key: impl Fn(&T) -> String) {
    for row in rows {
        map.insert(key(row), row.clone());
    }
}
