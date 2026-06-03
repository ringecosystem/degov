use async_graphql::{Enum, InputObject, SimpleObject};
use sqlx::FromRow;

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct GraphqlScope {
    pub dao_code: Option<String>,
    pub chain_id: Option<i32>,
    pub governor_address: Option<String>,
    pub contract_set_id: Option<String>,
}

impl GraphqlScope {
    pub(super) fn is_empty(&self) -> bool {
        self.dao_code.is_none()
            && self.chain_id.is_none()
            && self.governor_address.is_none()
            && self.contract_set_id.is_none()
    }

    pub(super) fn from_graphql_path(path: &str) -> Self {
        let Some(prefix) = path.strip_suffix("/graphql") else {
            return Self::default();
        };
        let dao_code = prefix.trim_matches('/');
        if dao_code.is_empty() || dao_code.contains('/') {
            return Self::default();
        }

        Self {
            dao_code: Some(dao_code.to_owned()),
            ..Self::default()
        }
    }
}

#[derive(Clone, Debug, FromRow, SimpleObject)]
#[graphql(rename_fields = "camelCase", complex)]
pub struct Proposal {
    pub(super) id: String,
    #[graphql(skip)]
    pub(super) contract_set_id: String,
    pub(super) chain_id: Option<i32>,
    pub(super) dao_code: Option<String>,
    pub(super) governor_address: Option<String>,
    pub(super) proposal_id: String,
    pub(super) proposer: String,
    pub(super) targets: Vec<String>,
    pub(super) values: Vec<String>,
    pub(super) signatures: Vec<String>,
    pub(super) calldatas: Vec<String>,
    pub(super) vote_start: String,
    pub(super) vote_end: String,
    pub(super) description: String,
    pub(super) block_number: String,
    pub(super) block_timestamp: String,
    pub(super) transaction_hash: String,
    pub(super) metrics_votes_count: Option<i32>,
    pub(super) metrics_votes_with_params_count: Option<i32>,
    pub(super) metrics_votes_without_params_count: Option<i32>,
    pub(super) metrics_votes_weight_for_sum: Option<String>,
    pub(super) metrics_votes_weight_against_sum: Option<String>,
    pub(super) metrics_votes_weight_abstain_sum: Option<String>,
    pub(super) title: String,
    pub(super) vote_start_timestamp: String,
    pub(super) vote_end_timestamp: String,
    pub(super) block_interval: Option<String>,
    pub(super) clock_mode: String,
    pub(super) proposal_deadline: Option<String>,
    pub(super) proposal_eta: Option<String>,
    pub(super) queue_ready_at: Option<String>,
    pub(super) queue_expires_at: Option<String>,
    pub(super) quorum: String,
    pub(super) decimals: String,
    pub(super) timelock_address: Option<String>,
    pub(super) timelock_grace_period: Option<String>,
}

#[derive(Clone, Debug, FromRow, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct VoteCastGroup {
    pub(super) id: String,
    pub(super) r#type: String,
    pub(super) params: Option<String>,
    pub(super) voter: String,
    pub(super) support: i32,
    pub(super) weight: String,
    pub(super) reason: String,
    pub(super) block_number: String,
    pub(super) block_timestamp: String,
    pub(super) transaction_hash: String,
}

#[derive(Clone, Debug, FromRow, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct ProposalCanceled {
    pub(super) id: String,
    pub(super) proposal_id: String,
    pub(super) block_number: String,
    pub(super) block_timestamp: String,
    pub(super) transaction_hash: String,
}

#[derive(Clone, Debug, FromRow, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct ProposalExecuted {
    pub(super) id: String,
    pub(super) proposal_id: String,
    pub(super) block_number: String,
    pub(super) block_timestamp: String,
    pub(super) transaction_hash: String,
}

#[derive(Clone, Debug, FromRow, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct ProposalQueued {
    pub(super) id: String,
    pub(super) proposal_id: String,
    pub(super) eta_seconds: String,
    pub(super) block_number: String,
    pub(super) block_timestamp: String,
    pub(super) transaction_hash: String,
}

