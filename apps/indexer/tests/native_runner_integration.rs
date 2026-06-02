use std::collections::VecDeque;
use std::fmt;
use std::time::Duration;

use datalens_sdk::native::QueryInput;
use degov_datalens_indexer::{
    BatchReadPlanConfig, ChainContracts, ChainFamily, ChainIdentityConfig, ChainReadMethod,
    DaoContractAddresses, DaoEventDecoder, DatalensConfig, DatalensError, DatalensFinality,
    DatalensLogQueryReader, DatasetKeyConfig, GovernanceTokenStandard,
    InMemoryProposalProjectionRepository, InMemoryTimelockProjectionRepository,
    InMemoryTokenProjectionRepository, InMemoryVoteProjectionRepository, IndexerCheckpoint,
    IndexerCheckpointIdentity, IndexerProjectionBatch, IndexerRunner, IndexerRunnerContexts,
    IndexerRunnerOptions, IndexerRunnerStore, IndexerRunnerTransaction, ProposalProjectionContext,
    ProposalProjectionRepository, QueryLimitConfig, SecretString, TimelockProjectionContext,
    TimelockProjectionRepository, TokenProjectionContext, TokenProjectionRepository,
    VoteProjectionContext, VoteProjectionRepository,
};
use ethabi::{Token, encode};
use serde_json::{Value, json};

#[test]
fn test_native_runner_decodes_raw_logs_projects_all_domains_and_replay_is_idempotent() {
    let mut runner = native_runner(scripted_pages(), CapturingStore::new(identity(), 1));

    let report = runner.run_to_target(5).expect("first run succeeds");

    assert_eq!(report.chunks_processed, 1);
    assert_eq!(runner.store().commit_count, 1);
    assert_eq!(runner.store().checkpoint.next_block, 6);
    assert_eq!(runner.store().checkpoint.processed_height, Some(5));

    assert_projected_domains(runner.store());
    assert_onchain_refresh_plans(runner.store());

    let mut replay_store = runner.store().clone();
    replay_store.checkpoint.next_block = 1;
    let mut replay_runner = native_runner(scripted_pages(), replay_store);
    replay_runner.run_to_target(5).expect("replay succeeds");

    assert_eq!(replay_runner.store().commit_count, 2);
    assert_eq!(
        replay_runner
            .store()
            .vote_repository
            .data_metric()
            .votes_count,
        1
    );
    assert_eq!(
        replay_runner
            .store()
            .vote_repository
            .data_metric()
            .votes_weight_for_sum,
        "77"
    );
    assert_eq!(
        replay_runner
            .store()
            .token_repository
            .delegate_changed()
            .len(),
        1
    );
}

#[test]
fn test_native_runner_does_not_advance_checkpoint_when_raw_decode_fails() {
    let mut pages = scripted_pages();
    pages[0][0]["data"] = json!("0xdeadbeef");
    let mut runner = native_runner(pages, CapturingStore::new(identity(), 1));

    let error = runner.run_to_target(5).expect_err("decode fails");

    assert!(error.to_string().contains("DAO event decode error"));
    assert_eq!(runner.store().checkpoint.next_block, 1);
    assert_eq!(runner.store().checkpoint.processed_height, None);
    assert_eq!(runner.store().commit_count, 0);
    assert_eq!(runner.store().vote_repository.data_metric().votes_count, 0);
}

fn assert_projected_domains(store: &CapturingStore) {
    let proposal = store
        .proposal_repository
        .proposals()
        .values()
        .next()
        .expect("proposal");
    assert_eq!(proposal.proposal_id, "42");
    assert_eq!(proposal.title, "Proposal title");
    assert_eq!(proposal.proposal_eta, Some("1234".to_owned()));

    assert_eq!(
        store.vote_repository.data_metric().votes_weight_for_sum,
        "77"
    );
    assert_eq!(store.vote_repository.data_metric().votes_count, 1);

    let mapping = store
        .token_repository
        .delegate_mappings()
        .get(DELEGATOR)
        .expect("delegate mapping");
    assert_eq!(mapping.to, DELEGATE);
    assert_eq!(mapping.power, "75");
    assert_eq!(store.token_repository.contributors().len(), 1);

    let operation = store
        .timelock_repository
        .timelock_operations()
        .values()
        .next()
        .expect("timelock operation");
    assert_eq!(operation.operation_id, OPERATION_ID);
    assert_eq!(operation.state, "Executed");
    assert_eq!(operation.call_count, Some(1));
    assert_eq!(operation.executed_call_count, Some(1));
}

