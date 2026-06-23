use std::{collections::BTreeMap, time::Duration};

use anyhow as runtime_anyhow;
use runtime_anyhow::{Context, Result};
use serde::Deserialize;
use sqlx::postgres::PgPoolOptions;

use crate::{
    ProposalReferenceFieldCandidate, ProposalReferenceFieldUpdate,
    read_proposal_reference_field_candidates, required_env, update_proposal_reference_fields,
};

use super::migrate::apply_migrations;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalReferenceFieldsReport {
    pub dao_code: String,
    pub reference_endpoint: String,
    pub local_scanned: usize,
    pub reference_scanned: usize,
    pub planned: usize,
    pub updated: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReferenceProposalFields {
    pub proposal_id: String,
    pub title: String,
    pub clock_mode: String,
    pub block_interval: Option<String>,
}

pub async fn refresh_proposal_reference_fields(
    dao_code: String,
    reference_endpoint: String,
) -> Result<ProposalReferenceFieldsReport> {
    let database_url = required_env("DEGOV_INDEXER_DATABASE_URL")?;
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(&database_url)
        .await
        .context("connect to DeGov indexer Postgres")?;
    apply_migrations(&pool).await?;

    refresh_proposal_reference_fields_with_pool(&pool, dao_code, reference_endpoint).await
}

pub async fn refresh_proposal_reference_fields_with_pool(
    pool: &sqlx::PgPool,
    dao_code: String,
    reference_endpoint: String,
) -> Result<ProposalReferenceFieldsReport> {
    validate_reference_endpoint_scope(&dao_code, &reference_endpoint)?;

    let candidates = read_proposal_reference_field_candidates(pool, &dao_code)
        .await
        .context("read proposal reference field candidates")?;
    let reference = fetch_reference_proposal_fields(&reference_endpoint)
        .await
        .context("fetch reference proposal fields")?;
    let updates = plan_proposal_reference_field_updates(&candidates, &reference);
    let planned = updates.len();
    let updated = update_proposal_reference_fields(pool, &dao_code, &updates)
        .await
        .context("update proposal reference fields")?;

    Ok(ProposalReferenceFieldsReport {
        dao_code,
        reference_endpoint,
        local_scanned: candidates.len(),
        reference_scanned: reference.len(),
        planned,
        updated,
    })
}

pub fn plan_proposal_reference_field_updates(
    candidates: &[ProposalReferenceFieldCandidate],
    reference: &[ReferenceProposalFields],
) -> Vec<ProposalReferenceFieldUpdate> {
    let reference_by_proposal_id = reference
        .iter()
        .filter_map(|row| normalize_proposal_id(&row.proposal_id).map(|key| (key, row)))
        .collect::<BTreeMap<_, _>>();

    candidates
        .iter()
        .filter_map(|candidate| {
            let key = normalize_proposal_id(&candidate.proposal_id)?;
            let reference = reference_by_proposal_id.get(&key)?;
            let block_interval = reference_block_interval(reference);
            if candidate.title == reference.title
                && candidate.clock_mode == reference.clock_mode
                && candidate.block_interval == block_interval
            {
                return None;
            }

            Some(ProposalReferenceFieldUpdate {
                id: candidate.id.clone(),
                previous_title: candidate.title.clone(),
                previous_block_interval: candidate.block_interval.clone(),
                previous_clock_mode: candidate.clock_mode.clone(),
                title: reference.title.clone(),
                clock_mode: reference.clock_mode.clone(),
                block_interval,
            })
        })
        .collect()
}

fn reference_block_interval(reference: &ReferenceProposalFields) -> Option<String> {
    (reference.clock_mode == "blocknumber")
        .then(|| reference.block_interval.clone())
        .flatten()
}

pub fn normalize_proposal_id(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Some(hex) = trimmed
        .strip_prefix("0x")
        .or_else(|| trimmed.strip_prefix("0X"))
    {
        let normalized = hex.trim_start_matches('0');
        return Some(if normalized.is_empty() {
            "0".to_owned()
        } else {
            normalized.to_ascii_lowercase()
        });
    }

    let decimal = trimmed.trim_start_matches('0');
    if decimal.is_empty() {
        return Some("0".to_owned());
    }
    if !decimal.chars().all(|character| character.is_ascii_digit()) {
        return None;
    }

    Some(decimal_to_hex(decimal))
}

fn decimal_to_hex(decimal: &str) -> String {
    let mut digits = decimal.bytes().map(|byte| byte - b'0').collect::<Vec<_>>();
    let mut hex_digits = Vec::new();

    while !digits.is_empty() {
        let mut quotient = Vec::with_capacity(digits.len());
        let mut remainder = 0u8;
        for digit in digits {
            let value = remainder * 10 + digit;
            let next = value / 16;
            remainder = value % 16;
            if !quotient.is_empty() || next != 0 {
                quotient.push(next);
            }
        }
        hex_digits.push(char::from_digit(u32::from(remainder), 16).expect("hex digit"));
        digits = quotient;
    }

    hex_digits.iter().rev().collect()
}

fn validate_reference_endpoint_scope(dao_code: &str, endpoint: &str) -> Result<()> {
    if reference_endpoint_has_dao_path_segment(dao_code, endpoint) {
        return Ok(());
    }

    runtime_anyhow::bail!(
        "reference GraphQL endpoint must be scoped to dao_code={dao_code}; use a path like /{dao_code}/graphql instead of an unscoped /graphql endpoint"
    );
}

fn reference_endpoint_has_dao_path_segment(dao_code: &str, endpoint: &str) -> bool {
    let without_fragment = endpoint.split('#').next().unwrap_or(endpoint);
    let without_query = without_fragment
        .split('?')
        .next()
        .unwrap_or(without_fragment);
    let path = without_query
        .split_once("://")
        .and_then(|(_, rest)| rest.split_once('/').map(|(_, path)| path))
        .unwrap_or(without_query);

    path.split('/').any(|segment| segment == dao_code)
}

async fn fetch_reference_proposal_fields(endpoint: &str) -> Result<Vec<ReferenceProposalFields>> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .context("build reference proposal GraphQL client")?;
    let mut proposals = Vec::new();
    let mut offset = 0i32;
    const LIMIT: i32 = 100;

    loop {
        let response = client
            .post(endpoint)
            .json(&ReferenceGraphqlRequest {
                query: REFERENCE_PROPOSALS_QUERY,
                variables: ReferenceProposalVariables {
                    limit: LIMIT,
                    offset,
                },
            })
            .send()
            .await
            .context("send reference proposal GraphQL request")?
            .error_for_status()
            .context("reference proposal GraphQL response status")?
            .json::<ReferenceGraphqlResponse>()
            .await
            .context("decode reference proposal GraphQL response")?;

        if let Some(errors) = response.errors.filter(|errors| !errors.is_empty()) {
            runtime_anyhow::bail!(
                "reference proposal GraphQL returned errors: {}",
                serde_json::to_string(&errors).unwrap_or_else(|_| "<unserializable>".to_owned())
            );
        }

        let rows = response
            .data
            .context("reference proposal GraphQL response missing data")?
            .proposals;
        let row_count = rows.len();
        proposals.extend(rows.into_iter().map(|row| ReferenceProposalFields {
            proposal_id: row.proposal_id,
            title: row.title,
            clock_mode: row.clock_mode,
            block_interval: row.block_interval,
        }));
        if row_count < LIMIT as usize {
            return Ok(proposals);
        }
        offset += LIMIT;
    }
}

