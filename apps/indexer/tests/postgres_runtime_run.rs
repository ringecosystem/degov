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
    DelegateVotesChangedEvent, GovernanceTokenStandard, IndexerProjectionBatch, IndexerRunnerStore,
    IndexerRunnerTransaction, NormalizedEvmLog, PostgresIndexerRunnerStore, ProposalCreatedEvent,
    ProposalExtendedEvent, ProposalProjectionContext, ProposalProjectionEvent, ProposalQueuedEvent,
    TimelockProjectionContext, TimelockProjectionEvent, TimelockProposalLinkContext,
    TokenProjectionContext, TokenProjectionEvent, TokenTransferEvent, VoteCastEvent,
    VoteProjectionContext, VoteProjectionEvent, project_proposal_events, project_timelock_events,
    project_timelock_events_with_proposal_links, project_token_events, project_vote_events,
    runtime::apply_migrations,
};
use ethabi::{Token, encode};
use serde_json::{Value, json};
use sqlx::{PgPool, Row, postgres::PgPoolOptions};
use tokio::sync::{Mutex, MutexGuard};
use tokio::time::{sleep, timeout};

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
        apply_migrations(&pool).await?;

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

    assert_eq!(datalens.head_count.load(Ordering::Relaxed), 1);
    assert_eq!(datalens.query_count.load(Ordering::Relaxed), 1);
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

    assert_eq!(datalens.head_count.load(Ordering::Relaxed), 0);
    assert_eq!(datalens.query_count.load(Ordering::Relaxed), 1);
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

    let raw_ref = expected_proposal_ref(CONTRACT_SET_ID, 1, GOVERNOR, "42");
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

