use std::time::{Duration, Instant};

use datalens_sdk::native::{
    ChainFamilyInput, ChainFamilyKindInput, ChainIdentityInput, DatasetKeyInput,
    EvmLogsSelectorInput, NetworkIdInput, QueryInput, QueryRangeInput, QueryRangeKindInput,
    QuerySelectorInput, SelectorKindInput,
};

use crate::{
    DatalensConfig, DatalensError, DatalensLogQueryCacheSummary, DatalensLogQueryResult,
    DatalensProvisionalFinality, GovernanceTokenStandard,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DaoContractAddresses {
    pub governor: String,
    pub governor_token: String,
    pub governor_token_standard: GovernanceTokenStandard,
    pub timelock: Option<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DaoLogSource {
    Governor,
    GovernorToken,
    Timelock,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DaoLogAddressSource {
    pub address: String,
    pub source: DaoLogSource,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DaoLogQueryPlan {
    pub sources: Vec<DaoLogAddressSource>,
    pub from_block: i32,
    pub to_block: i32,
    pub input: QueryInput,
}

#[derive(Clone, Debug, PartialEq)]
pub struct DatalensLogPage {
    pub plan: DaoLogQueryPlan,
    pub rows: serde_json::Value,
    pub cache: DatalensLogQueryCacheSummary,
    pub query_duration: Duration,
}

pub trait DatalensLogQueryReader {
    fn query_logs(&mut self, input: QueryInput) -> Result<DatalensLogQueryResult, DatalensError>;
}

#[derive(Clone, Debug, PartialEq)]
pub struct DatalensProvisionalLogPage {
    pub plan: DaoLogQueryPlan,
    pub rows: serde_json::Value,
    pub segments: Vec<DatalensProvisionalCacheSegment>,
    pub query_duration: Duration,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DatalensProvisionalCacheSegment {
    pub source: String,
    pub finality: String,
    pub range_start_block: i64,
    pub range_end_block: i64,
    pub anchor_block_number: Option<i64>,
    pub anchor_block_hash: Option<String>,
    pub anchor_parent_hash: Option<String>,
    pub anchor_block_timestamp: Option<i64>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct DatalensProvisionalLogQueryResult {
    pub rows: serde_json::Value,
    pub segments: Vec<DatalensProvisionalCacheSegment>,
}

impl DatalensProvisionalLogQueryResult {
    pub fn rows_only(rows: serde_json::Value) -> Self {
        Self {
            rows,
            segments: Vec::new(),
        }
    }
}

pub trait DatalensProvisionalLogQueryReader {
    fn query_provisional_logs(
        &mut self,
        input: QueryInput,
    ) -> Result<DatalensProvisionalLogQueryResult, DatalensError>;
}

pub fn plan_dao_log_queries(
    config: &DatalensConfig,
    addresses: &DaoContractAddresses,
    from_block: i64,
    to_block: i64,
) -> Result<Vec<DaoLogQueryPlan>, DatalensError> {
    if from_block < 0 || to_block < 0 || from_block > to_block {
        return Err(DatalensError::Query(format!(
            "invalid Datalens log block range {from_block}..={to_block}"
        )));
    }
    if config.query_limits.block_range_limit == 0 {
        return Err(DatalensError::Query(
            "Datalens log block range limit must be greater than zero".to_owned(),
        ));
    }

    let mut plans = Vec::new();
    let mut next_chunk_start = from_block;
    let chunk_limit = i64::from(config.query_limits.block_range_limit);

    while next_chunk_start <= to_block {
        let chunk_end = next_chunk_start
            .checked_add(chunk_limit - 1)
            .ok_or_else(|| DatalensError::Query("Datalens log range overflowed".to_owned()))?
            .min(to_block);
        let range_start = i32::try_from(next_chunk_start).map_err(|_| {
            DatalensError::Query("Datalens log range start exceeds SDK limit".to_owned())
        })?;
        let range_end = i32::try_from(chunk_end).map_err(|_| {
            DatalensError::Query("Datalens log range end exceeds SDK limit".to_owned())
        })?;

        plans.extend(query_plans(config, addresses, range_start, range_end));

        if chunk_end == to_block {
            break;
        }
        next_chunk_start = chunk_end + 1;
    }

    Ok(plans)
}

pub fn fetch_dao_log_pages(
    reader: &mut impl DatalensLogQueryReader,
    plans: &[DaoLogQueryPlan],
) -> Result<Vec<DatalensLogPage>, DatalensError> {
    let mut pages = Vec::new();
    for plan in plans {
        let query_started_at = Instant::now();
        let result = reader.query_logs(plan.input.clone())?;
        pages.push(DatalensLogPage {
            plan: plan.clone(),
            rows: result.rows,
            cache: result.cache,
            query_duration: query_started_at.elapsed(),
        });
    }

    Ok(pages)
}

pub fn fetch_provisional_dao_log_pages(
    reader: &mut impl DatalensProvisionalLogQueryReader,
    plans: &[DaoLogQueryPlan],
    finality: DatalensProvisionalFinality,
) -> Result<Vec<DatalensProvisionalLogPage>, DatalensError> {
    let mut pages = Vec::new();
    for plan in plans {
        let mut input = plan.input.clone();
        input.finality = Some(finality.as_datalens_value().to_owned());
        let query_started_at = Instant::now();
        let result = reader.query_provisional_logs(input)?;
        pages.push(DatalensProvisionalLogPage {
            plan: plan.clone(),
            rows: result.rows,
            segments: result.segments,
            query_duration: query_started_at.elapsed(),
        });
    }

    Ok(pages)
}

fn query_plans(
    config: &DatalensConfig,
    addresses: &DaoContractAddresses,
    from_block: i32,
    to_block: i32,
) -> Vec<DaoLogQueryPlan> {
    let mut governance_sources = vec![DaoLogAddressSource {
        address: addresses.governor.clone(),
        source: DaoLogSource::Governor,
    }];
    if let Some(timelock) = &addresses.timelock {
        governance_sources.push(DaoLogAddressSource {
            address: timelock.clone(),
            source: DaoLogSource::Timelock,
        });
    }

    vec![
        query_plan(
            config,
            governance_sources,
            Vec::new(),
            broad_governance_topic0_filters(),
            from_block,
            to_block,
        ),
        query_plan(
            config,
            vec![DaoLogAddressSource {
                address: addresses.governor_token.clone(),
                source: DaoLogSource::GovernorToken,
            }],
            vec![addresses.governor_token.clone()],
            governor_token_topic0_filters(),
            from_block,
            to_block,
        ),
    ]
}

fn query_plan(
    config: &DatalensConfig,
    sources: Vec<DaoLogAddressSource>,
    selector_addresses: Vec<String>,
    topics: Vec<String>,
    from_block: i32,
    to_block: i32,
) -> DaoLogQueryPlan {
    DaoLogQueryPlan {
        sources,
        from_block,
        to_block,
        input: QueryInput {
            chain: ChainIdentityInput {
                family: ChainFamilyInput {
                    kind: ChainFamilyKindInput::Evm,
                    other: None,
                },
                configured_name: config.chain.configured_name.clone(),
                network_id: config.chain.network_id.map(|numeric| NetworkIdInput {
                    numeric: Some(numeric),
                    textual: None,
                }),
            },
            dataset_key: DatasetKeyInput {
                family: config.dataset.family.clone(),
                name: config.dataset.name.clone(),
            },
            selector: QuerySelectorInput {
                kind: SelectorKindInput::EvmLogs,
                evm_logs: Some(EvmLogsSelectorInput {
                    addresses: selector_addresses,
                    topics: vec![topics],
                }),
                other: None,
            },
            range: QueryRangeInput {
                kind: QueryRangeKindInput::Block,
                start: from_block
                    .try_into()
                    .expect("query plan start is non-negative"),
                end: to_block.try_into().expect("query plan end is non-negative"),
            },
            finality: Some(config.finality.as_datalens_value().to_owned()),
            fields: None,
        },
    }
}

fn broad_governance_topic0_filters() -> Vec<String> {
    unique_topic0_filters(
        GOVERNOR_TOPIC0_FILTERS
            .iter()
            .chain(TIMELOCK_TOPIC0_FILTERS),
    )
}

fn governor_token_topic0_filters() -> Vec<String> {
    unique_topic0_filters(GOVERNOR_TOKEN_TOPIC0_FILTERS.iter())
}

fn unique_topic0_filters<'a>(topics: impl Iterator<Item = &'a &'a str>) -> Vec<String> {
    let mut values = Vec::new();
    for topic in topics {
        let topic = (*topic).to_owned();
        if !values.contains(&topic) {
            values.push(topic);
        }
    }
    values
}

const GOVERNOR_TOPIC0_FILTERS: &[&str] = &[
    "0x7d84a6263ae0d98d3329bd7b46bb4e8d6f98cd35a7adb45c274c8b7fd5ebd5e0",
    "0x9a2e42fd6722813d69113e7d0079d3d940171428df7373df9c7f7617cfda2892",
    "0x541f725fb9f7c98a30cc9c0ff32fbb14358cd7159c847a3aa20a2bdc442ba511",
    "0x712ae1383f79ac853f8d882153778e0260ef8f03b504e2866e0593e04d2b291f",
    "0x789cf55be980739dad1d0699b93b58e806b51c9d96619bfa8fe0a28abaa7b30c",
    "0xc565b045403dc03c2eea82b81a0465edad9e2e7fc4d97e11421c209da93d7a93",
    "0x7e3f7f0708a84de9203036abaa450dccc85ad5ff52f78c170f3edb55cf5e8828",
    "0xccb45da8d5717e6c4544694297c4ba5cf151d455c9bb0ed4fc7a38411bc05461",
    "0x0553476bf02ef2726e8ce5ced78d63e26e602e4a2257b1f559418e24b4633997",
    "0x7ca4ac117ed3cdce75c1161d8207c440389b1a15d69d096831664657c07dafc2",
    "0x08f74ea46ef7894f65eabfb5e6e695de773a000b47c529ab559178069b226401",
    "0xb8e138887d0aa13bab447e82de9d5c1777041ecd21ca36ba824ff1e6c07ddda4",
    "0xe2babfbac5889a709b63bb7f598b324e08bc5a4fb9ec647fb3cbc9ec07eb8712",
];

const GOVERNOR_TOKEN_TOPIC0_FILTERS: &[&str] = &[
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    "0x3134e8a2e6d97e929a7e54011ea5485d7d196dd5f0ba4d4ef95803e8e3fc257f",
    "0xdec2bacdd2f05b59de34da9b523dff8be42e5e38e818c82fdb0bae774387a724",
];

const TIMELOCK_TOPIC0_FILTERS: &[&str] = &[
    "0x4cf4410cc57040e44862ef0f45f3dd5a5e02db8eb8add648d4b0e236f1d07dca",
    "0xc2617efa69bab66782fa219543714338489c4e9e178271560a91b82c3f612b58",
    "0x20fda5fd27a1ea7bf5b9567f143ac5470bb059374a27e8f67cb44f946f6d0387",
    "0xbaa1eb22f2a492ba1a5fea61b8df4d27c6c8b5f3971e63bb58fa14ff72eedb70",
    "0x11c24f4ead16507c69ac467fbd5e4eed5fb5c699626d2cc6d66421df253886d5",
    "0x2f8788117e7eff1d82e926ec794901d17c78024a50270940304540a733656f0d",
    "0xf6391f5c32d9c69d2a47ea670b442974b53935d1edc7fd64eb21e047a839171b",
    "0xbd79b86ffe0ab8e8776151514217cd7cacd52c909f66475c3af44e129f0b00ff",
];
