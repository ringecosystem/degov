use degov_datalens_indexer::normalize_evm_log_rows;
use serde_json::{Value, json};

#[test]
fn test_normalize_evm_log_rows_sorts_mixed_blocks_and_transactions_deterministically() {
    let logs = normalize_evm_log_rows(
        46,
        vec![
            raw_log(
                101,
                1,
                4,
                1_700_000_101,
                "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
            ),
            raw_log(
                100,
                4,
                9,
                1_700_000_100,
                "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
            ),
            raw_log(
                100,
                2,
                7,
                1_700_000_100,
                "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
            ),
            raw_log(
                100,
                2,
                3,
                1_700_000_100,
                "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
            ),
        ],
    )
    .expect("normalize logs");

    let order = logs
        .iter()
        .map(|log| (log.block_number, log.transaction_index, log.log_index))
        .collect::<Vec<_>>();

    assert_eq!(
        order,
        vec![(100, 2, 3), (100, 2, 7), (100, 4, 9), (101, 1, 4)]
    );
}

#[test]
fn test_normalize_evm_log_rows_converts_timestamps_and_lowercases_addresses() {
    let logs = normalize_evm_log_rows(
        46,
        vec![raw_log(
            100,
            2,
            3,
            1_700_000_100,
            "0xAaBbCcDdEeFf0011223344556677889900AaBbCc",
        )],
    )
    .expect("normalize logs");

    let log = logs.first().expect("normalized log");

    assert_eq!(log.block_timestamp_ms, Some(1_700_000_100_000));
    assert_eq!(log.address, "0xaabbccddeeff0011223344556677889900aabbcc");
    assert_eq!(
        log.raw_payload["address"],
        "0xAaBbCcDdEeFf0011223344556677889900AaBbCc"
    );
}

#[test]
fn test_normalize_evm_log_rows_deduplicates_duplicate_raw_logs_by_stable_event_id() {
    let first = raw_log(
        100,
        2,
        3,
        1_700_000_100,
        "0xAaBbCcDdEeFf0011223344556677889900AaBbCc",
    );
    let duplicate = first.clone();

    let logs = normalize_evm_log_rows(46, vec![first, duplicate]).expect("normalize logs");

    assert_eq!(logs.len(), 1);
    assert_eq!(logs[0].id, "evm:46:100:2:3");
}

fn raw_log(
    block_number: u64,
    transaction_index: u64,
    log_index: u64,
    block_timestamp: u64,
    address: &str,
) -> Value {
    json!({
        "block_number": block_number,
        "block_hash": format!("0xblock{block_number}"),
        "block_timestamp": block_timestamp,
        "transaction_hash": format!("0xtx{block_number}{transaction_index}"),
        "transaction_index": transaction_index,
        "log_index": log_index,
        "address": address,
        "topics": [
            "0x1111111111111111111111111111111111111111111111111111111111111111"
        ],
        "data": "0x",
        "removed": false
    })
}
