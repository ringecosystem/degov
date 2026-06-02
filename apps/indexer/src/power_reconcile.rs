use std::collections::{BTreeMap, BTreeSet};

use crate::{
    BatchReadPlanConfig, ChainContracts, ChainReadPlan, ChainReadPlanBuilder, ChainReadReason,
    DecodedDaoEvent, DecodedGovernorEvent, DecodedTokenEvent,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PowerReconcileContext {
    pub dao_code: String,
    pub chain_id: i32,
    pub contracts: ChainContracts,
    pub from_block: u64,
    pub to_block: u64,
    pub target_height: Option<u64>,
    pub read_plan_config: BatchReadPlanConfig,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PowerReconcileEvent {
    pub block_number: u64,
    pub transaction_hash: String,
    pub event: DecodedDaoEvent,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum PowerActivityReason {
    DelegateChanged,
    DelegateVotesChanged,
    Transfer,
    VoteCast,
}

impl PowerActivityReason {
    fn label(self) -> &'static str {
        match self {
            Self::DelegateChanged => "delegate_changed",
            Self::DelegateVotesChanged => "delegate_votes_changed",
            Self::Transfer => "transfer",
            Self::VoteCast => "vote_cast",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PowerRefreshReadSource {
    OnchainRpc,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PowerRefreshStatus {
    Pending,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PowerRefreshStatusRecord {
    pub dao_code: String,
    pub chain_id: i32,
    pub governor: String,
    pub governor_token: String,
    pub account: String,
    pub source: PowerRefreshReadSource,
    pub status: PowerRefreshStatus,
    pub refresh_balance: bool,
    pub refresh_power: bool,
    pub reason: String,
    pub first_seen_activity_block: u64,
    pub last_seen_activity_block: u64,
    pub last_seen_transaction_hash: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PowerReconcileCandidate {
    pub dao_code: String,
    pub chain_id: i32,
    pub governor: String,
    pub governor_token: String,
    pub account: String,
    pub latest_activity_block: u64,
    pub reasons: BTreeSet<PowerActivityReason>,
    pub observed_log_power: Option<String>,
    pub status: PowerRefreshStatusRecord,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PowerFreshnessState {
    Fresh,
    SyncLag { lag_blocks: u64 },
    UnknownTarget,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct PowerReconcileMetrics {
    pub candidate_count: usize,
    pub deduped_count: usize,
    pub read_count: usize,
    pub processed_count: usize,
    pub failed_count: usize,
    pub sync_lag_blocks: Option<u64>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PowerReconcilePlan {
    pub context: PowerReconcileContext,
    pub candidates: Vec<PowerReconcileCandidate>,
    pub chain_read_plan: ChainReadPlan,
    pub freshness_state: PowerFreshnessState,
    pub metrics: PowerReconcileMetrics,
}

pub fn plan_power_reconcile(
    context: &PowerReconcileContext,
    events: &[PowerReconcileEvent],
) -> PowerReconcilePlan {
    let mut candidate_count = 0;
    let mut candidates = BTreeMap::<String, PendingPowerCandidate>::new();

    for event in events {
        for (account, reason) in affected_accounts(&event.event) {
            if is_zero_address(&account) {
                continue;
            }

            candidate_count += 1;
            let normalized_account = normalize_identifier(&account);
            candidates
                .entry(normalized_account.clone())
                .and_modify(|candidate| {
                    candidate.first_seen_activity_block =
                        candidate.first_seen_activity_block.min(event.block_number);
                    if event.block_number >= candidate.latest_activity_block {
                        candidate.latest_activity_block = event.block_number;
                        candidate.last_seen_transaction_hash = event.transaction_hash.clone();
                    }
                    candidate.reasons.insert(reason);
                })
                .or_insert_with(|| PendingPowerCandidate {
                    account: normalized_account,
                    first_seen_activity_block: event.block_number,
                    latest_activity_block: event.block_number,
                    last_seen_transaction_hash: event.transaction_hash.clone(),
                    reasons: [reason].into(),
                });
        }
    }

    let mut read_plan_builder = ChainReadPlanBuilder::new(
        context.chain_id,
        context.contracts.clone(),
        context.read_plan_config,
    );
    let candidates = candidates
        .into_values()
        .map(|candidate| {
            read_plan_builder.add_account_power_refresh(
                &candidate.account,
                candidate.latest_activity_block,
                ChainReadReason::TokenActivityPowerRefresh,
            );
            candidate.into_reconcile_candidate(context)
        })
        .collect::<Vec<_>>();
    let chain_read_plan = read_plan_builder.build();
    let freshness_state = freshness_state(context);
    let sync_lag_blocks = match freshness_state {
        PowerFreshnessState::SyncLag { lag_blocks } => Some(lag_blocks),
        PowerFreshnessState::Fresh | PowerFreshnessState::UnknownTarget => None,
    };

    PowerReconcilePlan {
        context: context.clone(),
        metrics: PowerReconcileMetrics {
            candidate_count,
            deduped_count: candidate_count.saturating_sub(candidates.len()),
            read_count: chain_read_plan.reads.len(),
            processed_count: 0,
            failed_count: 0,
            sync_lag_blocks,
        },
        candidates,
        chain_read_plan,
        freshness_state,
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct PendingPowerCandidate {
    account: String,
    first_seen_activity_block: u64,
    latest_activity_block: u64,
    last_seen_transaction_hash: String,
    reasons: BTreeSet<PowerActivityReason>,
}

impl PendingPowerCandidate {
    fn into_reconcile_candidate(self, context: &PowerReconcileContext) -> PowerReconcileCandidate {
        let governor = normalize_identifier(&context.contracts.governor);
        let governor_token = normalize_identifier(&context.contracts.governor_token);
        let reason = reason_label(&self.reasons);

        PowerReconcileCandidate {
            dao_code: context.dao_code.clone(),
            chain_id: context.chain_id,
            governor: governor.clone(),
            governor_token: governor_token.clone(),
            account: self.account.clone(),
            latest_activity_block: self.latest_activity_block,
            reasons: self.reasons,
            observed_log_power: None,
            status: PowerRefreshStatusRecord {
                dao_code: context.dao_code.clone(),
                chain_id: context.chain_id,
                governor,
                governor_token,
                account: self.account,
                source: PowerRefreshReadSource::OnchainRpc,
                status: PowerRefreshStatus::Pending,
                refresh_balance: false,
                refresh_power: true,
                reason,
                first_seen_activity_block: self.first_seen_activity_block,
                last_seen_activity_block: self.latest_activity_block,
                last_seen_transaction_hash: self.last_seen_transaction_hash,
            },
        }
    }
}

fn affected_accounts(event: &DecodedDaoEvent) -> Vec<(String, PowerActivityReason)> {
    match event {
        DecodedDaoEvent::Token(DecodedTokenEvent::Transfer(event)) => vec![
            (event.from.clone(), PowerActivityReason::Transfer),
            (event.to.clone(), PowerActivityReason::Transfer),
        ],
        DecodedDaoEvent::Token(DecodedTokenEvent::DelegateChanged(event)) => vec![
            (
                event.delegator.clone(),
                PowerActivityReason::DelegateChanged,
            ),
            (
                event.from_delegate.clone(),
                PowerActivityReason::DelegateChanged,
            ),
            (
                event.to_delegate.clone(),
                PowerActivityReason::DelegateChanged,
            ),
        ],
        DecodedDaoEvent::Token(DecodedTokenEvent::DelegateVotesChanged(event)) => {
            vec![(
                event.delegate.clone(),
                PowerActivityReason::DelegateVotesChanged,
            )]
        }
        DecodedDaoEvent::Governor(DecodedGovernorEvent::VoteCast(event)) => {
            vec![(event.voter.clone(), PowerActivityReason::VoteCast)]
        }
        DecodedDaoEvent::Governor(DecodedGovernorEvent::VoteCastWithParams(event)) => {
            vec![(event.voter.clone(), PowerActivityReason::VoteCast)]
        }
        DecodedDaoEvent::Governor(_)
        | DecodedDaoEvent::Timelock(_)
        | DecodedDaoEvent::UnsupportedTopic(_) => Vec::new(),
    }
}

fn freshness_state(context: &PowerReconcileContext) -> PowerFreshnessState {
    match context.target_height {
        Some(target_height) if context.to_block >= target_height => PowerFreshnessState::Fresh,
        Some(target_height) => PowerFreshnessState::SyncLag {
            lag_blocks: target_height - context.to_block,
        },
        None => PowerFreshnessState::UnknownTarget,
    }
}

fn reason_label(reasons: &BTreeSet<PowerActivityReason>) -> String {
    reasons
        .iter()
        .map(|reason| reason.label())
        .collect::<Vec<_>>()
        .join(",")
}

fn is_zero_address(account: &str) -> bool {
    normalize_identifier(account) == "0x0000000000000000000000000000000000000000"
}

fn normalize_identifier(value: &str) -> String {
    value.to_ascii_lowercase()
}
