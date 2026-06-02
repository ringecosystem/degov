use std::collections::BTreeMap;

use sha3::{Digest, Keccak256};

use crate::{
    BatchReadPlanConfig, ChainContracts, ChainReadPlan, ChainReadPlanBuilder, ChainReadReason,
    DecodedGovernorEvent, NormalizedEvmLog, ProposalCreatedEvent, ProposalExtendedEvent,
    ProposalQueuedEvent,
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
) -> ProposalProjectionBatch {
    let governor_address = normalize_identifier(&context.governor_address);
    let mut builder = ChainReadPlanBuilder::new(
        first_chain_id(&events),
        context.contracts.clone(),
        context.read_plan_config,
    );
    let mut deduped = BTreeMap::new();

    for event in events {
        deduped.entry(event.log.id.clone()).or_insert(event);
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
                let extension = deadline_extension_write(&common, event);
                proposal_deadline_extensions.insert(extension.id.clone(), extension);
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

    ProposalProjectionBatch {
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
    }
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
    let (title, description_body) = split_description(&event.description);

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
        description: event.description.clone(),
        title,
        description_body,
        description_hash: description_hash(&event.description),
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
) -> ProposalDeadlineExtensionWrite {
    let proposal_ref = proposal_ref(
        &common.governor_address,
        &common.proposal_id,
        common.chain_id,
    );

    ProposalDeadlineExtensionWrite {
        id: format!("{}:deadline-extension:{}", proposal_ref, common.log_index),
        chain_id: common.chain_id,
        dao_code: common.dao_code.clone(),
        governor_address: common.governor_address.clone(),
        contract_address: common.contract_address.clone(),
        log_index: common.log_index,
        transaction_index: common.transaction_index,
        proposal_ref,
        proposal_id: common.proposal_id.clone(),
        previous_deadline: None,
        new_deadline: event.extended_deadline.clone(),
        block_number: common.block_number.clone(),
        block_timestamp: common.block_timestamp.clone(),
        transaction_hash: common.transaction_hash.clone(),
    }
}

fn lifecycle_stub(common: &ProposalEventCommon, state: &str) -> ProposalWrite {
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
        description: String::new(),
        title: String::new(),
        description_body: String::new(),
        description_hash: description_hash(""),
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

fn first_chain_id(events: &[ProposalProjectionEvent]) -> i32 {
    events
        .first()
        .map(|event| event.log.chain_id)
        .unwrap_or_default()
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

fn split_description(description: &str) -> (String, String) {
    let trimmed = description.trim();
    if let Some(rest) = trimmed.strip_prefix("# ") {
        let mut parts = rest.splitn(2, "\n\n");
        let title = parts.next().unwrap_or_default().trim().to_owned();
        let body = parts.next().unwrap_or_default().trim().to_owned();
        return (title, body);
    }

    let mut lines = trimmed.lines();
    let title = lines
        .next()
        .unwrap_or_default()
        .trim_start_matches('#')
        .trim();
    let body = lines.collect::<Vec<_>>().join("\n").trim().to_owned();
    (title.to_owned(), body)
}

fn description_hash(description: &str) -> String {
    let hash = Keccak256::digest(description.as_bytes());
    format!("0x{}", hex::encode(hash))
}

fn normalize_identifier(value: &str) -> String {
    value.to_ascii_lowercase()
}

fn extend_map<T: Clone>(map: &mut BTreeMap<String, T>, rows: &[T], key: impl Fn(&T) -> String) {
    for row in rows {
        map.insert(key(row), row.clone());
    }
}
