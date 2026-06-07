use std::collections::{BTreeMap, BTreeSet};
use std::time::Duration;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ChainContracts {
    pub governor: String,
    pub governor_token: String,
    pub timelock: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BatchReadPlanConfig {
    pub max_concurrency: usize,
    pub multicall_batch_size: usize,
}

impl Default for BatchReadPlanConfig {
    fn default() -> Self {
        Self {
            max_concurrency: 8,
            multicall_batch_size: 50,
        }
    }
}

impl BatchReadPlanConfig {
    pub fn validated(self) -> Self {
        Self {
            max_concurrency: self.max_concurrency.max(1),
            multicall_batch_size: self.multicall_batch_size.max(1),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum BlockReadMode {
    Fresh,
    Latest,
    Safe,
    Finalized,
    AtBlock(u64),
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum ChainReadMethod {
    CountingMode,
    ClockMode,
    Decimals,
    Delegates,
    BalanceOf,
    GetVotes,
    CurrentVotes,
    GetPastVotes,
    GetPriorVotes,
    ProposalSnapshot,
    ProposalDeadline,
    State,
    Quorum,
    TimelockEta,
    TimelockOperationState,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum ChainReadReason {
    CapabilityDetection,
    TokenActivityPowerRefresh,
    ProposalSnapshotPower,
    ProposalLifecycleRefresh,
    TimelockLifecycleRefresh,
    OptionalEnrichment,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReadRequirement {
    Required,
    Optional,
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct ChainReadKey {
    pub chain_id: i32,
    pub contract_address: String,
    pub method: ChainReadMethod,
    pub args: Vec<String>,
    pub block_mode: BlockReadMode,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct ChainReadMetadata {
    pub accounts: BTreeSet<String>,
    pub proposal_ids: BTreeSet<String>,
    pub operation_ids: BTreeSet<String>,
    pub reasons: BTreeSet<ChainReadReason>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ChainReadRequest {
    pub key: ChainReadKey,
    pub metadata: ChainReadMetadata,
    pub requirement: ReadRequirement,
    pub activity_blocks: Vec<u64>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MulticallReadGroup {
    pub chain_id: i32,
    pub contract_address: String,
    pub block_mode: BlockReadMode,
    pub read_indexes: Vec<usize>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ChainReadExecutionPlan {
    pub max_concurrency: usize,
    pub multicall_groups: Vec<MulticallReadGroup>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ChainReadPlan {
    pub reads: Vec<ChainReadRequest>,
    pub execution: ChainReadExecutionPlan,
    pub metrics: ChainReadMetrics,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct ChainReadMetrics {
    pub requested_reads: usize,
    pub deduped_reads: usize,
    pub executed_rpc_calls: usize,
    pub multicall_batch_size: usize,
    pub failures: usize,
    pub retries: usize,
    pub latency_ms: u128,
    pub cache_hits: usize,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ChainReadRetryPolicy {
    pub max_attempts: u32,
    pub initial_backoff: Duration,
    pub max_backoff: Duration,
    pub request_timeout: Duration,
}

impl Default for ChainReadRetryPolicy {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            initial_backoff: Duration::from_millis(250),
            max_backoff: Duration::from_secs(5),
            request_timeout: Duration::from_secs(15),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ChainReadFailureKind {
    Timeout,
    RateLimited,
    Transport,
    Reverted,
    Unsupported,
    Decode,
    Internal,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ChainReadFailure {
    pub key: ChainReadKey,
    pub kind: ChainReadFailureKind,
    pub retryable: bool,
    pub message: String,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct PartialChainReadFailureReport {
    pub required_failures: Vec<ChainReadFailure>,
    pub optional_failures: Vec<ChainReadFailure>,
}

impl PartialChainReadFailureReport {
    pub fn can_commit_projection_writes(&self) -> bool {
        self.required_failures.is_empty()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ChainReadCapability {
    Supported {
        method: ChainReadMethod,
    },
    Unsupported {
        method: ChainReadMethod,
    },
    Fallback {
        requested: ChainReadMethod,
        fallback: ChainReadMethod,
    },
}

pub trait ChainTool {
    fn execute_read_plan(
        &self,
        plan: &ChainReadPlan,
    ) -> Result<ChainReadExecutionReport, PartialChainReadFailureReport>;
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct ChainReadExecutionReport {
    pub metrics: ChainReadMetrics,
    pub capabilities: Vec<ChainReadCapability>,
    pub results: Vec<ChainReadResult>,
    pub partial_failures: PartialChainReadFailureReport,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ChainReadResult {
    pub read_index: usize,
    pub key: ChainReadKey,
    pub value: ChainReadValue,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ChainReadValue {
    Null,
    Bool(bool),
    Integer(String),
    String(String),
    Bytes(String),
    Array(Vec<ChainReadValue>),
    Object(BTreeMap<String, ChainReadValue>),
}

pub struct ChainReadPlanBuilder {
    chain_id: i32,
    contracts: ChainContracts,
    config: BatchReadPlanConfig,
    requested_reads: usize,
    reads: BTreeMap<ChainReadKey, PendingChainRead>,
}

impl ChainReadPlanBuilder {
    pub fn new(chain_id: i32, contracts: ChainContracts, config: BatchReadPlanConfig) -> Self {
        Self {
            chain_id,
            contracts: normalize_contracts(contracts),
            config: config.validated(),
            requested_reads: 0,
            reads: BTreeMap::new(),
        }
    }

    pub fn capability_detection_plan(
        chain_id: i32,
        contracts: ChainContracts,
        config: BatchReadPlanConfig,
    ) -> ChainReadPlan {
        let mut builder = Self::new(chain_id, contracts, config);
        builder.add_governor_capability(ChainReadMethod::CountingMode, vec![]);
        builder.add_governor_capability(ChainReadMethod::ClockMode, vec![]);
        builder.add_governor_capability(ChainReadMethod::ProposalSnapshot, vec!["0"]);
        builder.add_governor_capability(ChainReadMethod::ProposalDeadline, vec!["0"]);
        builder.add_governor_capability(ChainReadMethod::State, vec!["0"]);
        builder.add_governor_capability(ChainReadMethod::Quorum, vec!["0"]);
        builder.add_token_capability(ChainReadMethod::Decimals, vec![]);
        builder.add_token_capability(
            ChainReadMethod::Delegates,
            vec!["0x0000000000000000000000000000000000000000"],
        );
        builder.add_token_capability(
            ChainReadMethod::BalanceOf,
            vec!["0x0000000000000000000000000000000000000000"],
        );
        builder.add_token_capability(
            ChainReadMethod::GetVotes,
            vec!["0x0000000000000000000000000000000000000000"],
        );
        builder.add_token_capability(
            ChainReadMethod::CurrentVotes,
            vec!["0x0000000000000000000000000000000000000000"],
        );
        builder.add_token_capability(
            ChainReadMethod::GetPastVotes,
            vec!["0x0000000000000000000000000000000000000000", "0"],
        );
        builder.add_token_capability(
            ChainReadMethod::GetPriorVotes,
            vec!["0x0000000000000000000000000000000000000000", "0"],
        );
        builder.add_timelock_capability(ChainReadMethod::TimelockEta, vec!["0x00"]);
        builder.add_timelock_capability(ChainReadMethod::TimelockOperationState, vec!["0x00"]);
        builder.add_timelock_capability(ChainReadMethod::TimelockEta, vec!["0x00"]);
        builder.build()
    }

    pub fn add_account_power_refresh(
        &mut self,
        account: &str,
        activity_block: u64,
        reason: ChainReadReason,
    ) {
        self.add_account_power_refresh_with_method(
            account,
            activity_block,
            reason,
            ChainReadMethod::GetVotes,
        );
    }

    pub fn add_account_power_refresh_with_method(
        &mut self,
        account: &str,
        activity_block: u64,
        reason: ChainReadReason,
        method: ChainReadMethod,
    ) {
        self.add_account_power_refresh_with_method_and_block_mode(
            account,
            activity_block,
            reason,
            method,
            BlockReadMode::Safe,
        );
    }

    pub fn add_account_latest_power_refresh_with_method(
        &mut self,
        account: &str,
        activity_block: u64,
        reason: ChainReadReason,
        method: ChainReadMethod,
    ) {
        self.add_account_power_refresh_with_method_and_block_mode(
            account,
            activity_block,
            reason,
            method,
            BlockReadMode::Latest,
        );
    }

    fn add_account_power_refresh_with_method_and_block_mode(
        &mut self,
        account: &str,
        activity_block: u64,
        reason: ChainReadReason,
        method: ChainReadMethod,
        block_mode: BlockReadMode,
    ) {
        let account = normalize_identifier(account);
        self.add_required_read(ChainReadDraft {
            contract_address: self.contracts.governor_token.clone(),
            method,
            args: vec![account.clone()],
            block_mode,
            account: Some(account),
            proposal_id: None,
            operation_id: None,
            reason,
            activity_block: Some(activity_block),
        });
    }

    pub fn add_account_balance_refresh(
        &mut self,
        account: &str,
        activity_block: u64,
        reason: ChainReadReason,
    ) {
        let account = normalize_identifier(account);
        self.add_required_read(ChainReadDraft {
            contract_address: self.contracts.governor_token.clone(),
            method: ChainReadMethod::BalanceOf,
            args: vec![account.clone()],
            block_mode: BlockReadMode::Safe,
            account: Some(account),
            proposal_id: None,
            operation_id: None,
            reason,
            activity_block: Some(activity_block),
        });
    }

    pub fn add_account_past_power(
        &mut self,
        account: &str,
        snapshot_block: u64,
        reason: ChainReadReason,
    ) {
        let account = normalize_identifier(account);
        self.add_required_read(ChainReadDraft {
            contract_address: self.contracts.governor_token.clone(),
            method: ChainReadMethod::GetPastVotes,
            args: vec![account.clone(), snapshot_block.to_string()],
            block_mode: BlockReadMode::AtBlock(snapshot_block),
            account: Some(account),
            proposal_id: None,
            operation_id: None,
            reason,
            activity_block: Some(snapshot_block),
        });
    }

    pub fn add_proposal_refresh(
        &mut self,
        proposal_id: &str,
        activity_block: u64,
        reason: ChainReadReason,
    ) {
        let proposal_id = normalize_identifier(proposal_id);
        for method in [
            ChainReadMethod::ProposalSnapshot,
            ChainReadMethod::ProposalDeadline,
            ChainReadMethod::State,
        ] {
            self.add_required_read(ChainReadDraft {
                contract_address: self.contracts.governor.clone(),
                method,
                args: vec![proposal_id.clone()],
                block_mode: BlockReadMode::Safe,
                account: None,
                proposal_id: Some(proposal_id.clone()),
                operation_id: None,
                reason,
                activity_block: Some(activity_block),
            });
        }
    }

    pub fn add_timelock_operation_refresh(
        &mut self,
        operation_id: &str,
        activity_block: u64,
        reason: ChainReadReason,
    ) {
        let operation_id = normalize_identifier(operation_id);
        self.add_required_read(ChainReadDraft {
            contract_address: self.contracts.timelock.clone(),
            method: ChainReadMethod::TimelockOperationState,
            args: vec![operation_id.clone()],
            block_mode: BlockReadMode::Safe,
            account: None,
            proposal_id: None,
            operation_id: Some(operation_id),
            reason,
            activity_block: Some(activity_block),
        });
    }

    pub fn add_optional_enrichment_read(
        &mut self,
        contract_address: String,
        method: ChainReadMethod,
        args: Vec<String>,
        block_mode: BlockReadMode,
    ) {
        self.add_read(
            ChainReadDraft {
                contract_address,
                method,
                args,
                block_mode,
                account: None,
                proposal_id: None,
                operation_id: None,
                reason: ChainReadReason::OptionalEnrichment,
                activity_block: None,
            },
            ReadRequirement::Optional,
        );
    }

    pub fn build(self) -> ChainReadPlan {
        let reads = self
            .reads
            .into_iter()
            .map(|(key, read)| read.into_request(key))
            .collect::<Vec<_>>();
        let execution = ChainReadExecutionPlan {
            max_concurrency: self.config.max_concurrency,
            multicall_groups: build_multicall_groups(&reads, self.config.multicall_batch_size),
        };
        let metrics = ChainReadMetrics {
            requested_reads: self.requested_reads,
            deduped_reads: self.requested_reads.saturating_sub(reads.len()),
            multicall_batch_size: self.config.multicall_batch_size,
            ..ChainReadMetrics::default()
        };

        ChainReadPlan {
            reads,
            execution,
            metrics,
        }
    }

    fn add_governor_capability(&mut self, method: ChainReadMethod, args: Vec<&str>) {
        self.add_required_read(ChainReadDraft {
            contract_address: self.contracts.governor.clone(),
            method,
            args: args.into_iter().map(str::to_owned).collect(),
            block_mode: BlockReadMode::Fresh,
            account: None,
            proposal_id: Some("0".to_owned()),
            operation_id: None,
            reason: ChainReadReason::CapabilityDetection,
            activity_block: None,
        });
    }

    fn add_token_capability(&mut self, method: ChainReadMethod, args: Vec<&str>) {
        self.add_required_read(ChainReadDraft {
            contract_address: self.contracts.governor_token.clone(),
            method,
            args: args.into_iter().map(str::to_owned).collect(),
            block_mode: BlockReadMode::Fresh,
            account: None,
            proposal_id: None,
            operation_id: None,
            reason: ChainReadReason::CapabilityDetection,
            activity_block: None,
        });
    }

    fn add_timelock_capability(&mut self, method: ChainReadMethod, args: Vec<&str>) {
        self.add_required_read(ChainReadDraft {
            contract_address: self.contracts.timelock.clone(),
            method,
            args: args.into_iter().map(str::to_owned).collect(),
            block_mode: BlockReadMode::Fresh,
            account: None,
            proposal_id: None,
            operation_id: Some("0x00".to_owned()),
            reason: ChainReadReason::CapabilityDetection,
            activity_block: None,
        });
    }

    fn add_required_read(&mut self, draft: ChainReadDraft) {
        self.add_read(draft, ReadRequirement::Required);
    }

    fn add_read(&mut self, draft: ChainReadDraft, requirement: ReadRequirement) {
        self.requested_reads += 1;
        let metadata = ChainReadMetadata::from_draft(&draft);
        let key = ChainReadKey {
            chain_id: self.chain_id,
            contract_address: normalize_identifier(&draft.contract_address),
            method: draft.method,
            args: draft
                .args
                .into_iter()
                .map(|arg| normalize_identifier(&arg))
                .collect(),
            block_mode: draft.block_mode,
        };

        self.reads
            .entry(key)
            .and_modify(|read| {
                read.requirement = merge_requirement(read.requirement, requirement);
                if let Some(activity_block) = draft.activity_block {
                    read.activity_blocks.insert(activity_block);
                }
                read.metadata.merge(metadata.clone());
            })
            .or_insert_with(|| PendingChainRead::new(requirement, draft.activity_block, metadata));
    }
}

#[derive(Clone, Debug)]
struct ChainReadDraft {
    contract_address: String,
    method: ChainReadMethod,
    args: Vec<String>,
    block_mode: BlockReadMode,
    account: Option<String>,
    proposal_id: Option<String>,
    operation_id: Option<String>,
    reason: ChainReadReason,
    activity_block: Option<u64>,
}

#[derive(Clone, Debug)]
struct PendingChainRead {
    metadata: ChainReadMetadata,
    requirement: ReadRequirement,
    activity_blocks: BTreeSet<u64>,
}

impl PendingChainRead {
    fn new(
        requirement: ReadRequirement,
        activity_block: Option<u64>,
        metadata: ChainReadMetadata,
    ) -> Self {
        Self {
            metadata,
            requirement,
            activity_blocks: activity_block.into_iter().collect(),
        }
    }

    fn into_request(self, key: ChainReadKey) -> ChainReadRequest {
        ChainReadRequest {
            key,
            metadata: self.metadata,
            requirement: self.requirement,
            activity_blocks: self.activity_blocks.into_iter().collect(),
        }
    }
}

impl ChainReadMetadata {
    fn from_draft(draft: &ChainReadDraft) -> Self {
        let mut metadata = Self::default();
        metadata.accounts.extend(draft.account.clone());
        metadata.proposal_ids.extend(draft.proposal_id.clone());
        metadata.operation_ids.extend(draft.operation_id.clone());
        metadata.reasons.insert(draft.reason);
        metadata
    }

    fn merge(&mut self, other: Self) {
        self.accounts.extend(other.accounts);
        self.proposal_ids.extend(other.proposal_ids);
        self.operation_ids.extend(other.operation_ids);
        self.reasons.extend(other.reasons);
    }
}

fn build_multicall_groups(
    reads: &[ChainReadRequest],
    multicall_batch_size: usize,
) -> Vec<MulticallReadGroup> {
    if multicall_batch_size == 0 {
        return Vec::new();
    }

    let mut grouped = BTreeMap::<(i32, String, BlockReadMode), Vec<usize>>::new();
    for (index, read) in reads.iter().enumerate() {
        grouped
            .entry((
                read.key.chain_id,
                read.key.contract_address.clone(),
                read.key.block_mode,
            ))
            .or_default()
            .push(index);
    }

    grouped
        .into_iter()
        .flat_map(|((chain_id, contract_address, block_mode), indexes)| {
            indexes
                .chunks(multicall_batch_size)
                .map(move |chunk| MulticallReadGroup {
                    chain_id,
                    contract_address: contract_address.clone(),
                    block_mode,
                    read_indexes: chunk.to_vec(),
                })
                .collect::<Vec<_>>()
        })
        .collect()
}

fn merge_requirement(left: ReadRequirement, right: ReadRequirement) -> ReadRequirement {
    match (left, right) {
        (ReadRequirement::Required, _) | (_, ReadRequirement::Required) => {
            ReadRequirement::Required
        }
        (ReadRequirement::Optional, ReadRequirement::Optional) => ReadRequirement::Optional,
    }
}

fn normalize_contracts(contracts: ChainContracts) -> ChainContracts {
    ChainContracts {
        governor: normalize_identifier(&contracts.governor),
        governor_token: normalize_identifier(&contracts.governor_token),
        timelock: normalize_identifier(&contracts.timelock),
    }
}

fn normalize_identifier(value: &str) -> String {
    value.to_ascii_lowercase()
}