#[derive(Clone, Debug, FromRow, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct DataMetric {
    pub(super) id: String,
    pub(super) chain_id: Option<i32>,
    pub(super) dao_code: Option<String>,
    pub(super) governor_address: Option<String>,
    pub(super) token_address: Option<String>,
    pub(super) contract_address: Option<String>,
    pub(super) log_index: Option<i32>,
    pub(super) transaction_index: Option<i32>,
    pub(super) proposals_count: Option<i32>,
    pub(super) votes_count: Option<i32>,
    pub(super) votes_with_params_count: Option<i32>,
    pub(super) votes_without_params_count: Option<i32>,
    pub(super) votes_weight_for_sum: Option<String>,
    pub(super) votes_weight_against_sum: Option<String>,
    pub(super) votes_weight_abstain_sum: Option<String>,
    pub(super) power_sum: Option<String>,
    pub(super) member_count: Option<i32>,
}

#[derive(Clone, Debug, FromRow, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct Contributor {
    pub(super) id: String,
    pub(super) chain_id: Option<i32>,
    pub(super) dao_code: Option<String>,
    pub(super) governor_address: Option<String>,
    pub(super) block_number: String,
    pub(super) block_timestamp: String,
    pub(super) transaction_hash: String,
    pub(super) last_vote_timestamp: Option<String>,
    pub(super) power: String,
    pub(super) balance: Option<String>,
    pub(super) delegates_count_all: i32,
}

#[derive(Clone, Debug, FromRow, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct Delegate {
    pub(super) id: String,
    pub(super) chain_id: Option<i32>,
    pub(super) dao_code: Option<String>,
    pub(super) governor_address: Option<String>,
    pub(super) from_delegate: String,
    pub(super) to_delegate: String,
    pub(super) block_number: String,
    pub(super) block_timestamp: String,
    pub(super) transaction_hash: String,
    pub(super) is_current: bool,
    pub(super) power: String,
}

#[derive(Clone, Debug, FromRow, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct DelegateMapping {
    pub(super) id: String,
    pub(super) chain_id: Option<i32>,
    pub(super) dao_code: Option<String>,
    pub(super) governor_address: Option<String>,
    pub(super) from: String,
    pub(super) to: String,
    pub(super) power: String,
    pub(super) block_number: String,
    pub(super) block_timestamp: String,
    pub(super) transaction_hash: String,
}

#[derive(Clone, Debug, FromRow, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct IndexerStatus {
    pub(super) dao_code: String,
    pub(super) chain_id: i32,
    pub(super) contract_set_id: String,
    pub(super) processed_height: Option<i64>,
    pub(super) target_height: Option<i64>,
    pub(super) synced_percentage: Option<f64>,
    pub(super) is_synced: bool,
    pub(super) updated_at: String,
    pub(super) last_error: Option<String>,
}

#[derive(Clone, Debug, FromRow, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct SquidStatus {
    pub(super) height: i64,
    pub(super) finalized_height: i64,
    pub(super) hash: Option<String>,
    pub(super) finalized_hash: Option<String>,
}

#[derive(Clone, Debug, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct Connection {
    pub(super) total_count: i64,
}

#[derive(Clone, Debug, Default, InputObject)]
#[graphql(rename_fields = "camelCase")]
pub struct ScopeWhereInput {
    #[graphql(name = "chainId_eq")]
    pub(super) chain_id_eq: Option<i32>,
    #[graphql(name = "governorAddress_eq")]
    pub(super) governor_address_eq: Option<String>,
    #[graphql(name = "daoCode_eq")]
    pub(super) dao_code_eq: Option<String>,
}

