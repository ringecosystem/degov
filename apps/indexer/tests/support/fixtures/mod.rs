use std::{
    fmt, fs,
    path::{Path, PathBuf},
    str::FromStr,
};

use serde::Deserialize;

use degov_datalens_indexer::{
    DaoEventDecodeError, DaoLogSource, DecodedDaoEvent, GovernanceTokenStandard, NormalizedEvmLog,
    decode_dao_log,
};

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct DatalensFixture {
    pub name: String,
    pub description: String,
    pub dao_ranges: Vec<DatalensFixtureDaoRange>,
    pub pages: Vec<DatalensFixturePage>,
    pub duplicate_replay_rows_path: String,
    pub expected_decoded_events_path: String,
    pub expected_decoded_payloads_path: String,
    pub expected_projected_outputs_path: String,
    pub expected_checkpoint: DatalensFixtureCheckpointExpectation,
    pub expected_duplicate_replay: DatalensFixtureDuplicateReplayExpectation,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
pub struct DatalensFixtureDaoRange {
    pub label: String,
    pub dao_code: String,
    pub chain_id: i32,
    pub chain: String,
    pub contracts: DatalensFixtureContracts,
    pub from_block: u64,
    pub to_block: u64,
    pub why_chosen: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
pub struct DatalensFixtureContracts {
    pub governor: String,
    pub governor_token: String,
    pub timelock: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct DatalensFixturePage {
    pub label: String,
    pub dao_code: String,
    pub chain_id: i32,
    pub source: DatalensFixtureLogSource,
    pub token_standard: Option<DatalensFixtureTokenStandard>,
    pub from_block: u64,
    pub to_block: u64,
    pub rows_path: String,
    #[serde(skip)]
    pub rows: Vec<serde_json::Value>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DatalensFixtureLogSource {
    Governor,
    GovernorToken,
    Timelock,
}

impl From<DatalensFixtureLogSource> for DaoLogSource {
    fn from(source: DatalensFixtureLogSource) -> Self {
        match source {
            DatalensFixtureLogSource::Governor => Self::Governor,
            DatalensFixtureLogSource::GovernorToken => Self::GovernorToken,
            DatalensFixtureLogSource::Timelock => Self::Timelock,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DatalensFixtureTokenStandard {
    Erc20,
    Erc721,
}

impl From<DatalensFixtureTokenStandard> for GovernanceTokenStandard {
    fn from(standard: DatalensFixtureTokenStandard) -> Self {
        match standard {
            DatalensFixtureTokenStandard::Erc20 => Self::Erc20,
            DatalensFixtureTokenStandard::Erc721 => Self::Erc721,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
pub struct DatalensFixtureCheckpointExpectation {
    pub dao_code: String,
    pub chain_id: i32,
    pub stream_id: String,
    pub data_source_version: String,
    pub processed_height: i64,
    pub next_block: i64,
    pub target_height: i64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
pub struct DatalensFixtureDuplicateReplayExpectation {
    pub unique_log_count: usize,
    pub replayed_log_count: usize,
    pub duplicate_log_ids: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
pub struct DatalensFixtureExpectedEvent {
    pub table: String,
    pub event: String,
    pub dao_code: String,
    pub block_number: String,
    pub proposal_id: Option<String>,
}

#[derive(Debug)]
pub enum DatalensFixtureError {
    Io {
        path: PathBuf,
        source: std::io::Error,
    },
    Json {
        path: PathBuf,
        source: serde_json::Error,
    },
    Decode(DaoEventDecodeError),
}

impl fmt::Display for DatalensFixtureError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io { path, source } => {
                write!(
                    formatter,
                    "failed to read Datalens fixture {}: {source}",
                    path.display()
                )
            }
            Self::Json { path, source } => {
                write!(
                    formatter,
                    "failed to parse Datalens fixture {}: {source}",
                    path.display()
                )
            }
            Self::Decode(source) => {
                write!(formatter, "failed to decode Datalens fixture: {source}")
            }
        }
    }
}

impl std::error::Error for DatalensFixtureError {}

impl DatalensFixture {
    pub fn decode_log(
        &self,
        page: &DatalensFixturePage,
        log: &NormalizedEvmLog,
    ) -> Result<DecodedDaoEvent, DatalensFixtureError> {
        let token_standard = page.token_standard.map(GovernanceTokenStandard::from);
        decode_dao_log(
            &page.dao_code,
            DaoLogSource::from(page.source),
            token_standard,
            log,
        )
        .map_err(DatalensFixtureError::Decode)
    }

    pub fn duplicate_replay_rows(&self) -> Result<Vec<serde_json::Value>, DatalensFixtureError> {
        read_json(&fixture_path(&self.name).join(&self.duplicate_replay_rows_path))
    }

    pub fn expected_decoded_events(
        &self,
    ) -> Result<Vec<DatalensFixtureExpectedEvent>, DatalensFixtureError> {
        read_json(&fixture_path(&self.name).join(&self.expected_decoded_events_path))
    }

    pub fn expected_decoded_payloads(&self) -> Result<serde_json::Value, DatalensFixtureError> {
        read_json(&fixture_path(&self.name).join(&self.expected_decoded_payloads_path))
    }

    pub fn expected_projected_outputs(&self) -> Result<serde_json::Value, DatalensFixtureError> {
        read_json(&fixture_path(&self.name).join(&self.expected_projected_outputs_path))
    }
}

pub fn load_datalens_fixture(name: &str) -> Result<DatalensFixture, DatalensFixtureError> {
    let root = fixture_path(name);
    let manifest_path = root.join("manifest.json");
    let mut fixture: DatalensFixture = read_json(&manifest_path)?;

    for page in &mut fixture.pages {
        page.rows = read_json(&root.join(&page.rows_path))?;
    }

    Ok(fixture)
}

fn fixture_path(name: &str) -> PathBuf {
    PathBuf::from_str(env!("CARGO_MANIFEST_DIR"))
        .expect("manifest dir")
        .join("tests")
        .join("support")
        .join("fixtures")
        .join(name)
}

fn read_json<T>(path: &Path) -> Result<T, DatalensFixtureError>
where
    T: for<'de> Deserialize<'de>,
{
    let content = fs::read_to_string(path).map_err(|source| DatalensFixtureError::Io {
        path: path.to_path_buf(),
        source,
    })?;

    serde_json::from_str(&content).map_err(|source| DatalensFixtureError::Json {
        path: path.to_path_buf(),
        source,
    })
}
