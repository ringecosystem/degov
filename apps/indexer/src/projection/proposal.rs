use std::collections::BTreeMap;

use crate::{
    BatchReadPlanConfig, ChainContracts, ChainReadExecutionReport, ChainReadMethod, ChainReadPlan,
    ChainReadPlanBuilder, ChainReadReason, ChainReadValue, DataMetricWrite, DecodedGovernorEvent,
    GovernanceTokenStandard, NormalizedEvmLog, ProposalCreatedEvent, ProposalExtendedEvent,
    ProposalQueuedEvent, derive_proposal_metadata,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalProjectionContext {
    pub contract_set_id: String,
    pub dao_code: String,
    pub governor_address: String,
    pub contracts: ChainContracts,
    pub token_standard: GovernanceTokenStandard,
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
    pub data_metrics: Vec<DataMetricWrite>,
    pub chain_read_plan: ChainReadPlan,
}

impl ProposalProjectionBatch {
    pub fn apply_chain_read_execution_report(&mut self, report: &ChainReadExecutionReport) {
        let block_timestamps = report
            .results
            .iter()
            .filter_map(|result| {
                if result.key.method != ChainReadMethod::BlockTimestamp {
                    return None;
                }
                let block_number = result.key.args.first()?;
                let timestamp = chain_read_scalar(&result.value)?;
                Some(((result.key.chain_id, block_number.clone()), timestamp))
            })
            .collect::<BTreeMap<_, _>>();
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
            if result.key.method == ChainReadMethod::BlockTimestamp {
                continue;
            }
            if result.key.method == ChainReadMethod::ClockMode {
                if let Some(value) = chain_read_clock_mode(&result.value) {
                    for proposal in &mut self.proposals {
                        proposal.clock_mode = value.clone();
                        proposal.block_interval =
                            block_interval(proposal.chain_id, &proposal.clock_mode);
                        proposal.vote_start_timestamp =
                            timepoint_timestamp_for_proposal(proposal, &proposal.vote_start);
                        proposal.vote_end_timestamp =
                            timepoint_timestamp_for_proposal(proposal, &proposal.vote_end);
                    }
                }
                continue;
            }
            if result.key.method == ChainReadMethod::Decimals {
                if let Some(value) = chain_read_scalar(&result.value) {
                    for proposal in &mut self.proposals {
                        proposal.decimals = value.clone();
                    }
                }
                continue;
            }
            let Some(proposal_id) = result.key.args.first() else {
                continue;
            };
            let key = (
                result.key.chain_id,
                normalize_identifier(&result.key.contract_address),
                normalize_identifier(proposal_id),
            );
            let index = proposal_indexes.get(&key).copied().or_else(|| {
                if result.key.method == ChainReadMethod::Quorum {
                    self.proposals.iter().position(|proposal| {
                        proposal.proposal_snapshot.as_deref() == Some(proposal_id)
                    })
                } else {
                    None
                }
            });
            let Some(index) = index else { continue };
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
                ChainReadMethod::Quorum => {
                    if let Some(value) = chain_read_scalar(&result.value) {
                        proposal.quorum = value;
                    }
                }
                _ => {}
            }
        }
        apply_block_timestamps(&mut self.proposals, &block_timestamps);
    }
}