#[derive(Clone, Debug, Default, InputObject)]
#[graphql(rename_fields = "camelCase")]
pub struct ProposalWhereInput {
    #[graphql(flatten)]
    pub(super) scope: ScopeWhereInput,
    #[graphql(name = "proposalId_eq")]
    pub(super) proposal_id_eq: Option<String>,
    #[graphql(name = "proposer_eq")]
    pub(super) proposer_eq: Option<String>,
    #[graphql(name = "description_containsInsensitive")]
    pub(super) description_contains_insensitive: Option<String>,
    #[graphql(name = "voters_some")]
    pub(super) voters_some: Option<VoteCastGroupWhereInput>,
    #[graphql(name = "OR")]
    pub(super) or: Option<Vec<ProposalWhereInput>>,
}

#[derive(Clone, Debug, Default, InputObject)]
#[graphql(rename_fields = "camelCase")]
pub struct VoteCastGroupWhereInput {
    #[graphql(name = "voter_eq")]
    pub(super) voter_eq: Option<String>,
    #[graphql(name = "support_eq")]
    pub(super) support_eq: Option<i32>,
    #[graphql(name = "OR")]
    pub(super) or: Option<Vec<VoteCastGroupWhereInput>>,
}

macro_rules! proposal_event_where_input {
    ($name:ident, $graphql_name:literal) => {
        #[derive(Clone, Debug, Default, InputObject)]
        #[graphql(name = $graphql_name, rename_fields = "camelCase")]
        pub struct $name {
            #[graphql(flatten)]
            pub(super) scope: ScopeWhereInput,
            #[graphql(name = "proposalId_eq")]
            pub(super) proposal_id_eq: Option<String>,
        }

        impl ProposalEventWhere for $name {
            fn scope(&self) -> &ScopeWhereInput {
                &self.scope
            }

            fn proposal_id_eq(&self) -> Option<&String> {
                self.proposal_id_eq.as_ref()
            }
        }
    };
}

proposal_event_where_input!(ProposalCanceledWhereInput, "ProposalCanceledWhereInput");
proposal_event_where_input!(ProposalExecutedWhereInput, "ProposalExecutedWhereInput");
proposal_event_where_input!(ProposalQueuedWhereInput, "ProposalQueuedWhereInput");

pub(super) trait ProposalEventWhere {
    fn scope(&self) -> &ScopeWhereInput;
    fn proposal_id_eq(&self) -> Option<&String>;
}

#[derive(Clone, Debug, Default, InputObject)]
#[graphql(rename_fields = "camelCase")]
pub struct DataMetricWhereInput {
    #[graphql(flatten)]
    pub(super) scope: ScopeWhereInput,
    #[graphql(name = "id_eq")]
    pub(super) id_eq: Option<String>,
    #[graphql(name = "proposalsCount_eq")]
    pub(super) proposals_count_eq: Option<i32>,
    #[graphql(name = "votesCount_eq")]
    pub(super) votes_count_eq: Option<i32>,
    #[graphql(name = "votesWithParamsCount_eq")]
    pub(super) votes_with_params_count_eq: Option<i32>,
    #[graphql(name = "votesWithoutParamsCount_eq")]
    pub(super) votes_without_params_count_eq: Option<i32>,
    #[graphql(name = "votesWeightForSum_eq")]
    pub(super) votes_weight_for_sum_eq: Option<String>,
    #[graphql(name = "votesWeightAgainstSum_eq")]
    pub(super) votes_weight_against_sum_eq: Option<String>,
    #[graphql(name = "votesWeightAbstainSum_eq")]
    pub(super) votes_weight_abstain_sum_eq: Option<String>,
    #[graphql(name = "OR")]
    pub(super) or: Option<Vec<DataMetricWhereInput>>,
}

#[derive(Clone, Debug, Default, InputObject)]
#[graphql(rename_fields = "camelCase")]
pub struct ContributorWhereInput {
    #[graphql(flatten)]
    pub(super) scope: ScopeWhereInput,
    #[graphql(name = "id_eq")]
    pub(super) id_eq: Option<String>,
    #[graphql(name = "id_in")]
    pub(super) id_in: Option<Vec<String>>,
    #[graphql(name = "id_not_eq")]
    pub(super) id_not_eq: Option<String>,
    #[graphql(name = "power_lt")]
    pub(super) power_lt: Option<i64>,
    #[graphql(name = "OR")]
    pub(super) or: Option<Vec<ContributorWhereInput>>,
}

