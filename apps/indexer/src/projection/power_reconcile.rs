use std::collections::{BTreeMap, BTreeSet};

use crate::{
    BatchReadPlanConfig, ChainContracts, ChainReadMethod, ChainReadPlan, ChainReadPlanBuilder,
    ChainReadReason, DecodedDaoEvent, DecodedTokenEvent,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PowerReconcileContext {
    pub contract_set_id: String,
    pub dao_code: String,
    pub chain_id: i32,
    pub contracts: ChainContracts,
    pub from_block: u64,
    pub to_block: u64,
    pub target_height: Option<u64>,
    pub read_plan_config: BatchReadPlanConfig,
    pub current_power_method: ChainReadMethod,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PowerReconcileEvent {
    pub block_number: u64,
    pub block_timestamp_ms: Option<u64>,
    pub transaction_hash: String,
    pub transaction_index: u64,
    pub log_index: u64,
    pub event: DecodedDaoEvent,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum PowerActivityReason {
    DelegateChanged,
    DelegateVotesChanged,
    Transfer,
}

impl PowerActivityReason {
    fn label(self) -> &'static str {
        match self {
            Self::DelegateChanged => "delegate-change",
            Self::DelegateVotesChanged => "delegate-votes-changed",
            Self::Transfer => "transfer",
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
    pub contract_set_id: String,
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
    pub last_seen_block_timestamp_ms: Option<u64>,
    pub last_seen_transaction_hash: String,
    pub last_seen_transaction_index: u64,
    pub last_seen_log_index: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PowerReconcileCandidate {
    pub contract_set_id: String,
    pub dao_code: String,
    pub chain_id: i32,
    pub governor: String,
    pub governor_token: String,
    pub account: String,
    pub latest_activity_block: u64,
    pub latest_transaction_index: u64,
    pub latest_log_index: u64,
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
                    if event.log_position() >= candidate.latest_position() {
                        candidate.latest_activity_block = event.block_number;
                        candidate.latest_transaction_index = event.transaction_index;
                        candidate.latest_log_index = event.log_index;
                        candidate.last_seen_block_timestamp_ms = event.block_timestamp_ms;
                        candidate.last_seen_transaction_hash = event.transaction_hash.clone();
                    }
                    candidate.reasons.insert(reason);
                })
                .or_insert_with(|| PendingPowerCandidate {
                    account: normalized_account,
                    first_seen_activity_block: event.block_number,
                    latest_activity_block: event.block_number,
                    latest_transaction_index: event.transaction_index,
                    latest_log_index: event.log_index,
                    last_seen_block_timestamp_ms: event.block_timestamp_ms,
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
            if candidate.refresh_balance() {
                read_plan_builder.add_account_balance_refresh(
                    &candidate.account,
                    candidate.latest_activity_block,
                    ChainReadReason::TokenActivityPowerRefresh,
                );
            }
            read_plan_builder.add_account_power_refresh_with_method(
                &candidate.account,
                candidate.latest_activity_block,
                ChainReadReason::TokenActivityPowerRefresh,
                context.current_power_method,
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
    latest_transaction_index: u64,
    latest_log_index: u64,
    last_seen_block_timestamp_ms: Option<u64>,
    last_seen_transaction_hash: String,
    reasons: BTreeSet<PowerActivityReason>,
}

impl PendingPowerCandidate {
    fn into_reconcile_candidate(self, context: &PowerReconcileContext) -> PowerReconcileCandidate {
        let governor = normalize_identifier(&context.contracts.governor);
        let governor_token = normalize_identifier(&context.contracts.governor_token);
        let reason = reason_label(&self.reasons);
        let refresh_balance = self.refresh_balance();

        PowerReconcileCandidate {
            contract_set_id: context.contract_set_id.clone(),
            dao_code: context.dao_code.clone(),
            chain_id: context.chain_id,
            governor: governor.clone(),
            governor_token: governor_token.clone(),
            account: self.account.clone(),
            latest_activity_block: self.latest_activity_block,
            latest_transaction_index: self.latest_transaction_index,
            latest_log_index: self.latest_log_index,
            reasons: self.reasons,
            observed_log_power: None,
            status: PowerRefreshStatusRecord {
                contract_set_id: context.contract_set_id.clone(),
                dao_code: context.dao_code.clone(),
                chain_id: context.chain_id,
                governor,
                governor_token,
                account: self.account,
                source: PowerRefreshReadSource::OnchainRpc,
                status: PowerRefreshStatus::Pending,
                refresh_balance,
                refresh_power: true,
                reason,
                first_seen_activity_block: self.first_seen_activity_block,
                last_seen_activity_block: self.latest_activity_block,
                last_seen_block_timestamp_ms: self.last_seen_block_timestamp_ms,
                last_seen_transaction_hash: self.last_seen_transaction_hash,
                last_seen_transaction_index: self.latest_transaction_index,
                last_seen_log_index: self.latest_log_index,
            },
        }
    }

    fn latest_position(&self) -> (u64, u64, u64) {
        (
            self.latest_activity_block,
            self.latest_transaction_index,
            self.latest_log_index,
        )
    }

    fn refresh_balance(&self) -> bool {
        self.reasons.contains(&PowerActivityReason::DelegateChanged)
            || self.reasons.contains(&PowerActivityReason::Transfer)
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
        .join("+")
}

fn is_zero_address(account: &str) -> bool {
    normalize_identifier(account) == "0x0000000000000000000000000000000000000000"
}

fn normalize_identifier(value: &str) -> String {
    value.to_ascii_lowercase()
}

impl PowerReconcileEvent {
    fn log_position(&self) -> (u64, u64, u64) {
        (self.block_number, self.transaction_index, self.log_index)
    }
}
