use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    thread,
    time::Duration,
};

use datalens_sdk::RetryConfig;
use degov_datalens_indexer::{
    ChainFamily, ChainIdentityConfig, DaoContractAddresses, DatalensConfig,
    DatalensDurableHeadReader, DatalensError, DatalensFinality, DatalensLogQueryReader,
    DatalensNativeClient, DatalensNativeReader, DatalensProvisionalLogQueryReader,
    DatalensQueryConcurrencyConfig, DatalensQueryConcurrencyGate, DatalensQueryConcurrencyKey,
    DatalensQueryErrorClass, DatasetKeyConfig, GovernanceTokenStandard, QueryLimitConfig,
    SecretString, ServiceReadiness, classify_datalens_query_error, plan_dao_log_queries,
    verify_datalens_service,
};
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    mpsc,
};

struct MockDatalensReader {
    readiness: Result<ServiceReadiness, DatalensError>,
}

impl DatalensNativeReader for MockDatalensReader {
    fn service_readiness(&self) -> Result<ServiceReadiness, DatalensError> {
        match &self.readiness {
            Ok(readiness) => Ok(readiness.clone()),
            Err(error) => Err(DatalensError::Readiness(error.to_string())),
        }
    }
}

#[test]
fn test_verify_datalens_service_accepts_mocked_ready_client() {
    let reader = MockDatalensReader {
        readiness: Ok(ServiceReadiness {
            native_graphql_ready: true,
        }),
    };

    let readiness = verify_datalens_service(&reader).expect("ready");

    assert!(readiness.native_graphql_ready);
}

#[test]
fn test_verify_datalens_service_rejects_mocked_unready_client() {
    let reader = MockDatalensReader {
        readiness: Ok(ServiceReadiness {
            native_graphql_ready: false,
        }),
    };

    let error = verify_datalens_service(&reader).expect_err("unready");

    assert!(error.to_string().contains("readiness was not confirmed"));
}

#[test]
fn test_datalens_query_gate_blocks_when_process_limit_is_full() {
    let gate = DatalensQueryConcurrencyGate::new(DatalensQueryConcurrencyConfig {
        global_max_in_flight: Some(1),
        per_chain_max_in_flight: None,
    })
    .expect("gate");
    let first_key = query_key("evm", "ethereum", Some(1));
    let second_key = query_key("evm", "lisk", Some(1135));
    let first = gate.acquire(&first_key).expect("first permit");
    let (sender, receiver) = mpsc::channel();
    let thread_gate = gate.clone();

    let handle = thread::spawn(move || {
        let permit = thread_gate.acquire(&second_key).expect("second permit");
        sender
            .send(permit.wait_duration > Duration::ZERO)
            .expect("send wait result");
    });

    assert!(receiver.recv_timeout(Duration::from_millis(50)).is_err());
    drop(first);
    assert!(
        receiver
            .recv_timeout(Duration::from_secs(1))
            .expect("unblocked")
    );
    handle.join().expect("thread joins");
}

#[test]
fn test_datalens_query_gate_limits_same_chain_but_allows_other_chain() {
    let gate = DatalensQueryConcurrencyGate::new(DatalensQueryConcurrencyConfig {
        global_max_in_flight: Some(2),
        per_chain_max_in_flight: Some(1),
    })
    .expect("gate");
    let ethereum = query_key("evm", "ethereum", Some(1));
    let same_ethereum = query_key("evm", "ethereum", Some(1));
    let lisk = query_key("evm", "lisk", Some(1135));
    let first = gate.acquire(&ethereum).expect("first permit");
    let (same_sender, same_receiver) = mpsc::channel();
    let same_gate = gate.clone();
    let same_handle = thread::spawn(move || {
        let _permit = same_gate
            .acquire(&same_ethereum)
            .expect("same-chain permit");
        same_sender.send(()).expect("send same-chain result");
    });

    assert!(
        same_receiver
            .recv_timeout(Duration::from_millis(50))
            .is_err()
    );
    let other = gate.acquire(&lisk).expect("other-chain permit");
    drop(other);
    drop(first);
    same_receiver
        .recv_timeout(Duration::from_secs(1))
        .expect("same chain unblocked");
    same_handle.join().expect("thread joins");
}