const REFERENCE_PROPOSALS_QUERY: &str = r#"
query ProposalReferenceFields($limit: Int!, $offset: Int!) {
  proposals(orderBy: [id_ASC], limit: $limit, offset: $offset) {
    proposalId
    title
    clockMode
    blockInterval
  }
}
"#;

#[derive(serde::Serialize)]
struct ReferenceGraphqlRequest {
    query: &'static str,
    variables: ReferenceProposalVariables,
}

#[derive(serde::Serialize)]
struct ReferenceProposalVariables {
    limit: i32,
    offset: i32,
}

#[derive(Deserialize)]
struct ReferenceGraphqlResponse {
    data: Option<ReferenceGraphqlData>,
    errors: Option<Vec<serde_json::Value>>,
}

#[derive(Deserialize)]
struct ReferenceGraphqlData {
    proposals: Vec<ReferenceProposalRow>,
}

#[derive(Deserialize)]
struct ReferenceProposalRow {
    #[serde(rename = "proposalId")]
    proposal_id: String,
    title: String,
    #[serde(rename = "clockMode", default = "default_reference_clock_mode")]
    clock_mode: String,
    #[serde(rename = "blockInterval")]
    block_interval: Option<String>,
}

fn default_reference_clock_mode() -> String {
    "blocknumber".to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_proposal_id_matches_decimal_and_hex_uint256_values() {
        assert_eq!(normalize_proposal_id("0"), Some("0".to_owned()));
        assert_eq!(normalize_proposal_id("00042"), Some("2a".to_owned()));
        assert_eq!(normalize_proposal_id("0x00002A"), Some("2a".to_owned()));
        assert_eq!(
            normalize_proposal_id(
                "115615865324623814833258987703837575663427750121726187103053182962864855260310"
            ),
            Some("ff9c42c3ca9b4cc32c7aee333740cdc2616718d84666a4dea7f5dc129bdd1c96".to_owned())
        );
    }

    #[test]
    fn test_plan_proposal_reference_field_updates_matches_by_normalized_proposal_id() {
        let updates = plan_proposal_reference_field_updates(
            &[
                ProposalReferenceFieldCandidate {
                    id: "proposal:1".to_owned(),
                    proposal_id: "42".to_owned(),
                    title: "local title".to_owned(),
                    block_interval: Some("12".to_owned()),
                    clock_mode: "blocknumber".to_owned(),
                },
                ProposalReferenceFieldCandidate {
                    id: "proposal:2".to_owned(),
                    proposal_id: "7".to_owned(),
                    title: "same title".to_owned(),
                    block_interval: None,
                    clock_mode: "blocknumber".to_owned(),
                },
            ],
            &[
                ReferenceProposalFields {
                    proposal_id: "0x2a".to_owned(),
                    title: "reference title".to_owned(),
                    clock_mode: "blocknumber".to_owned(),
                    block_interval: Some("13.333333333333334".to_owned()),
                },
                ReferenceProposalFields {
                    proposal_id: "0x07".to_owned(),
                    title: "same title".to_owned(),
                    clock_mode: "blocknumber".to_owned(),
                    block_interval: None,
                },
            ],
        );

        assert_eq!(
            updates,
            vec![ProposalReferenceFieldUpdate {
                id: "proposal:1".to_owned(),
                previous_title: "local title".to_owned(),
                previous_block_interval: Some("12".to_owned()),
                previous_clock_mode: "blocknumber".to_owned(),
                title: "reference title".to_owned(),
                clock_mode: "blocknumber".to_owned(),
                block_interval: Some("13.333333333333334".to_owned()),
            }]
        );
    }

    #[test]
    fn test_plan_proposal_reference_field_updates_clears_timestamp_block_interval() {
        let updates = plan_proposal_reference_field_updates(
            &[ProposalReferenceFieldCandidate {
                id: "proposal:1".to_owned(),
                proposal_id: "42".to_owned(),
                title: "local title".to_owned(),
                block_interval: Some("12".to_owned()),
                clock_mode: "timestamp".to_owned(),
            }],
            &[ReferenceProposalFields {
                proposal_id: "0x2a".to_owned(),
                title: "reference title".to_owned(),
                clock_mode: "timestamp".to_owned(),
                block_interval: Some("13.333333333333334".to_owned()),
            }],
        );

        assert_eq!(
            updates,
            vec![ProposalReferenceFieldUpdate {
                id: "proposal:1".to_owned(),
                previous_title: "local title".to_owned(),
                previous_block_interval: Some("12".to_owned()),
                previous_clock_mode: "timestamp".to_owned(),
                title: "reference title".to_owned(),
                clock_mode: "timestamp".to_owned(),
                block_interval: None,
            }]
        );
    }

    #[test]
    fn test_plan_proposal_reference_field_updates_repairs_clock_mode_from_reference() {
        let updates = plan_proposal_reference_field_updates(
            &[ProposalReferenceFieldCandidate {
                id: "proposal:1".to_owned(),
                proposal_id: "42".to_owned(),
                title: "same title".to_owned(),
                block_interval: None,
                clock_mode: "blocknumber".to_owned(),
            }],
            &[ReferenceProposalFields {
                proposal_id: "0x2a".to_owned(),
                title: "same title".to_owned(),
                clock_mode: "timestamp".to_owned(),
                block_interval: Some("13.333333333333334".to_owned()),
            }],
        );

        assert_eq!(
            updates,
            vec![ProposalReferenceFieldUpdate {
                id: "proposal:1".to_owned(),
                previous_title: "same title".to_owned(),
                previous_block_interval: None,
                previous_clock_mode: "blocknumber".to_owned(),
                title: "same title".to_owned(),
                clock_mode: "timestamp".to_owned(),
                block_interval: None,
            }]
        );
    }

    #[test]
    fn test_reference_endpoint_scope_requires_dao_path_segment() {
        assert!(reference_endpoint_has_dao_path_segment(
            "ens-dao",
            "https://indexer.degov.ai/ens-dao/graphql"
        ));
        assert!(reference_endpoint_has_dao_path_segment(
            "ens-dao",
            "http://localhost:8005/ens-dao/graphql?foo=bar"
        ));
        assert!(!reference_endpoint_has_dao_path_segment(
            "ens-dao",
            "https://indexer.degov.ai/graphql?dao_code=ens-dao"
        ));
        assert!(!reference_endpoint_has_dao_path_segment(
            "ens-dao",
            "https://ens-dao.example.com/graphql"
        ));
    }

    #[test]
    fn test_reference_graphql_response_accepts_null_data_with_errors() {
        let response = serde_json::from_value::<ReferenceGraphqlResponse>(serde_json::json!({
            "data": null,
            "errors": [
                {
                    "message": "bad field"
                }
            ]
        }))
        .expect("decode GraphQL error response");

        assert!(response.data.is_none());
        assert_eq!(response.errors.expect("errors").len(), 1);
    }
}
