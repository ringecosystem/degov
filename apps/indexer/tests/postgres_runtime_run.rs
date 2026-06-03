use std::{
    env,
    error::Error,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    process::{Command, Stdio},
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use degov_datalens_indexer::{
    BatchReadPlanConfig, CallExecutedEvent, CallScheduledEvent, ChainContracts, ChainReadMethod,
    DecodedGovernorEvent, DecodedTimelockEvent, DecodedTokenEvent, DelegateChangedEvent,
    GovernanceTokenStandard, IndexerProjectionBatch, IndexerRunnerStore, IndexerRunnerTransaction,
    NormalizedEvmLog, PostgresIndexerRunnerStore, ProposalCreatedEvent, ProposalExtendedEvent,
    ProposalProjectionContext, ProposalProjectionEvent, ProposalQueuedEvent,
    TimelockProjectionContext, TimelockProjectionEvent, TimelockProposalLinkContext,
    TokenProjectionContext, TokenProjectionEvent, VoteCastEvent, VoteProjectionContext,
    VoteProjectionEvent, project_proposal_events, project_timelock_events,
    project_timelock_events_with_proposal_links, project_token_events, project_vote_events,
};
use ethabi::{Token, encode};
use serde_json::{Value, json};
use sqlx::{PgPool, Row, postgres::PgPoolOptions};
use tokio::sync::{Mutex, MutexGuard};
use tokio::time::{sleep, timeout};

const SCHEMA_SQL: &str = include_str!("../schema/postgres.sql");
static SCHEMA_COUNTER: AtomicU64 = AtomicU64::new(0);
static DATABASE_TEST_LOCK: Mutex<()> = Mutex::const_new(());

struct TestDatabase {
    _guard: MutexGuard<'static, ()>,
    pool: PgPool,
    schema: String,
    database_url: String,
}

impl TestDatabase {
    async fn connect() -> Result<Self, Box<dyn Error>> {
        let guard = DATABASE_TEST_LOCK.lock().await;
        let database_url = env::var("DEGOV_INDEXER_TEST_DATABASE_URL")
            .map_err(|_| "DEGOV_INDEXER_TEST_DATABASE_URL is required")?;

        let pool = PgPoolOptions::new()
            .max_connections(1)
            .connect(&database_url)
            .await?;
        let schema = unique_schema_name();

        sqlx::query("DROP SCHEMA IF EXISTS squid_processor CASCADE")
            .execute(&pool)
            .await?;
        sqlx::query(&format!(r#"CREATE SCHEMA "{schema}""#))
            .execute(&pool)
            .await?;
        sqlx::query(&format!(r#"SET search_path TO "{schema}""#))
            .execute(&pool)
            .await?;
        sqlx::raw_sql(SCHEMA_SQL).execute(&pool).await?;

        Ok(Self {
            _guard: guard,
            pool,
            database_url: database_url_with_search_path(&database_url, &schema),
            schema,
        })
    }

    async fn cleanup(&self) -> Result<(), sqlx::Error> {
        sqlx::query("DROP SCHEMA IF EXISTS squid_processor CASCADE")
            .execute(&self.pool)
            .await?;
        sqlx::query(&format!(
            r#"DROP SCHEMA IF EXISTS "{}" CASCADE"#,
            self.schema
        ))
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}

impl Drop for TestDatabase {
    fn drop(&mut self) {
        let pool = self.pool.clone();
        let schema = self.schema.clone();

        if let Ok(handle) = tokio::runtime::Handle::try_current() {
            tokio::task::block_in_place(|| {
                handle.block_on(async move {
                    let _ = sqlx::query("DROP SCHEMA IF EXISTS squid_processor CASCADE")
                        .execute(&pool)
                        .await;
                    let _ = sqlx::query(&format!(r#"DROP SCHEMA IF EXISTS "{schema}" CASCADE"#))
                        .execute(&pool)
                        .await;
                });
            });
        }
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn test_run_path_processes_datalens_pages_into_postgres() -> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    let datalens = FakeDatalensServer::start(
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
        vec![call_scheduled_row(), call_executed_row()],
    );

    run_indexer_command(&database.database_url, &datalens.endpoint).await?;

    assert_eq!(datalens.query_count.load(Ordering::Relaxed), 3);
    assert_table_count(&database.pool, "proposal_created", 1).await?;
    assert_table_count(&database.pool, "proposal", 1).await?;
    assert_table_count(&database.pool, "vote_cast", 1).await?;
    assert_proposal_projection_parity_state(&database.pool).await?;
    assert_table_count(&database.pool, "delegate_changed", 1).await?;
    assert_table_count(&database.pool, "token_transfer", 1).await?;
    assert_table_count(&database.pool, "vote_power_checkpoint", 1).await?;
    assert_token_projection_state(&database.pool).await?;
    assert_table_count(&database.pool, "timelock_operation", 1).await?;
    assert_table_count(&database.pool, "timelock_call", 1).await?;
    assert_timelock_projection_state(&database.pool).await?;
    assert_checkpoint(&database.pool).await?;

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_run_path_all_mode_resumes_existing_scope_and_starts_new_scope()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    insert_checkpoint(&database.pool, CONTRACT_SET_ID, 3, Some(2), Some(2)).await?;
    let datalens = FakeDatalensServer::start(vec![], vec![], vec![]);

    run_indexer_all_contract_sets_command(&database.database_url, &datalens.endpoint).await?;

    assert_eq!(datalens.query_count.load(Ordering::Relaxed), 3);
    assert_checkpoint_scope(&database.pool, CONTRACT_SET_ID, 3, Some(2), Some(2)).await?;
    assert_checkpoint_scope(&database.pool, SECOND_CONTRACT_SET_ID, 3, Some(2), Some(2)).await?;
    assert_checkpoint_row_count(&database.pool, 2).await?;

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_postgres_relinks_lifecycle_stub_plain_proposal_ids() -> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    let mut store = PostgresIndexerRunnerStore::new(database.pool.clone());
    let context = proposal_projection_context();
    let lifecycle_batch = project_proposal_events(
        &context,
        vec![
            ProposalProjectionEvent {
                log: normalized_log("evm:1:3:0xtx30:0:0", 3, 0, 0),
                event: DecodedGovernorEvent::ProposalQueued(ProposalQueuedEvent {
                    proposal_id: "42".to_owned(),
                    eta_seconds: "1234".to_owned(),
                }),
            },
            ProposalProjectionEvent {
                log: normalized_log("evm:1:4:0xtx40:0:0", 4, 0, 0),
                event: DecodedGovernorEvent::ProposalExtended(ProposalExtendedEvent {
                    proposal_id: "42".to_owned(),
                    extended_deadline: "250".to_owned(),
                }),
            },
        ],
    )
    .map_err(|error| format!("lifecycle projection failed: {error:?}"))?;
    let raw_batch = project_proposal_events(
        &context,
        vec![ProposalProjectionEvent {
            log: normalized_log("evm:1:2:0xtx20:0:0", 2, 0, 0),
            event: DecodedGovernorEvent::ProposalCreated(ProposalCreatedEvent {
                proposal_id: "42".to_owned(),
                proposer: PROPOSER.to_owned(),
                targets: vec![TARGET.to_owned()],
                values: vec!["1".to_owned()],
                signatures: vec!["upgrade()".to_owned()],
                calldatas: vec!["0x1234".to_owned()],
                vote_start: "100".to_owned(),
                vote_end: "200".to_owned(),
                description: "Proposal title\n\nProposal body".to_owned(),
            }),
        }],
    )
    .map_err(|error| format!("raw projection failed: {error:?}"))?;

    {
        let mut transaction = store
            .begin_transaction()
            .map_err(|error| format!("begin lifecycle transaction failed: {error}"))?;
        transaction
            .apply_projection_batch(&IndexerProjectionBatch {
                proposal: Some(lifecycle_batch),
                ..IndexerProjectionBatch::default()
            })
            .map_err(|error| format!("apply lifecycle batch failed: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("commit lifecycle transaction failed: {error}"))?;
    }
    {
        let mut transaction = store
            .begin_transaction()
            .map_err(|error| format!("begin raw transaction failed: {error}"))?;
        transaction
            .apply_projection_batch(&IndexerProjectionBatch {
                proposal: Some(raw_batch),
                ..IndexerProjectionBatch::default()
            })
            .map_err(|error| format!("apply raw batch failed: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("commit raw transaction failed: {error}"))?;
    }

    let raw_ref = "evm:1:2:0xtx20:0:0";
    let state = sqlx::query(
        "SELECT proposal_id, proposal_ref
         FROM proposal_state_epoch
         WHERE state = 'Queued'",
    )
    .fetch_one(&database.pool)
    .await?;
    assert_eq!(state.get::<String, _>("proposal_id"), raw_ref);
    assert_eq!(state.get::<String, _>("proposal_ref"), raw_ref);

    let extension =
        sqlx::query("SELECT proposal_id, proposal_ref FROM proposal_deadline_extension")
            .fetch_one(&database.pool)
            .await?;
    assert_eq!(extension.get::<String, _>("proposal_id"), raw_ref);
    assert_eq!(extension.get::<String, _>("proposal_ref"), raw_ref);

    let action = sqlx::query("SELECT proposal_id, proposal_ref FROM proposal_action")
        .fetch_one(&database.pool)
        .await?;
    assert_eq!(action.get::<String, _>("proposal_id"), raw_ref);
    assert_eq!(action.get::<String, _>("proposal_ref"), raw_ref);

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_postgres_data_metric_event_rows_are_idempotent_and_keep_global()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    seed_global_metric(&database.pool).await?;
    let mut store = PostgresIndexerRunnerStore::new(database.pool.clone());
    let proposal_batch = project_proposal_events(
        &proposal_projection_context(),
        vec![ProposalProjectionEvent {
            log: normalized_log("0000000002-proposal", 2, 0, 7),
            event: DecodedGovernorEvent::ProposalCreated(ProposalCreatedEvent {
                proposal_id: "42".to_owned(),
                proposer: PROPOSER.to_owned(),
                targets: vec![TARGET.to_owned()],
                values: vec!["1".to_owned()],
                signatures: vec!["upgrade()".to_owned()],
                calldatas: vec!["0x1234".to_owned()],
                vote_start: "100".to_owned(),
                vote_end: "200".to_owned(),
                description: "Proposal title\n\nProposal body".to_owned(),
            }),
        }],
    )
    .map_err(|error| format!("proposal projection failed: {error:?}"))?;
    let vote_batch = project_vote_events(
        &vote_projection_context(),
        vec![VoteProjectionEvent {
            log: normalized_log("0000000003-vote", 3, 0, 8),
            event: DecodedGovernorEvent::VoteCast(VoteCastEvent {
                voter: "0x4444444444444444444444444444444444444444".to_owned(),
                proposal_id: "42".to_owned(),
                support: 1,
                weight: "77".to_owned(),
                reason: "yes".to_owned(),
            }),
        }],
    )
    .map_err(|error| format!("vote projection failed: {error:?}"))?;

    for _ in 0..2 {
        let mut transaction = store
            .begin_transaction()
            .map_err(|error| format!("begin transaction failed: {error}"))?;
        transaction
            .apply_projection_batch(&IndexerProjectionBatch {
                proposal: Some(proposal_batch.clone()),
                vote: Some(vote_batch.clone()),
                ..IndexerProjectionBatch::default()
            })
            .map_err(|error| format!("apply projection batch failed: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("commit transaction failed: {error}"))?;
    }

    let rows = sqlx::query(
        "SELECT id, proposals_count, votes_count, votes_without_params_count,
                votes_weight_for_sum::TEXT AS votes_weight_for_sum,
                power_sum::TEXT AS power_sum, member_count, contract_address,
                log_index, transaction_index
         FROM data_metric
         ORDER BY id ASC",
    )
    .fetch_all(&database.pool)
    .await?;

    assert_eq!(rows.len(), 3);
    assert_eq!(rows[0].get::<String, _>("id"), "0000000002-proposal");
    assert_eq!(rows[0].get::<Option<i32>, _>("proposals_count"), Some(1));
    assert_eq!(rows[0].get::<Option<i32>, _>("votes_count"), Some(0));
    assert_eq!(
        rows[0].get::<Option<String>, _>("power_sum"),
        Some("150".to_owned())
    );
    assert_eq!(rows[0].get::<Option<i32>, _>("member_count"), Some(2));
    assert_eq!(
        rows[0].get::<Option<String>, _>("contract_address"),
        Some(GOVERNOR.to_owned())
    );
    assert_eq!(rows[0].get::<Option<i32>, _>("log_index"), Some(7));
    assert_eq!(rows[0].get::<Option<i32>, _>("transaction_index"), Some(0));
    assert_eq!(rows[1].get::<String, _>("id"), "0000000003-vote");
    assert_eq!(rows[1].get::<Option<i32>, _>("proposals_count"), Some(0));
    assert_eq!(rows[1].get::<Option<i32>, _>("votes_count"), Some(1));
    assert_eq!(
        rows[1].get::<Option<i32>, _>("votes_without_params_count"),
        Some(1)
    );
    assert_eq!(
        rows[1].get::<Option<String>, _>("votes_weight_for_sum"),
        Some("77".to_owned())
    );
    assert_eq!(rows[2].get::<String, _>("id"), "global");
    assert_eq!(rows[2].get::<Option<i32>, _>("proposals_count"), Some(1));
    assert_eq!(rows[2].get::<Option<i32>, _>("votes_count"), Some(1));

    let global = sqlx::query("SELECT id FROM data_metric WHERE id = 'global'")
        .fetch_one(&database.pool)
        .await?;
    assert_eq!(global.get::<String, _>("id"), "global");

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_postgres_backfills_timelock_proposal_links_on_conflict() -> Result<(), Box<dyn Error>>
{
    let database = TestDatabase::connect().await?;
    let mut store = PostgresIndexerRunnerStore::new(database.pool.clone());
    let proposal_batch = project_proposal_events(
        &proposal_projection_context(),
        vec![
            ProposalProjectionEvent {
                log: normalized_log("evm:1:2:0xtx20:0:0", 2, 0, 0),
                event: DecodedGovernorEvent::ProposalCreated(ProposalCreatedEvent {
                    proposal_id: "42".to_owned(),
                    proposer: PROPOSER.to_owned(),
                    targets: vec![TARGET.to_owned()],
                    values: vec!["1".to_owned()],
                    signatures: vec!["upgrade()".to_owned()],
                    calldatas: vec!["0x1234".to_owned()],
                    vote_start: "100".to_owned(),
                    vote_end: "200".to_owned(),
                    description: "Proposal title\n\nProposal body".to_owned(),
                }),
            },
            ProposalProjectionEvent {
                log: normalized_log("evm:1:4:0xtx40:0:0", 4, 0, 0),
                event: DecodedGovernorEvent::ProposalQueued(ProposalQueuedEvent {
                    proposal_id: "42".to_owned(),
                    eta_seconds: "1234".to_owned(),
                }),
            },
        ],
    )
    .map_err(|error| format!("proposal projection failed: {error:?}"))?;
    let scheduled = TimelockProjectionEvent {
        log: timelock_normalized_log("evm:1:4:0xtx40:0:1", 4, 0, 1),
        event: DecodedTimelockEvent::CallScheduled(CallScheduledEvent {
            id: OPERATION_ID.to_owned(),
            index: "0".to_owned(),
            target: TARGET.to_owned(),
            value: "1".to_owned(),
            data: "0x1234".to_owned(),
            predecessor: ZERO_OPERATION_ID.to_owned(),
            delay: "60".to_owned(),
        }),
    };
    let unlinked_timelock_batch =
        project_timelock_events(&timelock_projection_context(), vec![scheduled.clone()])
            .map_err(|error| format!("unlinked timelock projection failed: {error:?}"))?;
    let executed_timelock_batch = project_timelock_events(
        &timelock_projection_context(),
        vec![TimelockProjectionEvent {
            log: timelock_normalized_log("evm:1:5:0xtx50:0:0", 5, 0, 0),
            event: DecodedTimelockEvent::CallExecuted(CallExecutedEvent {
                id: OPERATION_ID.to_owned(),
                index: "0".to_owned(),
                target: TARGET.to_owned(),
                value: "1".to_owned(),
                data: "0x1234".to_owned(),
            }),
        }],
    )
    .map_err(|error| format!("executed timelock projection failed: {error:?}"))?;
    let proposal_links = TimelockProposalLinkContext::from_proposal_batch(&proposal_batch);
    let linked_timelock_batch = project_timelock_events_with_proposal_links(
        &timelock_projection_context(),
        &proposal_links,
        vec![scheduled],
    )
    .map_err(|error| format!("linked timelock projection failed: {error:?}"))?;

    apply_projection_batch(
        &mut store,
        IndexerProjectionBatch {
            proposal: Some(proposal_batch),
            ..IndexerProjectionBatch::default()
        },
    )?;
    apply_projection_batch(
        &mut store,
        IndexerProjectionBatch {
            timelock: Some(unlinked_timelock_batch),
            ..IndexerProjectionBatch::default()
        },
    )?;
    apply_projection_batch(
        &mut store,
        IndexerProjectionBatch {
            timelock: Some(executed_timelock_batch),
            ..IndexerProjectionBatch::default()
        },
    )?;
    apply_projection_batch(
        &mut store,
        IndexerProjectionBatch {
            timelock: Some(linked_timelock_batch),
            ..IndexerProjectionBatch::default()
        },
    )?;

    assert_timelock_projection_state(&database.pool).await?;
    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_postgres_data_metric_event_snapshots_follow_mixed_batch_event_order()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    seed_empty_global_metric(&database.pool).await?;
    let mut store = PostgresIndexerRunnerStore::new(database.pool.clone());
    let token_batch = project_token_events(
        &token_projection_context(),
        vec![TokenProjectionEvent {
            log: normalized_token_log("0000000001-token", 1, 0, 1),
            event: DecodedTokenEvent::DelegateChanged(DelegateChangedEvent {
                delegator: RECEIVER.to_owned(),
                from_delegate: ZERO_ADDRESS.to_owned(),
                to_delegate: DELEGATE.to_owned(),
            }),
        }],
    )
    .map_err(|error| format!("token projection failed: {error:?}"))?;
    let proposal_batch = project_proposal_events(
        &proposal_projection_context(),
        vec![ProposalProjectionEvent {
            log: normalized_log("0000000002-proposal", 2, 0, 7),
            event: DecodedGovernorEvent::ProposalCreated(ProposalCreatedEvent {
                proposal_id: "42".to_owned(),
                proposer: PROPOSER.to_owned(),
                targets: vec![TARGET.to_owned()],
                values: vec!["1".to_owned()],
                signatures: vec!["upgrade()".to_owned()],
                calldatas: vec!["0x1234".to_owned()],
                vote_start: "100".to_owned(),
                vote_end: "200".to_owned(),
                description: "Proposal title\n\nProposal body".to_owned(),
            }),
        }],
    )
    .map_err(|error| format!("proposal projection failed: {error:?}"))?;

    let mut transaction = store
        .begin_transaction()
        .map_err(|error| format!("begin transaction failed: {error}"))?;
    transaction
        .apply_projection_batch(&IndexerProjectionBatch {
            proposal: Some(proposal_batch),
            token: Some(token_batch),
            ..IndexerProjectionBatch::default()
        })
        .map_err(|error| format!("apply projection batch failed: {error}"))?;
    transaction
        .commit()
        .map_err(|error| format!("commit transaction failed: {error}"))?;

    let metric = sqlx::query(
        "SELECT power_sum::TEXT AS power_sum, member_count
         FROM data_metric
         WHERE id = '0000000002-proposal'",
    )
    .fetch_one(&database.pool)
    .await?;
    assert_eq!(
        metric.get::<Option<String>, _>("power_sum"),
        Some("0".to_owned())
    );
    assert_eq!(metric.get::<Option<i32>, _>("member_count"), Some(1));

    database.cleanup().await?;

    Ok(())
}

fn apply_projection_batch(
    store: &mut PostgresIndexerRunnerStore,
    batch: IndexerProjectionBatch,
) -> Result<(), Box<dyn Error>> {
    let mut transaction = store
        .begin_transaction()
        .map_err(|error| format!("begin transaction failed: {error}"))?;
    transaction
        .apply_projection_batch(&batch)
        .map_err(|error| format!("apply batch failed: {error}"))?;
    transaction
        .commit()
        .map_err(|error| format!("commit transaction failed: {error}"))?;

    Ok(())
}

async fn run_indexer_command(
    database_url: &str,
    datalens_endpoint: &str,
) -> Result<(), Box<dyn Error>> {
    let mut child = Command::new(env!("CARGO_BIN_EXE_degov-datalens-indexer"))
        .arg("run")
        .env("DEGOV_INDEXER_DATABASE_URL", database_url)
        .env("DEGOV_INDEXER_DAO_CODE", "demo-dao")
        .env("DEGOV_INDEXER_START_BLOCK", "1")
        .env("DEGOV_INDEXER_TARGET_HEIGHT", "2")
        .env("DEGOV_INDEXER_RUN_ONCE", "true")
        .env("DATALENS_ENDPOINT", datalens_endpoint)
        .env("DATALENS_APPLICATION", "degov-test")
        .env("DATALENS_TOKEN", "unit-test-redacted-value")
        .env("DATALENS_FINALITY", "durable_only")
        .env("DATALENS_CHAIN_FAMILY", "evm")
        .env("DATALENS_CHAIN_NAME", "ethereum")
        .env("DATALENS_CHAIN_ID", "1")
        .env("DATALENS_DATASET_FAMILY", "evm")
        .env("DATALENS_DATASET_NAME", "logs")
        .env("DATALENS_QUERY_BLOCK_RANGE_LIMIT", "10")
        .env("DATALENS_GOVERNOR_ADDRESS", GOVERNOR)
        .env("DATALENS_GOVERNOR_TOKEN_ADDRESS", TOKEN)
        .env("DATALENS_GOVERNOR_TOKEN_STANDARD", "ERC20")
        .env("DATALENS_TIMELOCK_ADDRESS", TIMELOCK)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    let status = timeout(Duration::from_secs(10), async {
        loop {
            if let Some(status) = child.try_wait()? {
                return Ok::<_, std::io::Error>(status);
            }
            sleep(Duration::from_millis(50)).await;
        }
    })
    .await;

    let status = match status {
        Ok(status) => status?,
        Err(_) => {
            let _ = child.kill();
            return Err("indexer run command timed out".into());
        }
    };
    let output = child.wait_with_output()?;

    if !status.success() {
        return Err(format!(
            "indexer run failed with status {status}\nstdout:\n{}\nstderr:\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        )
        .into());
    }

    Ok(())
}

async fn run_indexer_all_contract_sets_command(
    database_url: &str,
    datalens_endpoint: &str,
) -> Result<(), Box<dyn Error>> {
    let chains_json = json!([
        {
            "chainId": 1,
            "networkName": "ethereum",
            "contracts": [
                {
                    "daoCode": "demo-dao",
                    "chainId": 1,
                    "networkName": "ethereum",
                    "governor": GOVERNOR,
                    "governorToken": TOKEN,
                    "tokenStandard": "ERC20",
                    "timelock": TIMELOCK,
                    "startBlock": 1
                },
                {
                    "daoCode": "demo-dao",
                    "chainId": 1,
                    "networkName": "ethereum",
                    "governor": SECOND_GOVERNOR,
                    "governorToken": SECOND_TOKEN,
                    "tokenStandard": "ERC20",
                    "timelock": SECOND_TIMELOCK,
                    "startBlock": 1
                }
            ]
        }
    ])
    .to_string();
    let mut child = Command::new(env!("CARGO_BIN_EXE_degov-datalens-indexer"))
        .arg("run")
        .env("DEGOV_INDEXER_DATABASE_URL", database_url)
        .env("DEGOV_INDEXER_CONTRACT_SET_MODE", "all")
        .env("DEGOV_INDEXER_TARGET_HEIGHT", "2")
        .env("DEGOV_INDEXER_RUN_ONCE", "true")
        .env("DATALENS_ENDPOINT", datalens_endpoint)
        .env("DATALENS_APPLICATION", "degov-test")
        .env("DATALENS_TOKEN", "unit-test-redacted-value")
        .env("DATALENS_FINALITY", "durable_only")
        .env("DATALENS_CHAIN_FAMILY", "evm")
        .env("DATALENS_CHAIN_NAME", "ethereum")
        .env("DATALENS_CHAIN_ID", "1")
        .env("DATALENS_DATASET_FAMILY", "evm")
        .env("DATALENS_DATASET_NAME", "logs")
        .env("DATALENS_QUERY_BLOCK_RANGE_LIMIT", "10")
        .env("DATALENS_CHAINS_JSON", chains_json)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    let status = timeout(Duration::from_secs(10), async {
        loop {
            if let Some(status) = child.try_wait()? {
                return Ok::<_, std::io::Error>(status);
            }
            sleep(Duration::from_millis(50)).await;
        }
    })
    .await;

    let status = match status {
        Ok(status) => status?,
        Err(_) => {
            let _ = child.kill();
            return Err("indexer all-mode run command timed out".into());
        }
    };
    let output = child.wait_with_output()?;

    if !status.success() {
        return Err(format!(
            "indexer all-mode run failed with status {status}\nstdout:\n{}\nstderr:\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        )
        .into());
    }

    Ok(())
}

struct FakeDatalensServer {
    endpoint: String,
    query_count: Arc<AtomicU64>,
}

impl FakeDatalensServer {
    fn start(governor_rows: Vec<Value>, token_rows: Vec<Value>, timelock_rows: Vec<Value>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind fake Datalens server");
        let endpoint = format!("http://{}", listener.local_addr().expect("local addr"));
        let query_count = Arc::new(AtomicU64::new(0));
        let server_query_count = query_count.clone();

        thread::spawn(move || {
            for stream in listener.incoming().take(4).flatten() {
                handle_datalens_request(
                    stream,
                    &governor_rows,
                    &token_rows,
                    &timelock_rows,
                    &server_query_count,
                );
            }
        });

        Self {
            endpoint,
            query_count,
        }
    }
}

fn handle_datalens_request(
    mut stream: TcpStream,
    governor_rows: &[Value],
    token_rows: &[Value],
    timelock_rows: &[Value],
    query_count: &AtomicU64,
) {
    let request = read_http_request(&mut stream);
    let body = if request.contains("discovery") {
        json!({
            "data": {
                "discovery": {
                    "chains": []
                }
            }
        })
    } else {
        let query_index = query_count.fetch_add(1, Ordering::Relaxed);
        let rows = match query_index {
            0 => governor_rows.to_vec(),
            1 => token_rows.to_vec(),
            2 => timelock_rows.to_vec(),
            _ => Vec::new(),
        };

        json!({
            "data": {
                "query": {
                    "chain": {},
                    "datasetKey": "evm.logs",
                    "range": {},
                    "cache": {},
                    "rows": rows
                }
            }
        })
    }
    .to_string();

    let response = format!(
        "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    stream
        .write_all(response.as_bytes())
        .expect("write fake Datalens response");
}

fn read_http_request(stream: &mut TcpStream) -> String {
    let mut buffer = Vec::new();
    let mut chunk = [0; 1024];

    loop {
        let read = stream.read(&mut chunk).expect("read fake Datalens request");
        if read == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..read]);

        if let Some(header_end) = find_header_end(&buffer) {
            let content_length = content_length(&buffer[..header_end]).unwrap_or(0);
            let body_start = header_end + 4;
            if buffer.len().saturating_sub(body_start) >= content_length {
                break;
            }
        }
    }

    String::from_utf8_lossy(&buffer).into_owned()
}

fn find_header_end(buffer: &[u8]) -> Option<usize> {
    buffer.windows(4).position(|window| window == b"\r\n\r\n")
}

fn content_length(headers: &[u8]) -> Option<usize> {
    String::from_utf8_lossy(headers).lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        if name.eq_ignore_ascii_case("content-length") {
            value.trim().parse().ok()
        } else {
            None
        }
    })
}

async fn assert_table_count(pool: &PgPool, table: &str, expected: i64) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query(&format!("SELECT count(*)::BIGINT FROM {table}"))
        .fetch_one(pool)
        .await?
        .get(0);

    assert_eq!(count, expected);

    Ok(())
}

async fn assert_checkpoint(pool: &PgPool) -> Result<(), sqlx::Error> {
    let row = sqlx::query(
        "SELECT next_block::BIGINT, processed_height::BIGINT, target_height::BIGINT
         FROM degov_indexer_checkpoint
         WHERE dao_code = 'demo-dao'
           AND chain_id = 1
           AND contract_set_id = $1
           AND stream_id = 'datalens-native'
           AND data_source_version = 'datalens-v1'",
    )
    .bind(CONTRACT_SET_ID)
    .fetch_one(pool)
    .await?;

    assert_eq!(row.get::<i64, _>(0), 3);
    assert_eq!(row.get::<i64, _>(1), 2);
    assert_eq!(row.get::<i64, _>(2), 2);

    Ok(())
}

async fn insert_checkpoint(
    pool: &PgPool,
    contract_set_id: &str,
    next_block: i64,
    processed_height: Option<i64>,
    target_height: Option<i64>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO degov_indexer_checkpoint (
            dao_code,
            chain_id,
            contract_set_id,
            stream_id,
            data_source_version,
            next_block,
            processed_height,
            target_height
        ) VALUES ('demo-dao', 1, $1, 'datalens-native', 'datalens-v1', $2, $3, $4)",
    )
    .bind(contract_set_id)
    .bind(next_block)
    .bind(processed_height)
    .bind(target_height)
    .execute(pool)
    .await?;

    Ok(())
}

async fn assert_checkpoint_scope(
    pool: &PgPool,
    contract_set_id: &str,
    next_block: i64,
    processed_height: Option<i64>,
    target_height: Option<i64>,
) -> Result<(), sqlx::Error> {
    let row = sqlx::query(
        "SELECT next_block::BIGINT, processed_height::BIGINT, target_height::BIGINT
         FROM degov_indexer_checkpoint
         WHERE dao_code = 'demo-dao'
           AND chain_id = 1
           AND contract_set_id = $1
           AND stream_id = 'datalens-native'
           AND data_source_version = 'datalens-v1'",
    )
    .bind(contract_set_id)
    .fetch_one(pool)
    .await?;

    assert_eq!(row.get::<i64, _>(0), next_block);
    assert_eq!(row.get::<Option<i64>, _>(1), processed_height);
    assert_eq!(row.get::<Option<i64>, _>(2), target_height);

    Ok(())
}

async fn assert_checkpoint_row_count(pool: &PgPool, expected: i64) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query("SELECT count(*)::BIGINT FROM degov_indexer_checkpoint")
        .fetch_one(pool)
        .await?
        .get(0);

    assert_eq!(count, expected);

    Ok(())
}

async fn assert_proposal_projection_parity_state(pool: &PgPool) -> Result<(), sqlx::Error> {
    let proposal = sqlx::query(
        "SELECT id, proposal_id, block_timestamp::TEXT AS block_timestamp,
                vote_start_timestamp::TEXT AS vote_start_timestamp,
                vote_end_timestamp::TEXT AS vote_end_timestamp,
                proposal_eta::TEXT AS proposal_eta, clock_mode, quorum::TEXT AS quorum,
                decimals::TEXT AS decimals, metrics_votes_count,
                metrics_votes_weight_for_sum::TEXT AS metrics_votes_weight_for_sum
         FROM proposal",
    )
    .fetch_one(pool)
    .await?;

    let proposal_ref = "evm:1:2:0xtx20:0:0";
    assert_eq!(proposal.get::<String, _>("id"), proposal_ref);
    assert_eq!(proposal.get::<String, _>("proposal_id"), "42");
    assert_eq!(
        proposal.get::<String, _>("block_timestamp"),
        "1700000002000"
    );
    assert_eq!(proposal.get::<String, _>("vote_start_timestamp"), "100");
    assert_eq!(proposal.get::<String, _>("vote_end_timestamp"), "200");
    assert_eq!(proposal.get::<String, _>("proposal_eta"), "1234");
    assert_eq!(proposal.get::<String, _>("clock_mode"), "blocknumber");
    assert_eq!(proposal.get::<String, _>("quorum"), "0");
    assert_eq!(proposal.get::<String, _>("decimals"), "0");
    assert_eq!(
        proposal.get::<Option<i32>, _>("metrics_votes_count"),
        Some(1)
    );
    assert_eq!(
        proposal.get::<Option<String>, _>("metrics_votes_weight_for_sum"),
        Some("77".to_owned())
    );

    let action = sqlx::query("SELECT proposal_id, proposal_ref FROM proposal_action")
        .fetch_one(pool)
        .await?;
    assert_eq!(action.get::<String, _>("proposal_id"), proposal_ref);
    assert_eq!(action.get::<String, _>("proposal_ref"), proposal_ref);

    let active = sqlx::query(
        "SELECT proposal_id, proposal_ref, start_timepoint::TEXT AS start_timepoint,
                end_timepoint::TEXT AS end_timepoint, start_block_number::TEXT AS start_block_number
         FROM proposal_state_epoch
         WHERE state = 'Active'",
    )
    .fetch_one(pool)
    .await?;
    assert_eq!(active.get::<String, _>("proposal_id"), proposal_ref);
    assert_eq!(active.get::<String, _>("proposal_ref"), proposal_ref);
    assert_eq!(active.get::<String, _>("start_timepoint"), "100");
    assert_eq!(active.get::<String, _>("end_timepoint"), "200");
    assert_eq!(active.get::<Option<String>, _>("start_block_number"), None);

    let vote_group = sqlx::query("SELECT proposal_id, ref_proposal_id FROM vote_cast_group")
        .fetch_one(pool)
        .await?;
    assert_eq!(vote_group.get::<String, _>("proposal_id"), proposal_ref);
    assert_eq!(vote_group.get::<String, _>("ref_proposal_id"), "42");

    Ok(())
}

async fn assert_token_projection_state(pool: &PgPool) -> Result<(), sqlx::Error> {
    let mapping = sqlx::query(
        r#"SELECT "from", "to", power::TEXT AS power
           FROM delegate_mapping
           WHERE chain_id = 1
             AND dao_code = 'demo-dao'
             AND governor_address = $1
             AND token_address = $2
             AND "from" = $3"#,
    )
    .bind(GOVERNOR)
    .bind(TOKEN)
    .bind(DELEGATOR)
    .fetch_one(pool)
    .await?;

    assert_eq!(mapping.get::<String, _>("from"), DELEGATOR);
    assert_eq!(mapping.get::<String, _>("to"), DELEGATE);
    assert_eq!(mapping.get::<String, _>("power"), "75");

    let delegate = sqlx::query(
        "SELECT from_delegate, to_delegate, power::TEXT AS power, is_current
         FROM delegate
         WHERE chain_id = 1
           AND dao_code = 'demo-dao'
           AND governor_address = $1
           AND token_address = $2
           AND from_delegate = $3
           AND to_delegate = $4",
    )
    .bind(GOVERNOR)
    .bind(TOKEN)
    .bind(DELEGATOR)
    .bind(DELEGATE)
    .fetch_one(pool)
    .await?;

    assert_eq!(delegate.get::<String, _>("from_delegate"), DELEGATOR);
    assert_eq!(delegate.get::<String, _>("to_delegate"), DELEGATE);
    assert_eq!(delegate.get::<String, _>("power"), "75");
    assert!(delegate.get::<bool, _>("is_current"));

    let contributor = sqlx::query(
        "SELECT power::TEXT AS power, balance::TEXT AS balance,
                delegates_count_all, delegates_count_effective
         FROM contributor
	         WHERE chain_id = 1
	           AND dao_code = 'demo-dao'
	           AND governor_address = $1
	           AND token_address = $2
	           AND id = $3",
    )
    .bind(GOVERNOR)
    .bind(TOKEN)
    .bind(DELEGATE)
    .fetch_one(pool)
    .await?;

    assert_eq!(contributor.get::<String, _>("power"), "0");
    assert_eq!(contributor.get::<Option<String>, _>("balance"), None);
    assert_eq!(contributor.get::<i32, _>("delegates_count_all"), 1);
    assert_eq!(contributor.get::<i32, _>("delegates_count_effective"), 1);

    let checkpoint = sqlx::query(
        "SELECT account, clock_mode, timepoint::TEXT AS timepoint,
                previous_power::TEXT AS previous_power, new_power::TEXT AS new_power,
                delta::TEXT AS delta, source, cause, delegator, from_delegate, to_delegate
         FROM vote_power_checkpoint",
    )
    .fetch_one(pool)
    .await?;

    assert_eq!(checkpoint.get::<String, _>("account"), DELEGATE);
    assert_eq!(checkpoint.get::<String, _>("clock_mode"), "blocknumber");
    assert_eq!(checkpoint.get::<String, _>("timepoint"), "2");
    assert_eq!(checkpoint.get::<String, _>("previous_power"), "0");
    assert_eq!(checkpoint.get::<String, _>("new_power"), "100");
    assert_eq!(checkpoint.get::<String, _>("delta"), "100");
    assert_eq!(checkpoint.get::<String, _>("source"), "event");
    assert_eq!(
        checkpoint.get::<String, _>("cause"),
        "delegate-change+transfer"
    );
    assert_eq!(
        checkpoint.get::<Option<String>, _>("delegator"),
        Some(DELEGATOR.to_owned())
    );
    assert_eq!(
        checkpoint.get::<Option<String>, _>("from_delegate"),
        Some(ZERO_ADDRESS.to_owned())
    );
    assert_eq!(
        checkpoint.get::<Option<String>, _>("to_delegate"),
        Some(DELEGATE.to_owned())
    );

    Ok(())
}

async fn assert_timelock_projection_state(pool: &PgPool) -> Result<(), sqlx::Error> {
    let proposal_ref = "evm:1:2:0xtx20:0:0";
    let operation = sqlx::query(
        "SELECT proposal_id, proposal_ref, state, call_count, executed_call_count
         FROM timelock_operation",
    )
    .fetch_one(pool)
    .await?;

    assert_eq!(
        operation.get::<Option<String>, _>("proposal_id"),
        Some(proposal_ref.to_owned())
    );
    assert_eq!(
        operation.get::<Option<String>, _>("proposal_ref"),
        Some(proposal_ref.to_owned())
    );
    assert_eq!(operation.get::<String, _>("state"), "Done");
    assert_eq!(operation.get::<Option<i32>, _>("call_count"), Some(1));
    assert_eq!(
        operation.get::<Option<i32>, _>("executed_call_count"),
        Some(1)
    );

    let call = sqlx::query(
        "SELECT proposal_id, proposal_ref, proposal_action_id, proposal_action_index, state
         FROM timelock_call",
    )
    .fetch_one(pool)
    .await?;

    assert_eq!(
        call.get::<Option<String>, _>("proposal_id"),
        Some(proposal_ref.to_owned())
    );
    assert_eq!(
        call.get::<Option<String>, _>("proposal_ref"),
        Some(proposal_ref.to_owned())
    );
    assert_eq!(
        call.get::<Option<String>, _>("proposal_action_id"),
        Some(format!("{proposal_ref}:action:0"))
    );
    assert_eq!(call.get::<Option<i32>, _>("proposal_action_index"), Some(0));
    assert_eq!(call.get::<String, _>("state"), "Done");

    Ok(())
}

fn unique_schema_name() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_millis();
    let sequence = SCHEMA_COUNTER.fetch_add(1, Ordering::Relaxed);

    format!(
        "degov_runtime_run_test_{}_{}_{}",
        std::process::id(),
        millis,
        sequence
    )
}

fn database_url_with_search_path(database_url: &str, schema: &str) -> String {
    let separator = if database_url.contains('?') { '&' } else { '?' };

    format!("{database_url}{separator}options=-c%20search_path%3D{schema}")
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
        2,
        0,
        1,
        GOVERNOR,
        vec![PROPOSAL_QUEUED],
        encode(&[uint(42), uint(1234)]),
    )
}

fn vote_cast_row() -> Value {
    raw_log(
        2,
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
        2,
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
        2,
        1,
        1,
        TOKEN,
        vec![DELEGATE_VOTES_CHANGED, topic_address(DELEGATE).as_str()],
        encode(&[uint(0), uint(100)]),
    )
}

fn erc20_transfer_row() -> Value {
    raw_log(
        2,
        1,
        2,
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
        2,
        0,
        3,
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
        2,
        2,
        1,
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

fn proposal_projection_context() -> ProposalProjectionContext {
    ProposalProjectionContext {
        contract_set_id: CONTRACT_SET_ID.to_owned(),
        dao_code: "demo-dao".to_owned(),
        governor_address: GOVERNOR.to_owned(),
        contracts: ChainContracts {
            governor: GOVERNOR.to_owned(),
            governor_token: TOKEN.to_owned(),
            timelock: TIMELOCK.to_owned(),
        },
        read_plan_config: BatchReadPlanConfig {
            max_concurrency: 4,
            multicall_batch_size: 10,
        },
    }
}

fn vote_projection_context() -> VoteProjectionContext {
    VoteProjectionContext {
        contract_set_id: CONTRACT_SET_ID.to_owned(),
        dao_code: "demo-dao".to_owned(),
        governor_address: GOVERNOR.to_owned(),
        contracts: ChainContracts {
            governor: GOVERNOR.to_owned(),
            governor_token: TOKEN.to_owned(),
            timelock: TIMELOCK.to_owned(),
        },
        read_plan_config: BatchReadPlanConfig {
            max_concurrency: 4,
            multicall_batch_size: 10,
        },
    }
}

fn timelock_projection_context() -> TimelockProjectionContext {
    TimelockProjectionContext {
        dao_code: "demo-dao".to_owned(),
        governor_address: GOVERNOR.to_owned(),
        timelock_address: TIMELOCK.to_owned(),
        contracts: ChainContracts {
            governor: GOVERNOR.to_owned(),
            governor_token: TOKEN.to_owned(),
            timelock: TIMELOCK.to_owned(),
        },
        read_plan_config: BatchReadPlanConfig {
            max_concurrency: 4,
            multicall_batch_size: 10,
        },
    }
}

fn token_projection_context() -> TokenProjectionContext {
    TokenProjectionContext {
        contract_set_id: CONTRACT_SET_ID.to_owned(),
        dao_code: "demo-dao".to_owned(),
        governor_address: GOVERNOR.to_owned(),
        token_address: TOKEN.to_owned(),
        contracts: ChainContracts {
            governor: GOVERNOR.to_owned(),
            governor_token: TOKEN.to_owned(),
            timelock: TIMELOCK.to_owned(),
        },
        token_standard: GovernanceTokenStandard::Erc20,
        from_block: 1,
        to_block: 10,
        target_height: Some(10),
        read_plan_config: BatchReadPlanConfig {
            max_concurrency: 4,
            multicall_batch_size: 10,
        },
        current_power_method: ChainReadMethod::GetVotes,
    }
}

async fn seed_global_metric(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO data_metric (
            id, contract_set_id, chain_id, dao_code, governor_address, token_address, power_sum, member_count
         )
         VALUES ('global', $1, 1, 'demo-dao', $2, $3, 150::NUMERIC(78, 0), 2)",
    )
    .bind(CONTRACT_SET_ID)
    .bind(GOVERNOR)
    .bind(TOKEN)
    .execute(pool)
    .await?;

    Ok(())
}

async fn seed_empty_global_metric(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO data_metric (
            id, contract_set_id, chain_id, dao_code, governor_address, token_address, power_sum, member_count
         )
         VALUES ('global', $1, 1, 'demo-dao', $2, $3, 0::NUMERIC(78, 0), 0)",
    )
    .bind(CONTRACT_SET_ID)
    .bind(GOVERNOR)
    .bind(TOKEN)
    .execute(pool)
    .await?;

    Ok(())
}

fn normalized_token_log(
    id: &str,
    block_number: u64,
    transaction_index: u64,
    log_index: u64,
) -> NormalizedEvmLog {
    NormalizedEvmLog {
        address: TOKEN.to_owned(),
        ..normalized_log(id, block_number, transaction_index, log_index)
    }
}

fn normalized_log(
    id: &str,
    block_number: u64,
    transaction_index: u64,
    log_index: u64,
) -> NormalizedEvmLog {
    NormalizedEvmLog {
        id: id.to_owned(),
        chain_id: 1,
        block_number,
        block_hash: format!("0xblock{block_number}"),
        block_timestamp_ms: Some((1_700_000_000 + block_number) * 1_000),
        transaction_hash: format!("0xtx{block_number}{transaction_index}"),
        transaction_index,
        log_index,
        address: GOVERNOR.to_owned(),
        topics: vec![],
        data: "0x".to_owned(),
        removed: false,
        raw_payload: json!({ "block_number": block_number }),
    }
}

fn timelock_normalized_log(
    id: &str,
    block_number: u64,
    transaction_index: u64,
    log_index: u64,
) -> NormalizedEvmLog {
    let mut log = normalized_log(id, block_number, transaction_index, log_index);
    log.address = TIMELOCK.to_owned();
    log
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
const CONTRACT_SET_ID: &str = "dao=demo-dao|chain=1|datalens_chain=ethereum|dataset=evm.logs|governor=0x1111111111111111111111111111111111111111|token=0x2222222222222222222222222222222222222222|token_standard=erc20|timelock=0x3333333333333333333333333333333333333333";
const SECOND_GOVERNOR: &str = "0x4444444444444444444444444444444444444444";
const SECOND_TOKEN: &str = "0x5555555555555555555555555555555555555555";
const SECOND_TIMELOCK: &str = "0x6666666666666666666666666666666666666666";
const SECOND_CONTRACT_SET_ID: &str = "dao=demo-dao|chain=1|datalens_chain=ethereum|dataset=evm.logs|governor=0x4444444444444444444444444444444444444444|token=0x5555555555555555555555555555555555555555|token_standard=erc20|timelock=0x6666666666666666666666666666666666666666";
const PROPOSER: &str = "0x0000000000000000000000000000000000000a01";
const TARGET: &str = "0x0000000000000000000000000000000000000a02";
const VOTER: &str = "0x0000000000000000000000000000000000000b01";
const DELEGATOR: &str = "0x0000000000000000000000000000000000000c01";
const DELEGATE: &str = "0x0000000000000000000000000000000000000c02";
const RECEIVER: &str = "0x0000000000000000000000000000000000000c03";
const ZERO_ADDRESS: &str = "0x0000000000000000000000000000000000000000";
const OPERATION_ID: &str = "0x0101010101010101010101010101010101010101010101010101010101010101";
const ZERO_OPERATION_ID: &str =
    "0x0000000000000000000000000000000000000000000000000000000000000000";
const PROPOSAL_CREATED: &str = "0x7d84a6263ae0d98d3329bd7b46bb4e8d6f98cd35a7adb45c274c8b7fd5ebd5e0";
const PROPOSAL_QUEUED: &str = "0x9a2e42fd6722813d69113e7d0079d3d940171428df7373df9c7f7617cfda2892";
const VOTE_CAST: &str = "0xb8e138887d0aa13bab447e82de9d5c1777041ecd21ca36ba824ff1e6c07ddda4";
const TRANSFER: &str = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const DELEGATE_CHANGED: &str = "0x3134e8a2e6d97e929a7e54011ea5485d7d196dd5f0ba4d4ef95803e8e3fc257f";
const DELEGATE_VOTES_CHANGED: &str =
    "0xdec2bacdd2f05b59de34da9b523dff8be42e5e38e818c82fdb0bae774387a724";
const CALL_SCHEDULED: &str = "0x4cf4410cc57040e44862ef0f45f3dd5a5e02db8eb8add648d4b0e236f1d07dca";
const CALL_EXECUTED: &str = "0xc2617efa69bab66782fa219543714338489c4e9e178271560a91b82c3f612b58";