fn apply_block_timestamps(
    proposals: &mut [ProposalWrite],
    block_timestamps: &BTreeMap<(i32, String), String>,
) {
    for proposal in proposals {
        let start_key = (proposal.chain_id, proposal.vote_start.clone());
        if let Some(timestamp) = block_timestamps.get(&start_key) {
            proposal.vote_start_timestamp = timestamp.clone();
        }
        let end_key = (proposal.chain_id, proposal.vote_end.clone());
        if let Some(timestamp) = block_timestamps.get(&end_key) {
            proposal.vote_end_timestamp = timestamp.clone();
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalTimestampBackfillCandidate {
    pub proposal_ref: String,
    pub chain_id: i32,
    pub governor_address: String,
    pub clock_mode: String,
    pub vote_start: String,
    pub vote_end: String,
    pub vote_start_timestamp: String,
    pub vote_end_timestamp: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalTimestampBackfillUpdate {
    pub proposal_ref: String,
    pub vote_start_timestamp: Option<String>,
    pub vote_end_timestamp: Option<String>,
}

pub fn plan_proposal_timestamp_backfill_updates(
    candidates: &[ProposalTimestampBackfillCandidate],
    report: &ChainReadExecutionReport,
) -> Vec<ProposalTimestampBackfillUpdate> {
    let block_timestamps = report
        .results
        .iter()
        .filter_map(|result| {
            if result.key.method != ChainReadMethod::BlockTimestamp {
                return None;
            }
            let block_number = result.key.args.first()?;
            let timestamp = chain_read_scalar(&result.value)?;
            Some(((result.key.chain_id, block_number.clone()), timestamp))
        })
        .collect::<BTreeMap<_, _>>();

    candidates
        .iter()
        .filter(|candidate| candidate.clock_mode == "blocknumber")
        .filter_map(|candidate| {
            let vote_start_timestamp = block_timestamps
                .get(&(candidate.chain_id, candidate.vote_start.clone()))
                .cloned();
            let vote_end_timestamp = block_timestamps
                .get(&(candidate.chain_id, candidate.vote_end.clone()))
                .cloned();

            (vote_start_timestamp.is_some() || vote_end_timestamp.is_some()).then(|| {
                ProposalTimestampBackfillUpdate {
                    proposal_ref: candidate.proposal_ref.clone(),
                    vote_start_timestamp,
                    vote_end_timestamp,
                }
            })
        })
        .collect()
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
    pub contract_set_id: String,
    pub log_id: String,
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
    pub contract_set_id: String,
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
    pub vote_start_timestamp: String,
    pub vote_end_timestamp: String,
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
    pub queue_ready_at: Option<String>,
    pub queue_expires_at: Option<String>,
    pub block_interval: Option<String>,
    pub clock_mode: String,
    pub quorum: String,
    pub decimals: String,
    pub timelock_address: Option<String>,
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
    Active,
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

    pub fn proposal_actions(&self) -> &BTreeMap<String, ProposalActionWrite> {
        &self.proposal_actions
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
            if let Some(existing_id) = self
                .proposals
                .iter()
                .find(|(id, stored)| {
                    id.as_str() != proposal.id
                        && stored.chain_id == proposal.chain_id
                        && stored.governor_address == proposal.governor_address
                        && stored.proposal_id == proposal.proposal_id
                })
                .map(|(id, _)| id.clone())
            {
                if let Some(mut existing) = self.proposals.remove(&existing_id) {
                    existing.merge(proposal);
                    self.proposals.insert(proposal.id.clone(), existing);
                }
                continue;
            }
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
    let mut data_metrics = BTreeMap::new();
    let mut proposal_refs = BTreeMap::new();

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
                let metric = proposal_data_metric(&input.log.id, &common);
                data_metrics.insert(metric.id.clone(), metric);

                let proposal =
                    proposal_write(common.clone(), event, context.contracts.timelock.as_deref());
                proposal_refs.insert(proposal_lookup_key(&common), proposal.id.clone());
                for action in proposal_action_writes(&common, &proposal, event) {
                    proposal_actions.insert(action.id.clone(), action);
                }
                let pending = state_epoch_write(
                    &common,
                    &proposal.id,
                    ProposalStateWriteKind::Pending,
                    "Pending",
                    Some(event.vote_start.clone()),
                )
                .with_end_timepoint(Some(event.vote_start.clone()))
                .with_end_block_timestamp(proposal.vote_start_timestamp.clone());
                proposal_state_epochs.insert(pending.id.clone(), pending);
                let active = state_epoch_write(
                    &common,
                    &proposal.id,
                    ProposalStateWriteKind::Active,
                    "Active",
                    Some(event.vote_start.clone()),
                )
                .without_start_block_number()
                .with_start_block_timestamp(proposal.vote_start_timestamp.clone())
                .with_end_timepoint(Some(event.vote_end.clone()))
                .with_end_block_timestamp(proposal.vote_end_timestamp.clone());
                proposal_state_epochs.insert(active.id.clone(), active);
                builder.add_optional_enrichment_read(
                    context.contracts.governor.clone(),
                    ChainReadMethod::ClockMode,
                    vec![],
                    crate::BlockReadMode::Safe,
                );
                builder.add_optional_enrichment_read(
                    context.contracts.governor.clone(),
                    ChainReadMethod::Quorum,
                    vec![event.vote_start.clone()],
                    crate::BlockReadMode::Safe,
                );
                if proposal.clock_mode == "blocknumber" {
                    builder.add_optional_block_timestamp_read(&event.vote_start);
                    builder.add_optional_block_timestamp_read(&event.vote_end);
                }
                if context.token_standard == GovernanceTokenStandard::Erc20 {
                    builder.add_optional_enrichment_read(
                        context.contracts.governor_token.clone(),
                        ChainReadMethod::Decimals,
                        vec![],
                        crate::BlockReadMode::Safe,
                    );
                }
                proposals
                    .entry(proposal.id.clone())
                    .and_modify(|stored: &mut ProposalWrite| stored.merge(&proposal))
                    .or_insert(proposal);
            }
            DecodedGovernorEvent::ProposalQueued(event) => {
                let common = common(context, &governor_address, &input.log, &event.proposal_id);
                let proposal_ref = proposal_entity_ref(&proposal_refs, &common);
                let row = proposal_queued_write(&input.log.id, common.clone(), event);
                proposal_queued.insert(row.id.clone(), row);
                proposal_state_epochs.insert(
                    state_epoch_id(&proposal_ref, ProposalStateWriteKind::Queued, &input.log),
                    state_epoch_write(
                        &common,
                        &proposal_ref,
                        ProposalStateWriteKind::Queued,
                        "Queued",
                        Some(event.eta_seconds.clone()),
                    ),
                );
                proposals
                    .entry(proposal_ref.clone())
                    .and_modify(|proposal: &mut ProposalWrite| {
                        proposal.current_state = Some("Queued".to_owned());
                        proposal.proposal_eta = Some(event.eta_seconds.clone());
                        proposal.queue_ready_at = seconds_to_millis(&event.eta_seconds);
                        proposal.queued_block_number = Some(common.block_number.clone());
                        proposal.queued_block_timestamp = common.block_timestamp.clone();
                        proposal.queued_transaction_hash = Some(common.transaction_hash.clone());
                    })
                    .or_insert_with(|| lifecycle_stub(&common, &proposal_ref, "Queued"));
                if let Some(proposal) = proposals.get_mut(&proposal_ref) {
                    proposal.proposal_eta = Some(event.eta_seconds.clone());
                    proposal.queue_ready_at = seconds_to_millis(&event.eta_seconds);
                    proposal.queued_block_number = Some(common.block_number.clone());
                    proposal.queued_block_timestamp = common.block_timestamp.clone();
                    proposal.queued_transaction_hash = Some(common.transaction_hash.clone());
                }
            }
            DecodedGovernorEvent::ProposalExtended(event) => {
                let common = common(context, &governor_address, &input.log, &event.proposal_id);
                let row = proposal_extended_write(&input.log.id, common.clone(), event);
                proposal_extended.insert(row.id.clone(), row);
                let proposal_ref = proposal_entity_ref(&proposal_refs, &common);
                let previous_deadline = proposals
                    .get(&proposal_ref)
                    .and_then(|proposal: &ProposalWrite| proposal.proposal_deadline.clone());
                let extension =
                    deadline_extension_write(&common, &proposal_ref, event, previous_deadline);
                proposal_deadline_extensions.insert(extension.id.clone(), extension);
                proposals
                    .entry(proposal_ref.clone())
                    .and_modify(|proposal: &mut ProposalWrite| {
                        proposal.proposal_deadline = Some(event.extended_deadline.clone());
                    })
                    .or_insert_with(|| {
                        let mut proposal = lifecycle_stub(&common, &proposal_ref, "Pending");
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
                    &proposal_entity_ref(&proposal_refs, &common),
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
                    &proposal_entity_ref(&proposal_refs, &common),
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
                .unwrap_or(u64::MAX),
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
        data_metrics: data_metrics.into_values().collect(),
        chain_read_plan: builder.build(),
    })
}

fn write_terminal_state(
    proposals: &mut BTreeMap<String, ProposalWrite>,
    proposal_state_epochs: &mut BTreeMap<String, ProposalStateEpochWrite>,
    common: &ProposalEventCommon,
    proposal_ref: &str,
    log: &NormalizedEvmLog,
    kind: ProposalStateWriteKind,
    state: &str,
) {
    proposal_state_epochs.insert(
        state_epoch_id(proposal_ref, kind, log),
        state_epoch_write(common, proposal_ref, kind, state, None),
    );
    proposals
        .entry(proposal_ref.to_owned())
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
            let mut proposal = lifecycle_stub(common, proposal_ref, state);
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
        contract_set_id: context.contract_set_id.clone(),
        chain_id: log.chain_id,
        log_id: log.id.clone(),
        dao_code: context.dao_code.clone(),
        governor_address: governor_address.to_owned(),
        contract_address: normalize_identifier(&log.address),
        log_index: log.log_index,
        transaction_index: log.transaction_index,
        proposal_id: proposal_id.to_owned(),
        block_number: log.block_number.to_string(),
        block_timestamp: log
            .block_timestamp_ms
            .map(|timestamp| timestamp.to_string()),
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

fn proposal_data_metric(log_id: &str, common: &ProposalEventCommon) -> DataMetricWrite {
    DataMetricWrite {
        id: log_id.to_owned(),
        contract_set_id: common.contract_set_id.clone(),
        chain_id: common.chain_id,
        dao_code: common.dao_code.clone(),
        governor_address: common.governor_address.clone(),
        token_address: None,
        contract_address: Some(common.contract_address.clone()),
        log_index: Some(common.log_index),
        transaction_index: Some(common.transaction_index),
        block_number: common.block_number.clone(),
        proposals_count: Some(1),
        votes_count: Some(0),
        votes_with_params_count: Some(0),
        votes_without_params_count: Some(0),
        votes_weight_for_sum: Some("0".to_owned()),
        votes_weight_against_sum: Some("0".to_owned()),
        votes_weight_abstain_sum: Some("0".to_owned()),
        power_sum: None,
        contributor_count: None,
        holders_count: None,
        member_count: None,
    }
}

fn proposal_write(
    common: ProposalEventCommon,
    event: &ProposalCreatedEvent,
    timelock_address: Option<&str>,
) -> ProposalWrite {
    let metadata = derive_proposal_metadata(&event.description);
    let clock_mode = infer_clock_mode(&event.vote_start, &event.vote_end);
    let block_interval = block_interval(common.chain_id, &clock_mode);

    ProposalWrite {
        contract_set_id: common.contract_set_id.clone(),
        id: common_id(&common),
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
        vote_start_timestamp: timepoint_timestamp(
            &event.vote_start,
            &clock_mode,
            common.block_number.as_str(),
            common.block_timestamp.as_deref(),
            block_interval.as_deref(),
        ),
        vote_end_timestamp: timepoint_timestamp(
            &event.vote_end,
            &clock_mode,
            common.block_number.as_str(),
            common.block_timestamp.as_deref(),
            block_interval.as_deref(),
        ),
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
        proposal_eta: Some("0".to_owned()),
        queue_ready_at: None,
        queue_expires_at: None,
        block_interval,
        clock_mode,
        quorum: "0".to_owned(),
        decimals: "0".to_owned(),
        timelock_address: timelock_address.map(normalize_identifier),
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
                proposal_id: proposal.id.clone(),
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
        id: state_epoch_write_id(proposal_ref, kind, &common.log_id),
        chain_id: common.chain_id,
        dao_code: common.dao_code.clone(),
        governor_address: common.governor_address.clone(),
        contract_address: common.contract_address.clone(),
        log_index: common.log_index,
        transaction_index: common.transaction_index,
        proposal_ref: proposal_ref.to_owned(),
        proposal_id: proposal_ref.to_owned(),
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
    proposal_ref: &str,
    event: &ProposalExtendedEvent,
    previous_deadline: Option<String>,
) -> ProposalDeadlineExtensionWrite {
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
        proposal_ref: proposal_ref.to_owned(),
        proposal_id: proposal_ref.to_owned(),
        previous_deadline,
        new_deadline: event.extended_deadline.clone(),
        block_number: common.block_number.clone(),
        block_timestamp: common.block_timestamp.clone(),
        transaction_hash: common.transaction_hash.clone(),
    }
}

fn lifecycle_stub(common: &ProposalEventCommon, proposal_ref: &str, state: &str) -> ProposalWrite {
    let metadata = derive_proposal_metadata("");
    let clock_mode = "blocknumber".to_owned();
    let block_interval = block_interval(common.chain_id, &clock_mode);

    ProposalWrite {
        contract_set_id: common.contract_set_id.clone(),
        id: proposal_ref.to_owned(),
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
        vote_start_timestamp: "0".to_owned(),
        vote_end_timestamp: "0".to_owned(),
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
        queue_ready_at: None,
        queue_expires_at: None,
        block_interval,
        clock_mode,
        quorum: "0".to_owned(),
        decimals: "0".to_owned(),
        timelock_address: None,
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
            merged.queue_ready_at = self.queue_ready_at.clone().or(merged.queue_ready_at);
            merged.queue_expires_at = self.queue_expires_at.clone().or(merged.queue_expires_at);
            merged.block_interval = self.block_interval.clone().or(merged.block_interval);
            if merged.clock_mode == "blocknumber" && self.clock_mode != "blocknumber" {
                merged.clock_mode = self.clock_mode.clone();
            }
            if merged.quorum == "0" {
                merged.quorum = self.quorum.clone();
            }
            if merged.decimals == "0" {
                merged.decimals = self.decimals.clone();
            }
            merged.timelock_address = self.timelock_address.clone().or(merged.timelock_address);
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
            self.queue_ready_at = next.queue_ready_at.clone().or(self.queue_ready_at.clone());
            self.queue_expires_at = next
                .queue_expires_at
                .clone()
                .or(self.queue_expires_at.clone());
            self.block_interval = next.block_interval.clone().or(self.block_interval.clone());
            if self.clock_mode == "blocknumber" && next.clock_mode != "blocknumber" {
                self.clock_mode = next.clock_mode.clone();
            }
            if self.quorum == "0" {
                self.quorum = next.quorum.clone();
            }
            if self.decimals == "0" {
                self.decimals = next.decimals.clone();
            }
            self.timelock_address = next
                .timelock_address
                .clone()
                .or(self.timelock_address.clone());
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

impl ProposalStateEpochWrite {
    fn with_end_timepoint(mut self, end_timepoint: Option<String>) -> Self {
        self.end_timepoint = end_timepoint;
        self
    }

    fn without_start_block_number(mut self) -> Self {
        self.start_block_number = None;
        self
    }

    fn with_start_block_timestamp(mut self, start_block_timestamp: String) -> Self {
        self.start_block_timestamp = Some(start_block_timestamp);
        self
    }

    fn with_end_block_timestamp(mut self, end_block_timestamp: String) -> Self {
        self.end_block_timestamp = Some(end_block_timestamp);
        self
    }
}

fn common_id(common: &ProposalEventCommon) -> String {
    proposal_ref(
        &common.contract_set_id,
        &common.governor_address,
        &common.proposal_id,
        common.chain_id,
    )
}

fn proposal_lookup_key(common: &ProposalEventCommon) -> (String, i32, String, String) {
    (
        common.contract_set_id.clone(),
        common.chain_id,
        common.governor_address.clone(),
        common.proposal_id.clone(),
    )
}

fn proposal_entity_ref(
    proposal_refs: &BTreeMap<(String, i32, String, String), String>,
    common: &ProposalEventCommon,
) -> String {
    proposal_refs
        .get(&proposal_lookup_key(common))
        .cloned()
        .unwrap_or_else(|| {
            proposal_ref(
                &common.contract_set_id,
                &common.governor_address,
                &common.proposal_id,
                common.chain_id,
            )
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
    state_epoch_write_id(proposal_ref, kind, &log.id)
}

fn state_epoch_write_id(
    proposal_ref: &str,
    kind: ProposalStateWriteKind,
    event_log_id: &str,
) -> String {
    match kind {
        ProposalStateWriteKind::Pending | ProposalStateWriteKind::Active => {
            format!(
                "{proposal_ref}:state:{}",
                kind.as_str().to_ascii_lowercase()
            )
        }
        ProposalStateWriteKind::Queued
        | ProposalStateWriteKind::Executed
        | ProposalStateWriteKind::Canceled => {
            format!(
                "{proposal_ref}:state:{}:{event_log_id}",
                kind.as_str().to_ascii_lowercase()
            )
        }
    }
}

impl ProposalStateWriteKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "Pending",
            Self::Active => "Active",
            Self::Queued => "Queued",
            Self::Executed => "Executed",
            Self::Canceled => "Canceled",
        }
    }
}

fn infer_clock_mode(vote_start: &str, vote_end: &str) -> String {
    if is_unix_seconds_timepoint(vote_start) || is_unix_seconds_timepoint(vote_end) {
        "timestamp".to_owned()
    } else {
        "blocknumber".to_owned()
    }
}

fn is_unix_seconds_timepoint(value: &str) -> bool {
    value
        .parse::<u64>()
        .map(|value| value >= 1_000_000_000)
        .unwrap_or(false)
}

fn timepoint_timestamp(
    timepoint: &str,
    clock_mode: &str,
    anchor_block_number: &str,
    anchor_block_timestamp: Option<&str>,
    block_interval: Option<&str>,
) -> String {
    if clock_mode == "timestamp" {
        return seconds_to_millis(timepoint).unwrap_or_else(|| timepoint.to_owned());
    }

    estimate_blocknumber_timestamp(
        timepoint,
        anchor_block_number,
        anchor_block_timestamp,
        block_interval,
    )
    .unwrap_or_else(|| timepoint.to_owned())
}

fn estimate_blocknumber_timestamp(
    timepoint: &str,
    anchor_block_number: &str,
    anchor_block_timestamp: Option<&str>,
    block_interval: Option<&str>,
) -> Option<String> {
    let target = timepoint.parse::<f64>().ok()?;
    let anchor = anchor_block_number.parse::<f64>().ok()?;
    let timestamp = anchor_block_timestamp?.parse::<f64>().ok()?;
    let interval_ms = block_interval?.parse::<f64>().ok()? * 1_000.0;
    let estimated = (timestamp + (target - anchor) * interval_ms).round() as i128;

    (estimated >= 0).then(|| estimated.to_string())
}

fn block_interval(chain_id: i32, clock_mode: &str) -> Option<String> {
    const ETHEREUM_MAINNET_CHAIN_ID: i32 = 1;

    (chain_id == ETHEREUM_MAINNET_CHAIN_ID && clock_mode == "blocknumber").then(|| "12".to_owned())
}

fn timepoint_timestamp_for_proposal(proposal: &ProposalWrite, timepoint: &str) -> String {
    timepoint_timestamp(
        timepoint,
        &proposal.clock_mode,
        &proposal.block_number,
        proposal.block_timestamp.as_deref(),
        proposal.block_interval.as_deref(),
    )
}

fn seconds_to_millis(seconds: &str) -> Option<String> {
    seconds
        .parse::<u128>()
        .ok()
        .map(|seconds| (seconds * 1_000).to_string())
}

fn proposal_ref(
    contract_set_id: &str,
    governor_address: &str,
    proposal_id: &str,
    chain_id: i32,
) -> String {
    format!(
        "proposal:{contract_set_id}:{chain_id}:{}:{proposal_id}",
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

fn chain_read_clock_mode(value: &ChainReadValue) -> Option<String> {
    let value = chain_read_scalar(value)?;
    if value.contains("timestamp") {
        Some("timestamp".to_owned())
    } else if value.contains("blocknumber") {
        Some("blocknumber".to_owned())
    } else {
        Some(value)
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
