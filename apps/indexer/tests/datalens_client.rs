use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    thread,
    time::Duration,
};

use degov_datalens_indexer::{
    ChainFamily, ChainIdentityConfig, DatalensConfig, DatalensDurableHeadReader, DatalensError,
    DatalensFinality, DatalensNativeClient, DatalensNativeReader, DatasetKeyConfig,
    QueryLimitConfig, SecretString, ServiceReadiness, verify_datalens_service,
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
    let server = FakeHeadServer::start(568800);
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
    let server = FakeHeadServer::start(568801);
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

struct FakeHeadServer {
    endpoint: String,
    handle: thread::JoinHandle<String>,
}

impl FakeHeadServer {
    fn start(height: u64) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind fake Datalens head server");
        let endpoint = format!("http://{}", listener.local_addr().expect("local addr"));
        let handle = thread::spawn(move || {
            let (stream, _) = listener
                .accept()
                .expect("accept fake Datalens head request");
            handle_head_request(stream, height)
        });

        Self { endpoint, handle }
    }

    fn join(self) -> String {
        self.handle.join().expect("fake Datalens head server joins")
    }
}

fn handle_head_request(mut stream: TcpStream, height: u64) -> String {
    let request = read_http_request(&mut stream);
    let body = serde_json::json!({
        "chain": {
            "configured_name": "ethereum"
        },
        "height": height,
        "finality": "safe",
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
        dao_contracts: None,
        chains: Vec::new(),
    }
}