#[tokio::test(flavor = "multi_thread")]
async fn test_postgres_token_same_batch_mapping_mutations_remain_ordered()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    let mut store = PostgresIndexerRunnerStore::new(database.pool.clone());
    let initial = project_token_events(
        &token_projection_context(),
        vec![
            TokenProjectionEvent {
                log: normalized_token_log("0000000001-delegate", 1, 0, 1),
                event: DecodedTokenEvent::DelegateChanged(DelegateChangedEvent {
                    delegator: DELEGATOR.to_owned(),
                    from_delegate: ZERO_ADDRESS.to_owned(),
                    to_delegate: DELEGATE.to_owned(),
                }),
            },
            TokenProjectionEvent {
                log: normalized_token_log("0000000002-votes", 1, 0, 2),
                event: DecodedTokenEvent::DelegateVotesChanged(DelegateVotesChangedEvent {
                    delegate: DELEGATE.to_owned(),
                    previous_votes: "0".to_owned(),
                    new_votes: "100".to_owned(),
                }),
            },
        ],
    )
    .map_err(|error| format!("initial token projection failed: {error:?}"))?;
    apply_projection_batch(
        &mut store,
        IndexerProjectionBatch {
            token: Some(initial),
            ..IndexerProjectionBatch::default()
        },
    )?;

    let same_batch = project_token_events(
        &token_projection_context(),
        vec![
            TokenProjectionEvent {
                log: normalized_token_log("0000000003-transfer", 2, 0, 1),
                event: DecodedTokenEvent::Transfer(TokenTransferEvent {
                    from: DELEGATOR.to_owned(),
                    to: RECEIVER.to_owned(),
                    value: "40".to_owned(),
                    standard: GovernanceTokenStandard::Erc20,
                }),
            },
            TokenProjectionEvent {
                log: normalized_token_log("0000000004-redelegate", 2, 0, 2),
                event: DecodedTokenEvent::DelegateChanged(DelegateChangedEvent {
                    delegator: DELEGATOR.to_owned(),
                    from_delegate: DELEGATE.to_owned(),
                    to_delegate: SECOND_DELEGATE.to_owned(),
                }),
            },
            TokenProjectionEvent {
                log: normalized_token_log("0000000005-new-votes", 2, 0, 3),
                event: DecodedTokenEvent::DelegateVotesChanged(DelegateVotesChangedEvent {
                    delegate: SECOND_DELEGATE.to_owned(),
                    previous_votes: "0".to_owned(),
                    new_votes: "60".to_owned(),
                }),
            },
            TokenProjectionEvent {
                log: normalized_token_log("0000000006-second-transfer", 2, 0, 4),
                event: DecodedTokenEvent::Transfer(TokenTransferEvent {
                    from: DELEGATOR.to_owned(),
                    to: RECEIVER.to_owned(),
                    value: "10".to_owned(),
                    standard: GovernanceTokenStandard::Erc20,
                }),
            },
        ],
    )
    .map_err(|error| format!("same-batch token projection failed: {error:?}"))?;
    apply_projection_batch(
        &mut store,
        IndexerProjectionBatch {
            token: Some(same_batch),
            ..IndexerProjectionBatch::default()
        },
    )?;

    let mapping = sqlx::query(
        r#"SELECT "to", power::TEXT AS power
           FROM delegate_mapping
           WHERE contract_set_id = $1 AND "from" = $2"#,
    )
    .bind(CONTRACT_SET_ID)
    .bind(DELEGATOR)
    .fetch_one(&database.pool)
    .await?;
    assert_eq!(mapping.get::<String, _>("to"), SECOND_DELEGATE);
    assert_eq!(mapping.get::<String, _>("power"), "50");

    let previous_relation = sqlx::query(
        "SELECT power::TEXT AS power, is_current
         FROM delegate
         WHERE contract_set_id = $1 AND from_delegate = $2 AND to_delegate = $3",
    )
    .bind(CONTRACT_SET_ID)
    .bind(DELEGATOR)
    .bind(DELEGATE)
    .fetch_one(&database.pool)
    .await?;
    assert_eq!(previous_relation.get::<String, _>("power"), "60");
    assert!(!previous_relation.get::<bool, _>("is_current"));

    let current_relation = sqlx::query(
        "SELECT power::TEXT AS power, is_current
         FROM delegate
         WHERE contract_set_id = $1 AND from_delegate = $2 AND to_delegate = $3",
    )
    .bind(CONTRACT_SET_ID)
    .bind(DELEGATOR)
    .bind(SECOND_DELEGATE)
    .fetch_one(&database.pool)
    .await?;
    assert_eq!(current_relation.get::<String, _>("power"), "50");
    assert!(current_relation.get::<bool, _>("is_current"));

    let previous_delegate_counts = sqlx::query(
        "SELECT delegates_count_all, delegates_count_effective
         FROM contributor
         WHERE contract_set_id = $1 AND id = $2",
    )
    .bind(CONTRACT_SET_ID)
    .bind(DELEGATE)
    .fetch_one(&database.pool)
    .await?;
    assert_eq!(
        previous_delegate_counts.get::<i32, _>("delegates_count_all"),
        0
    );
    assert_eq!(
        previous_delegate_counts.get::<i32, _>("delegates_count_effective"),
        0
    );

    let current_delegate_counts = sqlx::query(
        "SELECT delegates_count_all, delegates_count_effective
         FROM contributor
         WHERE contract_set_id = $1 AND id = $2",
    )
    .bind(CONTRACT_SET_ID)
    .bind(SECOND_DELEGATE)
    .fetch_one(&database.pool)
    .await?;
    assert_eq!(
        current_delegate_counts.get::<i32, _>("delegates_count_all"),
        1
    );
    assert_eq!(
        current_delegate_counts.get::<i32, _>("delegates_count_effective"),
        1
    );

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_postgres_token_repeated_delegate_ensure_keeps_member_count_once()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    let mut store = PostgresIndexerRunnerStore::new(database.pool.clone());
    let token_batch = project_token_events(
        &token_projection_context(),
        vec![
            TokenProjectionEvent {
                log: normalized_token_log("0000000010-first-delegate", 10, 0, 1),
                event: DecodedTokenEvent::DelegateChanged(DelegateChangedEvent {
                    delegator: DELEGATOR.to_owned(),
                    from_delegate: ZERO_ADDRESS.to_owned(),
                    to_delegate: DELEGATE.to_owned(),
                }),
            },
            TokenProjectionEvent {
                log: normalized_token_log("0000000011-second-delegate", 10, 0, 2),
                event: DecodedTokenEvent::DelegateChanged(DelegateChangedEvent {
                    delegator: RECEIVER.to_owned(),
                    from_delegate: ZERO_ADDRESS.to_owned(),
                    to_delegate: DELEGATE.to_owned(),
                }),
            },
        ],
    )
    .map_err(|error| format!("token projection failed: {error:?}"))?;
    apply_projection_batch(
        &mut store,
        IndexerProjectionBatch {
            token: Some(token_batch),
            ..IndexerProjectionBatch::default()
        },
    )?;

    let contributor_count: i64 = sqlx::query_scalar(
        "SELECT count(*)::BIGINT
         FROM contributor
         WHERE contract_set_id = $1 AND id = $2",
    )
    .bind(CONTRACT_SET_ID)
    .bind(DELEGATE)
    .fetch_one(&database.pool)
    .await?;
    assert_eq!(contributor_count, 1);

    let delegate_counts = sqlx::query(
        "SELECT delegates_count_all, delegates_count_effective
         FROM contributor
         WHERE contract_set_id = $1 AND id = $2",
    )
    .bind(CONTRACT_SET_ID)
    .bind(DELEGATE)
    .fetch_one(&database.pool)
    .await?;
    assert_eq!(delegate_counts.get::<i32, _>("delegates_count_all"), 2);
    assert_eq!(
        delegate_counts.get::<i32, _>("delegates_count_effective"),
        0
    );

    let member_count: Option<i32> = sqlx::query_scalar(
        "SELECT member_count
         FROM data_metric
         WHERE contract_set_id = $1 AND id = 'global'",
    )
    .bind(CONTRACT_SET_ID)
    .fetch_one(&database.pool)
    .await?;
    assert_eq!(member_count, Some(1));

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_postgres_token_preload_does_not_advance_member_count_before_timeline()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    seed_global_metric(&database.pool).await?;
    let mut store = PostgresIndexerRunnerStore::new(database.pool.clone());
    let proposal_batch = project_proposal_events(
        &proposal_projection_context(),
        vec![ProposalProjectionEvent {
            log: normalized_log("0000000010-proposal-before-token", 10, 0, 0),
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
    let token_batch = project_token_events(
        &token_projection_context(),
        vec![
            TokenProjectionEvent {
                log: normalized_token_log("0000000010-first-delegate", 10, 0, 1),
                event: DecodedTokenEvent::DelegateChanged(DelegateChangedEvent {
                    delegator: DELEGATOR.to_owned(),
                    from_delegate: ZERO_ADDRESS.to_owned(),
                    to_delegate: DELEGATE.to_owned(),
                }),
            },
            TokenProjectionEvent {
                log: normalized_token_log("0000000011-second-delegate", 10, 0, 2),
                event: DecodedTokenEvent::DelegateChanged(DelegateChangedEvent {
                    delegator: RECEIVER.to_owned(),
                    from_delegate: ZERO_ADDRESS.to_owned(),
                    to_delegate: DELEGATE.to_owned(),
                }),
            },
        ],
    )
    .map_err(|error| format!("token projection failed: {error:?}"))?;
    apply_projection_batch(
        &mut store,
        IndexerProjectionBatch {
            proposal: Some(proposal_batch),
            token: Some(token_batch),
            ..IndexerProjectionBatch::default()
        },
    )?;

    let proposal_member_count: Option<i32> = sqlx::query_scalar(
        "SELECT member_count
         FROM data_metric
         WHERE contract_set_id = $1 AND id = $2",
    )
    .bind(CONTRACT_SET_ID)
    .bind("0000000010-proposal-before-token")
    .fetch_one(&database.pool)
    .await?;
    assert_eq!(proposal_member_count, Some(2));

    let global_member_count: Option<i32> = sqlx::query_scalar(
        "SELECT member_count
         FROM data_metric
         WHERE contract_set_id = $1 AND id = 'global'",
    )
    .bind(CONTRACT_SET_ID)
    .fetch_one(&database.pool)
    .await?;
    assert_eq!(global_member_count, Some(3));

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_postgres_token_reconcile_tasks_preserve_conflict_semantics()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    let mut store = PostgresIndexerRunnerStore::new(database.pool.clone())
        .with_onchain_refresh_debounce(Duration::ZERO);
    seed_refresh_task_for_account(
        &database.pool,
        DELEGATOR,
        "failed",
        3,
        50,
        Some("stale error"),
        false,
    )
    .await?;
    seed_refresh_task_for_account(
        &database.pool,
        SECOND_DELEGATE,
        "processing",
        5,
        999,
        Some("rpc still running"),
        false,
    )
    .await?;

    let mut token_batch = project_token_events(
        &token_projection_context(),
        vec![
            TokenProjectionEvent {
                log: normalized_token_log("0000000020-transfer", 20, 0, 1),
                event: DecodedTokenEvent::Transfer(TokenTransferEvent {
                    from: DELEGATOR.to_owned(),
                    to: RECEIVER.to_owned(),
                    value: "40".to_owned(),
                    standard: GovernanceTokenStandard::Erc20,
                }),
            },
            TokenProjectionEvent {
                log: normalized_token_log("0000000022-delegator-votes", 22, 0, 2),
                event: DecodedTokenEvent::DelegateVotesChanged(DelegateVotesChangedEvent {
                    delegate: DELEGATOR.to_owned(),
                    previous_votes: "0".to_owned(),
                    new_votes: "100".to_owned(),
                }),
            },
            TokenProjectionEvent {
                log: normalized_token_log("0000000025-processing-votes", 25, 0, 3),
                event: DecodedTokenEvent::DelegateVotesChanged(DelegateVotesChangedEvent {
                    delegate: SECOND_DELEGATE.to_owned(),
                    previous_votes: "0".to_owned(),
                    new_votes: "80".to_owned(),
                }),
            },
        ],
    )
    .map_err(|error| format!("token projection failed: {error:?}"))?;
    token_batch
        .reconcile_plan
        .candidates
        .iter_mut()
        .find(|candidate| candidate.account == RECEIVER)
        .expect("receiver candidate")
        .status
        .reason
        .clear();
    let before = unix_time_millis_for_test();
    apply_projection_batch(
        &mut store,
        IndexerProjectionBatch {
            token: Some(token_batch),
            ..IndexerProjectionBatch::default()
        },
    )?;
    let after = unix_time_millis_for_test();

    let rows = sqlx::query(
        "SELECT id, account, refresh_balance, refresh_power, reason, status, attempts,
                next_run_at::TEXT AS next_run_at, first_seen_block_number::TEXT AS first_seen_block_number,
                last_seen_block_number::TEXT AS last_seen_block_number,
                last_seen_block_timestamp::TEXT AS last_seen_block_timestamp,
                last_seen_transaction_hash, processed_at::TEXT AS processed_at, error,
                pending_after_lock, pending_after_lock_block_number::TEXT AS pending_after_lock_block_number,
                pending_after_lock_block_timestamp::TEXT AS pending_after_lock_block_timestamp,
                pending_after_lock_transaction_hash
         FROM onchain_refresh_task
         ORDER BY account ASC",
    )
    .fetch_all(&database.pool)
    .await?;
    assert_eq!(rows.len(), 3);

    let pending = rows
        .iter()
        .find(|row| row.get::<String, _>("account") == DELEGATOR)
        .expect("pending conflict row");
    assert!(!pending.get::<bool, _>("refresh_balance"));
    assert!(pending.get::<bool, _>("refresh_power"));
    assert_eq!(
        pending.get::<String, _>("reason"),
        "delegate-votes-changed+transfer"
    );
    assert_eq!(pending.get::<String, _>("status"), "pending");
    assert_eq!(pending.get::<i32, _>("attempts"), 0);
    let pending_next_run_at = pending.get::<String, _>("next_run_at").parse::<i64>()?;
    let debounce_ms = 0;
    assert!(pending_next_run_at >= before + debounce_ms);
    assert!(pending_next_run_at <= after + debounce_ms);
    assert_eq!(pending.get::<String, _>("first_seen_block_number"), "10");
    assert_eq!(pending.get::<String, _>("last_seen_block_number"), "22");
    assert_eq!(
        pending.get::<String, _>("last_seen_block_timestamp"),
        "1700000022000"
    );
    assert_eq!(
        pending.get::<String, _>("last_seen_transaction_hash"),
        "0xtx220"
    );
    assert_eq!(pending.get::<Option<String>, _>("processed_at"), None);
    assert_eq!(pending.get::<Option<String>, _>("error"), None);
    assert!(!pending.get::<bool, _>("pending_after_lock"));
    assert_eq!(
        pending.get::<Option<String>, _>("pending_after_lock_block_number"),
        None
    );

    let inserted = rows
        .iter()
        .find(|row| row.get::<String, _>("account") == RECEIVER)
        .expect("inserted row");
    assert_eq!(inserted.get::<String, _>("id"), refresh_task_id(RECEIVER));
    assert_eq!(inserted.get::<String, _>("reason"), "token-activity");
    assert_eq!(inserted.get::<String, _>("first_seen_block_number"), "20");
    assert_eq!(inserted.get::<String, _>("last_seen_block_number"), "20");
    assert_eq!(inserted.get::<String, _>("status"), "pending");
    let inserted_next_run_at = inserted.get::<String, _>("next_run_at").parse::<i64>()?;
    assert!(inserted_next_run_at >= before + debounce_ms);
    assert!(inserted_next_run_at <= after + debounce_ms);

    let processing = rows
        .iter()
        .find(|row| row.get::<String, _>("account") == SECOND_DELEGATE)
        .expect("processing conflict row");
    assert_eq!(processing.get::<String, _>("status"), "processing");
    assert_eq!(processing.get::<i32, _>("attempts"), 5);
    assert_eq!(processing.get::<String, _>("next_run_at"), "999");
    assert_eq!(
        processing.get::<Option<String>, _>("error"),
        Some("rpc still running".to_owned())
    );
    assert_eq!(processing.get::<String, _>("first_seen_block_number"), "10");
    assert_eq!(processing.get::<String, _>("last_seen_block_number"), "25");
    assert!(processing.get::<bool, _>("pending_after_lock"));
    assert_eq!(
        processing.get::<Option<String>, _>("pending_after_lock_block_number"),
        Some("25".to_owned())
    );
    assert_eq!(
        processing.get::<Option<String>, _>("pending_after_lock_block_timestamp"),
        Some("1700000025000".to_owned())
    );
    assert_eq!(
        processing.get::<Option<String>, _>("pending_after_lock_transaction_hash"),
        Some("0xtx250".to_owned())
    );

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_postgres_token_reconcile_tasks_dedupe_duplicate_accounts_before_sql()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    let mut store = PostgresIndexerRunnerStore::new(database.pool.clone())
        .with_onchain_refresh_debounce(Duration::ZERO);
    seed_refresh_task_for_account(
        &database.pool,
        SECOND_DELEGATE,
        "processing",
        5,
        999,
        Some("rpc still running"),
        false,
    )
    .await?;

    let mut token_batch = project_token_events(
        &token_projection_context(),
        vec![
            TokenProjectionEvent {
                log: normalized_token_log("0000000020-transfer", 20, 0, 1),
                event: DecodedTokenEvent::Transfer(TokenTransferEvent {
                    from: DELEGATOR.to_owned(),
                    to: RECEIVER.to_owned(),
                    value: "40".to_owned(),
                    standard: GovernanceTokenStandard::Erc20,
                }),
            },
            TokenProjectionEvent {
                log: normalized_token_log("0000000022-delegator-votes", 22, 0, 2),
                event: DecodedTokenEvent::DelegateVotesChanged(DelegateVotesChangedEvent {
                    delegate: DELEGATOR.to_owned(),
                    previous_votes: "0".to_owned(),
                    new_votes: "100".to_owned(),
                }),
            },
            TokenProjectionEvent {
                log: normalized_token_log("0000000025-processing-votes", 25, 0, 3),
                event: DecodedTokenEvent::DelegateVotesChanged(DelegateVotesChangedEvent {
                    delegate: SECOND_DELEGATE.to_owned(),
                    previous_votes: "0".to_owned(),
                    new_votes: "80".to_owned(),
                }),
            },
        ],
    )
    .map_err(|error| format!("token projection failed: {error:?}"))?;

    let mut duplicate_delegator = token_batch
        .reconcile_plan
        .candidates
        .iter()
        .find(|candidate| candidate.account == DELEGATOR)
        .expect("delegator candidate")
        .clone();
    duplicate_delegator.status.last_seen_activity_block = 40;
    duplicate_delegator.status.last_seen_block_timestamp_ms = Some(1_700_000_040_000);
    duplicate_delegator.status.last_seen_transaction_hash = "0xtx400".to_owned();
    duplicate_delegator.latest_activity_block = 40;
    duplicate_delegator.latest_transaction_index = 0;
    duplicate_delegator.latest_log_index = 4;
    duplicate_delegator.status.last_seen_transaction_index = 0;
    duplicate_delegator.status.last_seen_log_index = 4;
    let mut duplicate_processing = token_batch
        .reconcile_plan
        .candidates
        .iter()
        .find(|candidate| candidate.account == SECOND_DELEGATE)
        .expect("processing candidate")
        .clone();
    duplicate_processing.status.last_seen_activity_block = 42;
    duplicate_processing.status.last_seen_block_timestamp_ms = Some(1_700_000_042_000);
    duplicate_processing.status.last_seen_transaction_hash = "0xtx420".to_owned();
    duplicate_processing.latest_activity_block = 42;
    duplicate_processing.latest_transaction_index = 0;
    duplicate_processing.latest_log_index = 5;
    duplicate_processing.status.last_seen_transaction_index = 0;
    duplicate_processing.status.last_seen_log_index = 5;
    token_batch
        .reconcile_plan
        .candidates
        .push(duplicate_delegator);
    token_batch
        .reconcile_plan
        .candidates
        .push(duplicate_processing);

    apply_projection_batch(
        &mut store,
        IndexerProjectionBatch {
            token: Some(token_batch),
            ..IndexerProjectionBatch::default()
        },
    )?;

    let rows = sqlx::query(
        "SELECT account, reason, status,
                first_seen_block_number::TEXT AS first_seen_block_number,
                last_seen_block_number::TEXT AS last_seen_block_number,
                last_seen_block_timestamp::TEXT AS last_seen_block_timestamp,
                last_seen_transaction_hash, pending_after_lock,
                pending_after_lock_block_number::TEXT AS pending_after_lock_block_number,
                pending_after_lock_block_timestamp::TEXT AS pending_after_lock_block_timestamp,
                pending_after_lock_transaction_hash
         FROM onchain_refresh_task
         ORDER BY account ASC",
    )
    .fetch_all(&database.pool)
    .await?;
    assert_eq!(rows.len(), 3);

    let deduped = rows
        .iter()
        .find(|row| row.get::<String, _>("account") == DELEGATOR)
        .expect("deduped delegator row");
    assert_eq!(
        deduped.get::<String, _>("reason"),
        "delegate-votes-changed+transfer"
    );
    assert_eq!(deduped.get::<String, _>("first_seen_block_number"), "20");
    assert_eq!(deduped.get::<String, _>("last_seen_block_number"), "40");
    assert_eq!(
        deduped.get::<String, _>("last_seen_block_timestamp"),
        "1700000040000"
    );
    assert_eq!(
        deduped.get::<String, _>("last_seen_transaction_hash"),
        "0xtx400"
    );

    let processing = rows
        .iter()
        .find(|row| row.get::<String, _>("account") == SECOND_DELEGATE)
        .expect("processing row");
    assert_eq!(processing.get::<String, _>("status"), "processing");
    assert!(processing.get::<bool, _>("pending_after_lock"));
    assert_eq!(
        processing.get::<Option<String>, _>("pending_after_lock_block_number"),
        Some("42".to_owned())
    );
    assert_eq!(
        processing.get::<Option<String>, _>("pending_after_lock_block_timestamp"),
        Some("1700000042000".to_owned())
    );
    assert_eq!(
        processing.get::<Option<String>, _>("pending_after_lock_transaction_hash"),
        Some("0xtx420".to_owned())
    );

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_postgres_token_deferred_refresh_reschedules_ready_materialized_task()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    let mut store = PostgresIndexerRunnerStore::new(database.pool.clone())
        .with_onchain_refresh_debounce(Duration::from_secs(120));
    seed_refresh_task_for_account(&database.pool, DELEGATE, "pending", 0, 0, None, false).await?;

    let before = unix_time_millis_for_test();
    let token_batch = project_token_events(
        &token_projection_context(),
        vec![TokenProjectionEvent {
            log: normalized_token_log("0000000030-ready-pending-repeat", 30, 0, 1),
            event: DecodedTokenEvent::DelegateVotesChanged(DelegateVotesChangedEvent {
                delegate: DELEGATE.to_owned(),
                previous_votes: "0".to_owned(),
                new_votes: "1".to_owned(),
            }),
        }],
    )
    .map_err(|error| format!("token projection failed: {error:?}"))?;
    apply_projection_batch(
        &mut store,
        IndexerProjectionBatch {
            token: Some(token_batch),
            ..IndexerProjectionBatch::default()
        },
    )?;
    let after = unix_time_millis_for_test();

    let pending = sqlx::query(
        "SELECT status, next_run_at::TEXT AS next_run_at
         FROM onchain_refresh_task
         WHERE contract_set_id = $1 AND account = $2",
    )
    .bind(CONTRACT_SET_ID)
    .bind(DELEGATE)
    .fetch_one(&database.pool)
    .await?;
    assert_eq!(pending.get::<String, _>("status"), "pending");
    let next_run_at = pending.get::<String, _>("next_run_at").parse::<i64>()?;
    assert!(next_run_at >= before + 120_000);
    assert!(next_run_at <= after + 120_000);

    let deferred_count: i64 = sqlx::query_scalar(
        "SELECT count(*)::BIGINT
         FROM onchain_refresh_deferred_candidate
         WHERE contract_set_id = $1 AND account = $2",
    )
    .bind(CONTRACT_SET_ID)
    .bind(DELEGATE)
    .fetch_one(&database.pool)
    .await?;
    assert_eq!(deferred_count, 1);

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_postgres_token_reconcile_tasks_insert_across_bulk_chunks()
-> Result<(), Box<dyn Error>> {
    const DENSE_EVENT_COUNT: usize = 1_205;
    const DENSE_UNIQUE_ACCOUNT_COUNT: usize = 150;
    const EXPECTED_MATERIALIZED_BATCH: i64 = 100;

    let database = TestDatabase::connect().await?;
    let mut store = PostgresIndexerRunnerStore::new(database.pool.clone())
        .with_onchain_refresh_debounce(Duration::from_secs(120));
    let deferred_account = indexed_account(DENSE_UNIQUE_ACCOUNT_COUNT - 1);
    let token_batch = project_token_events(
        &token_projection_context(),
        (0..DENSE_EVENT_COUNT)
            .map(|index| TokenProjectionEvent {
                log: normalized_token_log(
                    &format!("0000000030-dense-votes-{index}"),
                    30 + index as u64,
                    0,
                    1,
                ),
                event: DecodedTokenEvent::DelegateVotesChanged(DelegateVotesChangedEvent {
                    delegate: indexed_account(index % DENSE_UNIQUE_ACCOUNT_COUNT),
                    previous_votes: "0".to_owned(),
                    new_votes: "1".to_owned(),
                }),
            })
            .collect(),
    )
    .map_err(|error| format!("dense token projection failed: {error:?}"))?;
    assert_eq!(
        token_batch.reconcile_plan.candidates.len(),
        DENSE_UNIQUE_ACCOUNT_COUNT
    );

    apply_projection_batch(
        &mut store,
        IndexerProjectionBatch {
            token: Some(token_batch),
            ..IndexerProjectionBatch::default()
        },
    )?;

    let task_count: i64 = sqlx::query_scalar(
        "SELECT count(*)::BIGINT
         FROM onchain_refresh_task
         WHERE contract_set_id = $1",
    )
    .bind(CONTRACT_SET_ID)
    .fetch_one(&database.pool)
    .await?;
    assert_eq!(task_count, 0);

    let pending_count: i64 = sqlx::query_scalar(
        "SELECT count(*)::BIGINT
         FROM onchain_refresh_task
         WHERE contract_set_id = $1 AND status = 'pending'",
    )
    .bind(CONTRACT_SET_ID)
    .fetch_one(&database.pool)
    .await?;
    assert_eq!(pending_count, 0);

    let deferred_count: i64 = sqlx::query_scalar(
        "SELECT count(*)::BIGINT
         FROM onchain_refresh_deferred_candidate
         WHERE contract_set_id = $1",
    )
    .bind(CONTRACT_SET_ID)
    .fetch_one(&database.pool)
    .await?;
    assert_eq!(deferred_count, DENSE_UNIQUE_ACCOUNT_COUNT as i64);

    let deferred = sqlx::query(
        "SELECT account, reason, last_seen_block_number::TEXT AS last_seen_block_number,
                next_run_at::TEXT AS next_run_at
         FROM onchain_refresh_deferred_candidate
         WHERE contract_set_id = $1 AND account = $2",
    )
    .bind(CONTRACT_SET_ID)
    .bind(&deferred_account)
    .fetch_one(&database.pool)
    .await?;
    assert_eq!(deferred.get::<String, _>("account"), deferred_account);
    assert_eq!(
        deferred.get::<String, _>("reason"),
        "delegate-votes-changed"
    );
    assert_eq!(deferred.get::<String, _>("last_seen_block_number"), "1229");
    let first_next_run_at = deferred.get::<String, _>("next_run_at").parse::<i64>()?;

    let second_batch = project_token_events(
        &token_projection_context(),
        vec![TokenProjectionEvent {
            log: normalized_token_log("0000002000-dense-votes-repeat", 2_000, 0, 1),
            event: DecodedTokenEvent::DelegateVotesChanged(DelegateVotesChangedEvent {
                delegate: deferred_account.clone(),
                previous_votes: "1".to_owned(),
                new_votes: "2".to_owned(),
            }),
        }],
    )
    .map_err(|error| format!("repeat token projection failed: {error:?}"))?;
    apply_projection_batch(
        &mut store,
        IndexerProjectionBatch {
            token: Some(second_batch),
            ..IndexerProjectionBatch::default()
        },
    )?;

    let updated_deferred = sqlx::query(
        "SELECT last_seen_block_number::TEXT AS last_seen_block_number,
                next_run_at::TEXT AS next_run_at
         FROM onchain_refresh_deferred_candidate
         WHERE contract_set_id = $1 AND account = $2",
    )
    .bind(CONTRACT_SET_ID)
    .bind(&deferred_account)
    .fetch_one(&database.pool)
    .await?;
    assert_eq!(
        updated_deferred.get::<String, _>("last_seen_block_number"),
        "2000"
    );
    assert!(
        updated_deferred
            .get::<String, _>("next_run_at")
            .parse::<i64>()?
            >= first_next_run_at
    );

    let drained = store.drain_deferred_onchain_refresh_tasks(1).await?;
    assert_eq!(drained, 0);

    sqlx::query(
        "UPDATE onchain_refresh_deferred_candidate
         SET next_run_at = 0
         WHERE contract_set_id = $1",
    )
    .bind(CONTRACT_SET_ID)
    .execute(&database.pool)
    .await?;

    let drained = store
        .drain_deferred_onchain_refresh_tasks(EXPECTED_MATERIALIZED_BATCH as usize)
        .await?;
    assert_eq!(drained, EXPECTED_MATERIALIZED_BATCH as usize);

    let deferred_count_after_drain: i64 = sqlx::query_scalar(
        "SELECT count(*)::BIGINT
         FROM onchain_refresh_deferred_candidate
         WHERE contract_set_id = $1",
    )
    .bind(CONTRACT_SET_ID)
    .fetch_one(&database.pool)
    .await?;
    assert_eq!(
        deferred_count_after_drain,
        DENSE_UNIQUE_ACCOUNT_COUNT as i64 - EXPECTED_MATERIALIZED_BATCH
    );

    let pending_count_after_drain: i64 = sqlx::query_scalar(
        "SELECT count(*)::BIGINT
         FROM onchain_refresh_task
         WHERE contract_set_id = $1 AND status = 'pending'",
    )
    .bind(CONTRACT_SET_ID)
    .fetch_one(&database.pool)
    .await?;
    assert_eq!(pending_count_after_drain, EXPECTED_MATERIALIZED_BATCH);

    database.cleanup().await?;

    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
async fn test_postgres_projection_state_scopes_repeated_identifiers_by_contract_set_and_chain()
-> Result<(), Box<dyn Error>> {
    let database = TestDatabase::connect().await?;
    let mut store = PostgresIndexerRunnerStore::new(database.pool.clone());

    for scope in [
        (CONTRACT_SET_ID, 1, GOVERNOR, TOKEN, TIMELOCK, "demo-dao"),
        (
            SECOND_CONTRACT_SET_ID,
            1,
            GOVERNOR,
            TOKEN,
            TIMELOCK,
            "demo-dao",
        ),
        (
            "chain-two-contract-set",
            2,
            GOVERNOR,
            TOKEN,
            TIMELOCK,
            "demo-dao",
        ),
    ] {
        let batch = scoped_projection_batch(scope.0, scope.1, scope.2, scope.3, scope.4, scope.5)?;
        apply_projection_batch(&mut store, batch)?;
    }

    let proposal_count: i64 =
        sqlx::query_scalar("SELECT count(*)::BIGINT FROM proposal WHERE proposal_id = '42'")
            .fetch_one(&database.pool)
            .await?;
    assert_eq!(proposal_count, 3);

    let vote_group_count: i64 = sqlx::query_scalar(
        "SELECT count(*)::BIGINT FROM vote_cast_group WHERE ref_proposal_id = '42'",
    )
    .fetch_one(&database.pool)
    .await?;
    assert_eq!(vote_group_count, 3);

    let contributor_count: i64 =
        sqlx::query_scalar("SELECT count(*)::BIGINT FROM contributor WHERE id = $1")
            .bind(VOTER)
            .fetch_one(&database.pool)
            .await?;
    assert_eq!(contributor_count, 3);

    let timelock_operation_count: i64 = sqlx::query_scalar(
        "SELECT count(*)::BIGINT FROM timelock_operation WHERE operation_id = $1",
    )
    .bind(OPERATION_ID)
    .fetch_one(&database.pool)
    .await?;
    assert_eq!(timelock_operation_count, 3);

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

fn scoped_projection_batch(
    contract_set_id: &str,
    chain_id: i32,
    governor: &str,
    token: &str,
    timelock: &str,
    dao_code: &str,
) -> Result<IndexerProjectionBatch, Box<dyn Error>> {
    let proposal_context = proposal_projection_context_with_scope(
        contract_set_id,
        chain_id,
        governor,
        token,
        timelock,
        dao_code,
    );
    let vote_context = vote_projection_context_with_scope(
        contract_set_id,
        chain_id,
        governor,
        token,
        timelock,
        dao_code,
    );
    let timelock_context = timelock_projection_context_with_scope(
        contract_set_id,
        chain_id,
        governor,
        token,
        timelock,
        dao_code,
    );
    let proposal = project_proposal_events(
        &proposal_context,
        vec![ProposalProjectionEvent {
            log: normalized_log_with_scope(chain_id, "proposal-created", 10, 0, 0, governor),
            event: DecodedGovernorEvent::ProposalCreated(ProposalCreatedEvent {
                proposal_id: "42".to_owned(),
                proposer: PROPOSER.to_owned(),
                targets: vec![TARGET.to_owned()],
                values: vec!["1".to_owned()],
                signatures: vec!["upgrade()".to_owned()],
                calldatas: vec!["0x1234".to_owned()],
                vote_start: "100".to_owned(),
                vote_end: "200".to_owned(),
                description: "Scoped proposal".to_owned(),
            }),
        }],
    )
    .map_err(|error| format!("proposal projection failed: {error:?}"))?;
    let vote = project_vote_events(
        &vote_context,
        vec![VoteProjectionEvent {
            log: normalized_log_with_scope(chain_id, "vote-cast", 11, 0, 0, governor),
            event: DecodedGovernorEvent::VoteCast(VoteCastEvent {
                voter: VOTER.to_owned(),
                proposal_id: "42".to_owned(),
                support: 1,
                weight: "7".to_owned(),
                reason: "same account".to_owned(),
            }),
        }],
    )
    .map_err(|error| format!("vote projection failed: {error:?}"))?;
    let timelock_links = TimelockProposalLinkContext::from_proposal_batch(&proposal);
    let timelock = project_timelock_events_with_proposal_links(
        &timelock_context,
        &timelock_links,
        vec![TimelockProjectionEvent {
            log: normalized_log_with_scope(chain_id, "call-scheduled", 12, 0, 0, timelock),
            event: DecodedTimelockEvent::CallScheduled(CallScheduledEvent {
                id: OPERATION_ID.to_owned(),
                index: "0".to_owned(),
                target: TARGET.to_owned(),
                value: "1".to_owned(),
                data: "0x1234".to_owned(),
                predecessor: ZERO_OPERATION_ID.to_owned(),
                delay: "60".to_owned(),
            }),
        }],
    )
    .map_err(|error| format!("timelock projection failed: {error:?}"))?;

    Ok(IndexerProjectionBatch {
        proposal: Some(proposal),
        vote: Some(vote),
        timelock: Some(timelock),
        ..IndexerProjectionBatch::default()
    })
}

async fn run_indexer_command(
    database_url: &str,
    datalens_endpoint: &str,
) -> Result<(), Box<dyn Error>> {
    let rpc = FakeRpcServer::start();
    let mut child = Command::new(env!("CARGO_BIN_EXE_degov-datalens-indexer"))
        .arg("run")
        .env("DEGOV_INDEXER_DATABASE_URL", database_url)
        .env("DEGOV_INDEXER_DAO_CODE", "demo-dao")
        .env("DEGOV_INDEXER_START_BLOCK", "1")
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
        .env("DEGOV_ONCHAIN_REFRESH_RPC_URL", &rpc.endpoint)
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
    let rpc = FakeRpcServer::start();
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
        .env("DEGOV_ONCHAIN_REFRESH_RPC_URL", &rpc.endpoint)
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
    head_count: Arc<AtomicU64>,
    query_count: Arc<AtomicU64>,
}

impl FakeDatalensServer {
    fn start(governor_rows: Vec<Value>, token_rows: Vec<Value>, timelock_rows: Vec<Value>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind fake Datalens server");
        let endpoint = format!("http://{}", listener.local_addr().expect("local addr"));
        let head_count = Arc::new(AtomicU64::new(0));
        let query_count = Arc::new(AtomicU64::new(0));
        let server_head_count = head_count.clone();
        let server_query_count = query_count.clone();

        thread::spawn(move || {
            for stream in listener.incoming().take(8).flatten() {
                handle_datalens_request(
                    stream,
                    &governor_rows,
                    &token_rows,
                    &timelock_rows,
                    &server_head_count,
                    &server_query_count,
                );
            }
        });

        Self {
            endpoint,
            head_count,
            query_count,
        }
    }
}

struct FakeRpcServer {
    endpoint: String,
}

impl FakeRpcServer {
    fn start() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind fake RPC server");
        let endpoint = format!("http://{}", listener.local_addr().expect("local addr"));

        thread::spawn(move || {
            for stream in listener.incoming().take(64).flatten() {
                handle_rpc_request(stream);
            }
        });

        Self { endpoint }
    }
}

fn handle_rpc_request(mut stream: TcpStream) {
    let request = read_http_request(&mut stream);
    let body = request.split("\r\n\r\n").nth(1).unwrap_or_default();
    let request_body = serde_json::from_str::<Value>(body).unwrap_or_else(|_| json!({}));
    let data = request_body
        .pointer("/params/0/data")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let result = fake_rpc_result(data);
    let body = json!({
        "jsonrpc": "2.0",
        "id": request_body.get("id").cloned().unwrap_or_else(|| json!(1)),
        "result": result,
    })
    .to_string();
    let response = format!(
        "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    stream
        .write_all(response.as_bytes())
        .expect("write fake RPC response");
}

fn fake_rpc_result(data: &str) -> String {
    let value = if data.starts_with(selector("CLOCK_MODE()").as_str()) {
        Token::String("mode=blocknumber".to_owned())
    } else if data.starts_with(selector("decimals()").as_str()) {
        uint(18)
    } else if data.starts_with(selector("quorum(uint256)").as_str()) {
        uint(9000)
    } else if data.starts_with(selector("proposalSnapshot(uint256)").as_str()) {
        uint(100)
    } else if data.starts_with(selector("proposalDeadline(uint256)").as_str()) {
        uint(200)
    } else if data.starts_with(selector("state(uint256)").as_str()) {
        uint(5)
    } else if data.starts_with(selector("isOperationDone(bytes32)").as_str()) {
        Token::Bool(true)
    } else if data.starts_with(selector("isOperationReady(bytes32)").as_str())
        || data.starts_with(selector("isOperationPending(bytes32)").as_str())
    {
        Token::Bool(false)
    } else {
        uint(0)
    };

    format!("0x{}", hex::encode(encode(&[value])))
}

fn selector(signature: &str) -> String {
    use sha3::{Digest, Keccak256};

    let digest = Keccak256::digest(signature.as_bytes());
    format!("0x{}", hex::encode(&digest[..4]))
}

fn handle_datalens_request(
    mut stream: TcpStream,
    governor_rows: &[Value],
    token_rows: &[Value],
    timelock_rows: &[Value],
    head_count: &AtomicU64,
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
    } else if request.starts_with("GET /v1/chains/ethereum/head?finality=safe ") {
        head_count.fetch_add(1, Ordering::Relaxed);
        json!({
            "chain": {
                "configured_name": "ethereum"
            },
            "height": 2,
            "finality": "safe",
            "range_kind": "block"
        })
    } else {
        query_count.fetch_add(1, Ordering::Relaxed);
        let rows = governor_rows
            .iter()
            .chain(token_rows)
            .chain(timelock_rows)
            .cloned()
            .collect::<Vec<_>>();

        json!({
            "chain": {},
            "dataset_key": "evm.logs",
            "range": {},
            "cache": {},
            "rows": rows
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
                decimals::TEXT AS decimals, block_interval, timelock_address, metrics_votes_count,
                metrics_votes_weight_for_sum::TEXT AS metrics_votes_weight_for_sum
         FROM proposal",
    )
    .fetch_one(pool)
    .await?;

    let proposal_ref = expected_proposal_ref(CONTRACT_SET_ID, 1, GOVERNOR, "42");
    assert_eq!(proposal.get::<String, _>("id"), proposal_ref);
    assert_eq!(proposal.get::<String, _>("proposal_id"), "42");
    assert_eq!(
        proposal.get::<String, _>("block_timestamp"),
        "1700000002000"
    );
    assert_eq!(
        proposal.get::<String, _>("vote_start_timestamp"),
        "1700001178000"
    );
    assert_eq!(
        proposal.get::<String, _>("vote_end_timestamp"),
        "1700002378000"
    );
    assert_eq!(proposal.get::<String, _>("proposal_eta"), "1234");
    assert_eq!(proposal.get::<String, _>("clock_mode"), "blocknumber");
    assert_eq!(proposal.get::<String, _>("quorum"), "9000");
    assert_eq!(proposal.get::<String, _>("decimals"), "18");
    assert_eq!(
        proposal.get::<Option<String>, _>("block_interval"),
        Some("12".to_owned())
    );
    assert_eq!(
        proposal.get::<Option<String>, _>("timelock_address"),
        Some(TIMELOCK.to_owned())
    );
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
    let proposal_ref = expected_proposal_ref(CONTRACT_SET_ID, 1, GOVERNOR, "42");
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
        token_standard: GovernanceTokenStandard::Erc20,
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
        contract_set_id: CONTRACT_SET_ID.to_owned(),
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

fn proposal_projection_context_with_scope(
    contract_set_id: &str,
    _chain_id: i32,
    governor: &str,
    token: &str,
    timelock: &str,
    dao_code: &str,
) -> ProposalProjectionContext {
    ProposalProjectionContext {
        contract_set_id: contract_set_id.to_owned(),
        dao_code: dao_code.to_owned(),
        governor_address: governor.to_owned(),
        contracts: ChainContracts {
            governor: governor.to_owned(),
            governor_token: token.to_owned(),
            timelock: timelock.to_owned(),
        },
        token_standard: GovernanceTokenStandard::Erc20,
        read_plan_config: BatchReadPlanConfig {
            max_concurrency: 4,
            multicall_batch_size: 10,
        },
    }
}

fn vote_projection_context_with_scope(
    contract_set_id: &str,
    _chain_id: i32,
    governor: &str,
    token: &str,
    timelock: &str,
    dao_code: &str,
) -> VoteProjectionContext {
    VoteProjectionContext {
        contract_set_id: contract_set_id.to_owned(),
        dao_code: dao_code.to_owned(),
        governor_address: governor.to_owned(),
        contracts: ChainContracts {
            governor: governor.to_owned(),
            governor_token: token.to_owned(),
            timelock: timelock.to_owned(),
        },
        read_plan_config: BatchReadPlanConfig {
            max_concurrency: 4,
            multicall_batch_size: 10,
        },
    }
}

fn timelock_projection_context_with_scope(
    contract_set_id: &str,
    _chain_id: i32,
    governor: &str,
    token: &str,
    timelock: &str,
    dao_code: &str,
) -> TimelockProjectionContext {
    TimelockProjectionContext {
        contract_set_id: contract_set_id.to_owned(),
        dao_code: dao_code.to_owned(),
        governor_address: governor.to_owned(),
        timelock_address: timelock.to_owned(),
        contracts: ChainContracts {
            governor: governor.to_owned(),
            governor_token: token.to_owned(),
            timelock: timelock.to_owned(),
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

async fn seed_refresh_task_for_account(
    pool: &PgPool,
    account: &str,
    status: &str,
    attempts: i32,
    next_run_at: u64,
    error: Option<&str>,
    pending_after_lock: bool,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO onchain_refresh_task (
            id, contract_set_id, chain_id, dao_code, governor_address, token_address, account,
            refresh_balance, refresh_power, reason, first_seen_block_number,
            last_seen_block_number, last_seen_block_timestamp, last_seen_transaction_hash,
            status, attempts, next_run_at, pending_after_lock, created_at, updated_at, error
         )
         VALUES (
            $1, $2, 1, 'demo-dao', $3, $4, $5, false, true, 'seeded',
            10::NUMERIC(78, 0), 12::NUMERIC(78, 0), 1700000012000::NUMERIC(78, 0),
            '0xseed', $6, $7, $8::NUMERIC(78, 0), $9, 10::NUMERIC(78, 0),
            12::NUMERIC(78, 0), $10
         )",
    )
    .bind(refresh_task_id(account))
    .bind(CONTRACT_SET_ID)
    .bind(GOVERNOR)
    .bind(TOKEN)
    .bind(account)
    .bind(status)
    .bind(attempts)
    .bind(next_run_at.to_string())
    .bind(pending_after_lock)
    .bind(error)
    .execute(pool)
    .await?;

    Ok(())
}

fn refresh_task_id(account: &str) -> String {
    format!("{CONTRACT_SET_ID}:demo-dao:1:{GOVERNOR}:{TOKEN}:{account}")
}

fn unix_time_millis_for_test() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_millis()
        .min(i64::MAX as u128) as i64
}

fn indexed_account(index: usize) -> String {
    format!("0x{:040x}", 0x1000usize + index)
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

fn normalized_log_with_scope(
    chain_id: i32,
    label: &str,
    block_number: u64,
    transaction_index: u64,
    log_index: u64,
    address: &str,
) -> NormalizedEvmLog {
    NormalizedEvmLog {
        id: format!("evm:{chain_id}:{block_number}:0x{label}:{transaction_index}:{log_index}"),
        chain_id,
        block_number,
        block_hash: format!("0xblock{chain_id}{block_number}"),
        block_timestamp_ms: Some((1_700_000_000 + block_number) * 1_000),
        transaction_hash: format!("0x{label}"),
        transaction_index,
        log_index,
        address: address.to_owned(),
        topics: vec![],
        data: "0x".to_owned(),
        removed: false,
        raw_payload: json!({ "block_number": block_number }),
    }
}

fn expected_proposal_ref(
    contract_set_id: &str,
    chain_id: i32,
    governor_address: &str,
    proposal_id: &str,
) -> String {
    format!(
        "proposal:{contract_set_id}:{chain_id}:{}:{proposal_id}",
        governor_address.to_ascii_lowercase()
    )
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
const SECOND_DELEGATE: &str = "0x0000000000000000000000000000000000000c04";
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