#[derive(Clone, Debug, Default, InputObject)]
#[graphql(rename_fields = "camelCase")]
pub struct DelegateWhereInput {
    #[graphql(flatten)]
    pub(super) scope: ScopeWhereInput,
    #[graphql(name = "fromDelegate_eq")]
    pub(super) from_delegate_eq: Option<String>,
    #[graphql(name = "toDelegate_eq")]
    pub(super) to_delegate_eq: Option<String>,
    #[graphql(name = "isCurrent_eq")]
    pub(super) is_current_eq: Option<bool>,
    #[graphql(name = "power_lt")]
    pub(super) power_lt: Option<i64>,
    #[graphql(name = "OR")]
    pub(super) or: Option<Vec<DelegateWhereInput>>,
}

#[derive(Clone, Debug, Default, InputObject)]
#[graphql(rename_fields = "camelCase")]
pub struct DelegateMappingWhereInput {
    #[graphql(flatten)]
    pub(super) scope: ScopeWhereInput,
    #[graphql(name = "from_eq")]
    pub(super) from_eq: Option<String>,
    #[graphql(name = "to_eq")]
    pub(super) to_eq: Option<String>,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, Enum)]
#[graphql(rename_items = "camelCase")]
pub enum ProposalOrderByInput {
    #[graphql(name = "blockTimestamp_DESC_NULLS_LAST")]
    BlockTimestampDescNullsLast,
    #[graphql(name = "id_ASC")]
    IdAsc,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, Enum)]
pub enum VoteCastGroupOrderByInput {
    #[graphql(name = "blockTimestamp_ASC_NULLS_LAST")]
    BlockTimestampAscNullsLast,
    #[graphql(name = "blockTimestamp_DESC_NULLS_LAST")]
    BlockTimestampDescNullsLast,
    #[graphql(name = "id_ASC")]
    IdAsc,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, Enum)]
pub enum EventOrderByInput {
    #[graphql(name = "blockTimestamp_ASC_NULLS_LAST")]
    BlockTimestampAscNullsLast,
    #[graphql(name = "blockTimestamp_DESC_NULLS_LAST")]
    BlockTimestampDescNullsLast,
    #[graphql(name = "id_ASC")]
    IdAsc,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, Enum)]
pub enum DataMetricOrderByInput {
    #[graphql(name = "id_ASC")]
    IdAsc,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, Enum)]
pub enum ContributorOrderByInput {
    #[graphql(name = "power_DESC")]
    PowerDesc,
    #[graphql(name = "power_ASC")]
    PowerAsc,
    #[graphql(name = "lastVoteTimestamp_ASC_NULLS_LAST")]
    LastVoteTimestampAscNullsLast,
    #[graphql(name = "lastVoteTimestamp_DESC_NULLS_LAST")]
    LastVoteTimestampDescNullsLast,
    #[graphql(name = "delegatesCountAll_ASC")]
    DelegatesCountAllAsc,
    #[graphql(name = "delegatesCountAll_DESC")]
    DelegatesCountAllDesc,
    #[graphql(name = "id_ASC")]
    IdAsc,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, Enum)]
pub enum DelegateOrderByInput {
    #[graphql(name = "blockTimestamp_ASC_NULLS_LAST")]
    BlockTimestampAscNullsLast,
    #[graphql(name = "blockTimestamp_DESC_NULLS_LAST")]
    BlockTimestampDescNullsLast,
    #[graphql(name = "power_ASC")]
    PowerAsc,
    #[graphql(name = "power_DESC")]
    PowerDesc,
    #[graphql(name = "id_ASC")]
    IdAsc,
}

#[derive(Copy, Clone, Debug, Eq, PartialEq, Enum)]
pub enum DelegateMappingOrderByInput {
    #[graphql(name = "id_ASC")]
    IdAsc,
    #[graphql(name = "power_DESC")]
    PowerDesc,
    #[graphql(name = "blockNumber_DESC")]
    BlockNumberDesc,
}
