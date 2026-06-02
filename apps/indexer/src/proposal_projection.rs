use std::collections::BTreeMap;

use crate::{
    BatchReadPlanConfig, ChainContracts, ChainReadExecutionReport, ChainReadMethod, ChainReadPlan,
    ChainReadPlanBuilder, ChainReadReason, ChainReadValue, DecodedGovernorEvent, NormalizedEvmLog,
    ProposalCreatedEvent, ProposalExtendedEvent, ProposalQueuedEvent, derive_proposal_metadata,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalProjectionContext {
    pub dao_code: String,
    pub governor_address: String,
    pub contracts: ChainContracts,
    pub read_plan_config: BatchReadPlanConfig,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ProposalProjectionEvent {
    pub log: NormalizedEvmLog,
    pub event: DecodedGovernorEvent,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalProjectionBatch {
    pub event_order: Vec<String>,
    pub proposal_created: Vec<ProposalCreatedWrite>,
    pub proposal_queued: Vec<ProposalQueuedWrite>,
    pub proposal_extended: Vec<ProposalExtendedWrite>,
    pub proposal_executed: Vec<ProposalIdWrite>,
    pub proposal_canceled: Vec<ProposalIdWrite>,
    pub proposals: Vec<ProposalWrite>,
    pub proposal_actions: Vec<ProposalActionWrite>,
    pub proposal_state_epochs: Vec<ProposalStateEpochWrite>,
    pub proposal_deadline_extensions: Vec<ProposalDeadlineExtensionWrite>,
    pub chain_read_plan: ChainReadPlan,
}

impl ProposalProjectionBatch {
    pub fn apply_chain_read_execution_report(&mut self, report: &ChainReadExecutionReport) {
        let proposal_indexes = self
            .proposals
            .iter()
            .enumerate()
            .map(|(index, proposal)| {
                (
                    (
                        proposal.chain_id,
                        normalize_identifier(&proposal.governor_address),
                        normalize_identifier(&proposal.proposal_id),
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
            let Some(proposal_id) = result.key.args.first() else {
                continue;
            };
            let key = (
                result.key.chain_id,
                normalize_identifier(&result.key.contract_address),
                normalize_identifier(proposal_id),
            );
            let Some(index) = proposal_indexes.get(&key).copied() else {
                continue;
            };
            let proposal = &mut self.proposals[index];
            match result.key.method {
                ChainReadMethod::ProposalSnapshot => {
                    if let Some(value) = chain_read_scalar(&result.value) {
                        proposal.proposal_snapshot = Some(value);
                    }
                }
                ChainReadMethod::ProposalDeadline => {
                    if let Some(value) = chain_read_scalar(&result.value) {
                        proposal.proposal_deadline = Some(value);
                    }
                }
                ChainReadMethod::State => {
                    if let Some(value) = chain_read_state(&result.value) {
                        proposal.current_state = Some(value);
                    }
                }
                _ => {}
            }
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalProjectionError {
    MixedChainIds {
        expected: i32,
        actual: i32,
        log_id: String,
    },
    ConflictingDuplicateLog {
        log_id: String,
    },
    ActionLengthMismatch {
        proposal_id: String,
        targets: usize,
        values: usize,
        signatures: usize,
        calldatas: usize,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalCreatedWrite {
    pub id: String,
    pub common: ProposalEventCommon,
    pub proposal_id: String,
    pub proposer: String,
    pub targets: Vec<String>,
    pub values: Vec<String>,
    pub signatures: Vec<String>,
    pub calldatas: Vec<String>,
    pub vote_start: String,
    pub vote_end: String,
    pub description: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalQueuedWrite {
    pub id: String,
    pub common: ProposalEventCommon,
    pub proposal_id: String,
    pub eta_seconds: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalExtendedWrite {
    pub id: String,
    pub common: ProposalEventCommon,
    pub proposal_id: String,
    pub extended_deadline: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalIdWrite {
    pub id: String,
    pub common: ProposalEventCommon,
    pub proposal_id: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalEventCommon {
    pub chain_id: i32,
    pub dao_code: String,
    pub governor_address: String,
    pub contract_address: String,
    pub log_index: u64,
    pub transaction_index: u64,
    pub proposal_id: String,
    pub block_number: String,
    pub block_timestamp: Option<String>,
    pub transaction_hash: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalWrite {
    pub id: String,
    pub chain_id: i32,
    pub dao_code: String,
    pub governor_address: String,
    pub contract_address: String,
    pub log_index: u64,
    pub transaction_index: u64,
    pub proposal_id: String,
    pub proposer: String,
    pub targets: Vec<String>,
    pub values: Vec<String>,
    pub signatures: Vec<String>,
    pub calldatas: Vec<String>,
    pub vote_start: String,
    pub vote_end: String,
    pub description: String,
    pub title: String,
    pub description_body: String,
    pub description_hash: String,
    pub proposal_snapshot: Option<String>,
    pub proposal_deadline: Option<String>,
    pub block_number: String,
    pub block_timestamp: Option<String>,
    pub transaction_hash: String,
    pub current_state: Option<String>,
    pub proposal_eta: Option<String>,
    pub queued_block_number: Option<String>,
    pub queued_block_timestamp: Option<String>,
    pub queued_transaction_hash: Option<String>,
    pub executed_block_number: Option<String>,
    pub executed_block_timestamp: Option<String>,
    pub executed_transaction_hash: Option<String>,
    pub canceled_block_number: Option<String>,
    pub canceled_block_timestamp: Option<String>,
    pub canceled_transaction_hash: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalActionWrite {
    pub id: String,
    pub chain_id: i32,
    pub dao_code: String,
    pub governor_address: String,
    pub contract_address: String,
    pub log_index: u64,
    pub transaction_index: u64,
    pub proposal_ref: String,
    pub proposal_id: String,
    pub action_index: usize,
    pub target: String,
    pub value: String,
    pub signature: String,
    pub calldata: String,
    pub block_number: String,
    pub block_timestamp: Option<String>,
    pub transaction_hash: String,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum ProposalStateWriteKind {
    Pending,
    Queued,
    Executed,
    Canceled,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalStateEpochWrite {
    pub id: String,
    pub chain_id: i32,
    pub dao_code: String,
    pub governor_address: String,
    pub contract_address: String,
    pub log_index: u64,
    pub transaction_index: u64,
    pub proposal_ref: String,
    pub proposal_id: String,
    pub kind: ProposalStateWriteKind,
    pub state: String,
    pub start_timepoint: Option<String>,
    pub end_timepoint: Option<String>,
    pub start_block_number: Option<String>,
    pub start_block_timestamp: Option<String>,
    pub end_block_number: Option<String>,
    pub end_block_timestamp: Option<String>,
    pub transaction_hash: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalDeadlineExtensionWrite {
    pub id: String,
    pub chain_id: i32,
    pub dao_code: String,
    pub governor_address: String,
    pub contract_address: String,
    pub log_index: u64,
    pub transaction_index: u64,
    pub proposal_ref: String,
    pub proposal_id: String,
    pub previous_deadline: Option<String>,
    pub new_deadline: String,
    pub block_number: String,
    pub block_timestamp: Option<String>,
    pub transaction_hash: String,
}

pub trait ProposalProjectionRepository {
    type Error;

    fn apply(&mut self, batch: &ProposalProjectionBatch) -> Result<(), Self::Error>;
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct InMemoryProposalProjectionRepository {
    proposal_created: BTreeMap<String, ProposalCreatedWrite>,
    proposal_queued: BTreeMap<String, ProposalQueuedWrite>,
    proposal_extended: BTreeMap<String, ProposalExtendedWrite>,
    proposal_executed: BTreeMap<String, ProposalIdWrite>,
    proposal_canceled: BTreeMap<String, ProposalIdWrite>,
    proposals: BTreeMap<String, ProposalWrite>,
    proposal_actions: BTreeMap<String, ProposalActionWrite>,
    proposal_state_epochs: BTreeMap<String, ProposalStateEpochWrite>,
    proposal_deadline_extensions: BTreeMap<String, ProposalDeadlineExtensionWrite>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalRepositoryWriteError {}

impl InMemoryProposalProjectionRepository {
    pub fn proposals(&self) -> &BTreeMap<String, ProposalWrite> {
        &self.proposals
    }
}

impl ProposalProjectionRepository for InMemoryProposalProjectionRepository {
    type Error = ProposalRepositoryWriteError;

    fn apply(&mut self, batch: &ProposalProjectionBatch) -> Result<(), Self::Error> {
        extend_map(&mut self.proposal_created, &batch.proposal_created, |row| {
            row.id.clone()
        });
        extend_map(&mut self.proposal_queued, &batch.proposal_queued, |row| {
            row.id.clone()
        });
        extend_map(
            &mut self.proposal_extended,
            &batch.proposal_extended,
            |row| row.id.clone(),
        );
        extend_map(
            &mut self.proposal_executed,
            &batch.proposal_executed,
            |row| row.id.clone(),
        );
        extend_map(
            &mut self.proposal_canceled,
            &batch.proposal_canceled,
            |row| row.id.clone(),
        );
        extend_map(&mut self.proposal_actions, &batch.proposal_actions, |row| {
            row.id.clone()
        });
        extend_map(
            &mut self.proposal_state_epochs,
            &batch.proposal_state_epochs,
            |row| row.id.clone(),
        );
        extend_map(
            &mut self.proposal_deadline_extensions,
            &batch.proposal_deadline_extensions,
            |row| row.id.clone(),
        );
        for proposal in &batch.proposals {
            self.proposals
                .entry(proposal.id.clone())
                .and_modify(|stored| stored.merge(proposal))
                .or_insert_with(|| proposal.clone());
        }

        Ok(())
    }
}

pub fn project_proposal_events(
    context: &ProposalProjectionContext,
    events: Vec<ProposalProjectionEvent>,
) -> Result<ProposalProjectionBatch, ProposalProjectionError> {
    let governor_address = normalize_identifier(&context.governor_address);
    let chain_id = validate_chain_ids(&events)?;
    let mut builder = ChainReadPlanBuilder::new(
        chain_id,
        context.contracts.clone(),
        context.read_plan_config,
    );
    let mut deduped: BTreeMap<String, ProposalProjectionEvent> = BTreeMap::new();

    for event in events {
        if let Some(stored) = deduped.get(&event.log.id) {
            if stored != &event {
                return Err(ProposalProjectionError::ConflictingDuplicateLog {
                    log_id: event.log.id,
                });
            }
            continue;
        }
        deduped.insert(event.log.id.clone(), event);
    }

    let mut event_order = Vec::new();
    let mut proposal_created = BTreeMap::new();
    let mut proposal_queued = BTreeMap::new();
    let mut proposal_extended = BTreeMap::new();
    let mut proposal_executed = BTreeMap::new();
    let mut proposal_canceled = BTreeMap::new();
    let mut proposals = BTreeMap::new();
    let mut proposal_actions = BTreeMap::new();
    let mut proposal_state_epochs = BTreeMap::new();
    let mut proposal_deadline_extensions = BTreeMap::new();

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
        let proposal_id = proposal_id(&input.event);
        let Some(proposal_id) = proposal_id else {
            continue;
        };
        event_order.push(input.log.id.clone());
        builder.add_proposal_refresh(
            proposal_id,
            input.log.block_number,
            ChainReadReason::ProposalLifecycleRefresh,
        );

        match &input.event {
            DecodedGovernorEvent::ProposalCreated(event) => {
                validate_action_lengths(event)?;
                let common = common(context, &governor_address, &input.log, &event.proposal_id);
                let row = proposal_created_write(&input.log.id, common.clone(), event);
                proposal_created.insert(row.id.clone(), row);

                let proposal = proposal_write(common.clone(), event);
                for action in proposal_action_writes(&common, &proposal, event) {
                    proposal_actions.insert(action.id.clone(), action);
                }
                proposal_state_epochs.insert(
                    state_epoch_id(&proposal.id, ProposalStateWriteKind::Pending, &input.log),
                    state_epoch_write(
                        &common,
                        &proposal.id,
                        ProposalStateWriteKind::Pending,
                        "Pending",
                        Some(event.vote_start.clone()),
                    ),
                );
                proposals
                    .entry(proposal.id.clone())
                    .and_modify(|stored: &mut ProposalWrite| stored.merge(&proposal))
                    .or_insert(proposal);
            }
            DecodedGovernorEvent::ProposalQueued(event) => {
                let common = common(context, &governor_address, &input.log, &event.proposal_id);
                let row = proposal_queued_write(&input.log.id, common.clone(), event);
                proposal_queued.insert(row.id.clone(), row);
                proposal_state_epochs.insert(
                    state_epoch_id(
                        &proposal_ref(
                            &common.governor_address,
                            &common.proposal_id,
                            common.chain_id,
                        ),
                        ProposalStateWriteKind::Queued,
                        &input.log,
                    ),
                    state_epoch_write(
                        &common,
                        &proposal_ref(
                            &common.governor_address,
                            &common.proposal_id,
                            common.chain_id,
                        ),
                        ProposalStateWriteKind::Queued,
                        "Queued",
                        Some(event.eta_seconds.clone()),
                    ),
                );
                proposals
                    .entry(proposal_ref(
                        &common.governor_address,
                        &common.proposal_id,
                        common.chain_id,
                    ))
                    .and_modify(|proposal: &mut ProposalWrite| {
                        proposal.current_state = Some("Queued".to_owned());
                        proposal.proposal_eta = Some(event.eta_seconds.clone());
                        proposal.queued_block_number = Some(common.block_number.clone());
                        proposal.queued_block_timestamp = common.block_timestamp.clone();
                        proposal.queued_transaction_hash = Some(common.transaction_hash.clone());
                    })
                    .or_insert_with(|| lifecycle_stub(&common, "Queued"));
                if let Some(proposal) = proposals.get_mut(&proposal_ref(
                    &common.governor_address,
                    &common.proposal_id,
                    common.chain_id,
                )) {
                    proposal.proposal_eta = Some(event.eta_seconds.clone());
                    proposal.queued_block_number = Some(common.block_number.clone());
                    proposal.queued_block_timestamp = common.block_timestamp.clone();
                    proposal.queued_transaction_hash = Some(common.transaction_hash.clone());
                }
            }
            DecodedGovernorEvent::ProposalExtended(event) => {
                let common = common(context, &governor_address, &input.log, &event.proposal_id);
                let row = proposal_extended_write(&input.log.id, common.clone(), event);
                proposal_extended.insert(row.id.clone(), row);
                let proposal_ref = proposal_ref(
                    &common.governor_address,
                    &common.proposal_id,
                    common.chain_id,
                );
                let previous_deadline = proposals
                    .get(&proposal_ref)
                    .and_then(|proposal: &ProposalWrite| proposal.proposal_deadline.clone());
                let extension = deadline_extension_write(&common, event, previous_deadline);
                proposal_deadline_extensions.insert(extension.id.clone(), extension);
                proposals
                    .entry(proposal_ref)
                    .and_modify(|proposal: &mut ProposalWrite| {
                        proposal.proposal_deadline = Some(event.extended_deadline.clone());
                    })
                    .or_insert_with(|| {
                        let mut proposal = lifecycle_stub(&common, "Pending");
                        proposal.proposal_deadline = Some(event.extended_deadline.clone());
                        proposal
                    });
            }
            DecodedGovernorEvent::ProposalExecuted(event) => {
                let common = common(context, &governor_address, &input.log, &event.proposal_id);
                let row = proposal_id_write(&input.log.id, common.clone());
                proposal_executed.insert(row.id.clone(), row);
                write_terminal_state(
                    &mut proposals,
                    &mut proposal_state_epochs,
                    &common,
                    &input.log,
                    ProposalStateWriteKind::Executed,
                    "Executed",
                );
            }
            DecodedGovernorEvent::ProposalCanceled(event) => {
                let common = common(context, &governor_address, &input.log, &event.proposal_id);
                let row = proposal_id_write(&input.log.id, common.clone());
                proposal_canceled.insert(row.id.clone(), row);
                write_terminal_state(
                    &mut proposals,
                    &mut proposal_state_epochs,
                    &common,
                    &input.log,
                    ProposalStateWriteKind::Canceled,
                    "Canceled",
                );
            }
            _ => {}
        }
    }

    let mut proposal_state_epochs = proposal_state_epochs.into_values().collect::<Vec<_>>();
    proposal_state_epochs.sort_by_key(|row| {
        (
            row.start_block_number
                .as_deref()
                .and_then(|value| value.parse::<u64>().ok())
                .unwrap_or_default(),
            row.transaction_index,
            row.log_index,
            row.kind,
        )
    });

    Ok(ProposalProjectionBatch {
        event_order,
        proposal_created: proposal_created.into_values().collect(),
        proposal_queued: proposal_queued.into_values().collect(),
        proposal_extended: proposal_extended.into_values().collect(),
        proposal_executed: proposal_executed.into_values().collect(),
        proposal_canceled: proposal_canceled.into_values().collect(),
        proposals: proposals.into_values().collect(),
        proposal_actions: proposal_actions.into_values().collect(),
        proposal_state_epochs,
        proposal_deadline_extensions: proposal_deadline_extensions.into_values().collect(),
        chain_read_plan: builder.build(),
    })
}

fn write_terminal_state(
    proposals: &mut BTreeMap<String, ProposalWrite>,
    proposal_state_epochs: &mut BTreeMap<String, ProposalStateEpochWrite>,
    common: &ProposalEventCommon,
    log: &NormalizedEvmLog,
    kind: ProposalStateWriteKind,
    state: &str,
) {
    let proposal_ref = proposal_ref(
        &common.governor_address,
        &common.proposal_id,
        common.chain_id,
    );
    proposal_state_epochs.insert(
        state_epoch_id(&proposal_ref, kind, log),
        state_epoch_write(common, &proposal_ref, kind, state, None),
    );
    proposals
        .entry(proposal_ref)
        .and_modify(|proposal| {
            proposal.current_state = Some(state.to_owned());
            match kind {
                ProposalStateWriteKind::Executed => {
                    proposal.executed_block_number = Some(common.block_number.clone());
                    proposal.executed_block_timestamp = common.block_timestamp.clone();
                    proposal.executed_transaction_hash = Some(common.transaction_hash.clone());
                }
                ProposalStateWriteKind::Canceled => {
                    proposal.canceled_block_number = Some(common.block_number.clone());
                    proposal.canceled_block_timestamp = common.block_timestamp.clone();
                    proposal.canceled_transaction_hash = Some(common.transaction_hash.clone());
                }
                _ => {}
            }
        })
        .or_insert_with(|| {
            let mut proposal = lifecycle_stub(common, state);
            match kind {
                ProposalStateWriteKind::Executed => {
                    proposal.executed_block_number = Some(common.block_number.clone());
                    proposal.executed_block_timestamp = common.block_timestamp.clone();
                    proposal.executed_transaction_hash = Some(common.transaction_hash.clone());
                }
                ProposalStateWriteKind::Canceled => {
                    proposal.canceled_block_number = Some(common.block_number.clone());
                    proposal.canceled_block_timestamp = common.block_timestamp.clone();
                    proposal.canceled_transaction_hash = Some(common.transaction_hash.clone());
                }
                _ => {}
            }
            proposal
        });
}

fn common(
    context: &ProposalProjectionContext,
    governor_address: &str,
    log: &NormalizedEvmLog,
    proposal_id: &str,
) -> ProposalEventCommon {
    ProposalEventCommon {
        chain_id: log.chain_id,
        dao_code: context.dao_code.clone(),
        governor_address: governor_address.to_owned(),
        contract_address: normalize_identifier(&log.address),
        log_index: log.log_index,
        transaction_index: log.transaction_index,
        proposal_id: proposal_id.to_owned(),
        block_number: log.block_number.to_string(),
        block_timestamp: log
            .block_timestamp_ms
            .map(|timestamp| (timestamp / 1_000).to_string()),
        transaction_hash: normalize_identifier(&log.transaction_hash),
    }
}

fn proposal_created_write(
    log_id: &str,
    common: ProposalEventCommon,
    event: &ProposalCreatedEvent,
) -> ProposalCreatedWrite {
    ProposalCreatedWrite {
        id: log_id.to_owned(),
        common,
        proposal_id: event.proposal_id.clone(),
        proposer: normalize_identifier(&event.proposer),
        targets: event
            .targets
            .iter()
            .map(|target| normalize_identifier(target))
            .collect(),
        values: event.values.clone(),
        signatures: event.signatures.clone(),
        calldatas: event.calldatas.clone(),
        vote_start: event.vote_start.clone(),
        vote_end: event.vote_end.clone(),
        description: event.description.clone(),
    }
}

fn proposal_queued_write(
    log_id: &str,
    common: ProposalEventCommon,
    event: &ProposalQueuedEvent,
) -> ProposalQueuedWrite {
    ProposalQueuedWrite {
        id: log_id.to_owned(),
        common,
        proposal_id: event.proposal_id.clone(),
        eta_seconds: event.eta_seconds.clone(),
    }
}

fn proposal_extended_write(
    log_id: &str,
    common: ProposalEventCommon,
    event: &ProposalExtendedEvent,
) -> ProposalExtendedWrite {
    ProposalExtendedWrite {
        id: log_id.to_owned(),
        common,
        proposal_id: event.proposal_id.clone(),
        extended_deadline: event.extended_deadline.clone(),
    }
}

fn proposal_id_write(log_id: &str, common: ProposalEventCommon) -> ProposalIdWrite {
    let proposal_id = common.proposal_id.clone();

    ProposalIdWrite {
        id: log_id.to_owned(),
        common,
        proposal_id,
    }
}

fn proposal_write(common: ProposalEventCommon, event: &ProposalCreatedEvent) -> ProposalWrite {
    let metadata = derive_proposal_metadata(&event.description);

    ProposalWrite {
        id: proposal_ref(
            &common.governor_address,
            &event.proposal_id,
            common.chain_id,
        ),
        chain_id: common.chain_id,
        dao_code: common.dao_code.clone(),
        governor_address: common.governor_address.clone(),
        contract_address: common.contract_address.clone(),
        log_index: common.log_index,
        transaction_index: common.transaction_index,
        proposal_id: event.proposal_id.clone(),
        proposer: normalize_identifier(&event.proposer),
        targets: event
            .targets
            .iter()
            .map(|target| normalize_identifier(target))
            .collect(),
        values: event.values.clone(),
        signatures: event.signatures.clone(),
        calldatas: event.calldatas.clone(),
        vote_start: event.vote_start.clone(),
        vote_end: event.vote_end.clone(),
        description: metadata.description,
        title: metadata.title,
        description_body: metadata.description_body,
        description_hash: metadata.description_hash,
        proposal_snapshot: Some(event.vote_start.clone()),
        proposal_deadline: Some(event.vote_end.clone()),
        block_number: common.block_number.clone(),
        block_timestamp: common.block_timestamp.clone(),
        transaction_hash: common.transaction_hash.clone(),
        current_state: Some("Pending".to_owned()),
        proposal_eta: None,
        queued_block_number: None,
        queued_block_timestamp: None,
        queued_transaction_hash: None,
        executed_block_number: None,
        executed_block_timestamp: None,
        executed_transaction_hash: None,
        canceled_block_number: None,
        canceled_block_timestamp: None,
        canceled_transaction_hash: None,
    }
}

fn proposal_action_writes(
    common: &ProposalEventCommon,
    proposal: &ProposalWrite,
    event: &ProposalCreatedEvent,
) -> Vec<ProposalActionWrite> {
    event
        .targets
        .iter()
        .zip(event.values.iter())
        .zip(event.signatures.iter())
        .zip(event.calldatas.iter())
        .enumerate()
        .map(
            |(action_index, (((target, value), signature), calldata))| ProposalActionWrite {
                id: format!("{}:action:{action_index}", proposal.id),
                chain_id: common.chain_id,
                dao_code: common.dao_code.clone(),
                governor_address: common.governor_address.clone(),
                contract_address: common.contract_address.clone(),
                log_index: common.log_index,
                transaction_index: common.transaction_index,
                proposal_ref: proposal.id.clone(),
                proposal_id: common.proposal_id.clone(),
                action_index,
                target: normalize_identifier(target),
                value: value.clone(),
                signature: signature.clone(),
                calldata: calldata.clone(),
                block_number: common.block_number.clone(),
                block_timestamp: common.block_timestamp.clone(),
                transaction_hash: common.transaction_hash.clone(),
            },
        )
        .collect()
}

fn state_epoch_write(
    common: &ProposalEventCommon,
    proposal_ref: &str,
    kind: ProposalStateWriteKind,
    state: &str,
    start_timepoint: Option<String>,
) -> ProposalStateEpochWrite {
    ProposalStateEpochWrite {
        id: format!(
            "{proposal_ref}:state:{}:{}:{}",
            state.to_ascii_lowercase(),
            common.block_number,
            common.log_index
        ),
        chain_id: common.chain_id,
        dao_code: common.dao_code.clone(),
        governor_address: common.governor_address.clone(),
        contract_address: common.contract_address.clone(),
        log_index: common.log_index,
        transaction_index: common.transaction_index,
        proposal_ref: proposal_ref.to_owned(),
        proposal_id: common.proposal_id.clone(),
        kind,
        state: state.to_owned(),
        start_timepoint,
        end_timepoint: None,
        start_block_number: Some(common.block_number.clone()),
        start_block_timestamp: common.block_timestamp.clone(),
        end_block_number: None,
        end_block_timestamp: None,
        transaction_hash: common.transaction_hash.clone(),
    }
}

fn deadline_extension_write(
    common: &ProposalEventCommon,
    event: &ProposalExtendedEvent,
    previous_deadline: Option<String>,
) -> ProposalDeadlineExtensionWrite {
    let proposal_ref = proposal_ref(
        &common.governor_address,
        &common.proposal_id,
        common.chain_id,
    );

    ProposalDeadlineExtensionWrite {
        id: format!(
            "{}:deadline-extension:{}:{}:{}",
            proposal_ref, common.block_number, common.transaction_hash, common.log_index
        ),
        chain_id: common.chain_id,
        dao_code: common.dao_code.clone(),
        governor_address: common.governor_address.clone(),
        contract_address: common.contract_address.clone(),
        log_index: common.log_index,
        transaction_index: common.transaction_index,
        proposal_ref,
        proposal_id: common.proposal_id.clone(),
        previous_deadline,
        new_deadline: event.extended_deadline.clone(),
        block_number: common.block_number.clone(),
        block_timestamp: common.block_timestamp.clone(),
        transaction_hash: common.transaction_hash.clone(),
    }
}

fn lifecycle_stub(common: &ProposalEventCommon, state: &str) -> ProposalWrite {
    let metadata = derive_proposal_metadata("");

    ProposalWrite {
        id: proposal_ref(
            &common.governor_address,
            &common.proposal_id,
            common.chain_id,
        ),
        chain_id: common.chain_id,
        dao_code: common.dao_code.clone(),
        governor_address: common.governor_address.clone(),
        contract_address: common.contract_address.clone(),
        log_index: common.log_index,
        transaction_index: common.transaction_index,
        proposal_id: common.proposal_id.clone(),
        proposer: String::new(),
        targets: Vec::new(),
        values: Vec::new(),
        signatures: Vec::new(),
        calldatas: Vec::new(),
        vote_start: "0".to_owned(),
        vote_end: "0".to_owned(),
        description: metadata.description,
        title: metadata.title,
        description_body: metadata.description_body,
        description_hash: metadata.description_hash,
        proposal_snapshot: None,
        proposal_deadline: None,
        block_number: common.block_number.clone(),
        block_timestamp: common.block_timestamp.clone(),
        transaction_hash: common.transaction_hash.clone(),
        current_state: Some(state.to_owned()),
        proposal_eta: None,
        queued_block_number: None,
        queued_block_timestamp: None,
        queued_transaction_hash: None,
        executed_block_number: None,
        executed_block_timestamp: None,
        executed_transaction_hash: None,
        canceled_block_number: None,
        canceled_block_timestamp: None,
        canceled_transaction_hash: None,
    }
}

impl ProposalWrite {
    fn merge(&mut self, next: &Self) {
        if !next.proposer.is_empty() {
            let mut merged = next.clone();
            merged.current_state = self.current_state.clone().or(merged.current_state);
            merged.proposal_snapshot = self.proposal_snapshot.clone().or(merged.proposal_snapshot);
            merged.proposal_deadline = self.proposal_deadline.clone().or(merged.proposal_deadline);
            merged.proposal_eta = self.proposal_eta.clone().or(merged.proposal_eta);
            merged.queued_block_number = self
                .queued_block_number
                .clone()
                .or(merged.queued_block_number);
            merged.queued_block_timestamp = self
                .queued_block_timestamp
                .clone()
                .or(merged.queued_block_timestamp);
            merged.queued_transaction_hash = self
                .queued_transaction_hash
                .clone()
                .or(merged.queued_transaction_hash);
            merged.executed_block_number = self
                .executed_block_number
                .clone()
                .or(merged.executed_block_number);
            merged.executed_block_timestamp = self
                .executed_block_timestamp
                .clone()
                .or(merged.executed_block_timestamp);
            merged.executed_transaction_hash = self
                .executed_transaction_hash
                .clone()
                .or(merged.executed_transaction_hash);
            merged.canceled_block_number = self
                .canceled_block_number
                .clone()
                .or(merged.canceled_block_number);
            merged.canceled_block_timestamp = self
                .canceled_block_timestamp
                .clone()
                .or(merged.canceled_block_timestamp);
            merged.canceled_transaction_hash = self
                .canceled_transaction_hash
                .clone()
                .or(merged.canceled_transaction_hash);
            *self = merged;
        } else {
            self.current_state = next.current_state.clone().or(self.current_state.clone());
            self.proposal_snapshot = next
                .proposal_snapshot
                .clone()
                .or(self.proposal_snapshot.clone());
            self.proposal_deadline = next
                .proposal_deadline
                .clone()
                .or(self.proposal_deadline.clone());
            self.proposal_eta = next.proposal_eta.clone().or(self.proposal_eta.clone());
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
            self.canceled_block_number = next
                .canceled_block_number
                .clone()
                .or(self.canceled_block_number.clone());
            self.canceled_block_timestamp = next
                .canceled_block_timestamp
                .clone()
                .or(self.canceled_block_timestamp.clone());
            self.canceled_transaction_hash = next
                .canceled_transaction_hash
                .clone()
                .or(self.canceled_transaction_hash.clone());
        }
    }
}

fn validate_chain_ids(events: &[ProposalProjectionEvent]) -> Result<i32, ProposalProjectionError> {
    let Some(first) = events.first() else {
        return Ok(0);
    };
    for event in events.iter().skip(1) {
        if event.log.chain_id != first.log.chain_id {
            return Err(ProposalProjectionError::MixedChainIds {
                expected: first.log.chain_id,
                actual: event.log.chain_id,
                log_id: event.log.id.clone(),
            });
        }
    }
    Ok(first.log.chain_id)
}

fn validate_action_lengths(event: &ProposalCreatedEvent) -> Result<(), ProposalProjectionError> {
    if event.targets.len() == event.values.len()
        && event.targets.len() == event.signatures.len()
        && event.targets.len() == event.calldatas.len()
    {
        return Ok(());
    }

    Err(ProposalProjectionError::ActionLengthMismatch {
        proposal_id: event.proposal_id.clone(),
        targets: event.targets.len(),
        values: event.values.len(),
        signatures: event.signatures.len(),
        calldatas: event.calldatas.len(),
    })
}

fn proposal_id(event: &DecodedGovernorEvent) -> Option<&str> {
    match event {
        DecodedGovernorEvent::ProposalCreated(event) => Some(&event.proposal_id),
        DecodedGovernorEvent::ProposalQueued(event) => Some(&event.proposal_id),
        DecodedGovernorEvent::ProposalExtended(event) => Some(&event.proposal_id),
        DecodedGovernorEvent::ProposalExecuted(event) => Some(&event.proposal_id),
        DecodedGovernorEvent::ProposalCanceled(event) => Some(&event.proposal_id),
        _ => None,
    }
}

fn state_epoch_id(
    proposal_ref: &str,
    kind: ProposalStateWriteKind,
    log: &NormalizedEvmLog,
) -> String {
    format!(
        "{proposal_ref}:state:{}:{}:{}",
        kind.as_str().to_ascii_lowercase(),
        log.block_number,
        log.log_index
    )
}

impl ProposalStateWriteKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "Pending",
            Self::Queued => "Queued",
            Self::Executed => "Executed",
            Self::Canceled => "Canceled",
        }
    }
}

fn proposal_ref(governor_address: &str, proposal_id: &str, chain_id: i32) -> String {
    format!(
        "proposal:{chain_id}:{}:{proposal_id}",
        normalize_identifier(governor_address)
    )
}

fn normalize_identifier(value: &str) -> String {
    value.to_ascii_lowercase()
}

fn chain_read_scalar(value: &ChainReadValue) -> Option<String> {
    match value {
        ChainReadValue::Integer(value) | ChainReadValue::String(value) => Some(value.clone()),
        _ => None,
    }
}

fn chain_read_state(value: &ChainReadValue) -> Option<String> {
    match value {
        ChainReadValue::Integer(value) => Some(
            match value.as_str() {
                "0" => "Pending",
                "1" => "Active",
                "2" => "Canceled",
                "3" => "Defeated",
                "4" => "Succeeded",
                "5" => "Queued",
                "6" => "Expired",
                "7" => "Executed",
                state => state,
            }
            .to_owned(),
        ),
        ChainReadValue::String(value) => Some(value.clone()),
        _ => None,
    }
}

fn extend_map<T: Clone>(map: &mut BTreeMap<String, T>, rows: &[T], key: impl Fn(&T) -> String) {
    for row in rows {
        map.insert(key(row), row.clone());
    }
}
