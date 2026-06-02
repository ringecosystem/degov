use std::collections::VecDeque;
use std::time::Duration;

use datalens_sdk::native::QueryInput;
use degov_datalens_indexer::{
    BatchReadPlanConfig, ChainContracts, ChainFamily, ChainIdentityConfig, DaoContractAddresses,
    DaoEventDecodeError, DaoLogSource, DatalensConfig, DatalensError, DatalensFinality,
    DatalensLogQueryReader, DatasetKeyConfig, DecodedDaoEvent, DecodedGovernorEvent,
    DecodedTokenEvent, GovernanceTokenStandard, InMemoryIndexerRunnerStore,
    IndexerCheckpointIdentity, IndexerEventDecoder, IndexerRunner, IndexerRunnerContexts,
    IndexerRunnerOptions, NormalizedEvmLog, QueryLimitConfig, SecretString, TokenProjectionContext,
    VoteCastEvent, VoteProjectionContext,
};
use serde_json::{Value, json};

#[test]
fn test_runner_processes_multiple_chunks_and_advances_checkpoint_after_commits() {
    let mut runner = runner(
        vec![
            vec![row(1, 0, 0)],
            vec![],
            vec![],
            vec![row(2, 0, 0)],
            vec![],
            vec![],
        ],
        ScriptedDecoder,
    );

    let report = runner.run_to_target(2).expect("runner succeeds");

    assert_eq!(report.chunks_processed, 2);
    assert_eq!(report.last_progress.processed_height, Some(2));
    assert_eq!(report.last_progress.synced_percentage, 100.0);
    assert!(report.last_progress.onchain_refresh_allowed);
    assert_eq!(
        runner.store().checkpoint().expect("checkpoint").next_block,
        3
    );
    assert_eq!(runner.store().commit_count(), 2);
    assert_eq!(
        runner
            .store()
            .vote_repository()
            .data_metric()
            .votes_weight_for_sum,
        "30"
    );
}

#[test]
fn test_runner_skips_removed_logs_before_decode_and_still_advances_checkpoint() {
    let mut options = options();
    options.datalens_config.finality = DatalensFinality::IncludePending;
    let mut runner = runner_with_decoder(
        vec![vec![removed_row(1, 0, 0)], vec![], vec![]],
        RejectRemovedDecoder,
        options,
    );

    let report = runner.run_to_target(1).expect("runner succeeds");

    assert_eq!(report.chunks_processed, 1);
    assert_eq!(
        runner.store().checkpoint().expect("checkpoint").next_block,
        2
    );
    assert_eq!(runner.store().commit_count(), 1);
    assert_eq!(
        runner.store().vote_repository().data_metric().votes_count,
        0
    );
}

#[test]
fn test_runner_keeps_checkpoint_unchanged_when_transaction_fails() {
    let mut runner = runner(vec![vec![row(1, 0, 0)], vec![], vec![]], ScriptedDecoder);
    runner
        .store_mut()
        .fail_next_commit("projection write failed");

    let error = runner.run_to_target(1).expect_err("commit fails");

    assert!(error.to_string().contains("projection write failed"));
    assert_eq!(
        runner.store().checkpoint().expect("checkpoint").next_block,
        1
    );
    assert_eq!(runner.store().commit_count(), 0);
    assert_eq!(
        runner.store().vote_repository().data_metric().votes_count,
        0
    );
}

#[test]
fn test_runner_replay_over_same_range_does_not_double_count_business_totals() {
    let mut runner = runner(
        vec![
            vec![row(1, 0, 0)],
            vec![],
            vec![],
            vec![row(1, 0, 0)],
            vec![],
            vec![],
        ],
        ScriptedDecoder,
    );

    runner.run_to_target(1).expect("first run succeeds");
    runner.store_mut().rewind_next_block_for_replay(1);
    runner.run_to_target(1).expect("replay succeeds");

    assert_eq!(
        runner.store().vote_repository().data_metric().votes_count,
        1
    );
    assert_eq!(
        runner
            .store()
            .vote_repository()
            .data_metric()
            .votes_weight_for_sum,
        "10"
    );
    assert_eq!(runner.store().commit_count(), 2);
    assert_eq!(
        runner.store().checkpoint().expect("checkpoint").next_block,
        2
    );
}

#[test]
fn test_runner_stops_gracefully_between_chunks() {
    let mut runner = runner(
        vec![
            vec![row(1, 0, 0)],
            vec![],
            vec![],
            vec![row(2, 0, 0)],
            vec![],
            vec![],
        ],
        ScriptedDecoder,
    );
    runner.request_shutdown_after_chunks(1);

    let report = runner.run_to_target(2).expect("runner stops cleanly");

    assert_eq!(report.chunks_processed, 1);
    assert!(report.shutdown_requested);
    assert_eq!(
        runner.store().checkpoint().expect("checkpoint").next_block,
        2
    );
    assert_eq!(runner.store().commit_count(), 1);
}

struct ScriptedDatalensReader {
    rows: VecDeque<Vec<Value>>,
}

impl DatalensLogQueryReader for ScriptedDatalensReader {
    fn query_logs(&mut self, _input: QueryInput) -> Result<Value, DatalensError> {
        Ok(Value::Array(
            self.rows.pop_front().expect("scripted query response"),
        ))
    }
}

