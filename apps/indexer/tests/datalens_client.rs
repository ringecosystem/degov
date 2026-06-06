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
    DatalensNativeClient, DatalensNativeReader, DatasetKeyConfig, GovernanceTokenStandard,
    QueryLimitConfig, SecretString, ServiceReadiness, plan_dao_log_queries,
    verify_datalens_service,
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
fn test_datalens_durable_head_reader_uses_latest_finality_when_pending_enabled() {
    let server = FakeHeadServer::start(568801, "latest");
    let config = datalens_config(&server.endpoint, DatalensFinality::IncludePending);
    let mut client = DatalensNativeClient::from_config(&config).expect("client");

    let height = client
        .durable_head_height(&config)
        .expect("durable head height");

    assert_eq!(height, 568801);
    let request = server.join();
    assert!(
        request.starts_with("GET /v1/chains/ethereum/head?finality=latest "),
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
    let config = datalens_config(&server.endpoint, DatalensFinality::DurableOnly);
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

enum FakeQueryResponse {
    Http(String),
    CloseWithoutResponse,
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
                }
            }
            requests
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

fn addresses() -> DaoContractAddresses {
    DaoContractAddresses {
        governor: "0x1111111111111111111111111111111111111111".to_owned(),
        governor_token: "0x2222222222222222222222222222222222222222".to_owned(),
        governor_token_standard: GovernanceTokenStandard::Erc20,
        timelock: "0x3333333333333333333333333333333333333333".to_owned(),
    }
}

fn datalens_config(endpoint: &str, finality: DatalensFinality) -> DatalensConfig {
    DatalensConfig {
        endpoint: endpoint.to_owned(),
        application: "degov-test".to_owned(),
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