fn assert_onchain_refresh_plans(store: &CapturingStore) {
    let batch = store.committed_batches.first().expect("committed batch");

    let proposal_reads = batch
        .proposal
        .as_ref()
        .expect("proposal batch")
        .chain_read_plan
        .reads
        .iter()
        .map(|read| read.key.method)
        .collect::<Vec<_>>();
    assert!(proposal_reads.contains(&ChainReadMethod::ProposalSnapshot));
    assert!(proposal_reads.contains(&ChainReadMethod::ProposalDeadline));
    assert!(proposal_reads.contains(&ChainReadMethod::State));

    let vote_reads = batch
        .vote
        .as_ref()
        .expect("vote batch")
        .chain_read_plan
        .reads
        .iter()
        .map(|read| read.key.method)
        .collect::<Vec<_>>();
    assert!(vote_reads.contains(&ChainReadMethod::ProposalSnapshot));
    assert!(vote_reads.contains(&ChainReadMethod::ProposalDeadline));
    assert!(vote_reads.contains(&ChainReadMethod::State));

    let token_batch = batch.token.as_ref().expect("token batch");
    assert_eq!(token_batch.reconcile_plan.metrics.read_count, 3);
    assert_eq!(token_batch.reconcile_plan.candidates.len(), 3);
    assert!(
        token_batch
            .reconcile_plan
            .chain_read_plan
            .reads
            .iter()
            .all(|read| read.key.method == ChainReadMethod::GetVotes)
    );

    let timelock_reads = batch
        .timelock
        .as_ref()
        .expect("timelock batch")
        .chain_read_plan
        .reads
        .iter()
        .map(|read| read.key.method)
        .collect::<Vec<_>>();
    assert!(timelock_reads.contains(&ChainReadMethod::TimelockOperationState));
}

type NativeRunner = IndexerRunner<ScriptedReader, CapturingStore, DaoEventDecoder>;

fn native_runner(pages: Vec<Vec<Value>>, store: CapturingStore) -> NativeRunner {
    IndexerRunner::new(
        options(),
        contexts(),
        ScriptedReader {
            rows: VecDeque::from(pages),
        },
        store,
        DaoEventDecoder,
    )
}

#[derive(Clone, Debug)]
struct ScriptedReader {
    rows: VecDeque<Vec<Value>>,
}

impl DatalensLogQueryReader for ScriptedReader {
    fn query_logs(&mut self, _input: QueryInput) -> Result<Value, DatalensError> {
        Ok(Value::Array(
            self.rows.pop_front().expect("scripted query response"),
        ))
    }
}

#[derive(Clone, Debug)]
struct CapturingStore {
    checkpoint: IndexerCheckpoint,
    committed_batches: Vec<IndexerProjectionBatch>,
    proposal_repository: InMemoryProposalProjectionRepository,
    vote_repository: InMemoryVoteProjectionRepository,
    token_repository: InMemoryTokenProjectionRepository,
    timelock_repository: InMemoryTimelockProjectionRepository,
    commit_count: u64,
}

impl CapturingStore {
    fn new(identity: IndexerCheckpointIdentity, start_block: i64) -> Self {
        Self {
            checkpoint: IndexerCheckpoint {
                identity,
                next_block: start_block,
                processed_height: None,
                target_height: None,
                updated_at: "in-memory".to_owned(),
                last_error: None,
                lock_owner: None,
                locked_at: None,
            },
            committed_batches: Vec::new(),
            proposal_repository: InMemoryProposalProjectionRepository::default(),
            vote_repository: InMemoryVoteProjectionRepository::default(),
            token_repository: InMemoryTokenProjectionRepository::default(),
            timelock_repository: InMemoryTimelockProjectionRepository::default(),
            commit_count: 0,
        }
    }
}

impl IndexerRunnerStore for CapturingStore {
    type Error = CapturingStoreError;
    type Transaction<'a> = CapturingTransaction<'a>;

    fn read_or_create_checkpoint(
        &mut self,
        _identity: &IndexerCheckpointIdentity,
        _start_block: i64,
    ) -> Result<IndexerCheckpoint, Self::Error> {
        Ok(self.checkpoint.clone())
    }

    fn begin_transaction(&mut self) -> Result<Self::Transaction<'_>, Self::Error> {
        Ok(CapturingTransaction {
            store: self,
            staged_checkpoint: None,
            staged_batch: None,
            proposal_repository: None,
            vote_repository: None,
            token_repository: None,
            timelock_repository: None,
        })
    }
}