#[derive(Clone)]
struct ScriptedDecoder;

impl IndexerEventDecoder for ScriptedDecoder {
    fn decode(
        &self,
        _dao_code: &str,
        source: DaoLogSource,
        _token_standard: Option<GovernanceTokenStandard>,
        log: &NormalizedEvmLog,
    ) -> Result<DecodedDaoEvent, DaoEventDecodeError> {
        match source {
            DaoLogSource::Governor => Ok(DecodedDaoEvent::Governor(
                DecodedGovernorEvent::VoteCast(VoteCastEvent {
                    voter: format!("0x{:040}", log.block_number),
                    proposal_id: "42".to_owned(),
                    support: 1,
                    weight: (log.block_number * 10).to_string(),
                    reason: String::new(),
                }),
            )),
            DaoLogSource::GovernorToken => Ok(DecodedDaoEvent::Token(
                DecodedTokenEvent::DelegateChanged(degov_datalens_indexer::DelegateChangedEvent {
                    delegator: "0x0000000000000000000000000000000000000001".to_owned(),
                    from_delegate: "0x0000000000000000000000000000000000000000".to_owned(),
                    to_delegate: "0x0000000000000000000000000000000000000002".to_owned(),
                }),
            )),
            DaoLogSource::Timelock => Ok(DecodedDaoEvent::UnsupportedTopic(
                degov_datalens_indexer::UnsupportedTopicEvent {
                    dao_code: "demo-dao".to_owned(),
                    source,
                    block_number: log.block_number,
                    transaction_hash: log.transaction_hash.clone(),
                    address: log.address.clone(),
                    topic0: log.topics[0].clone(),
                },
            )),
        }
    }
}

#[derive(Clone)]
struct RejectRemovedDecoder;

impl IndexerEventDecoder for RejectRemovedDecoder {
    fn decode(
        &self,
        _dao_code: &str,
        _source: DaoLogSource,
        _token_standard: Option<GovernanceTokenStandard>,
        log: &NormalizedEvmLog,
    ) -> Result<DecodedDaoEvent, DaoEventDecodeError> {
        assert!(!log.removed, "removed log reached decoder");
        Ok(DecodedDaoEvent::UnsupportedTopic(
            degov_datalens_indexer::UnsupportedTopicEvent {
                dao_code: "demo-dao".to_owned(),
                source: DaoLogSource::Governor,
                block_number: log.block_number,
                transaction_hash: log.transaction_hash.clone(),
                address: log.address.clone(),
                topic0: log.topics[0].clone(),
            },
        ))
    }
}

fn runner(
    rows: Vec<Vec<Value>>,
    decoder: ScriptedDecoder,
) -> IndexerRunner<ScriptedDatalensReader, InMemoryIndexerRunnerStore, ScriptedDecoder> {
    runner_with_decoder(rows, decoder, options())
}

fn runner_with_decoder<D: IndexerEventDecoder>(
    rows: Vec<Vec<Value>>,
    decoder: D,
    options: IndexerRunnerOptions,
) -> IndexerRunner<ScriptedDatalensReader, InMemoryIndexerRunnerStore, D> {
    IndexerRunner::new(
        options,
        contexts(),
        ScriptedDatalensReader {
            rows: VecDeque::from(rows),
        },
        InMemoryIndexerRunnerStore::new(identity(), 1),
        decoder,
    )
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
                block_range_limit: 1,
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
        governor: "0x1111111111111111111111111111111111111111".to_owned(),
        governor_token: "0x2222222222222222222222222222222222222222".to_owned(),
        timelock: "0x3333333333333333333333333333333333333333".to_owned(),
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
            contracts,
            token_standard: GovernanceTokenStandard::Erc20,
            from_block: 1,
            to_block: 1,
            target_height: None,
            read_plan_config,
            current_power_method: degov_datalens_indexer::ChainReadMethod::GetVotes,
        },
        proposal: None,
        timelock: None,
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
        governor: "0x1111111111111111111111111111111111111111".to_owned(),
        governor_token: "0x2222222222222222222222222222222222222222".to_owned(),
        governor_token_standard: GovernanceTokenStandard::Erc20,
        timelock: "0x3333333333333333333333333333333333333333".to_owned(),
    }
}

fn row(block_number: u64, transaction_index: u64, log_index: u64) -> Value {
    row_with_removed(block_number, transaction_index, log_index, false)
}

fn removed_row(block_number: u64, transaction_index: u64, log_index: u64) -> Value {
    row_with_removed(block_number, transaction_index, log_index, true)
}

fn row_with_removed(
    block_number: u64,
    transaction_index: u64,
    log_index: u64,
    removed: bool,
) -> Value {
    json!({
        "block_number": block_number,
        "block_hash": format!("0xblock{block_number}"),
        "block_timestamp": 1_700_000_000 + block_number,
        "transaction_hash": format!("0xtx{block_number}"),
        "transaction_index": transaction_index,
        "log_index": log_index,
        "address": "0x1111111111111111111111111111111111111111",
        "topics": ["0x0000000000000000000000000000000000000000000000000000000000000000"],
        "data": "0x",
        "removed": removed
    })
}
