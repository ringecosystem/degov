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
    assert_table_count(&database.pool, "delegate_changed", 1).await?;
    assert_table_count(&database.pool, "token_transfer", 1).await?;
    assert_table_count(&database.pool, "vote_power_checkpoint", 1).await?;
    assert_token_projection_state(&database.pool).await?;
    assert_table_count(&database.pool, "timelock_operation", 1).await?;
    assert_checkpoint(&database.pool).await?;

    database.cleanup().await?;

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
        2,
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