struct CapturingTransaction<'a> {
    store: &'a mut CapturingStore,
    staged_checkpoint: Option<IndexerCheckpoint>,
    staged_batch: Option<IndexerProjectionBatch>,
    proposal_repository: Option<InMemoryProposalProjectionRepository>,
    vote_repository: Option<InMemoryVoteProjectionRepository>,
    token_repository: Option<InMemoryTokenProjectionRepository>,
    timelock_repository: Option<InMemoryTimelockProjectionRepository>,
}

impl IndexerRunnerTransaction for CapturingTransaction<'_> {
    type Error = CapturingStoreError;

    fn apply_projection_batch(
        &mut self,
        batch: &IndexerProjectionBatch,
    ) -> Result<(), Self::Error> {
        if let Some(batch) = &batch.proposal {
            let repository = self
                .proposal_repository
                .get_or_insert_with(|| self.store.proposal_repository.clone());
            repository.apply(batch).map_err(|error| {
                CapturingStoreError(format!("proposal write failed: {error:?}"))
            })?;
        }
        if let Some(batch) = &batch.vote {
            let repository = self
                .vote_repository
                .get_or_insert_with(|| self.store.vote_repository.clone());
            repository
                .apply(batch)
                .map_err(|error| CapturingStoreError(format!("vote write failed: {error:?}")))?;
        }
        if let Some(batch) = &batch.token {
            let repository = self
                .token_repository
                .get_or_insert_with(|| self.store.token_repository.clone());
            repository
                .apply(batch)
                .map_err(|error| CapturingStoreError(format!("token write failed: {error:?}")))?;
        }
        if let Some(batch) = &batch.timelock {
            let repository = self
                .timelock_repository
                .get_or_insert_with(|| self.store.timelock_repository.clone());
            repository.apply(batch).map_err(|error| {
                CapturingStoreError(format!("timelock write failed: {error:?}"))
            })?;
        }
        self.staged_batch = Some(batch.clone());

        Ok(())
    }

    fn advance_checkpoint(
        &mut self,
        identity: &IndexerCheckpointIdentity,
        processed_height: i64,
        target_height: Option<i64>,
    ) -> Result<(), Self::Error> {
        if self.store.checkpoint.identity != *identity {
            return Err(CapturingStoreError(
                "checkpoint identity mismatch".to_owned(),
            ));
        }

        let mut checkpoint = self.store.checkpoint.clone();
        checkpoint.processed_height = Some(
            checkpoint
                .processed_height
                .map_or(processed_height, |current| current.max(processed_height)),
        );
        checkpoint.next_block = checkpoint.next_block.max(processed_height + 1);
        checkpoint.target_height = match (checkpoint.target_height, target_height) {
            (Some(current), Some(next)) => Some(current.max(next)),
            (None, Some(next)) => Some(next),
            (current, None) => current,
        };
        self.staged_checkpoint = Some(checkpoint);

        Ok(())
    }

    fn commit(mut self) -> Result<(), Self::Error> {
        if let Some(repository) = self.proposal_repository.take() {
            self.store.proposal_repository = repository;
        }
        if let Some(repository) = self.vote_repository.take() {
            self.store.vote_repository = repository;
        }
        if let Some(repository) = self.token_repository.take() {
            self.store.token_repository = repository;
        }
        if let Some(repository) = self.timelock_repository.take() {
            self.store.timelock_repository = repository;
        }
        if let Some(checkpoint) = self.staged_checkpoint.take() {
            self.store.checkpoint = checkpoint;
        }
        if let Some(batch) = self.staged_batch.take() {
            self.store.committed_batches.push(batch);
        }
        self.store.commit_count += 1;

        Ok(())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct CapturingStoreError(String);

impl fmt::Display for CapturingStoreError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

fn options() -> IndexerRunnerOptions {
    IndexerRunnerOptions {
        datalens_config: DatalensConfig {
            endpoint: "https://datalens.example".to_owned(),
            application: "degov-test".to_owned(),
            bearer_token: SecretString::new("test-token"),
            timeout: Duration::from_secs(30),
            finality: DatalensFinality::DurableOnly,
            chain: ChainIdentityConfig {
                family: ChainFamily::Evm,
                configured_name: "ethereum".to_owned(),
                network_id: Some(1),
            },
            dataset: DatasetKeyConfig {
                family: "evm".to_owned(),
                name: "logs".to_owned(),
            },
            query_limits: QueryLimitConfig {
                block_range_limit: 10,
                row_limit: 100,
            },
            dao_contracts: Some(addresses()),
        },
        addresses: addresses(),
        checkpoint_identity: identity(),
        start_block: 1,
        query_max_attempts: 1,
        safe_height: None,
        progress_refresh_lag_blocks: 0,
    }
}

fn contexts() -> IndexerRunnerContexts {
    let contracts = ChainContracts {
        governor: GOVERNOR.to_owned(),
        governor_token: TOKEN.to_owned(),
        timelock: TIMELOCK.to_owned(),
    };
    let read_plan_config = BatchReadPlanConfig {
        max_concurrency: 10,
        multicall_batch_size: 100,
    };

    IndexerRunnerContexts {
        vote: VoteProjectionContext {
            dao_code: "demo-dao".to_owned(),
            governor_address: contracts.governor.clone(),
            contracts: contracts.clone(),
            read_plan_config,
        },
        token: TokenProjectionContext {
            dao_code: "demo-dao".to_owned(),
            governor_address: contracts.governor.clone(),
            token_address: contracts.governor_token.clone(),
            contracts: contracts.clone(),
            token_standard: GovernanceTokenStandard::Erc20,
            from_block: 1,
            to_block: 1,
            target_height: None,
            read_plan_config,
            current_power_method: ChainReadMethod::GetVotes,
        },
        proposal: Some(ProposalProjectionContext {
            dao_code: "demo-dao".to_owned(),
            governor_address: contracts.governor.clone(),
            contracts: contracts.clone(),
            read_plan_config,
        }),
        timelock: Some(TimelockProjectionContext {
            dao_code: "demo-dao".to_owned(),
            governor_address: contracts.governor.clone(),
            timelock_address: contracts.timelock.clone(),
            contracts,
            read_plan_config,
        }),
    }
}

fn identity() -> IndexerCheckpointIdentity {
    IndexerCheckpointIdentity {
        dao_code: "demo-dao".to_owned(),
        chain_id: 1,
        stream_id: "datalens-native".to_owned(),
        data_source_version: "test".to_owned(),
    }
}

fn addresses() -> DaoContractAddresses {
    DaoContractAddresses {
        governor: GOVERNOR.to_owned(),
        governor_token: TOKEN.to_owned(),
        governor_token_standard: GovernanceTokenStandard::Erc20,
        timelock: TIMELOCK.to_owned(),
    }
}

fn scripted_pages() -> Vec<Vec<Value>> {
    vec![
        vec![
            vote_cast_row(),
            proposal_created_row(),
            proposal_queued_row(),
        ],
        vec![
            delegate_changed_row(),
            delegate_votes_changed_row(),
            erc20_transfer_row(),
        ],
        vec![call_executed_row(), call_scheduled_row()],
    ]
}

fn proposal_created_row() -> Value {
    raw_log(
        2,
        0,
        0,
        GOVERNOR,
        vec![PROPOSAL_CREATED],
        encode(&[
            uint(42),
            address(PROPOSER),
            Token::Array(vec![address(TARGET)]),
            Token::Array(vec![uint(1)]),
            Token::Array(vec![Token::String("upgrade()".to_owned())]),
            Token::Array(vec![Token::Bytes(vec![0x12, 0x34])]),
            uint(100),
            uint(200),
            Token::String("Proposal title\n\nProposal body".to_owned()),
        ]),
    )
}

fn proposal_queued_row() -> Value {
    raw_log(
        4,
        0,
        0,
        GOVERNOR,
        vec![PROPOSAL_QUEUED],
        encode(&[uint(42), uint(1234)]),
    )
}

fn vote_cast_row() -> Value {
    raw_log(
        3,
        0,
        2,
        GOVERNOR,
        vec![VOTE_CAST, topic_address(VOTER).as_str()],
        encode(&[
            uint(42),
            Token::Uint(1.into()),
            uint(77),
            Token::String("aye".to_owned()),
        ]),
    )
}

fn delegate_changed_row() -> Value {
    raw_log(
        3,
        1,
        0,
        TOKEN,
        vec![
            DELEGATE_CHANGED,
            topic_address(DELEGATOR).as_str(),
            topic_address(ZERO_ADDRESS).as_str(),
            topic_address(DELEGATE).as_str(),
        ],
        vec![],
    )
}

fn delegate_votes_changed_row() -> Value {
    raw_log(
        3,
        1,
        1,
        TOKEN,
        vec![DELEGATE_VOTES_CHANGED, topic_address(DELEGATE).as_str()],
        encode(&[uint(0), uint(100)]),
    )
}

fn erc20_transfer_row() -> Value {
    raw_log(
        5,
        0,
        0,
        TOKEN,
        vec![
            TRANSFER,
            topic_address(DELEGATOR).as_str(),
            topic_address(RECEIVER).as_str(),
        ],
        encode(&[uint(25)]),
    )
}

fn call_scheduled_row() -> Value {
    raw_log(
        4,
        1,
        0,
        TIMELOCK,
        vec![CALL_SCHEDULED, OPERATION_ID, topic_uint(0).as_str()],
        encode(&[
            address(TARGET),
            uint(1),
            Token::Bytes(vec![0x12, 0x34]),
            bytes32(2),
            uint(60),
        ]),
    )
}

fn call_executed_row() -> Value {
    raw_log(
        5,
        1,
        0,
        TIMELOCK,
        vec![CALL_EXECUTED, OPERATION_ID, topic_uint(0).as_str()],
        encode(&[address(TARGET), uint(1), Token::Bytes(vec![0x12, 0x34])]),
    )
}

fn raw_log(
    block_number: u64,
    transaction_index: u64,
    log_index: u64,
    address: &str,
    topics: Vec<&str>,
    data: Vec<u8>,
) -> Value {
    json!({
        "block_number": block_number,
        "block_hash": format!("0xblock{block_number}"),
        "block_timestamp": 1_700_000_000 + block_number,
        "transaction_hash": format!("0xtx{block_number}{transaction_index}"),
        "transaction_index": transaction_index,
        "log_index": log_index,
        "address": address,
        "topics": topics,
        "data": format!("0x{}", hex::encode(data)),
        "removed": false
    })
}

fn uint(value: u64) -> Token {
    Token::Uint(value.into())
}

fn address(value: &str) -> Token {
    Token::Address(value.parse().expect("address"))
}

fn bytes32(value: u8) -> Token {
    Token::FixedBytes(vec![value; 32])
}

fn topic_address(value: &str) -> String {
    format!("0x{:0>64}", value.trim_start_matches("0x"))
}

fn topic_uint(value: u64) -> String {
    format!("0x{value:064x}")
}

const GOVERNOR: &str = "0x1111111111111111111111111111111111111111";
const TOKEN: &str = "0x2222222222222222222222222222222222222222";
const TIMELOCK: &str = "0x3333333333333333333333333333333333333333";
const PROPOSER: &str = "0x0000000000000000000000000000000000000a01";
const TARGET: &str = "0x0000000000000000000000000000000000000a02";
const VOTER: &str = "0x0000000000000000000000000000000000000b01";
const DELEGATOR: &str = "0x0000000000000000000000000000000000000c01";
const DELEGATE: &str = "0x0000000000000000000000000000000000000c02";
const RECEIVER: &str = "0x0000000000000000000000000000000000000c03";
const ZERO_ADDRESS: &str = "0x0000000000000000000000000000000000000000";
const OPERATION_ID: &str = "0x0101010101010101010101010101010101010101010101010101010101010101";

const PROPOSAL_CREATED: &str = "0x7d84a6263ae0d98d3329bd7b46bb4e8d6f98cd35a7adb45c274c8b7fd5ebd5e0";
const PROPOSAL_QUEUED: &str = "0x9a2e42fd6722813d69113e7d0079d3d940171428df7373df9c7f7617cfda2892";
const VOTE_CAST: &str = "0xb8e138887d0aa13bab447e82de9d5c1777041ecd21ca36ba824ff1e6c07ddda4";
const TRANSFER: &str = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const DELEGATE_CHANGED: &str = "0x3134e8a2e6d97e929a7e54011ea5485d7d196dd5f0ba4d4ef95803e8e3fc257f";
const DELEGATE_VOTES_CHANGED: &str =
    "0xdec2bacdd2f05b59de34da9b523dff8be42e5e38e818c82fdb0bae774387a724";
const CALL_SCHEDULED: &str = "0x4cf4410cc57040e44862ef0f45f3dd5a5e02db8eb8add648d4b0e236f1d07dca";
const CALL_EXECUTED: &str = "0xc2617efa69bab66782fa219543714338489c4e9e178271560a91b82c3f612b58";