#[test]
fn test_datalens_query_concurrency_key_uses_full_chain_identity() {
    let ethereum = query_key("evm", "ethereum", Some(1));
    let ethereum_alias = query_key("evm", "ethereum-mainnet", Some(1));
    let textual = query_key("evm", "ethereum", None);

    assert_ne!(ethereum, ethereum_alias);
    assert_ne!(ethereum, textual);
}

#[test]
fn test_classify_datalens_query_error_separates_provider_limit_from_timeout() {
    assert_eq!(
        classify_datalens_query_error("provider_limit: narrow your filter"),
        DatalensQueryErrorClass::ProviderLimit
    );
    assert_eq!(
        classify_datalens_query_error("provider_timeout: upstream RPC timed out"),
        DatalensQueryErrorClass::Transient
    );
    assert_eq!(
        classify_datalens_query_error("request_rate_limit"),
        DatalensQueryErrorClass::Transient
    );
    for error in [
        "HTTP 502 bad gateway",
        "503 no available server",
        "524 a timeout occurred",
        "error sending request for url",
    ] {
        assert_eq!(
            classify_datalens_query_error(error),
            DatalensQueryErrorClass::Transient
        );
    }
}

#[test]
fn test_datalens_durable_head_reader_uses_sdk_chain_head_safe_finality() {
    let server = FakeHeadServer::start(568800, "safe");
    let config = datalens_config(&server.endpoint, DatalensFinality::DurableOnly);
    let mut client = DatalensNativeClient::from_config(&config).expect("client");

    let height = client
        .durable_head_height(&config)
        .expect("durable head height");

    assert_eq!(height, 568800);
    let request = server.join();
    assert!(
        request.starts_with("GET /v1/chains/ethereum/head?finality=safe "),
        "{request}"
    );
    assert!(!request.contains(r#""end":2147483647"#));
}

#[test]
fn test_datalens_durable_head_reader_uses_safe_finality_for_durable_head() {
    let server = FakeHeadServer::start(568801, "safe");
    let config = datalens_config(&server.endpoint, DatalensFinality::DurableOnly);
    let mut client = DatalensNativeClient::from_config(&config).expect("client");

    let height = client
        .durable_head_height(&config)
        .expect("durable head height");

    assert_eq!(height, 568801);
    let request = server.join();
    assert!(
        request.starts_with("GET /v1/chains/ethereum/head?finality=safe "),
        "{request}"
    );
    assert!(!request.contains(r#""end":2147483647"#));
}

#[test]
fn test_datalens_log_query_retries_retryable_rate_limit_before_success() {
    let server = FakeQueryServer::start(vec![
        api_error_response(429, "rate_limited", Some("request_rate_limit")),
        query_success_response(serde_json::json!([{ "block_number": 100 }])),
    ]);
    let config = datalens_config(&server.endpoint, DatalensFinality::DurableOnly);
    let mut client =
        DatalensNativeClient::from_config_with_retry_config(&config, retry_config_with_attempts(2))
            .expect("client");
    let plans = plan_dao_log_queries(&config, &addresses(), 100, 100).expect("query plan builds");

    let result = client
        .query_logs(plans[0].input.clone())
        .expect("query retries and succeeds");

    assert_eq!(result.rows, serde_json::json!([{ "block_number": 100 }]));
    let requests = server.join();
    assert_eq!(requests.len(), 2);
    assert!(
        requests
            .iter()
            .all(|request| request.starts_with("POST /v1/query ")),
        "{requests:?}"
    );
}

#[test]
fn test_datalens_log_query_retries_provider_timeout_before_success() {
    let server = FakeQueryServer::start(vec![
        api_error_response(503, "provider_timeout", None),
        query_success_response(serde_json::json!([{ "block_number": 101 }])),
    ]);
    let mut config = datalens_config(&server.endpoint, DatalensFinality::DurableOnly);
    config.timeout = Duration::from_secs(30);
    let mut client =
        DatalensNativeClient::from_config_with_retry_config(&config, retry_config_with_attempts(2))
            .expect("client");
    let plans = plan_dao_log_queries(&config, &addresses(), 100, 100).expect("query plan builds");

    let result = client
        .query_logs(plans[0].input.clone())
        .expect("query retries and succeeds");

    assert_eq!(result.rows, serde_json::json!([{ "block_number": 101 }]));
    let requests = server.join();
    assert_eq!(requests.len(), 2);
}

#[test]
fn test_datalens_log_query_retries_transport_failure_before_success() {
    let server = FakeQueryServer::start_steps(vec![
        FakeQueryResponse::CloseWithoutResponse,
        FakeQueryResponse::Http(query_success_response(serde_json::json!([{
            "block_number": 102
        }]))),
    ]);
    let config = datalens_config(&server.endpoint, DatalensFinality::DurableOnly);
    let mut client =
        DatalensNativeClient::from_config_with_retry_config(&config, retry_config_with_attempts(2))
            .expect("client");
    let plans = plan_dao_log_queries(&config, &addresses(), 100, 100).expect("query plan builds");

    let result = client
        .query_logs(plans[0].input.clone())
        .expect("query retries and succeeds");

    assert_eq!(result.rows, serde_json::json!([{ "block_number": 102 }]));
    let requests = server.join();
    assert_eq!(requests.len(), 2);
}

#[test]
fn test_datalens_log_query_returns_degov_timeout_for_stalled_sdk_query() {
    let server = FakeHangingQueryServer::start(Duration::from_millis(500));
    let mut config = datalens_config(&server.endpoint, DatalensFinality::DurableOnly);
    config.timeout = Duration::from_millis(50);
    let mut client =
        DatalensNativeClient::from_config_with_retry_config(&config, retry_config_with_attempts(1))
            .expect("client");
    let plans = plan_dao_log_queries(&config, &addresses(), 100, 100).expect("query plan builds");
    let started_at = std::time::Instant::now();

    let error = client
        .query_logs(plans[0].input.clone())
        .expect_err("stalled query times out");

    assert!(
        started_at.elapsed() < Duration::from_millis(300),
        "outer timeout should bound the stalled SDK call"
    );
    let error_message = error.to_string();
    assert!(
        error_message.contains("Datalens query timed out after 50ms")
            || error_message.contains("send datalens REST request"),
        "{error_message}"
    );
    assert_eq!(
        classify_datalens_query_error(&error.to_string()),
        DatalensQueryErrorClass::Transient
    );
    let requests = server.join();
    assert_eq!(requests.len(), 1);
}

#[test]
fn test_datalens_log_query_retries_after_stalled_sdk_query_timeout() {
    let server = FakeQueryServer::start_steps(vec![
        FakeQueryResponse::HoldOpen(Duration::from_millis(500)),
        FakeQueryResponse::HoldOpen(Duration::from_millis(500)),
    ]);
    let mut config = datalens_config(&server.endpoint, DatalensFinality::DurableOnly);
    config.timeout = Duration::from_millis(50);
    let mut client =
        DatalensNativeClient::from_config_with_retry_config(&config, retry_config_with_attempts(2))
            .expect("client");
    let plans = plan_dao_log_queries(&config, &addresses(), 100, 100).expect("query plan builds");

    let error = client
        .query_logs(plans[0].input.clone())
        .expect_err("stalled query times out after retrying");

    assert!(
        error
            .to_string()
            .contains("Datalens query timed out after 50ms"),
        "{error}"
    );
    assert!(
        !error
            .to_string()
            .contains("previous SDK query is still in flight"),
        "{error}"
    );
    let requests = server.join();
    assert_eq!(requests.len(), 2);
}

#[test]
fn test_datalens_log_query_allows_retry_after_stalled_sdk_query_times_out() {
    let server = FakeQueryServer::start_concurrent(vec![
        FakeQueryResponse::HoldOpen(Duration::from_millis(500)),
        FakeQueryResponse::Http(query_success_response(serde_json::json!([{
            "block_number": 100
        }]))),
    ]);
    let mut config = datalens_config(&server.endpoint, DatalensFinality::DurableOnly);
    config.timeout = Duration::from_millis(50);
    let mut client =
        DatalensNativeClient::from_config_with_retry_config(&config, retry_config_with_attempts(1))
            .expect("client");
    let plans = plan_dao_log_queries(&config, &addresses(), 100, 100).expect("query plan builds");

    let first_error = client
        .query_logs(plans[0].input.clone())
        .expect_err("first stalled query times out");
    assert!(first_error.to_string().contains("timed out"));

    let started_at = std::time::Instant::now();
    let second_result = client
        .query_logs(plans[0].input.clone())
        .expect("second query can proceed while first SDK worker is still blocked");

    assert!(
        started_at.elapsed() < Duration::from_millis(150),
        "second query should not wait for the first blocked SDK worker"
    );
    assert_eq!(
        second_result.rows,
        serde_json::json!([{ "block_number": 100 }])
    );
    let requests = server.join();
    assert_eq!(requests.len(), 2);
}

#[test]
fn test_datalens_log_query_caps_overlapping_stalled_sdk_queries() {
    let server = FakeQueryServer::start_concurrent(vec![
        FakeQueryResponse::HoldOpen(Duration::from_millis(700)),
        FakeQueryResponse::HoldOpen(Duration::from_millis(700)),
    ]);
    let mut config = datalens_config(&server.endpoint, DatalensFinality::DurableOnly);
    config.timeout = Duration::from_millis(500);
    let mut first_client =
        DatalensNativeClient::from_config_with_retry_config(&config, retry_config_with_attempts(1))
            .expect("first client");
    let mut second_client =
        DatalensNativeClient::from_config_with_retry_config(&config, retry_config_with_attempts(1))
            .expect("second client");
    let mut third_client =
        DatalensNativeClient::from_config_with_retry_config(&config, retry_config_with_attempts(1))
            .expect("third client");
    let plans = plan_dao_log_queries(&config, &addresses(), 100, 100).expect("query plan builds");
    let first_input = plans[0].input.clone();
    let second_input = plans[0].input.clone();
    let third_input = plans[0].input.clone();
    let (started_sender, started_receiver) = mpsc::channel();

    let first_handle = thread::spawn({
        let started_sender = started_sender.clone();
        move || {
            started_sender.send(()).expect("send first start");
            first_client
                .query_logs(first_input)
                .expect_err("first stalled query times out")
        }
    });
    let second_handle = thread::spawn(move || {
        started_sender.send(()).expect("send second start");
        second_client
            .query_logs(second_input)
            .expect_err("second stalled query times out")
    });
    started_receiver
        .recv_timeout(Duration::from_millis(100))
        .expect("first query starts");
    started_receiver
        .recv_timeout(Duration::from_millis(100))
        .expect("second query starts");
    thread::sleep(Duration::from_millis(100));

    let started_at = std::time::Instant::now();
    let third_error = third_client
        .query_logs(third_input)
        .expect_err("third query is blocked by the overlapping worker cap");

    assert!(
        started_at.elapsed() < Duration::from_millis(150),
        "third query should fail fast while two SDK workers are still blocked"
    );
    assert!(
        third_error
            .to_string()
            .contains("previous SDK queries are still in flight"),
        "{third_error}"
    );
    assert_eq!(
        classify_datalens_query_error(&third_error.to_string()),
        DatalensQueryErrorClass::Transient
    );
    let first_error = first_handle.join().expect("first query joins");
    let second_error = second_handle.join().expect("second query joins");
    assert!(first_error.to_string().contains("timed out"));
    assert!(second_error.to_string().contains("timed out"));
    let requests = server.join();
    assert_eq!(requests.len(), 2);
}

#[test]
fn test_datalens_log_query_times_out_while_waiting_for_query_gate() {
    let mut config = datalens_config("http://127.0.0.1:9", DatalensFinality::DurableOnly);
    config.timeout = Duration::from_millis(50);
    let gate = DatalensQueryConcurrencyGate::new(DatalensQueryConcurrencyConfig {
        global_max_in_flight: Some(1),
        per_chain_max_in_flight: None,
    })
    .expect("gate");
    let held_permit = gate
        .acquire(&DatalensQueryConcurrencyKey::from_config(&config))
        .expect("held permit");
    let mut client =
        DatalensNativeClient::from_config_with_retry_config(&config, retry_config_with_attempts(1))
            .expect("client")
            .with_query_concurrency_gate(gate);
    let plans = plan_dao_log_queries(&config, &addresses(), 100, 100).expect("query plan builds");
    let (sender, receiver) = mpsc::channel();

    let handle = thread::spawn(move || {
        let started_at = std::time::Instant::now();
        let error = client
            .query_logs(plans[0].input.clone())
            .expect_err("query gate wait times out");
        sender
            .send((started_at.elapsed(), error.to_string()))
            .expect("send timeout result");
    });

    let result = receiver.recv_timeout(Duration::from_millis(200));
    drop(held_permit);
    handle.join().expect("query thread joins");
    let (elapsed, error) = result.expect("query should timeout while waiting for gate");
    assert!(
        elapsed < Duration::from_millis(150),
        "query gate wait should be bounded by the configured timeout"
    );
    assert!(
        error.contains("Datalens query timed out after 50ms"),
        "{error}"
    );
    assert!(
        error.contains("waiting for query concurrency permit"),
        "{error}"
    );
    assert_eq!(
        classify_datalens_query_error(&error),
        DatalensQueryErrorClass::Transient
    );
}

#[test]
fn test_datalens_log_query_does_not_retry_non_retryable_quota_error() {
    let server = FakeQueryServer::start(vec![api_error_response(
        429,
        "rate_limited",
        Some("range_limit"),
    )]);
    let config = datalens_config(&server.endpoint, DatalensFinality::DurableOnly);
    let mut client =
        DatalensNativeClient::from_config_with_retry_config(&config, retry_config_with_attempts(3))
            .expect("client");
    let plans = plan_dao_log_queries(&config, &addresses(), 100, 100).expect("query plan builds");

    let error = client
        .query_logs(plans[0].input.clone())
        .expect_err("range limit is not retryable");

    assert!(error.to_string().contains("range_limit"));
    let requests = server.join();
    assert_eq!(requests.len(), 1);
}

#[test]
fn test_datalens_provisional_log_query_uses_query_provisional_with_safe_to_latest_finality() {
    let server = FakeQueryServer::start(vec![query_success_response_with_segment(
        serde_json::json!([]),
        "hot",
        "latest",
    )]);
    let config = datalens_config(&server.endpoint, DatalensFinality::DurableOnly);
    let mut client =
        DatalensNativeClient::from_config_with_retry_config(&config, retry_config_with_attempts(1))
            .expect("client");
    let mut input = plan_dao_log_queries(&config, &addresses(), 100, 105)
        .expect("query plan builds")
        .remove(0)
        .input;
    input.finality = Some("safe_to_latest".to_owned());

    let result = client
        .query_provisional_logs(input)
        .expect("provisional query succeeds");

    assert_eq!(result.segments.len(), 1);
    assert_eq!(result.segments[0].source, "hot");
    assert_eq!(result.segments[0].finality, "latest");
    assert_eq!(result.segments[0].range_start_block, 100);
    assert_eq!(result.segments[0].range_end_block, 105);
    let requests = server.join();
    assert_eq!(requests.len(), 1);
    assert!(requests[0].contains(r#""finality":"safe_to_latest""#));
}

#[test]
fn test_datalens_provisional_log_query_returns_degov_timeout_for_stalled_sdk_query() {
    let server = FakeHangingQueryServer::start(Duration::from_millis(500));
    let mut config = datalens_config(&server.endpoint, DatalensFinality::DurableOnly);
    config.timeout = Duration::from_millis(50);
    let mut client =
        DatalensNativeClient::from_config_with_retry_config(&config, retry_config_with_attempts(1))
            .expect("client");
    let mut input = plan_dao_log_queries(&config, &addresses(), 100, 105)
        .expect("query plan builds")
        .remove(0)
        .input;
    input.finality = Some("safe_to_latest".to_owned());
    let started_at = std::time::Instant::now();

    let error = client
        .query_provisional_logs(input)
        .expect_err("stalled provisional query times out");

    assert!(
        started_at.elapsed() < Duration::from_millis(300),
        "outer timeout should bound the stalled SDK call"
    );
    assert!(
        error
            .to_string()
            .contains("Datalens provisional query timed out after 50ms"),
        "{error}"
    );
    assert_eq!(
        classify_datalens_query_error(&error.to_string()),
        DatalensQueryErrorClass::Transient
    );
    let requests = server.join();
    assert_eq!(requests.len(), 1);
}

struct FakeHeadServer {
    endpoint: String,
    handle: thread::JoinHandle<String>,
}

impl FakeHeadServer {
    fn start(height: u64, finality: &'static str) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind fake Datalens head server");
        let endpoint = format!("http://{}", listener.local_addr().expect("local addr"));
        let handle = thread::spawn(move || {
            let (stream, _) = listener
                .accept()
                .expect("accept fake Datalens head request");
            handle_head_request(stream, height, finality)
        });

        Self { endpoint, handle }
    }

    fn join(self) -> String {
        self.handle.join().expect("fake Datalens head server joins")
    }
}

struct FakeQueryServer {
    endpoint: String,
    handle: thread::JoinHandle<Vec<String>>,
}

struct FakeHangingQueryServer {
    endpoint: String,
    handle: thread::JoinHandle<Vec<String>>,
}

impl FakeHangingQueryServer {
    fn start(hold_open_for: Duration) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind fake Datalens query server");
        let endpoint = format!("http://{}", listener.local_addr().expect("local addr"));
        let handle = thread::spawn(move || {
            let mut requests = Vec::new();
            let (mut stream, _) = listener
                .accept()
                .expect("accept fake Datalens query request");
            requests.push(read_http_request(&mut stream));
            thread::sleep(hold_open_for);
            requests
        });

        Self { endpoint, handle }
    }

    fn join(self) -> Vec<String> {
        self.handle
            .join()
            .expect("fake hanging Datalens query server joins")
    }
}

enum FakeQueryResponse {
    Http(String),
    CloseWithoutResponse,
    HoldOpen(Duration),
}

impl FakeQueryServer {
    fn start(responses: Vec<String>) -> Self {
        Self::start_steps(responses.into_iter().map(FakeQueryResponse::Http).collect())
    }

    fn start_steps(responses: Vec<FakeQueryResponse>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind fake Datalens query server");
        let endpoint = format!("http://{}", listener.local_addr().expect("local addr"));
        let handle = thread::spawn(move || {
            let mut requests = Vec::new();
            for response in responses {
                let (mut stream, _) = listener
                    .accept()
                    .expect("accept fake Datalens query request");
                requests.push(read_http_request(&mut stream));
                match response {
                    FakeQueryResponse::Http(response) => stream
                        .write_all(response.as_bytes())
                        .expect("write fake Datalens query response"),
                    FakeQueryResponse::CloseWithoutResponse => {}
                    FakeQueryResponse::HoldOpen(duration) => thread::sleep(duration),
                }
            }
            requests
        });

        Self { endpoint, handle }
    }

    fn start_concurrent(responses: Vec<FakeQueryResponse>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind fake Datalens query server");
        let endpoint = format!("http://{}", listener.local_addr().expect("local addr"));
        let handle = thread::spawn(move || {
            let mut handles = Vec::new();
            for response in responses {
                let (mut stream, _) = listener
                    .accept()
                    .expect("accept fake Datalens query request");
                handles.push(thread::spawn(move || {
                    let request = read_http_request(&mut stream);
                    match response {
                        FakeQueryResponse::Http(response) => stream
                            .write_all(response.as_bytes())
                            .expect("write fake Datalens query response"),
                        FakeQueryResponse::CloseWithoutResponse => {}
                        FakeQueryResponse::HoldOpen(duration) => thread::sleep(duration),
                    }
                    request
                }));
            }

            handles
                .into_iter()
                .map(|handle| handle.join().expect("fake Datalens request handler joins"))
                .collect()
        });

        Self { endpoint, handle }
    }

    fn join(self) -> Vec<String> {
        self.handle
            .join()
            .expect("fake Datalens query server joins")
    }
}

fn handle_head_request(mut stream: TcpStream, height: u64, finality: &'static str) -> String {
    let request = read_http_request(&mut stream);
    let body = serde_json::json!({
        "chain": {
            "configured_name": "ethereum"
        },
        "height": height,
        "finality": finality,
        "range_kind": "block"
    })
    .to_string();
    let response = format!(
        "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    stream
        .write_all(response.as_bytes())
        .expect("write fake Datalens head response");

    request
}

fn query_success_response(rows: serde_json::Value) -> String {
    let body = serde_json::json!({
        "chain": {
            "configured_name": "ethereum"
        },
        "dataset_key": "evm.logs",
        "range": {
            "kind": "block",
            "start": 100,
            "end": 100
        },
        "cache": {},
        "rows": rows
    });
    http_response(200, body)
}

fn query_success_response_with_segment(
    rows: serde_json::Value,
    source: &str,
    finality: &str,
) -> String {
    let body = serde_json::json!({
        "chain": {
            "configured_name": "ethereum"
        },
        "dataset_key": "evm.logs",
        "range": {
            "kind": "block",
            "start": 100,
            "end": 105
        },
        "cache": {
            "segments": [{
                "range": {
                    "kind": "block",
                    "start": 100,
                    "end": 105
                },
                "source": source,
                "finality": finality,
                "anchor": {
                    "range_kind": "block",
                    "height": 105,
                    "block_hash": "0xabc",
                    "parent_hash": "0xdef",
                    "timestamp": 1700000000
                }
            }]
        },
        "rows": rows
    });
    http_response(200, body)
}

fn api_error_response(status: u16, kind: &str, quota_kind: Option<&str>) -> String {
    let mut body = serde_json::json!({
        "error": {
            "kind": kind,
            "message": format!("{kind} failed")
        }
    });
    if let Some(quota_kind) = quota_kind {
        body["error"]["quota"] = serde_json::json!({
            "kind": quota_kind,
            "scope": "application",
            "limit": 1,
            "requested": 2,
            "observed": 1,
            "retry_after_seconds": 0
        });
    }
    http_response(status, body)
}

fn http_response(status: u16, body: serde_json::Value) -> String {
    let body = body.to_string();
    let reason = match status {
        200 => "OK",
        429 => "Too Many Requests",
        503 => "Service Unavailable",
        _ => "Error",
    };
    format!(
        "HTTP/1.1 {status} {reason}\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
        body.len(),
        body
    )
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

fn retry_config_with_attempts(max_attempts: u32) -> RetryConfig {
    RetryConfig {
        max_attempts,
        initial_delay: Duration::from_millis(0),
        max_delay: Duration::from_millis(0),
        max_elapsed: None,
        jitter: false,
        jitter_factor: 0.0,
    }
}

fn query_key(
    family: &'static str,
    configured_name: &'static str,
    network_id: Option<i32>,
) -> DatalensQueryConcurrencyKey {
    DatalensQueryConcurrencyKey {
        family: family.to_owned(),
        configured_name: configured_name.to_owned(),
        network_id,
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

fn datalens_config(endpoint: &str, finality: DatalensFinality) -> DatalensConfig {
    static NEXT_APPLICATION_ID: AtomicUsize = AtomicUsize::new(0);
    let application_id = NEXT_APPLICATION_ID.fetch_add(1, Ordering::SeqCst);

    DatalensConfig {
        endpoint: endpoint.to_owned(),
        application: format!("degov-test-{application_id}"),
        bearer_token: SecretString::new("unit-test-redacted-value"),
        timeout: Duration::from_secs(5),
        finality,
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
            block_range_limit: 1_000,
        },
        warmup: Default::default(),
        dao_contracts: None,
        chains: Vec::new(),
    }
}
