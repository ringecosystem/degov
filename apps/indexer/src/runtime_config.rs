use std::{collections::BTreeMap, env, net::SocketAddr, path::Path, time::Duration};

use anyhow as runtime_anyhow;
use datalens_sdk::RetryConfig;
use runtime_anyhow::{Context, Result, bail};
use serde::Deserialize;

use crate::{
    AdaptiveChunkSizerConfig, BatchReadPlanConfig, ChainContracts, ChainReadMethod,
    DEFAULT_ONCHAIN_REFRESH_APPLY_BATCH_SIZE, DatalensConfig, DatalensProvisionalFinality,
    DatalensQueryConcurrencyConfig, DatalensRuntimeContractSet, IndexerCheckpointIdentity,
    IndexerRunnerContexts, IndexerRunnerOptions, OnchainRefreshTickConfig,
    OnchainRefreshWorkerConfig, ProposalProjectionContext, SecretString, TimelockProjectionContext,
    TokenProjectionContext, VoteProjectionContext,
    store::postgres::DEFAULT_ONCHAIN_REFRESH_DEFERRED_DRAIN_ROWS,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GraphqlRuntimeConfig {
    pub bind_address: SocketAddr,
    pub public_endpoint: Option<String>,
    pub paths: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProvisionalRuntimeConfig {
    pub enabled: bool,
    pub finality: DatalensProvisionalFinality,
}

impl ProvisionalRuntimeConfig {
    pub fn from_env() -> Result<Self> {
        let enabled = optional_env_bool("DEGOV_PROVISIONAL_WORKER_ENABLED")?.unwrap_or(false);
        let finality = optional_env("DEGOV_PROVISIONAL_FINALITY")?
            .as_deref()
            .map(str::parse)
            .transpose()?
            .unwrap_or(DatalensProvisionalFinality::SafeToLatest);

        Ok(Self { enabled, finality })
    }
}

impl GraphqlRuntimeConfig {
    pub fn from_env() -> Result<Self> {
        let endpoint = optional_env("DEGOV_INDEXER_GRAPHQL_ENDPOINT")?;
        let bind_address = match optional_env("DEGOV_INDEXER_GRAPHQL_BIND_ADDRESS")? {
            Some(address) => parse_bind_address("DEGOV_INDEXER_GRAPHQL_BIND_ADDRESS", &address)?,
            None => legacy_endpoint_bind_address(endpoint.as_deref())?.unwrap_or_else(|| {
                "0.0.0.0:4350"
                    .parse()
                    .expect("default GraphQL bind address parses")
            }),
        };
        let configured_path = optional_env("DEGOV_INDEXER_GRAPHQL_PATH")?;
        let public_endpoint = endpoint
            .filter(|value| !value.parse::<SocketAddr>().is_ok())
            .filter(|value| !value.trim().is_empty());
        let paths = graphql_paths(public_endpoint.as_deref(), configured_path.as_deref())?;

        Ok(Self {
            bind_address,
            public_endpoint,
            paths,
        })
    }
}

fn parse_bind_address(env_name: &str, value: &str) -> Result<SocketAddr> {
    value
        .parse()
        .with_context(|| format!("parse {env_name} as bind address: {value}"))
}

fn legacy_endpoint_bind_address(endpoint: Option<&str>) -> Result<Option<SocketAddr>> {
    let Some(endpoint) = endpoint else {
        return Ok(None);
    };
    if endpoint.starts_with("http://")
        || endpoint.starts_with("https://")
        || endpoint.starts_with('/')
        || endpoint.trim().is_empty()
    {
        return Ok(None);
    }

    Ok(Some(parse_bind_address(
        "DEGOV_INDEXER_GRAPHQL_ENDPOINT",
        endpoint,
    )?))
}

fn graphql_paths(endpoint: Option<&str>, configured_path: Option<&str>) -> Result<Vec<String>> {
    let mut paths = vec!["/graphql".to_owned()];
    if let Some(path) = endpoint.and_then(endpoint_graphql_path) {
        push_graphql_path(&mut paths, &path)?;
    }
    if let Some(path) = configured_path {
        push_graphql_path(&mut paths, path)?;
    }
    Ok(paths)
}

fn endpoint_graphql_path(endpoint: &str) -> Option<String> {
    if endpoint.starts_with('/') {
        return Some(endpoint.to_owned());
    }

    let endpoint = endpoint
        .strip_prefix("http://")
        .or_else(|| endpoint.strip_prefix("https://"))?;
    let path_start = endpoint.find('/')?;
    Some(endpoint[path_start..].to_owned())
}

fn push_graphql_path(paths: &mut Vec<String>, path: &str) -> Result<()> {
    let path = path
        .trim()
        .split(['?', '#'])
        .next()
        .unwrap_or("")
        .trim_end_matches('/');
    if path.is_empty() || path == "/graphql" {
        return Ok(());
    }
    if !path.starts_with('/') {
        bail!("DEGOV_INDEXER_GRAPHQL_PATH must start with /: {path}");
    }

    let path = path.to_owned();
    if !paths.contains(&path) {
        paths.push(path);
    }
    Ok(())
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IndexerRuntimeConfig {
    pub dao_filter: Option<String>,
    pub contract_set_mode: IndexerContractSetMode,
    pub target_height: IndexerTargetHeight,
    pub poll_interval: Duration,
    pub run_once: bool,
    pub max_chunks_per_run: Option<u64>,
    pub database_max_connections: u32,
    pub checkpoint_stream_id: String,
    pub data_source_version: String,
    pub query_max_attempts: u32,
    pub datalens_query_concurrency: DatalensQueryConcurrencyConfig,
    pub contract_set_max_concurrency: ContractSetConcurrencyLimit,
    pub contract_set_per_chain_max_concurrency: ContractSetConcurrencyLimit,
    pub progress_refresh_lag_blocks: i64,
    pub adaptive_chunk_sizer: AdaptiveChunkSizerRuntimeConfig,
    pub onchain_refresh_tick: OnchainRefreshTickConfig,
    pub onchain_refresh_deferred_drain_batch_size: usize,
    pub provisional: ProvisionalRuntimeConfig,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum IndexerContractSetMode {
    Single,
    All,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum IndexerTargetHeight {
    Latest,
    Fixed(i64),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ContractSetConcurrencyLimit {
    Limited(usize),
    Unlimited,
}

impl ContractSetConcurrencyLimit {
    pub fn as_log_value(self) -> String {
        match self {
            Self::Limited(limit) => limit.to_string(),
            Self::Unlimited => "unlimited".to_owned(),
        }
    }
}

pub fn datalens_retry_config(max_attempts: u32) -> RetryConfig {
    RetryConfig {
        max_attempts,
        max_elapsed: None,
        ..RetryConfig::default()
    }
}

impl IndexerTargetHeight {
    pub fn configured_height(self) -> Option<i64> {
        match self {
            Self::Latest => None,
            Self::Fixed(height) => Some(height),
        }
    }

    pub fn as_log_value(self) -> String {
        match self {
            Self::Latest => "latest".to_owned(),
            Self::Fixed(height) => height.to_string(),
        }
    }
}

impl IndexerContractSetMode {
    fn from_env() -> Result<Self> {
        match optional_env("DEGOV_INDEXER_CONTRACT_SET_MODE")?
            .as_deref()
            .unwrap_or("single")
        {
            "single" => Ok(Self::Single),
            "all" => Ok(Self::All),
            _ => bail!("DEGOV_INDEXER_CONTRACT_SET_MODE must be single or all"),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Single => "single",
            Self::All => "all",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IndexerContractSetRuntimeConfig {
    pub dao_code: String,
    pub start_block: i64,
    pub target_height: i64,
    pub checkpoint_contract_set_id: String,
    pub checkpoint_stream_id: String,
    pub data_source_version: String,
    pub query_max_attempts: u32,
    pub datalens_query_concurrency: DatalensQueryConcurrencyConfig,
    pub contract_set_max_concurrency: ContractSetConcurrencyLimit,
    pub contract_set_per_chain_max_concurrency: ContractSetConcurrencyLimit,
    pub progress_refresh_lag_blocks: i64,
    pub adaptive_chunk_sizer: AdaptiveChunkSizerRuntimeConfig,
    pub max_chunks_per_run: Option<u64>,
    pub onchain_refresh_tick: OnchainRefreshTickConfig,
    pub onchain_refresh_deferred_drain_batch_size: usize,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AdaptiveChunkSizerRuntimeConfig {
    pub min_chunk_size: u32,
    pub max_chunk_size: Option<u32>,
    pub fast_chunk_duration_threshold: Duration,
    pub high_query_duration_threshold: Duration,
    pub cache_fill_high_duration_threshold: Duration,
    pub stable_chunks_to_grow: u32,
    pub unstable_chunks_to_shrink: u32,
    pub shrink_factor_percent: u32,
}

impl Default for AdaptiveChunkSizerRuntimeConfig {
    fn default() -> Self {
        Self {
            min_chunk_size: 100,
            max_chunk_size: None,
            fast_chunk_duration_threshold: Duration::from_secs(1),
            high_query_duration_threshold: Duration::from_secs(10),
            cache_fill_high_duration_threshold: Duration::from_secs(3),
            stable_chunks_to_grow: 2,
            unstable_chunks_to_shrink: 2,
            shrink_factor_percent: 50,
        }
    }
}

impl AdaptiveChunkSizerRuntimeConfig {
    pub fn for_block_range_limit(self, block_range_limit: u32) -> AdaptiveChunkSizerConfig {
        let max_chunk_size = self
            .max_chunk_size
            .unwrap_or(block_range_limit)
            .min(block_range_limit);
        AdaptiveChunkSizerConfig {
            initial_chunk_size: max_chunk_size,
            max_chunk_size,
            min_chunk_size: self.min_chunk_size.min(max_chunk_size),
            fast_chunk_duration_threshold: self.fast_chunk_duration_threshold,
            high_query_duration_threshold: self.high_query_duration_threshold,
            cache_fill_high_duration_threshold: self.cache_fill_high_duration_threshold,
            stable_chunks_to_grow: self.stable_chunks_to_grow,
            unstable_chunks_to_shrink: self.unstable_chunks_to_shrink,
            shrink_factor_percent: self.shrink_factor_percent,
            ..AdaptiveChunkSizerConfig::for_max_chunk_size(max_chunk_size)
        }
    }
}

impl IndexerRuntimeConfig {
    pub fn from_env() -> Result<Self> {
        let contract_set_mode = IndexerContractSetMode::from_env()?;
        let dao_filter = match contract_set_mode {
            IndexerContractSetMode::Single => Some(required_env("DEGOV_INDEXER_DAO_CODE")?),
            IndexerContractSetMode::All => optional_env("DEGOV_INDEXER_DAO_CODE")?,
        };
        let target_height = parse_indexer_target_height()?;

        let query_max_attempts = optional_env_u32("DEGOV_INDEXER_QUERY_MAX_ATTEMPTS")?.unwrap_or(3);
        if query_max_attempts == 0 {
            bail!("DEGOV_INDEXER_QUERY_MAX_ATTEMPTS must be greater than zero");
        }

        let database_max_connections =
            optional_env_u32("DEGOV_INDEXER_DATABASE_MAX_CONNECTIONS")?.unwrap_or(5);
        if database_max_connections == 0 {
            bail!("DEGOV_INDEXER_DATABASE_MAX_CONNECTIONS must be greater than zero");
        }

        let poll_interval = Duration::from_millis(
            optional_env_u64("DEGOV_INDEXER_POLL_INTERVAL_MS")?.unwrap_or(10_000),
        );
        let run_once = optional_env_bool("DEGOV_INDEXER_RUN_ONCE")?.unwrap_or(false);

        Ok(Self {
            dao_filter,
            contract_set_mode,
            target_height,
            checkpoint_stream_id: optional_env("DEGOV_INDEXER_STREAM_ID")?
                .unwrap_or_else(|| "datalens-native".to_owned()),
            data_source_version: optional_env("DEGOV_INDEXER_DATA_SOURCE_VERSION")?
                .unwrap_or_else(|| "datalens-v1".to_owned()),
            query_max_attempts,
            datalens_query_concurrency: load_datalens_query_concurrency_config()?,
            contract_set_max_concurrency: optional_env_contract_set_concurrency_limit(
                "DEGOV_INDEXER_CONTRACT_SET_MAX_CONCURRENCY",
            )?
            .unwrap_or(ContractSetConcurrencyLimit::Limited(4)),
            contract_set_per_chain_max_concurrency: optional_env_contract_set_concurrency_limit(
                "DEGOV_INDEXER_CONTRACT_SET_PER_CHAIN_MAX_CONCURRENCY",
            )?
            .unwrap_or(ContractSetConcurrencyLimit::Limited(2)),
            progress_refresh_lag_blocks: optional_env_i64(
                "DEGOV_INDEXER_PROGRESS_REFRESH_LAG_BLOCKS",
            )?
            .unwrap_or(100),
            adaptive_chunk_sizer: load_adaptive_chunk_sizer_runtime_config()?,
            onchain_refresh_tick: load_onchain_refresh_tick_config()?,
            onchain_refresh_deferred_drain_batch_size:
                onchain_refresh_deferred_drain_batch_size_from_env()?,
            provisional: ProvisionalRuntimeConfig::from_env()?,
            poll_interval,
            run_once,
            max_chunks_per_run: optional_env_u64("DEGOV_INDEXER_MAX_CHUNKS_PER_RUN")?,
            database_max_connections,
        })
    }

    pub fn configured_contract_sets(
        &self,
        config: &DatalensConfig,
    ) -> Result<Vec<DatalensRuntimeContractSet>> {
        match self.contract_set_mode {
            IndexerContractSetMode::Single => {
                let dao_code = self
                    .dao_filter
                    .as_deref()
                    .context("DEGOV_INDEXER_DAO_CODE is required")?;
                let selected = config
                    .select_contract_set(dao_code)
                    .context("select Datalens indexer contract set")?;
                let configured = config
                    .configured_contract_sets(Some(dao_code))
                    .context("select configured Datalens indexer contract set")?;
                configured
                    .into_iter()
                    .find(|contract_set| contract_set.contract == selected)
                    .map(|contract_set| vec![contract_set])
                    .context("selected Datalens indexer contract set was not configured")
            }
            IndexerContractSetMode::All => config
                .configured_contract_sets(self.dao_filter.as_deref())
                .context("select configured Datalens indexer contract sets"),
        }
    }

    pub fn for_configured_contract_set(
        &self,
        contract_set: &DatalensRuntimeContractSet,
    ) -> Result<IndexerContractSetRuntimeConfig> {
        let target_height = self
            .target_height
            .configured_height()
            .context("latest DEGOV_INDEXER_TARGET_HEIGHT must be resolved before planning")?;

        self.for_configured_contract_set_at_target(contract_set, target_height)
    }

    pub fn for_configured_contract_set_at_target(
        &self,
        contract_set: &DatalensRuntimeContractSet,
        target_height: i64,
    ) -> Result<IndexerContractSetRuntimeConfig> {
        let runtime = IndexerContractSetRuntimeConfig {
            dao_code: contract_set.dao_code.clone(),
            start_block: 0,
            target_height,
            checkpoint_contract_set_id: String::new(),
            checkpoint_stream_id: self.checkpoint_stream_id.clone(),
            data_source_version: self.data_source_version.clone(),
            query_max_attempts: self.query_max_attempts,
            datalens_query_concurrency: self.datalens_query_concurrency,
            contract_set_max_concurrency: self.contract_set_max_concurrency,
            contract_set_per_chain_max_concurrency: self.contract_set_per_chain_max_concurrency,
            progress_refresh_lag_blocks: self.progress_refresh_lag_blocks,
            adaptive_chunk_sizer: self.adaptive_chunk_sizer,
            max_chunks_per_run: self.max_chunks_per_run,
            onchain_refresh_tick: self.onchain_refresh_tick.clone(),
            onchain_refresh_deferred_drain_batch_size: self
                .onchain_refresh_deferred_drain_batch_size,
        };

        Ok(runtime
            .with_start_block(contract_set.contract.start_block)?
            .with_contract_set_scope(contract_set.contract_set_id.clone()))
    }

    pub fn should_skip_contract_set_start_after_target(&self, start_block: i64) -> bool {
        matches!(self.contract_set_mode, IndexerContractSetMode::All)
            && self
                .target_height
                .configured_height()
                .is_some_and(|target_height| target_height < start_block)
    }

    pub fn should_skip_contract_set_start_after_resolved_target(
        &self,
        start_block: i64,
        target_height: i64,
    ) -> bool {
        matches!(self.contract_set_mode, IndexerContractSetMode::All) && target_height < start_block
    }
}

impl IndexerContractSetRuntimeConfig {
    pub fn with_start_block(mut self, start_block: i64) -> Result<Self> {
        if self.target_height < start_block {
            bail!(
                "DEGOV_INDEXER_TARGET_HEIGHT must be greater than or equal to configured startBlock"
            );
        }
        self.start_block = start_block;

        Ok(self)
    }

    pub fn with_contract_set_scope(mut self, contract_set_id: String) -> Self {
        self.checkpoint_contract_set_id = contract_set_id;
        self
    }

    pub fn options(
        &self,
        config: &DatalensConfig,
        contracts: &crate::DaoContractAddresses,
    ) -> Result<IndexerRunnerOptions> {
        let chain_id = config
            .chain
            .network_id
            .context("DATALENS_CHAIN_ID is required for EVM log normalization")?;

        Ok(IndexerRunnerOptions {
            datalens_config: config.clone(),
            addresses: contracts.clone(),
            checkpoint_identity: IndexerCheckpointIdentity {
                dao_code: self.dao_code.clone(),
                chain_id,
                contract_set_id: self.checkpoint_contract_set_id.clone(),
                stream_id: self.checkpoint_stream_id.clone(),
                data_source_version: self.data_source_version.clone(),
            },
            start_block: self.start_block,
            safe_height: None,
            progress_refresh_lag_blocks: self.progress_refresh_lag_blocks,
            adaptive_chunk_sizer: self
                .adaptive_chunk_sizer
                .for_block_range_limit(config.query_limits.block_range_limit),
            onchain_refresh_deferred_drain_batch_size: self
                .onchain_refresh_deferred_drain_batch_size,
        })
    }

    pub fn contexts(&self, contracts: &crate::DaoContractAddresses) -> IndexerRunnerContexts {
        let chain_contracts = ChainContracts {
            governor: contracts.governor.clone(),
            governor_token: contracts.governor_token.clone(),
            timelock: contracts.timelock.clone(),
        };
        let read_plan_config = BatchReadPlanConfig::default().validated();

        IndexerRunnerContexts {
            vote: VoteProjectionContext {
                contract_set_id: self.checkpoint_contract_set_id.clone(),
                dao_code: self.dao_code.clone(),
                governor_address: contracts.governor.clone(),
                contracts: chain_contracts.clone(),
                read_plan_config,
            },
            token: TokenProjectionContext {
                contract_set_id: self.checkpoint_contract_set_id.clone(),
                dao_code: self.dao_code.clone(),
                governor_address: contracts.governor.clone(),
                token_address: contracts.governor_token.clone(),
                contracts: chain_contracts.clone(),
                token_standard: contracts.governor_token_standard,
                from_block: u64::try_from(self.start_block).unwrap_or_default(),
                to_block: u64::try_from(self.start_block).unwrap_or_default(),
                target_height: u64::try_from(self.target_height).ok(),
                read_plan_config,
                current_power_method: ChainReadMethod::GetVotes,
            },
            proposal: Some(ProposalProjectionContext {
                contract_set_id: self.checkpoint_contract_set_id.clone(),
                dao_code: self.dao_code.clone(),
                governor_address: contracts.governor.clone(),
                contracts: chain_contracts.clone(),
                token_standard: contracts.governor_token_standard,
                read_plan_config,
            }),
            timelock: Some(TimelockProjectionContext {
                contract_set_id: self.checkpoint_contract_set_id.clone(),
                dao_code: self.dao_code.clone(),
                governor_address: contracts.governor.clone(),
                timelock_address: contracts.timelock.clone(),
                contracts: chain_contracts,
                read_plan_config,
            }),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OnchainRefreshRuntimeConfig {
    pub enabled: bool,
    pub rpc_chains: BTreeMap<i32, OnchainRefreshRpcChainConfig>,
    pub batch_size: usize,
    pub apply_batch_size: usize,
    pub max_attempts: i32,
    pub max_batches_per_poll: usize,
    pub deferred_drain_batch_size: usize,
    pub poll_interval: Duration,
    pub run_once: bool,
    pub debounce: Duration,
    pub lock_ttl: Duration,
    pub retry_delay: Duration,
    pub request_timeout: Duration,
    pub database_max_connections: u32,
    pub max_concurrency: usize,
    pub multicall_batch_size: usize,
    pub current_power_method: ChainReadMethod,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OnchainRefreshRpcChainConfig {
    pub chain_id: i32,
    pub url_env: String,
    pub url: SecretString,
}

#[derive(Clone, Debug, Default, Deserialize)]
struct RawOnchainRefreshFileConfig {
    rpc: Option<RawRpcFileConfig>,
}

#[derive(Clone, Debug, Default, Deserialize)]
struct RawRpcFileConfig {
    chains: Option<BTreeMap<String, RawRpcChainFileConfig>>,
}

#[derive(Clone, Debug, Default, Deserialize)]
struct RawRpcChainFileConfig {
    #[serde(rename = "urlEnv", alias = "url_env")]
    url_env: Option<String>,
}

impl OnchainRefreshRuntimeConfig {
    pub fn from_env() -> Result<Self> {
        let enabled = optional_env_bool("DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED")?.unwrap_or(true);
        Self::from_env_with_enabled(enabled)
    }

    pub fn from_env_for_indexer_tick() -> Result<Self> {
        Self::from_env_with_enabled(true)
    }

    fn from_env_with_enabled(enabled: bool) -> Result<Self> {
        let rpc_chains = load_onchain_refresh_rpc_chains(enabled)?;
        let batch_size = onchain_refresh_batch_size_from_env()?;
        let apply_batch_size = onchain_refresh_apply_batch_size_from_env()?;

        let max_attempts = optional_env_i32("DEGOV_ONCHAIN_REFRESH_MAX_ATTEMPTS")?.unwrap_or(3);
        if max_attempts <= 0 {
            bail!("DEGOV_ONCHAIN_REFRESH_MAX_ATTEMPTS must be greater than zero");
        }

        let max_batches_per_poll =
            optional_env_usize("DEGOV_ONCHAIN_REFRESH_MAX_BATCHES_PER_POLL")?.unwrap_or(1);
        if max_batches_per_poll == 0 {
            bail!("DEGOV_ONCHAIN_REFRESH_MAX_BATCHES_PER_POLL must be greater than zero");
        }
        let deferred_drain_batch_size = onchain_refresh_deferred_drain_batch_size_from_env()?;

        let poll_interval = Duration::from_millis(
            optional_env_u64("DEGOV_ONCHAIN_REFRESH_POLL_INTERVAL_MS")?.unwrap_or(10_000),
        );
        let run_once = optional_env_bool("DEGOV_ONCHAIN_REFRESH_RUN_ONCE")?
            .or(optional_env_bool("DEGOV_INDEXER_RUN_ONCE")?)
            .unwrap_or(false);
        let debounce = onchain_refresh_debounce_from_env()?;
        let lock_ttl = Duration::from_millis(
            optional_env_u64("DEGOV_ONCHAIN_REFRESH_LOCK_TTL_MS")?.unwrap_or(300_000),
        );
        let retry_delay = Duration::from_millis(
            optional_env_u64("DEGOV_ONCHAIN_REFRESH_RETRY_DELAY_MS")?.unwrap_or(30_000),
        );
        let request_timeout = Duration::from_millis(
            optional_env_u64("DEGOV_ONCHAIN_REFRESH_REQUEST_TIMEOUT_MS")?.unwrap_or(15_000),
        );
        let database_max_connections =
            optional_env_u32("DEGOV_INDEXER_DATABASE_MAX_CONNECTIONS")?.unwrap_or(5);
        if database_max_connections == 0 {
            bail!("DEGOV_INDEXER_DATABASE_MAX_CONNECTIONS must be greater than zero");
        }
        let max_concurrency = optional_env_usize("DEGOV_ONCHAIN_REFRESH_CONCURRENCY")?.unwrap_or(1);
        if max_concurrency == 0 {
            bail!("DEGOV_ONCHAIN_REFRESH_CONCURRENCY must be greater than zero");
        }
        let multicall_batch_size =
            optional_env_usize("DEGOV_ONCHAIN_REFRESH_MULTICALL_CHUNK_SIZE")?.unwrap_or(100);
        if multicall_batch_size == 0 {
            bail!("DEGOV_ONCHAIN_REFRESH_MULTICALL_CHUNK_SIZE must be greater than zero");
        }
        let current_power_method = optional_env("DEGOV_ONCHAIN_REFRESH_CURRENT_POWER_METHOD")?
            .as_deref()
            .map(parse_current_power_method)
            .transpose()?
            .unwrap_or(ChainReadMethod::GetVotes);

        Ok(Self {
            enabled,
            rpc_chains,
            batch_size,
            apply_batch_size,
            max_attempts,
            max_batches_per_poll,
            deferred_drain_batch_size,
            poll_interval,
            run_once,
            debounce,
            lock_ttl,
            retry_delay,
            request_timeout,
            database_max_connections,
            max_concurrency,
            multicall_batch_size,
            current_power_method,
        })
    }

    pub fn read_plan_config(&self) -> BatchReadPlanConfig {
        BatchReadPlanConfig {
            max_concurrency: self.max_concurrency,
            multicall_batch_size: self.multicall_batch_size,
        }
        .validated()
    }

    pub fn worker_config(&self) -> OnchainRefreshWorkerConfig {
        OnchainRefreshWorkerConfig {
            batch_size: self.batch_size,
            apply_batch_size: self.apply_batch_size,
            max_attempts: self.max_attempts,
            deferred_drain_batch_size: self.deferred_drain_batch_size,
            debounce: self.debounce,
            lock_ttl: self.lock_ttl,
            retry_delay: self.retry_delay,
            lock_owner: format!("degov-onchain-refresh-worker:{}", std::process::id()),
        }
    }
}

fn load_onchain_refresh_tick_config() -> Result<OnchainRefreshTickConfig> {
    let defaults = OnchainRefreshTickConfig::default();
    let max_tasks_per_tick = optional_env_usize("DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_MAX_TASKS")?
        .unwrap_or(defaults.max_tasks_per_tick);
    let apply_batch_size = onchain_refresh_apply_batch_size_from_env()?;
    let max_tasks_per_run =
        optional_env_usize("DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_MAX_TASKS_PER_RUN")?
            .unwrap_or(max_tasks_per_tick.min(apply_batch_size));
    let config = OnchainRefreshTickConfig {
        enabled: optional_env_bool("DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_ENABLED")?
            .unwrap_or(defaults.enabled),
        max_tasks_per_tick,
        max_tasks_per_run,
        max_duration_per_tick: Duration::from_millis(
            optional_env_u64("DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_MAX_DURATION_MS")?
                .unwrap_or(duration_millis_u64(defaults.max_duration_per_tick)),
        ),
        min_blocks_between_ticks: optional_env_i64(
            "DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_MIN_BLOCKS",
        )?
        .unwrap_or(defaults.min_blocks_between_ticks),
    };

    if config.enabled && config.max_tasks_per_tick == 0 {
        bail!("DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_MAX_TASKS must be greater than zero");
    }
    if config.enabled && config.max_tasks_per_run == 0 {
        bail!("DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_MAX_TASKS_PER_RUN must be greater than zero");
    }
    if config.enabled && config.max_duration_per_tick.is_zero() {
        bail!("DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_MAX_DURATION_MS must be greater than zero");
    }
    if config.min_blocks_between_ticks < 0 {
        bail!("DEGOV_INDEXER_ONCHAIN_REFRESH_TICK_MIN_BLOCKS must be zero or greater");
    }

    Ok(config)
}

fn load_datalens_query_concurrency_config() -> Result<DatalensQueryConcurrencyConfig> {
    // These limits are process-local guards for this indexer instance, not
    // distributed limits shared across pods or hosts.
    let config = DatalensQueryConcurrencyConfig {
        global_max_in_flight: optional_env_usize("DEGOV_INDEXER_DATALENS_QUERY_MAX_IN_FLIGHT")?,
        per_chain_max_in_flight: optional_env_usize(
            "DEGOV_INDEXER_DATALENS_QUERY_PER_CHAIN_MAX_IN_FLIGHT",
        )?,
    };

    if config
        .global_max_in_flight
        .is_some_and(|max_in_flight| max_in_flight == 0)
    {
        bail!(
            "DEGOV_INDEXER_DATALENS_QUERY_MAX_IN_FLIGHT process-local limit must be greater than zero"
        );
    }
    if config
        .per_chain_max_in_flight
        .is_some_and(|max_in_flight| max_in_flight == 0)
    {
        bail!(
            "DEGOV_INDEXER_DATALENS_QUERY_PER_CHAIN_MAX_IN_FLIGHT process-local limit must be greater than zero"
        );
    }

    Ok(config)
}

fn load_adaptive_chunk_sizer_runtime_config() -> Result<AdaptiveChunkSizerRuntimeConfig> {
    let defaults = AdaptiveChunkSizerRuntimeConfig::default();
    let config = AdaptiveChunkSizerRuntimeConfig {
        min_chunk_size: optional_env_u32("DEGOV_INDEXER_ADAPTIVE_CHUNK_MIN_BLOCKS")?
            .unwrap_or(defaults.min_chunk_size),
        max_chunk_size: optional_env_u32("DEGOV_INDEXER_ADAPTIVE_CHUNK_MAX_BLOCKS")?,
        fast_chunk_duration_threshold: Duration::from_millis(
            optional_env_u64("DEGOV_INDEXER_ADAPTIVE_CHUNK_FAST_DURATION_MS")?
                .unwrap_or(duration_millis_u64(defaults.fast_chunk_duration_threshold)),
        ),
        high_query_duration_threshold: Duration::from_millis(
            optional_env_u64("DEGOV_INDEXER_ADAPTIVE_CHUNK_HIGH_DURATION_MS")?
                .unwrap_or(duration_millis_u64(defaults.high_query_duration_threshold)),
        ),
        cache_fill_high_duration_threshold: Duration::from_millis(
            optional_env_u64("DEGOV_INDEXER_ADAPTIVE_CHUNK_CACHE_FILL_HIGH_DURATION_MS")?
                .unwrap_or(duration_millis_u64(
                    defaults.cache_fill_high_duration_threshold,
                )),
        ),
        stable_chunks_to_grow: optional_env_u32(
            "DEGOV_INDEXER_ADAPTIVE_CHUNK_STABLE_CHUNKS_TO_GROW",
        )?
        .unwrap_or(defaults.stable_chunks_to_grow),
        unstable_chunks_to_shrink: optional_env_u32(
            "DEGOV_INDEXER_ADAPTIVE_CHUNK_UNSTABLE_CHUNKS_TO_SHRINK",
        )?
        .unwrap_or(defaults.unstable_chunks_to_shrink),
        shrink_factor_percent: optional_env_u32(
            "DEGOV_INDEXER_ADAPTIVE_CHUNK_SHRINK_FACTOR_PERCENT",
        )?
        .unwrap_or(defaults.shrink_factor_percent),
    };

    if config.min_chunk_size == 0 {
        bail!("DEGOV_INDEXER_ADAPTIVE_CHUNK_MIN_BLOCKS must be greater than zero");
    }
    if config
        .max_chunk_size
        .is_some_and(|max_chunk_size| max_chunk_size == 0)
    {
        bail!("DEGOV_INDEXER_ADAPTIVE_CHUNK_MAX_BLOCKS must be greater than zero");
    }
    if config
        .max_chunk_size
        .is_some_and(|max_chunk_size| config.min_chunk_size > max_chunk_size)
    {
        bail!(
            "DEGOV_INDEXER_ADAPTIVE_CHUNK_MIN_BLOCKS must be less than or equal to DEGOV_INDEXER_ADAPTIVE_CHUNK_MAX_BLOCKS"
        );
    }
    if config.fast_chunk_duration_threshold.is_zero() {
        bail!("DEGOV_INDEXER_ADAPTIVE_CHUNK_FAST_DURATION_MS must be greater than zero");
    }
    if config.high_query_duration_threshold.is_zero() {
        bail!("DEGOV_INDEXER_ADAPTIVE_CHUNK_HIGH_DURATION_MS must be greater than zero");
    }
    if config.cache_fill_high_duration_threshold.is_zero() {
        bail!("DEGOV_INDEXER_ADAPTIVE_CHUNK_CACHE_FILL_HIGH_DURATION_MS must be greater than zero");
    }
    if config.stable_chunks_to_grow == 0 {
        bail!("DEGOV_INDEXER_ADAPTIVE_CHUNK_STABLE_CHUNKS_TO_GROW must be greater than zero");
    }
    if config.unstable_chunks_to_shrink == 0 {
        bail!("DEGOV_INDEXER_ADAPTIVE_CHUNK_UNSTABLE_CHUNKS_TO_SHRINK must be greater than zero");
    }
    if config.shrink_factor_percent == 0 || config.shrink_factor_percent >= 100 {
        bail!(
            "DEGOV_INDEXER_ADAPTIVE_CHUNK_SHRINK_FACTOR_PERCENT must be greater than zero and less than 100"
        );
    }

    Ok(config)
}

fn optional_env_contract_set_concurrency_limit(
    name: &'static str,
) -> Result<Option<ContractSetConcurrencyLimit>> {
    optional_env(name)?
        .map(|value| parse_contract_set_concurrency_limit_env_value(name, &value))
        .transpose()
}

fn parse_contract_set_concurrency_limit_env_value(
    name: &'static str,
    value: &str,
) -> Result<ContractSetConcurrencyLimit> {
    match value.trim().to_ascii_lowercase().as_str() {
        "unlimited" | "unbounded" => Ok(ContractSetConcurrencyLimit::Unlimited),
        _ => {
            let limit = parse_usize_env_value(name, value)?;
            if limit == 0 {
                bail!("{name} must be a positive integer or unlimited");
            }
            Ok(ContractSetConcurrencyLimit::Limited(limit))
        }
    }
}

fn duration_millis_u64(duration: Duration) -> u64 {
    duration.as_millis().try_into().unwrap_or(u64::MAX)
}

fn load_onchain_refresh_rpc_chains(
    enabled: bool,
) -> Result<BTreeMap<i32, OnchainRefreshRpcChainConfig>> {
    let configured = load_rpc_chain_url_envs_from_config_file()?;
    if !configured.is_empty() {
        return configured
            .into_iter()
            .map(|(chain_id, url_env)| {
                let url = if enabled {
                    required_dynamic_env(&url_env).with_context(|| {
                        format!("resolve rpc.chains chain_id {chain_id} urlEnv {url_env}")
                    })?
                } else {
                    optional_dynamic_env(&url_env)?.unwrap_or_default()
                };

                Ok((
                    chain_id,
                    OnchainRefreshRpcChainConfig {
                        chain_id,
                        url_env,
                        url: SecretString::new(url),
                    },
                ))
            })
            .collect();
    }

    let legacy_url = if enabled {
        Some(required_env("DEGOV_ONCHAIN_REFRESH_RPC_URL")?)
    } else {
        optional_env("DEGOV_ONCHAIN_REFRESH_RPC_URL")?
    };
    let Some(legacy_url) = legacy_url else {
        return Ok(BTreeMap::new());
    };
    let chain_id =
        optional_env_i32("DATALENS_CHAIN_ID")?.unwrap_or(crate::config::DEFAULT_DATALENS_CHAIN_ID);

    Ok(BTreeMap::from([(
        chain_id,
        OnchainRefreshRpcChainConfig {
            chain_id,
            url_env: "DEGOV_ONCHAIN_REFRESH_RPC_URL".to_owned(),
            url: SecretString::new(legacy_url),
        },
    )]))
}

fn load_rpc_chain_url_envs_from_config_file() -> Result<BTreeMap<i32, String>> {
    let Some(config_file) = optional_env("DEGOV_INDEXER_CONFIG_FILE")? else {
        return Ok(BTreeMap::new());
    };

    let file: RawOnchainRefreshFileConfig = ::config::Config::builder()
        .add_source(::config::File::from(Path::new(&config_file)))
        .build()
        .with_context(|| format!("failed to load DEGOV_INDEXER_CONFIG_FILE: {config_file}"))?
        .try_deserialize()
        .with_context(|| format!("failed to parse DEGOV_INDEXER_CONFIG_FILE: {config_file}"))?;

    let Some(rpc) = file.rpc else {
        return Ok(BTreeMap::new());
    };
    let Some(chains) = rpc.chains else {
        return Ok(BTreeMap::new());
    };

    chains
        .into_iter()
        .map(|(chain_id, chain)| {
            let parsed_chain_id = chain_id
                .parse::<i32>()
                .with_context(|| format!("rpc.chains contains invalid chain id {chain_id}"))?;
            let url_env = chain
                .url_env
                .map(|value| value.trim().to_owned())
                .filter(|value| !value.is_empty())
                .with_context(|| {
                    format!("rpc.chains chain_id {parsed_chain_id} requires urlEnv")
                })?;

            Ok((parsed_chain_id, url_env))
        })
        .collect()
}

pub fn required_env(name: &'static str) -> Result<String> {
    let value = env::var(name).with_context(|| format!("{name} is required"))?;
    let value = value.trim().to_owned();

    if value.is_empty() {
        bail!("{name} must not be empty");
    }

    Ok(value)
}

fn required_dynamic_env(name: &str) -> Result<String> {
    let value = env::var(name).with_context(|| format!("{name} is required"))?;
    let value = value.trim().to_owned();

    if value.is_empty() {
        bail!("{name} must not be empty");
    }

    Ok(value)
}

fn optional_env(name: &'static str) -> Result<Option<String>> {
    match env::var(name) {
        Ok(value) => {
            let value = value.trim().to_owned();

            if value.is_empty() {
                Ok(None)
            } else {
                Ok(Some(value))
            }
        }
        Err(env::VarError::NotPresent) => Ok(None),
        Err(error) => Err(error).with_context(|| format!("read {name}")),
    }
}

fn optional_dynamic_env(name: &str) -> Result<Option<String>> {
    match env::var(name) {
        Ok(value) => {
            let value = value.trim().to_owned();

            if value.is_empty() {
                Ok(None)
            } else {
                Ok(Some(value))
            }
        }
        Err(env::VarError::NotPresent) => Ok(None),
        Err(error) => Err(error).with_context(|| format!("read {name}")),
    }
}

fn optional_env_i64(name: &'static str) -> Result<Option<i64>> {
    optional_env(name)?
        .map(|value| parse_i64_env_value(name, &value))
        .transpose()
}

fn optional_env_i32(name: &'static str) -> Result<Option<i32>> {
    optional_env(name)?
        .map(|value| parse_i32_env_value(name, &value))
        .transpose()
}

fn optional_env_u32(name: &'static str) -> Result<Option<u32>> {
    optional_env(name)?
        .map(|value| parse_u32_env_value(name, &value))
        .transpose()
}

fn optional_env_u64(name: &'static str) -> Result<Option<u64>> {
    optional_env(name)?
        .map(|value| parse_u64_env_value(name, &value))
        .transpose()
}

fn optional_env_usize(name: &'static str) -> Result<Option<usize>> {
    optional_env(name)?
        .map(|value| parse_usize_env_value(name, &value))
        .transpose()
}

fn optional_env_bool(name: &'static str) -> Result<Option<bool>> {
    optional_env(name)?
        .map(|value| parse_bool_env_value(name, &value))
        .transpose()
}

fn parse_indexer_target_height() -> Result<IndexerTargetHeight> {
    match optional_env("DEGOV_INDEXER_TARGET_HEIGHT")? {
        None => Ok(IndexerTargetHeight::Latest),
        Some(value) if value.eq_ignore_ascii_case("latest") => Ok(IndexerTargetHeight::Latest),
        Some(value) => parse_i64_env_value("DEGOV_INDEXER_TARGET_HEIGHT", &value)
            .map(IndexerTargetHeight::Fixed),
    }
}

pub fn parse_i64_env_value(name: &'static str, value: &str) -> Result<i64> {
    value
        .trim()
        .parse::<i64>()
        .with_context(|| format!("{name} must be a signed integer"))
}

fn parse_i32_env_value(name: &'static str, value: &str) -> Result<i32> {
    value
        .trim()
        .parse::<i32>()
        .with_context(|| format!("{name} must be a signed integer"))
}

fn parse_u32_env_value(name: &'static str, value: &str) -> Result<u32> {
    value
        .trim()
        .parse::<u32>()
        .with_context(|| format!("{name} must be an unsigned integer"))
}

fn parse_usize_env_value(name: &'static str, value: &str) -> Result<usize> {
    value
        .trim()
        .parse::<usize>()
        .with_context(|| format!("{name} must be an unsigned integer"))
}

fn parse_u64_env_value(name: &'static str, value: &str) -> Result<u64> {
    value
        .trim()
        .parse::<u64>()
        .with_context(|| format!("{name} must be an unsigned integer"))
}

pub fn parse_bool_env_value(name: &'static str, value: &str) -> Result<bool> {
    match value.trim().to_ascii_lowercase().as_str() {
        "true" | "1" | "yes" => Ok(true),
        "false" | "0" | "no" => Ok(false),
        _ => bail!("{name} must be one of true, false, 1, 0, yes, or no"),
    }
}

pub fn onchain_refresh_worker_enabled(value: &str) -> Result<bool> {
    parse_bool_env_value("DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED", value)
}

pub fn onchain_refresh_debounce_from_env() -> Result<Duration> {
    Ok(Duration::from_millis(
        optional_env_u64("DEGOV_ONCHAIN_REFRESH_DEBOUNCE_MS")?.unwrap_or(120_000),
    ))
}

pub fn onchain_refresh_deferred_drain_batch_size_from_env() -> Result<usize> {
    let batch_size = optional_env_usize("DEGOV_ONCHAIN_REFRESH_DEFERRED_DRAIN_BATCH_SIZE")?
        .unwrap_or(DEFAULT_ONCHAIN_REFRESH_DEFERRED_DRAIN_ROWS);
    if batch_size == 0 {
        bail!("DEGOV_ONCHAIN_REFRESH_DEFERRED_DRAIN_BATCH_SIZE must be greater than zero");
    }

    Ok(batch_size)
}

fn onchain_refresh_batch_size_from_env() -> Result<usize> {
    let batch_size = optional_env_usize("DEGOV_ONCHAIN_REFRESH_BATCH_SIZE")?.unwrap_or(100);
    if batch_size == 0 {
        bail!("DEGOV_ONCHAIN_REFRESH_BATCH_SIZE must be greater than zero");
    }

    Ok(batch_size)
}

pub fn onchain_refresh_apply_batch_size_from_env() -> Result<usize> {
    let batch_size = optional_env_usize("DEGOV_INDEXER_ONCHAIN_REFRESH_APPLY_BATCH_SIZE")?
        .unwrap_or(DEFAULT_ONCHAIN_REFRESH_APPLY_BATCH_SIZE);
    if batch_size == 0 {
        bail!("DEGOV_INDEXER_ONCHAIN_REFRESH_APPLY_BATCH_SIZE must be greater than zero");
    }
    if batch_size > DEFAULT_ONCHAIN_REFRESH_APPLY_BATCH_SIZE {
        bail!(
            "DEGOV_INDEXER_ONCHAIN_REFRESH_APPLY_BATCH_SIZE must be less than or equal to {}",
            DEFAULT_ONCHAIN_REFRESH_APPLY_BATCH_SIZE
        );
    }

    Ok(batch_size)
}

fn parse_current_power_method(value: &str) -> Result<ChainReadMethod> {
    match value.trim() {
        "getVotes" | "get_votes" => Ok(ChainReadMethod::GetVotes),
        "getCurrentVotes" | "get_current_votes" | "currentVotes" | "current_votes" => {
            Ok(ChainReadMethod::CurrentVotes)
        }
        _ => {
            bail!("DEGOV_ONCHAIN_REFRESH_CURRENT_POWER_METHOD must be getVotes or getCurrentVotes")
        }
    }
}
