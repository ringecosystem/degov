//! Vote projection write models and deterministic repository boundary.
//!
//! The Postgres adapter is intentionally left to the storage layer; the structs in this module
//! carry schema-relevant fields for vote rows, vote groups, proposal totals, metric deltas, and
//! contributor participation signals.

use std::cmp::Ordering;
use std::collections::BTreeMap;

use crate::{
    BatchReadPlanConfig, ChainContracts, ChainReadPlan, ChainReadPlanBuilder, ChainReadReason,
    DecodedGovernorEvent, NormalizedEvmLog, VoteCastEvent, VoteCastWithParamsEvent,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VoteProjectionContext {
    pub contract_set_id: String,
    pub dao_code: String,
    pub governor_address: String,
    pub contracts: ChainContracts,
    pub read_plan_config: BatchReadPlanConfig,
}

#[derive(Clone, Debug, PartialEq)]
pub struct VoteProjectionEvent {
    pub log: NormalizedEvmLog,
    pub event: DecodedGovernorEvent,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VoteProjectionBatch {
    pub event_order: Vec<String>,
    pub vote_cast: Vec<VoteCastWrite>,
    pub vote_cast_with_params: Vec<VoteCastWithParamsWrite>,
    pub vote_cast_groups: Vec<VoteCastGroupWrite>,
    pub proposal_vote_totals: Vec<ProposalVoteTotalWrite>,
    pub contributor_vote_signals: Vec<ContributorVoteSignalWrite>,
    pub data_metric_delta: DataMetricVoteDelta,
    pub chain_read_plan: ChainReadPlan,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum VoteProjectionError {
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
pub struct VoteEventCommon {
    pub contract_set_id: String,
    pub chain_id: i32,
    pub dao_code: String,
    pub governor_address: String,
    pub token_address: String,
    pub contract_address: String,
    pub log_index: u64,
    pub transaction_index: u64,
    pub proposal_id: String,
    pub block_number: String,
    pub block_timestamp: Option<String>,
    pub transaction_hash: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VoteCastWrite {
    pub id: String,
    pub common: VoteEventCommon,
    pub voter: String,
    pub proposal_id: String,
    pub support: u8,
    pub weight: String,
    pub reason: String,
    pub block_number: String,
    pub block_timestamp: Option<String>,
    pub transaction_hash: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VoteCastWithParamsWrite {
    pub id: String,
    pub common: VoteEventCommon,
    pub voter: String,
    pub proposal_id: String,
    pub support: u8,
    pub weight: String,
    pub reason: String,
    pub params: String,
    pub block_number: String,
    pub block_timestamp: Option<String>,
    pub transaction_hash: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VoteCastGroupWrite {
    pub id: String,
    pub contract_set_id: String,
    pub chain_id: i32,
    pub dao_code: String,
    pub governor_address: String,
    pub contract_address: String,
    pub log_index: u64,
    pub transaction_index: u64,
    pub proposal_ref: String,
    pub kind: String,
    pub voter: String,
    pub ref_proposal_id: String,
    pub support: u8,
    pub weight: String,
    pub reason: String,
    pub params: Option<String>,
    pub block_number: String,
    pub block_timestamp: Option<String>,
    pub transaction_hash: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalVoteTotalWrite {
    pub proposal_ref: String,
    pub chain_id: i32,
    pub dao_code: String,
    pub governor_address: String,
    pub proposal_id: String,
    pub votes_count: i64,
    pub votes_with_params_count: i64,
    pub votes_without_params_count: i64,
    pub votes_weight_for_sum: String,
    pub votes_weight_against_sum: String,
    pub votes_weight_abstain_sum: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContributorVoteSignalWrite {
    pub id: String,
    pub contract_set_id: String,
    pub chain_id: i32,
    pub dao_code: String,
    pub governor_address: String,
    pub token_address: String,
    pub contract_address: String,
    pub log_index: u64,
    pub transaction_index: u64,
    pub voter: String,
    pub last_vote_block_number: String,
    pub last_vote_timestamp: Option<String>,
    pub transaction_hash: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DataMetricVoteDelta {
    pub votes_count: i64,
    pub votes_with_params_count: i64,
    pub votes_without_params_count: i64,
    pub votes_weight_for_sum: String,
    pub votes_weight_against_sum: String,
    pub votes_weight_abstain_sum: String,
}

impl Default for DataMetricVoteDelta {
    fn default() -> Self {
        Self {
            votes_count: 0,
            votes_with_params_count: 0,
            votes_without_params_count: 0,
            votes_weight_for_sum: "0".to_owned(),
            votes_weight_against_sum: "0".to_owned(),
            votes_weight_abstain_sum: "0".to_owned(),
        }
    }
}

pub trait VoteProjectionRepository {
    type Error;

    fn apply(&mut self, batch: &VoteProjectionBatch) -> Result<(), Self::Error>;
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct InMemoryVoteProjectionRepository {
    vote_cast: BTreeMap<String, VoteCastWrite>,
    vote_cast_with_params: BTreeMap<String, VoteCastWithParamsWrite>,
    vote_cast_groups: BTreeMap<String, VoteCastGroupWrite>,
    proposal_vote_totals: BTreeMap<String, ProposalVoteTotalWrite>,
    contributors: BTreeMap<String, ContributorVoteSignalWrite>,
    data_metric: DataMetricVoteDelta,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum VoteRepositoryWriteError {}

impl InMemoryVoteProjectionRepository {
    pub fn proposal_vote_totals(&self) -> &BTreeMap<String, ProposalVoteTotalWrite> {
        &self.proposal_vote_totals
    }

    pub fn data_metric(&self) -> &DataMetricVoteDelta {
        &self.data_metric
    }
}

impl VoteProjectionRepository for InMemoryVoteProjectionRepository {
    type Error = VoteRepositoryWriteError;

    fn apply(&mut self, batch: &VoteProjectionBatch) -> Result<(), Self::Error> {
        extend_map(&mut self.vote_cast, &batch.vote_cast, |row| row.id.clone());
        extend_map(
            &mut self.vote_cast_with_params,
            &batch.vote_cast_with_params,
            |row| row.id.clone(),
        );

        for group in &batch.vote_cast_groups {
            let old = self
                .vote_cast_groups
                .insert(group.id.clone(), group.clone());
            if old.as_ref() == Some(group) {
                continue;
            }
            if let Some(old) = old {
                self.apply_group_delta(&old, -1);
            }
            self.apply_group_delta(group, 1);
        }

        for signal in &batch.contributor_vote_signals {
            self.contributors
                .entry(signal.id.clone())
                .and_modify(|stored| {
                    if vote_signal_order(signal).cmp(&vote_signal_order(stored)) != Ordering::Less {
                        *stored = signal.clone();
                    }
                })
                .or_insert_with(|| signal.clone());
        }

        Ok(())
    }
}

impl InMemoryVoteProjectionRepository {
    fn apply_group_delta(&mut self, group: &VoteCastGroupWrite, direction: i64) {
        let total = self
            .proposal_vote_totals
            .entry(group.proposal_ref.clone())
            .or_insert_with(|| ProposalVoteTotalWrite {
                proposal_ref: group.proposal_ref.clone(),
                chain_id: group.chain_id,
                dao_code: group.dao_code.clone(),
                governor_address: group.governor_address.clone(),
                proposal_id: group.ref_proposal_id.clone(),
                votes_count: 0,
                votes_with_params_count: 0,
                votes_without_params_count: 0,
                votes_weight_for_sum: "0".to_owned(),
                votes_weight_against_sum: "0".to_owned(),
                votes_weight_abstain_sum: "0".to_owned(),
            });
        apply_total_delta(total, group, direction);
        apply_metric_delta(&mut self.data_metric, group, direction);
    }
}

pub fn project_vote_events(
    context: &VoteProjectionContext,
    events: Vec<VoteProjectionEvent>,
) -> Result<VoteProjectionBatch, VoteProjectionError> {
    let governor_address = normalize_identifier(&context.governor_address);
    let chain_id = validate_chain_ids(&events)?;
    let mut deduped: BTreeMap<String, VoteProjectionEvent> = BTreeMap::new();

    for event in events {
        if let Some(stored) = deduped.get(&event.log.id) {
            if stored != &event {
                return Err(VoteProjectionError::ConflictingDuplicateLog {
                    log_id: event.log.id,
                });
            }
            continue;
        }
        deduped.insert(event.log.id.clone(), event);
    }

    let mut ordered = deduped.into_values().collect::<Vec<_>>();
    ordered.sort_by_key(|event| {
        (
            event.log.block_number,
            event.log.transaction_index,
            event.log.log_index,
            event.log.id.clone(),
        )
    });

    let mut event_order = Vec::new();
    let mut vote_cast = Vec::new();
    let mut vote_cast_with_params = Vec::new();
    let mut vote_cast_groups = Vec::new();
    let mut proposal_vote_totals = BTreeMap::new();
    let mut contributor_vote_signals = BTreeMap::new();
    let mut data_metric_delta = DataMetricVoteDelta::default();
    let mut affected_proposals = BTreeMap::<String, u64>::new();

    for input in ordered {
        let Some(proposal_id) = proposal_id(&input.event) else {
            continue;
        };
        event_order.push(input.log.id.clone());
        affected_proposals
            .entry(proposal_id.to_owned())
            .and_modify(|block| *block = (*block).max(input.log.block_number))
            .or_insert(input.log.block_number);

        let common = common(context, &governor_address, &input.log, proposal_id);
        match &input.event {
            DecodedGovernorEvent::VoteCast(event) => {
                let row = vote_cast_write(&input.log.id, common.clone(), event);
                let group = vote_cast_group_without_params(&input.log.id, &common, event);
                add_group_to_totals(&mut proposal_vote_totals, &group);
                apply_metric_delta(&mut data_metric_delta, &group, 1);
                contributor_vote_signals.insert(
                    group.voter.clone(),
                    contributor_vote_signal(&common, &group.voter),
                );
                vote_cast.push(row);
                vote_cast_groups.push(group);
            }
            DecodedGovernorEvent::VoteCastWithParams(event) => {
                let row = vote_cast_with_params_write(&input.log.id, common.clone(), event);
                let group = vote_cast_group_with_params(&input.log.id, &common, event);
                add_group_to_totals(&mut proposal_vote_totals, &group);
                apply_metric_delta(&mut data_metric_delta, &group, 1);
                contributor_vote_signals.insert(
                    group.voter.clone(),
                    contributor_vote_signal(&common, &group.voter),
                );
                vote_cast_with_params.push(row);
                vote_cast_groups.push(group);
            }
            _ => {}
        }
    }

    let mut builder = ChainReadPlanBuilder::new(
        chain_id,
        context.contracts.clone(),
        context.read_plan_config,
    );
    for (proposal_id, block_number) in affected_proposals {
        builder.add_proposal_refresh(
            &proposal_id,
            block_number,
            ChainReadReason::ProposalLifecycleRefresh,
        );
    }

    Ok(VoteProjectionBatch {
        event_order,
        vote_cast,
        vote_cast_with_params,
        vote_cast_groups,
        proposal_vote_totals: proposal_vote_totals.into_values().collect(),
        contributor_vote_signals: contributor_vote_signals.into_values().collect(),
        data_metric_delta,
        chain_read_plan: builder.build(),
    })
}

fn common(
    context: &VoteProjectionContext,
    governor_address: &str,
    log: &NormalizedEvmLog,
    proposal_id: &str,
) -> VoteEventCommon {
    VoteEventCommon {
        contract_set_id: context.contract_set_id.clone(),
        chain_id: log.chain_id,
        dao_code: context.dao_code.clone(),
        governor_address: governor_address.to_owned(),
        token_address: normalize_identifier(&context.contracts.governor_token),
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

fn vote_cast_write(log_id: &str, common: VoteEventCommon, event: &VoteCastEvent) -> VoteCastWrite {
    VoteCastWrite {
        id: log_id.to_owned(),
        voter: normalize_identifier(&event.voter),
        proposal_id: event.proposal_id.clone(),
        support: event.support,
        weight: event.weight.clone(),
        reason: event.reason.clone(),
        block_number: common.block_number.clone(),
        block_timestamp: common.block_timestamp.clone(),
        transaction_hash: common.transaction_hash.clone(),
        common,
    }
}

fn vote_cast_with_params_write(
    log_id: &str,
    common: VoteEventCommon,
    event: &VoteCastWithParamsEvent,
) -> VoteCastWithParamsWrite {
    VoteCastWithParamsWrite {
        id: log_id.to_owned(),
        voter: normalize_identifier(&event.voter),
        proposal_id: event.proposal_id.clone(),
        support: event.support,
        weight: event.weight.clone(),
        reason: event.reason.clone(),
        params: event.params.clone(),
        block_number: common.block_number.clone(),
        block_timestamp: common.block_timestamp.clone(),
        transaction_hash: common.transaction_hash.clone(),
        common,
    }
}

fn vote_cast_group_without_params(
    log_id: &str,
    common: &VoteEventCommon,
    event: &VoteCastEvent,
) -> VoteCastGroupWrite {
    vote_cast_group(
        log_id,
        common,
        VoteCastGroupInput {
            kind: "vote-cast-without-params",
            voter: &event.voter,
            support: event.support,
            weight: &event.weight,
            reason: &event.reason,
            params: None,
        },
    )
}

fn vote_cast_group_with_params(
    log_id: &str,
    common: &VoteEventCommon,
    event: &VoteCastWithParamsEvent,
) -> VoteCastGroupWrite {
    vote_cast_group(
        log_id,
        common,
        VoteCastGroupInput {
            kind: "vote-cast-with-params",
            voter: &event.voter,
            support: event.support,
            weight: &event.weight,
            reason: &event.reason,
            params: Some(event.params.clone()),
        },
    )
}

struct VoteCastGroupInput<'a> {
    kind: &'a str,
    voter: &'a str,
    support: u8,
    weight: &'a str,
    reason: &'a str,
    params: Option<String>,
}

fn vote_cast_group(
    log_id: &str,
    common: &VoteEventCommon,
    input: VoteCastGroupInput<'_>,
) -> VoteCastGroupWrite {
    VoteCastGroupWrite {
        id: log_id.to_owned(),
        contract_set_id: common.contract_set_id.clone(),
        chain_id: common.chain_id,
        dao_code: common.dao_code.clone(),
        governor_address: common.governor_address.clone(),
        contract_address: common.contract_address.clone(),
        log_index: common.log_index,
        transaction_index: common.transaction_index,
        proposal_ref: proposal_ref(
            &common.governor_address,
            &common.proposal_id,
            common.chain_id,
        ),
        kind: input.kind.to_owned(),
        voter: normalize_identifier(input.voter),
        ref_proposal_id: common.proposal_id.clone(),
        support: input.support,
        weight: input.weight.to_owned(),
        reason: input.reason.to_owned(),
        params: input.params,
        block_number: common.block_number.clone(),
        block_timestamp: common.block_timestamp.clone(),
        transaction_hash: common.transaction_hash.clone(),
    }
}

fn contributor_vote_signal(common: &VoteEventCommon, voter: &str) -> ContributorVoteSignalWrite {
    ContributorVoteSignalWrite {
        id: normalize_identifier(voter),
        contract_set_id: common.contract_set_id.clone(),
        chain_id: common.chain_id,
        dao_code: common.dao_code.clone(),
        governor_address: common.governor_address.clone(),
        token_address: common.token_address.clone(),
        contract_address: common.contract_address.clone(),
        log_index: common.log_index,
        transaction_index: common.transaction_index,
        voter: normalize_identifier(voter),
        last_vote_block_number: common.block_number.clone(),
        last_vote_timestamp: common.block_timestamp.clone(),
        transaction_hash: common.transaction_hash.clone(),
    }
}

fn add_group_to_totals(
    proposal_vote_totals: &mut BTreeMap<String, ProposalVoteTotalWrite>,
    group: &VoteCastGroupWrite,
) {
    let total = proposal_vote_totals
        .entry(group.proposal_ref.clone())
        .or_insert_with(|| ProposalVoteTotalWrite {
            proposal_ref: group.proposal_ref.clone(),
            chain_id: group.chain_id,
            dao_code: group.dao_code.clone(),
            governor_address: group.governor_address.clone(),
            proposal_id: group.ref_proposal_id.clone(),
            votes_count: 0,
            votes_with_params_count: 0,
            votes_without_params_count: 0,
            votes_weight_for_sum: "0".to_owned(),
            votes_weight_against_sum: "0".to_owned(),
            votes_weight_abstain_sum: "0".to_owned(),
        });
    apply_total_delta(total, group, 1);
}

fn apply_total_delta(
    total: &mut ProposalVoteTotalWrite,
    group: &VoteCastGroupWrite,
    direction: i64,
) {
    total.votes_count += direction;
    match group.kind.as_str() {
        "vote-cast-with-params" => total.votes_with_params_count += direction,
        "vote-cast-without-params" => total.votes_without_params_count += direction,
        _ => {}
    }
    apply_support_weight_delta(
        group.support,
        &group.weight,
        direction,
        &mut total.votes_weight_for_sum,
        &mut total.votes_weight_against_sum,
        &mut total.votes_weight_abstain_sum,
    );
}

fn apply_metric_delta(
    metric: &mut DataMetricVoteDelta,
    group: &VoteCastGroupWrite,
    direction: i64,
) {
    metric.votes_count += direction;
    match group.kind.as_str() {
        "vote-cast-with-params" => metric.votes_with_params_count += direction,
        "vote-cast-without-params" => metric.votes_without_params_count += direction,
        _ => {}
    }
    apply_support_weight_delta(
        group.support,
        &group.weight,
        direction,
        &mut metric.votes_weight_for_sum,
        &mut metric.votes_weight_against_sum,
        &mut metric.votes_weight_abstain_sum,
    );
}

fn apply_support_weight_delta(
    support: u8,
    weight: &str,
    direction: i64,
    for_sum: &mut String,
    against_sum: &mut String,
    abstain_sum: &mut String,
) {
    let target = match support {
        0 => against_sum,
        1 => for_sum,
        2 => abstain_sum,
        _ => return,
    };
    if direction >= 0 {
        *target = add_decimal_strings(target, weight);
    } else {
        *target = subtract_decimal_strings(target, weight);
    }
}

fn validate_chain_ids(events: &[VoteProjectionEvent]) -> Result<i32, VoteProjectionError> {
    let Some(first) = events.first() else {
        return Ok(0);
    };
    for event in events.iter().skip(1) {
        if event.log.chain_id != first.log.chain_id {
            return Err(VoteProjectionError::MixedChainIds {
                expected: first.log.chain_id,
                actual: event.log.chain_id,
                log_id: event.log.id.clone(),
            });
        }
    }
    Ok(first.log.chain_id)
}

fn proposal_id(event: &DecodedGovernorEvent) -> Option<&str> {
    match event {
        DecodedGovernorEvent::VoteCast(event) => Some(&event.proposal_id),
        DecodedGovernorEvent::VoteCastWithParams(event) => Some(&event.proposal_id),
        _ => None,
    }
}

fn vote_signal_order(signal: &ContributorVoteSignalWrite) -> (u64, u64, u64, String) {
    (
        signal
            .last_vote_block_number
            .parse::<u64>()
            .unwrap_or_default(),
        signal.transaction_index,
        signal.log_index,
        signal.transaction_hash.clone(),
    )
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

fn extend_map<T: Clone>(target: &mut BTreeMap<String, T>, rows: &[T], key: impl Fn(&T) -> String) {
    for row in rows {
        target.insert(key(row), row.clone());
    }
}

fn normalize_decimal(value: &str) -> String {
    let trimmed = value.trim_start_matches('0');
    if trimmed.is_empty() {
        "0".to_owned()
    } else {
        trimmed.to_owned()
    }
}

fn add_decimal_strings(left: &str, right: &str) -> String {
    let mut carry = 0u8;
    let mut output = Vec::new();
    let mut left = left.as_bytes().iter().rev();
    let mut right = right.as_bytes().iter().rev();

    loop {
        let left_digit = left.next().map(|digit| digit - b'0');
        let right_digit = right.next().map(|digit| digit - b'0');
        if left_digit.is_none() && right_digit.is_none() && carry == 0 {
            break;
        }
        let sum = left_digit.unwrap_or_default() + right_digit.unwrap_or_default() + carry;
        output.push(b'0' + (sum % 10));
        carry = sum / 10;
    }

    output.reverse();
    normalize_decimal(&String::from_utf8(output).expect("decimal digits"))
}

fn subtract_decimal_strings(left: &str, right: &str) -> String {
    if compare_decimal_strings(left, right) == Ordering::Less {
        return "0".to_owned();
    }

    let mut borrow = 0i16;
    let mut output = Vec::new();
    let mut left = left.as_bytes().iter().rev();
    let mut right = right.as_bytes().iter().rev();

    while let Some(left_digit) = left.next().map(|digit| (digit - b'0') as i16) {
        let right_digit = right
            .next()
            .map(|digit| (digit - b'0') as i16)
            .unwrap_or_default();
        let mut diff = left_digit - borrow - right_digit;
        if diff < 0 {
            diff += 10;
            borrow = 1;
        } else {
            borrow = 0;
        }
        output.push(b'0' + diff as u8);
    }

    output.reverse();
    normalize_decimal(&String::from_utf8(output).expect("decimal digits"))
}

fn compare_decimal_strings(left: &str, right: &str) -> Ordering {
    let left = normalize_decimal(left);
    let right = normalize_decimal(right);
    left.len()
        .cmp(&right.len())
        .then_with(|| left.as_str().cmp(right.as_str()))
}
