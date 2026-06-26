use std::{collections::BTreeMap, fmt};

use datalens_sdk::safety::{
    BlockAnchor, DataFinality, DataRange, PromotionDecision, plan_promotion,
};

use crate::datalens::DatalensProvisionalLogPage;
use crate::{
    BatchReadPlanConfig, ChainContracts, DaoContractAddresses, DaoLogSource, DatalensConfig,
    DatalensError, DatalensProvisionalCacheSegment, DatalensProvisionalFinality,
    DatalensProvisionalLogQueryReader, DecodedDaoEvent, DecodedGovernorEvent,
    IndexerCheckpointIdentity, NormalizedEvmLog, ProposalIdWrite, ProposalProjectionContext,
    ProposalProjectionEvent, ProposalQueuedWrite, ProposalWrite, VoteCastGroupWrite,
    VoteProjectionContext, VoteProjectionEvent, datalens_selector_fingerprint, decode_dao_log,
    fetch_provisional_dao_log_pages, normalize_evm_log_rows, page_rows, plan_dao_log_queries,
    project_proposal_events, project_vote_events,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProvisionalWorkerOptions {
    pub datalens_config: DatalensConfig,
    pub addresses: DaoContractAddresses,
    pub dao_code: String,
    pub contract_set_id: String,
    pub chain_id: i32,
    pub chain_name: String,
    pub finality: DatalensProvisionalFinality,
    pub from_block: i64,
    pub to_block: i64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DatalensProvisionalSegmentWrite {
    pub id: String,
    pub dao_code: Option<String>,
    pub contract_set_id: String,
    pub chain_id: Option<i32>,
    pub chain_name: Option<String>,
    pub dataset_key: String,
    pub selector: String,
    pub selector_fingerprint: Option<String>,
    pub range_start_block: i64,
    pub range_end_block: i64,
    pub segment_finality: String,
    pub source: String,
    pub anchor_block_number: Option<i64>,
    pub anchor_block_hash: Option<String>,
    pub anchor_parent_hash: Option<String>,
    pub anchor_block_timestamp: Option<i64>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProvisionalContributorPowerOverlayWrite {
    pub id: String,
    pub segment_id: Option<String>,
    pub dao_code: Option<String>,
    pub contract_set_id: String,
    pub chain_id: Option<i32>,
    pub chain_name: Option<String>,
    pub governor_address: Option<String>,
    pub token_address: Option<String>,
    pub account: String,
    pub power: String,
    pub balance: Option<String>,
    pub delegates_count_all: i32,
    pub delegates_count_effective: i32,
    pub last_vote_block_number: Option<String>,
    pub last_vote_timestamp: Option<String>,
    pub source: String,
    pub status: String,
    pub anchor_block_number: Option<String>,
    pub anchor_block_hash: Option<String>,
    pub anchor_parent_hash: Option<String>,
    pub anchor_block_timestamp: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProvisionalDelegatePowerOverlayWrite {
    pub id: String,
    pub segment_id: Option<String>,
    pub dao_code: Option<String>,
    pub contract_set_id: String,
    pub chain_id: Option<i32>,
    pub chain_name: Option<String>,
    pub governor_address: Option<String>,
    pub token_address: Option<String>,
    pub delegator: String,
    pub delegate: String,
    pub power: String,
    pub is_current: bool,
    pub source: String,
    pub status: String,
    pub anchor_block_number: Option<String>,
    pub anchor_block_hash: Option<String>,
    pub anchor_parent_hash: Option<String>,
    pub anchor_block_timestamp: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProvisionalProposalOverlayWrite {
    pub id: String,
    pub segment_id: Option<String>,
    pub dao_code: Option<String>,
    pub contract_set_id: String,
    pub chain_id: Option<i32>,
    pub chain_name: Option<String>,
    pub governor_address: Option<String>,
    pub contract_address: Option<String>,
    pub log_index: Option<i32>,
    pub transaction_index: Option<i32>,
    pub proposal_id: String,
    pub proposer: Option<String>,
    pub targets: Option<Vec<String>>,
    pub values: Option<Vec<String>>,
    pub signatures: Option<Vec<String>>,
    pub calldatas: Option<Vec<String>>,
    pub vote_start: Option<String>,
    pub vote_end: Option<String>,
    pub description: Option<String>,
    pub title: Option<String>,
    pub state: Option<String>,
    pub vote_start_timestamp: Option<String>,
    pub vote_end_timestamp: Option<String>,
    pub description_hash: Option<String>,
    pub proposal_snapshot: Option<String>,
    pub proposal_deadline: Option<String>,
    pub proposal_eta: Option<String>,
    pub queue_ready_at: Option<String>,
    pub queue_expires_at: Option<String>,
    pub block_number: Option<String>,
    pub block_timestamp: Option<String>,
    pub transaction_hash: Option<String>,
    pub block_interval: Option<String>,
    pub counting_mode: Option<String>,
    pub timelock_address: Option<String>,
    pub timelock_grace_period: Option<String>,
    pub clock_mode: Option<String>,
    pub quorum: Option<String>,
    pub decimals: Option<String>,
    pub source: String,
    pub status: String,
    pub anchor_block_number: Option<String>,
    pub anchor_block_hash: Option<String>,
    pub anchor_parent_hash: Option<String>,
    pub anchor_block_timestamp: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProvisionalTimelockOperationOverlayWrite {
    pub id: String,
    pub segment_id: Option<String>,
    pub dao_code: Option<String>,
    pub contract_set_id: String,
    pub chain_id: Option<i32>,
    pub chain_name: Option<String>,
    pub governor_address: Option<String>,
    pub timelock_address: String,
    pub proposal_id: Option<String>,
    pub operation_id: String,
    pub timelock_type: Option<String>,
    pub predecessor: Option<String>,
    pub salt: Option<String>,
    pub state: String,
    pub call_count: Option<i32>,
    pub executed_call_count: Option<i32>,
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
    pub source: String,
    pub status: String,
    pub anchor_block_number: Option<String>,
    pub anchor_block_hash: Option<String>,
    pub anchor_parent_hash: Option<String>,
    pub anchor_block_timestamp: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProvisionalVoteCastGroupOverlayWrite {
    pub id: String,
    pub segment_id: Option<String>,
    pub dao_code: Option<String>,
    pub contract_set_id: String,
    pub chain_id: Option<i32>,
    pub chain_name: Option<String>,
    pub governor_address: Option<String>,
    pub contract_address: Option<String>,
    pub log_index: Option<i32>,
    pub transaction_index: Option<i32>,
    pub proposal_id: String,
    pub kind: String,
    pub voter: String,
    pub ref_proposal_id: String,
    pub support: i32,
    pub weight: String,
    pub reason: String,
    pub params: Option<String>,
    pub block_number: String,
    pub block_timestamp: String,
    pub transaction_hash: String,
    pub source: String,
    pub status: String,
    pub anchor_block_number: Option<String>,
    pub anchor_block_hash: Option<String>,
    pub anchor_parent_hash: Option<String>,
    pub anchor_block_timestamp: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProvisionalProposalEventOverlayWrite {
    pub id: String,
    pub segment_id: Option<String>,
    pub dao_code: Option<String>,
    pub contract_set_id: String,
    pub chain_id: Option<i32>,
    pub chain_name: Option<String>,
    pub governor_address: Option<String>,
    pub contract_address: Option<String>,
    pub event_type: String,
    pub log_index: Option<i32>,
    pub transaction_index: Option<i32>,
    pub proposal_id: String,
    pub eta_seconds: Option<String>,
    pub block_number: String,
    pub block_timestamp: String,
    pub transaction_hash: String,
    pub source: String,
    pub status: String,
    pub anchor_block_number: Option<String>,
    pub anchor_block_hash: Option<String>,
    pub anchor_parent_hash: Option<String>,
    pub anchor_block_timestamp: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProvisionalPowerOverlayScope {
    pub contract_set_id: String,
    pub chain_id: i32,
    pub dao_code: Option<String>,
    pub governor_address: String,
    pub token_address: String,
    pub account: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProvisionalDelegatePowerOverlayRelation {
    pub contract_set_id: String,
    pub chain_id: Option<i32>,
    pub chain_name: Option<String>,
    pub dao_code: Option<String>,
    pub governor_address: Option<String>,
    pub token_address: Option<String>,
    pub delegator: String,
    pub delegate: String,
    pub is_current: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProvisionalWorkerReport {
    pub segments_written: usize,
    pub proposal_overlays_written: usize,
    pub proposal_event_overlays_written: usize,
    pub vote_overlays_written: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProvisionalRollbackScope {
    pub dao_code: String,
    pub contract_set_id: String,
    pub chain_id: i32,
    pub source: Option<String>,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct ProvisionalCleanupReport {
    pub segments_marked_finalized: usize,
    pub contributor_overlays_marked_finalized: usize,
    pub delegate_overlays_marked_finalized: usize,
    pub proposal_overlays_marked_finalized: usize,
    pub proposal_event_overlays_marked_finalized: usize,
    pub timelock_overlays_marked_finalized: usize,
    pub vote_overlays_marked_finalized: usize,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct ProvisionalRollbackReport {
    pub segments_marked_invalid: usize,
    pub contributor_overlays_marked_invalid: usize,
    pub delegate_overlays_marked_invalid: usize,
    pub proposal_overlays_marked_invalid: usize,
    pub proposal_event_overlays_marked_invalid: usize,
    pub timelock_overlays_marked_invalid: usize,
    pub vote_overlays_marked_invalid: usize,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProvisionalSegmentCleanupCandidate {
    pub range_start_block: i64,
    pub range_end_block: i64,
    pub segment_finality: String,
    pub anchor_block_number: Option<i64>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProvisionalSegmentCleanupDecision {
    Finalize,
    Keep,
    Invalid,
}

#[derive(Debug, thiserror::Error)]
pub enum ProvisionalWorkerError {
    #[error("provisional Datalens query error: {0}")]
    Datalens(#[from] DatalensError),

    #[error("provisional segment store error: {0}")]
    Store(String),

    #[error("provisional log normalization error: {0}")]
    Normalize(String),

    #[error("provisional log decode error: {0}")]
    Decode(String),

    #[error("provisional proposal projection error: {0}")]
    Projection(String),
}

pub trait DatalensProvisionalSegmentStore {
    type Error: fmt::Display;

    fn write_provisional_segments(
        &mut self,
        segments: &[DatalensProvisionalSegmentWrite],
    ) -> Result<(), Self::Error>;
}

pub trait ProvisionalPowerOverlayStore {
    type Error: fmt::Display;

    fn current_delegate_power_overlay_relations(
        &mut self,
        scopes: &[ProvisionalPowerOverlayScope],
    ) -> Result<Vec<ProvisionalDelegatePowerOverlayRelation>, Self::Error>;

    fn write_power_overlays(
        &mut self,
        contributors: &[ProvisionalContributorPowerOverlayWrite],
        delegates: &[ProvisionalDelegatePowerOverlayWrite],
    ) -> Result<(), Self::Error>;
}

pub trait ProvisionalProposalOverlayStore {
    type Error: fmt::Display;

    fn write_proposal_overlays(
        &mut self,
        proposals: &[ProvisionalProposalOverlayWrite],
        proposal_events: &[ProvisionalProposalEventOverlayWrite],
        timelocks: &[ProvisionalTimelockOperationOverlayWrite],
    ) -> Result<(), Self::Error>;
}

pub trait ProvisionalVoteOverlayStore {
    type Error: fmt::Display;

    fn write_vote_overlays(
        &mut self,
        votes: &[ProvisionalVoteCastGroupOverlayWrite],
    ) -> Result<(), Self::Error>;
}

pub trait ProvisionalCleanupStore {
    type Error: fmt::Display;

    fn cleanup_finalized_provisional_overlays(
        &mut self,
        identity: &IndexerCheckpointIdentity,
        source: Option<&str>,
    ) -> Result<ProvisionalCleanupReport, Self::Error>;

    fn rollback_provisional_overlays(
        &mut self,
        scope: &ProvisionalRollbackScope,
        reason: &str,
    ) -> Result<ProvisionalRollbackReport, Self::Error>;
}

pub fn plan_provisional_segment_cleanup(
    finalized_height: i64,
    candidate: &ProvisionalSegmentCleanupCandidate,
) -> ProvisionalSegmentCleanupDecision {
    if finalized_height < 0
        || candidate.range_start_block < 0
        || candidate.range_end_block < candidate.range_start_block
    {
        return ProvisionalSegmentCleanupDecision::Invalid;
    }

    let Ok(finalized_height) = u64::try_from(finalized_height) else {
        return ProvisionalSegmentCleanupDecision::Invalid;
    };
    let Ok(range_start) = u64::try_from(candidate.range_start_block) else {
        return ProvisionalSegmentCleanupDecision::Invalid;
    };
    let Ok(range_end) = u64::try_from(candidate.range_end_block) else {
        return ProvisionalSegmentCleanupDecision::Invalid;
    };
    let anchor_height = candidate
        .anchor_block_number
        .and_then(|height| u64::try_from(height).ok())
        .unwrap_or(range_end);
    let durable_head = BlockAnchor {
        range_kind: "block".to_owned(),
        height: finalized_height,
        block_hash: None,
        parent_hash: None,
        timestamp: None,
        finality: DataFinality::Safe,
    };
    let provisional_range = DataRange::new("block", range_start, range_end);
    let provisional_anchor = BlockAnchor {
        range_kind: "block".to_owned(),
        height: anchor_height,
        block_hash: None,
        parent_hash: None,
        timestamp: None,
        finality: DataFinality::from(candidate.segment_finality.as_str()),
    };

    match plan_promotion(
        Some(&durable_head),
        Some(&provisional_range),
        Some(&provisional_anchor),
    )
    .decision
    {
        PromotionDecision::Promote { .. } => ProvisionalSegmentCleanupDecision::Finalize,
        PromotionDecision::Rollback { .. } => ProvisionalSegmentCleanupDecision::Invalid,
        PromotionDecision::KeepProvisional { .. } => ProvisionalSegmentCleanupDecision::Keep,
        PromotionDecision::Recheck { .. } if finalized_height >= range_end => {
            ProvisionalSegmentCleanupDecision::Finalize
        }
        PromotionDecision::Recheck { .. } => ProvisionalSegmentCleanupDecision::Keep,
    }
}

pub struct ProvisionalWorker<'a, R, S> {
    options: ProvisionalWorkerOptions,
    reader: &'a mut R,
    store: &'a mut S,
}

impl<'a, R, S> ProvisionalWorker<'a, R, S>
where
    R: DatalensProvisionalLogQueryReader,
    S: DatalensProvisionalSegmentStore
        + ProvisionalProposalOverlayStore
        + ProvisionalVoteOverlayStore,
{
    pub fn new(options: ProvisionalWorkerOptions, reader: &'a mut R, store: &'a mut S) -> Self {
        Self {
            options,
            reader,
            store,
        }
    }

    pub fn run_once(&mut self) -> Result<ProvisionalWorkerReport, ProvisionalWorkerError> {
        let plans = plan_dao_log_queries(
            &self.options.datalens_config,
            &self.options.addresses,
            self.options.from_block,
            self.options.to_block,
        )?;
        let pages = fetch_provisional_dao_log_pages(self.reader, &plans, self.options.finality)?;
        let mut writes = Vec::new();
        let mut proposal_writes = Vec::new();
        let mut proposal_event_writes = Vec::new();
        let mut vote_writes = Vec::new();

        for page in pages {
            let selector = serde_json::to_string(&page.plan.input.selector)
                .unwrap_or_else(|_| "unavailable".to_owned());
            let selector_fingerprint = datalens_selector_fingerprint(&page.plan.input.selector);
            let segment_writes = page
                .segments
                .iter()
                .cloned()
                .map(|segment| self.segment_write(segment, &selector, &selector_fingerprint))
                .collect::<Vec<_>>();
            let proposal_page_writes = self.proposal_writes(&page, &segment_writes)?;
            proposal_writes.extend(proposal_page_writes.proposals);
            proposal_event_writes.extend(proposal_page_writes.events);
            vote_writes.extend(self.vote_writes(&page, &segment_writes)?);
            for segment in segment_writes {
                writes.push(segment);
            }
        }

        self.store
            .write_provisional_segments(&writes)
            .map_err(|error| ProvisionalWorkerError::Store(error.to_string()))?;
        self.store
            .write_proposal_overlays(&proposal_writes, &proposal_event_writes, &[])
            .map_err(|error| ProvisionalWorkerError::Store(error.to_string()))?;
        self.store
            .write_vote_overlays(&vote_writes)
            .map_err(|error| ProvisionalWorkerError::Store(error.to_string()))?;

        Ok(ProvisionalWorkerReport {
            segments_written: writes.len(),
            proposal_overlays_written: proposal_writes.len(),
            proposal_event_overlays_written: proposal_event_writes.len(),
            vote_overlays_written: vote_writes.len(),
        })
    }

    fn segment_write(
        &self,
        segment: DatalensProvisionalCacheSegment,
        selector: &str,
        selector_fingerprint: &str,
    ) -> DatalensProvisionalSegmentWrite {
        let dataset_key = self.options.datalens_config.dataset.key();
        let id = format!(
            "{}:{}:{}:{}:{}:{}:{}:{}:{}",
            self.options.dao_code,
            self.options.chain_name,
            self.options.contract_set_id,
            dataset_key,
            selector_fingerprint,
            segment.range_start_block,
            segment.range_end_block,
            segment.finality,
            segment.source
        );

        DatalensProvisionalSegmentWrite {
            id,
            dao_code: Some(self.options.dao_code.clone()),
            contract_set_id: self.options.contract_set_id.clone(),
            chain_id: Some(self.options.chain_id),
            chain_name: Some(self.options.chain_name.clone()),
            dataset_key,
            selector: selector.to_owned(),
            selector_fingerprint: Some(selector_fingerprint.to_owned()),
            range_start_block: segment.range_start_block,
            range_end_block: segment.range_end_block,
            segment_finality: segment.finality,
            source: segment.source,
            anchor_block_number: segment.anchor_block_number,
            anchor_block_hash: segment.anchor_block_hash,
            anchor_parent_hash: segment.anchor_parent_hash,
            anchor_block_timestamp: segment.anchor_block_timestamp,
            error: None,
        }
    }

    fn proposal_writes(
        &self,
        page: &DatalensProvisionalLogPage,
        segments: &[DatalensProvisionalSegmentWrite],
    ) -> Result<ProvisionalProposalPageWrites, ProvisionalWorkerError> {
        let sources = page
            .plan
            .sources
            .iter()
            .fold(BTreeMap::new(), |mut sources, source| {
                sources
                    .entry(source.address.to_ascii_lowercase())
                    .or_insert_with(Vec::new)
                    .push(source.source);
                sources
            });
        let rows = page_rows(page.rows.clone())
            .map_err(|error| ProvisionalWorkerError::Normalize(error.to_string()))?;
        let logs = normalize_evm_log_rows(self.options.chain_id, rows)
            .map_err(|error| ProvisionalWorkerError::Normalize(error.to_string()))?;
        let mut proposal_events = Vec::new();

        for log in logs {
            if log.removed {
                continue;
            }
            let Some(candidate_sources) = sources.get(&log.address) else {
                continue;
            };
            let Some(event) = self.decode_proposal_event(candidate_sources, &log)? else {
                continue;
            };
            proposal_events.push(ProposalProjectionEvent { log, event });
        }
        if proposal_events.is_empty() {
            return Ok(ProvisionalProposalPageWrites::default());
        }

        let context = self.proposal_context();
        let batch = project_proposal_events(&context, proposal_events)
            .map_err(|error| ProvisionalWorkerError::Projection(format!("{error:?}")))?;

        let proposals = batch
            .proposals
            .iter()
            .filter_map(|proposal| self.proposal_overlay_write(proposal, segments))
            .collect();
        let mut events = Vec::new();
        events.extend(batch.proposal_queued.iter().filter_map(|event| {
            self.queued_event_overlay_write(event, "proposal_queued", segments)
        }));
        events.extend(
            batch.proposal_executed.iter().filter_map(|event| {
                self.id_event_overlay_write(event, "proposal_executed", segments)
            }),
        );
        events.extend(
            batch.proposal_canceled.iter().filter_map(|event| {
                self.id_event_overlay_write(event, "proposal_canceled", segments)
            }),
        );

        Ok(ProvisionalProposalPageWrites { proposals, events })
    }

    fn decode_proposal_event(
        &self,
        candidate_sources: &[DaoLogSource],
        log: &NormalizedEvmLog,
    ) -> Result<Option<DecodedGovernorEvent>, ProvisionalWorkerError> {
        for source in candidate_sources {
            let token_standard = (*source == DaoLogSource::GovernorToken)
                .then_some(self.options.addresses.governor_token_standard);
            let event = decode_dao_log(&self.options.dao_code, *source, token_standard, log)
                .map_err(|error| ProvisionalWorkerError::Decode(error.to_string()))?;
            if let DecodedDaoEvent::Governor(event @ DecodedGovernorEvent::ProposalCreated(_)) =
                event
            {
                return Ok(Some(event));
            }
            if let DecodedDaoEvent::Governor(
                event @ (DecodedGovernorEvent::ProposalQueued(_)
                | DecodedGovernorEvent::ProposalExecuted(_)
                | DecodedGovernorEvent::ProposalCanceled(_)),
            ) = event
            {
                return Ok(Some(event));
            }
        }

        Ok(None)
    }

    fn vote_writes(
        &self,
        page: &DatalensProvisionalLogPage,
        segments: &[DatalensProvisionalSegmentWrite],
    ) -> Result<Vec<ProvisionalVoteCastGroupOverlayWrite>, ProvisionalWorkerError> {
        let sources = page
            .plan
            .sources
            .iter()
            .fold(BTreeMap::new(), |mut sources, source| {
                sources
                    .entry(source.address.to_ascii_lowercase())
                    .or_insert_with(Vec::new)
                    .push(source.source);
                sources
            });
        let rows = page_rows(page.rows.clone())
            .map_err(|error| ProvisionalWorkerError::Normalize(error.to_string()))?;
        let logs = normalize_evm_log_rows(self.options.chain_id, rows)
            .map_err(|error| ProvisionalWorkerError::Normalize(error.to_string()))?;
        let mut vote_events = Vec::new();

        for log in logs {
            if log.removed {
                continue;
            }
            let Some(candidate_sources) = sources.get(&log.address) else {
                continue;
            };
            let Some(event) = self.decode_vote_event(candidate_sources, &log)? else {
                continue;
            };
            vote_events.push(VoteProjectionEvent { log, event });
        }
        if vote_events.is_empty() {
            return Ok(Vec::new());
        }

        let context = self.vote_context();
        let batch = project_vote_events(&context, vote_events)
            .map_err(|error| ProvisionalWorkerError::Projection(format!("{error:?}")))?;

        Ok(batch
            .vote_cast_groups
            .iter()
            .filter_map(|vote| self.vote_overlay_write(vote, segments))
            .collect())
    }

    fn decode_vote_event(
        &self,
        candidate_sources: &[DaoLogSource],
        log: &NormalizedEvmLog,
    ) -> Result<Option<DecodedGovernorEvent>, ProvisionalWorkerError> {
        for source in candidate_sources {
            let token_standard = (*source == DaoLogSource::GovernorToken)
                .then_some(self.options.addresses.governor_token_standard);
            let event = decode_dao_log(&self.options.dao_code, *source, token_standard, log)
                .map_err(|error| ProvisionalWorkerError::Decode(error.to_string()))?;
            if let DecodedDaoEvent::Governor(
                event @ (DecodedGovernorEvent::VoteCast(_)
                | DecodedGovernorEvent::VoteCastWithParams(_)),
            ) = event
            {
                return Ok(Some(event));
            }
        }

        Ok(None)
    }

    fn vote_context(&self) -> VoteProjectionContext {
        let contracts = ChainContracts {
            governor: self.options.addresses.governor.clone(),
            governor_token: self.options.addresses.governor_token.clone(),
            timelock: self.options.addresses.timelock.clone(),
        };

        VoteProjectionContext {
            contract_set_id: self.options.contract_set_id.clone(),
            dao_code: self.options.dao_code.clone(),
            governor_address: self.options.addresses.governor.clone(),
            contracts,
            read_plan_config: BatchReadPlanConfig::default().validated(),
        }
    }

    fn proposal_context(&self) -> ProposalProjectionContext {
        let contracts = ChainContracts {
            governor: self.options.addresses.governor.clone(),
            governor_token: self.options.addresses.governor_token.clone(),
            timelock: self.options.addresses.timelock.clone(),
        };

        ProposalProjectionContext {
            contract_set_id: self.options.contract_set_id.clone(),
            dao_code: self.options.dao_code.clone(),
            governor_address: self.options.addresses.governor.clone(),
            contracts,
            token_standard: self.options.addresses.governor_token_standard,
            read_plan_config: BatchReadPlanConfig::default().validated(),
        }
    }

    fn proposal_overlay_write(
        &self,
        proposal: &ProposalWrite,
        segments: &[DatalensProvisionalSegmentWrite],
    ) -> Option<ProvisionalProposalOverlayWrite> {
        let segment = matching_segment(segments, proposal.block_number.as_str())?;
        Some(ProvisionalProposalOverlayWrite {
            id: proposal.id.clone(),
            segment_id: Some(segment.id.clone()),
            dao_code: Some(proposal.dao_code.clone()),
            contract_set_id: proposal.contract_set_id.clone(),
            chain_id: Some(proposal.chain_id),
            chain_name: Some(self.options.chain_name.clone()),
            governor_address: Some(proposal.governor_address.clone()),
            contract_address: Some(proposal.contract_address.clone()),
            log_index: i32::try_from(proposal.log_index).ok(),
            transaction_index: i32::try_from(proposal.transaction_index).ok(),
            proposal_id: proposal.proposal_id.clone(),
            proposer: Some(proposal.proposer.clone()),
            targets: Some(proposal.targets.clone()),
            values: Some(proposal.values.clone()),
            signatures: Some(proposal.signatures.clone()),
            calldatas: Some(proposal.calldatas.clone()),
            vote_start: Some(proposal.vote_start.clone()),
            vote_end: Some(proposal.vote_end.clone()),
            description: Some(proposal.description.clone()),
            title: Some(proposal.title.clone()),
            state: proposal.current_state.clone(),
            vote_start_timestamp: Some(proposal.vote_start_timestamp.clone()),
            vote_end_timestamp: Some(proposal.vote_end_timestamp.clone()),
            description_hash: Some(proposal.description_hash.clone()),
            proposal_snapshot: proposal.proposal_snapshot.clone(),
            proposal_deadline: proposal.proposal_deadline.clone(),
            proposal_eta: proposal.proposal_eta.clone(),
            queue_ready_at: proposal.queue_ready_at.clone(),
            queue_expires_at: proposal.queue_expires_at.clone(),
            block_number: Some(proposal.block_number.clone()),
            block_timestamp: proposal.block_timestamp.clone(),
            transaction_hash: Some(proposal.transaction_hash.clone()),
            block_interval: proposal.block_interval.clone(),
            counting_mode: proposal.counting_mode.clone(),
            timelock_address: proposal.timelock_address.clone(),
            timelock_grace_period: None,
            clock_mode: Some(proposal.clock_mode.clone()),
            quorum: Some(proposal.quorum.clone()),
            decimals: Some(proposal.decimals.clone()),
            source: segment.source.clone(),
            status: "available".to_owned(),
            anchor_block_number: segment.anchor_block_number.map(|value| value.to_string()),
            anchor_block_hash: segment.anchor_block_hash.clone(),
            anchor_parent_hash: segment.anchor_parent_hash.clone(),
            anchor_block_timestamp: segment
                .anchor_block_timestamp
                .map(|value| value.to_string()),
        })
    }

    fn queued_event_overlay_write(
        &self,
        event: &ProposalQueuedWrite,
        event_type: &str,
        segments: &[DatalensProvisionalSegmentWrite],
    ) -> Option<ProvisionalProposalEventOverlayWrite> {
        self.proposal_event_overlay_write(
            &event.id,
            &event.common.contract_set_id,
            event.common.chain_id,
            &event.common.dao_code,
            &event.common.governor_address,
            &event.common.contract_address,
            event.common.log_index,
            event.common.transaction_index,
            &event.proposal_id,
            Some(event.eta_seconds.clone()),
            &event.common.block_number,
            event.common.block_timestamp.as_deref(),
            &event.common.transaction_hash,
            event_type,
            segments,
        )
    }

    fn id_event_overlay_write(
        &self,
        event: &ProposalIdWrite,
        event_type: &str,
        segments: &[DatalensProvisionalSegmentWrite],
    ) -> Option<ProvisionalProposalEventOverlayWrite> {
        self.proposal_event_overlay_write(
            &event.id,
            &event.common.contract_set_id,
            event.common.chain_id,
            &event.common.dao_code,
            &event.common.governor_address,
            &event.common.contract_address,
            event.common.log_index,
            event.common.transaction_index,
            &event.proposal_id,
            None,
            &event.common.block_number,
            event.common.block_timestamp.as_deref(),
            &event.common.transaction_hash,
            event_type,
            segments,
        )
    }

    #[allow(clippy::too_many_arguments)]
    fn proposal_event_overlay_write(
        &self,
        id: &str,
        contract_set_id: &str,
        chain_id: i32,
        dao_code: &str,
        governor_address: &str,
        contract_address: &str,
        log_index: u64,
        transaction_index: u64,
        proposal_id: &str,
        eta_seconds: Option<String>,
        block_number: &str,
        block_timestamp: Option<&str>,
        transaction_hash: &str,
        event_type: &str,
        segments: &[DatalensProvisionalSegmentWrite],
    ) -> Option<ProvisionalProposalEventOverlayWrite> {
        let segment = matching_segment(segments, block_number)?;
        Some(ProvisionalProposalEventOverlayWrite {
            id: id.to_owned(),
            segment_id: Some(segment.id.clone()),
            dao_code: Some(dao_code.to_owned()),
            contract_set_id: contract_set_id.to_owned(),
            chain_id: Some(chain_id),
            chain_name: Some(self.options.chain_name.clone()),
            governor_address: Some(governor_address.to_owned()),
            contract_address: Some(contract_address.to_owned()),
            event_type: event_type.to_owned(),
            log_index: i32::try_from(log_index).ok(),
            transaction_index: i32::try_from(transaction_index).ok(),
            proposal_id: proposal_id.to_owned(),
            eta_seconds,
            block_number: block_number.to_owned(),
            block_timestamp: block_timestamp?.to_owned(),
            transaction_hash: transaction_hash.to_owned(),
            source: segment.source.clone(),
            status: "available".to_owned(),
            anchor_block_number: segment.anchor_block_number.map(|value| value.to_string()),
            anchor_block_hash: segment.anchor_block_hash.clone(),
            anchor_parent_hash: segment.anchor_parent_hash.clone(),
            anchor_block_timestamp: segment
                .anchor_block_timestamp
                .map(|value| value.to_string()),
        })
    }

    fn vote_overlay_write(
        &self,
        vote: &VoteCastGroupWrite,
        segments: &[DatalensProvisionalSegmentWrite],
    ) -> Option<ProvisionalVoteCastGroupOverlayWrite> {
        let segment = matching_segment(segments, vote.block_number.as_str())?;
        Some(ProvisionalVoteCastGroupOverlayWrite {
            id: vote.id.clone(),
            segment_id: Some(segment.id.clone()),
            dao_code: Some(vote.dao_code.clone()),
            contract_set_id: vote.contract_set_id.clone(),
            chain_id: Some(vote.chain_id),
            chain_name: Some(self.options.chain_name.clone()),
            governor_address: Some(vote.governor_address.clone()),
            contract_address: Some(vote.contract_address.clone()),
            log_index: i32::try_from(vote.log_index).ok(),
            transaction_index: i32::try_from(vote.transaction_index).ok(),
            proposal_id: vote.proposal_ref.clone(),
            kind: vote.kind.clone(),
            voter: vote.voter.clone(),
            ref_proposal_id: vote.ref_proposal_id.clone(),
            support: i32::from(vote.support),
            weight: vote.weight.clone(),
            reason: vote.reason.clone(),
            params: vote.params.clone(),
            block_number: vote.block_number.clone(),
            block_timestamp: vote.block_timestamp.clone()?,
            transaction_hash: vote.transaction_hash.clone(),
            source: segment.source.clone(),
            status: "available".to_owned(),
            anchor_block_number: segment.anchor_block_number.map(|value| value.to_string()),
            anchor_block_hash: segment.anchor_block_hash.clone(),
            anchor_parent_hash: segment.anchor_parent_hash.clone(),
            anchor_block_timestamp: segment
                .anchor_block_timestamp
                .map(|value| value.to_string()),
        })
    }
}

#[derive(Default)]
struct ProvisionalProposalPageWrites {
    proposals: Vec<ProvisionalProposalOverlayWrite>,
    events: Vec<ProvisionalProposalEventOverlayWrite>,
}

fn matching_segment<'a>(
    segments: &'a [DatalensProvisionalSegmentWrite],
    block_number: &str,
) -> Option<&'a DatalensProvisionalSegmentWrite> {
    let block_number = block_number.parse::<i64>().ok()?;
    segments.iter().find(|segment| {
        segment.range_start_block <= block_number && block_number <= segment.range_end_block
    })
}
