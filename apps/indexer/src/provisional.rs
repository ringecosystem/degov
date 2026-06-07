use std::fmt;

use crate::{
    DaoContractAddresses, DatalensConfig, DatalensError, DatalensProvisionalCacheSegment,
    DatalensProvisionalFinality, DatalensProvisionalLogQueryReader, datalens_selector_fingerprint,
    fetch_provisional_dao_log_pages, plan_dao_log_queries,
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
}

#[derive(Debug, thiserror::Error)]
pub enum ProvisionalWorkerError {
    #[error("provisional Datalens query error: {0}")]
    Datalens(#[from] DatalensError),

    #[error("provisional segment store error: {0}")]
    Store(String),
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
        timelocks: &[ProvisionalTimelockOperationOverlayWrite],
    ) -> Result<(), Self::Error>;
}

pub struct ProvisionalWorker<'a, R, S> {
    options: ProvisionalWorkerOptions,
    reader: &'a mut R,
    store: &'a mut S,
}

impl<'a, R, S> ProvisionalWorker<'a, R, S>
where
    R: DatalensProvisionalLogQueryReader,
    S: DatalensProvisionalSegmentStore,
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

        for page in pages {
            let selector = serde_json::to_string(&page.plan.input.selector)
                .unwrap_or_else(|_| "unavailable".to_owned());
            let selector_fingerprint = datalens_selector_fingerprint(&page.plan.input.selector);
            for segment in page.segments {
                writes.push(self.segment_write(segment, &selector, &selector_fingerprint));
            }
        }

        self.store
            .write_provisional_segments(&writes)
            .map_err(|error| ProvisionalWorkerError::Store(error.to_string()))?;

        Ok(ProvisionalWorkerReport {
            segments_written: writes.len(),
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
}
