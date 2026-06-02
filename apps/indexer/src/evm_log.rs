use std::collections::BTreeMap;

use serde::Deserialize;
use thiserror::Error;

#[derive(Clone, Debug, PartialEq)]
pub struct NormalizedEvmLog {
    pub id: String,
    pub chain_id: i32,
    pub block_number: u64,
    pub block_hash: String,
    pub block_timestamp_ms: Option<u64>,
    pub transaction_hash: String,
    pub transaction_index: u64,
    pub log_index: u64,
    pub address: String,
    pub topics: Vec<String>,
    pub data: String,
    pub removed: bool,
    pub raw_payload: serde_json::Value,
}

#[derive(Debug, Error, Eq, PartialEq)]
pub enum EvmLogNormalizationError {
    #[error("invalid EVM log row: {0}")]
    InvalidRow(String),

    #[error("EVM log timestamp {seconds} seconds overflows millisecond timestamp")]
    TimestampOverflow { seconds: u64 },

    #[error("conflicting EVM log rows share stable id {id}")]
    DuplicateConflict { id: String },
}

#[derive(Deserialize)]
struct RawEvmLogRow {
    block_number: u64,
    block_hash: String,
    #[serde(default)]
    block_timestamp: Option<u64>,
    transaction_hash: String,
    transaction_index: u64,
    log_index: u64,
    address: String,
    #[serde(default)]
    topics: Vec<String>,
    data: String,
    removed: bool,
}

pub fn normalize_evm_log_rows(
    chain_id: i32,
    rows: Vec<serde_json::Value>,
) -> Result<Vec<NormalizedEvmLog>, EvmLogNormalizationError> {
    let mut logs = rows
        .into_iter()
        .map(|row| normalize_evm_log_row(chain_id, row))
        .collect::<Result<Vec<_>, _>>()?;
    logs.sort_by_key(|log| (log.block_number, log.transaction_index, log.log_index));

    let mut deduped = Vec::new();
    let mut seen_indexes = BTreeMap::new();
    for log in logs {
        match seen_indexes.get(&log.id) {
            Some(index) if deduped[*index] == log => {}
            Some(_) => return Err(EvmLogNormalizationError::DuplicateConflict { id: log.id }),
            None => {
                seen_indexes.insert(log.id.clone(), deduped.len());
                deduped.push(log);
            }
        }
    }

    Ok(deduped)
}

fn normalize_evm_log_row(
    chain_id: i32,
    raw_payload: serde_json::Value,
) -> Result<NormalizedEvmLog, EvmLogNormalizationError> {
    let row: RawEvmLogRow = serde_json::from_value(raw_payload.clone())
        .map_err(|error| EvmLogNormalizationError::InvalidRow(error.to_string()))?;
    let block_timestamp_ms = row
        .block_timestamp
        .map(timestamp_seconds_to_millis)
        .transpose()?;
    let transaction_hash = row.transaction_hash.to_ascii_lowercase();
    let id = format!(
        "evm:{chain_id}:{}:{}:{}:{}",
        row.block_number, transaction_hash, row.transaction_index, row.log_index
    );

    Ok(NormalizedEvmLog {
        id,
        chain_id,
        block_number: row.block_number,
        block_hash: row.block_hash,
        block_timestamp_ms,
        transaction_hash,
        transaction_index: row.transaction_index,
        log_index: row.log_index,
        address: row.address.to_ascii_lowercase(),
        topics: row
            .topics
            .into_iter()
            .map(|topic| topic.to_ascii_lowercase())
            .collect(),
        data: row.data,
        removed: row.removed,
        raw_payload,
    })
}

fn timestamp_seconds_to_millis(seconds: u64) -> Result<u64, EvmLogNormalizationError> {
    seconds
        .checked_mul(1_000)
        .ok_or(EvmLogNormalizationError::TimestampOverflow { seconds })
}
