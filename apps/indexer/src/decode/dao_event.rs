use std::str::FromStr;

use ethabi::{ParamType, Token, decode};
use thiserror::Error;

use crate::{ConfigError, DaoLogSource, NormalizedEvmLog};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GovernanceTokenStandard {
    Erc20,
    Erc721,
}

impl GovernanceTokenStandard {
    fn transfer_topic_count(self) -> usize {
        match self {
            Self::Erc20 => 3,
            Self::Erc721 => 4,
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Erc20 => "ERC20",
            Self::Erc721 => "ERC721",
        }
    }
}

impl FromStr for GovernanceTokenStandard {
    type Err = ConfigError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let trimmed = value.trim();

        match trimmed.to_ascii_lowercase().as_str() {
            "erc20" => Ok(Self::Erc20),
            "erc721" => Ok(Self::Erc721),
            _ => Err(ConfigError::InvalidTokenStandard {
                value: trimmed.to_owned(),
            }),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DecodedDaoEvent {
    Governor(DecodedGovernorEvent),
    Token(DecodedTokenEvent),
    Timelock(DecodedTimelockEvent),
    UnsupportedTopic(UnsupportedTopicEvent),
}

impl DecodedDaoEvent {
    pub fn as_governor(&self) -> Option<&DecodedGovernorEvent> {
        match self {
            Self::Governor(event) => Some(event),
            _ => None,
        }
    }

    pub fn as_token(&self) -> Option<&DecodedTokenEvent> {
        match self {
            Self::Token(event) => Some(event),
            _ => None,
        }
    }

    pub fn as_timelock(&self) -> Option<&DecodedTimelockEvent> {
        match self {
            Self::Timelock(event) => Some(event),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UnsupportedTopicEvent {
    pub dao_code: String,
    pub source: DaoLogSource,
    pub block_number: u64,
    pub transaction_hash: String,
    pub address: String,
    pub topic0: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DecodedGovernorEvent {
    ProposalCreated(ProposalCreatedEvent),
    ProposalQueued(ProposalQueuedEvent),
    ProposalExtended(ProposalExtendedEvent),
    ProposalExecuted(ProposalIdEvent),
    ProposalCanceled(ProposalIdEvent),
    VotingDelaySet(ParameterChangeEvent),
    VotingPeriodSet(ParameterChangeEvent),
    ProposalThresholdSet(ParameterChangeEvent),
    QuorumNumeratorUpdated(ParameterChangeEvent),
    LateQuorumVoteExtensionSet(ParameterChangeEvent),
    TimelockChange(TimelockChangeEvent),
    VoteCast(VoteCastEvent),
    VoteCastWithParams(VoteCastWithParamsEvent),
}

impl DecodedGovernorEvent {
    pub fn event_name(&self) -> &'static str {
        match self {
            Self::ProposalCreated(_) => "ProposalCreated",
            Self::ProposalQueued(_) => "ProposalQueued",
            Self::ProposalExtended(_) => "ProposalExtended",
            Self::ProposalExecuted(_) => "ProposalExecuted",
            Self::ProposalCanceled(_) => "ProposalCanceled",
            Self::VotingDelaySet(_) => "VotingDelaySet",
            Self::VotingPeriodSet(_) => "VotingPeriodSet",
            Self::ProposalThresholdSet(_) => "ProposalThresholdSet",
            Self::QuorumNumeratorUpdated(_) => "QuorumNumeratorUpdated",
            Self::LateQuorumVoteExtensionSet(_) => "LateQuorumVoteExtensionSet",
            Self::TimelockChange(_) => "TimelockChange",
            Self::VoteCast(_) => "VoteCast",
            Self::VoteCastWithParams(_) => "VoteCastWithParams",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalCreatedEvent {
    pub proposal_id: String,
    pub proposer: String,
    pub targets: Vec<String>,
    pub values: Vec<String>,
    pub signatures: Vec<String>,
    pub calldatas: Vec<String>,
    pub vote_start: String,
    pub vote_end: String,
    pub description: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalQueuedEvent {
    pub proposal_id: String,
    pub eta_seconds: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalExtendedEvent {
    pub proposal_id: String,
    pub extended_deadline: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProposalIdEvent {
    pub proposal_id: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ParameterChangeEvent {
    pub old_value: String,
    pub new_value: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimelockChangeEvent {
    pub old_timelock: String,
    pub new_timelock: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VoteCastEvent {
    pub voter: String,
    pub proposal_id: String,
    pub support: u8,
    pub weight: String,
    pub reason: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VoteCastWithParamsEvent {
    pub voter: String,
    pub proposal_id: String,
    pub support: u8,
    pub weight: String,
    pub reason: String,
    pub params: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DecodedTokenEvent {
    DelegateChanged(DelegateChangedEvent),
    DelegateVotesChanged(DelegateVotesChangedEvent),
    Transfer(TokenTransferEvent),
}

impl DecodedTokenEvent {
    pub fn event_name(&self) -> &'static str {
        match self {
            Self::DelegateChanged(_) => "DelegateChanged",
            Self::DelegateVotesChanged(_) => "DelegateVotesChanged",
            Self::Transfer(_) => "Transfer",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DelegateChangedEvent {
    pub delegator: String,
    pub from_delegate: String,
    pub to_delegate: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DelegateVotesChangedEvent {
    pub delegate: String,
    pub previous_votes: String,
    pub new_votes: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenTransferEvent {
    pub from: String,
    pub to: String,
    pub value: String,
    pub standard: GovernanceTokenStandard,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DecodedTimelockEvent {
    CallScheduled(CallScheduledEvent),
    CallExecuted(CallExecutedEvent),
    CallSalt(CallSaltEvent),
    Cancelled(TimelockOperationIdEvent),
    MinDelayChange(ParameterChangeEvent),
    RoleGranted(RoleAccountEvent),
    RoleRevoked(RoleAccountEvent),
    RoleAdminChanged(RoleAdminChangedEvent),
}

impl DecodedTimelockEvent {
    pub fn event_name(&self) -> &'static str {
        match self {
            Self::CallScheduled(_) => "CallScheduled",
            Self::CallExecuted(_) => "CallExecuted",
            Self::CallSalt(_) => "CallSalt",
            Self::Cancelled(_) => "Cancelled",
            Self::MinDelayChange(_) => "MinDelayChange",
            Self::RoleGranted(_) => "RoleGranted",
            Self::RoleRevoked(_) => "RoleRevoked",
            Self::RoleAdminChanged(_) => "RoleAdminChanged",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CallScheduledEvent {
    pub id: String,
    pub index: String,
    pub target: String,
    pub value: String,
    pub data: String,
    pub predecessor: String,
    pub delay: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CallExecutedEvent {
    pub id: String,
    pub index: String,
    pub target: String,
    pub value: String,
    pub data: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CallSaltEvent {
    pub id: String,
    pub salt: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimelockOperationIdEvent {
    pub id: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoleAccountEvent {
    pub role: String,
    pub account: String,
    pub sender: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoleAdminChangedEvent {
    pub role: String,
    pub previous_admin_role: String,
    pub new_admin_role: String,
}

#[derive(Clone, Debug, Error, Eq, PartialEq)]
#[error(
    "failed to decode DAO {dao_code} log at block {block_number}, tx {transaction_hash}, address {address}, topic0 {topic0}: {reason}"
)]
pub struct DaoEventDecodeError {
    pub dao_code: Box<str>,
    pub block_number: u64,
    pub transaction_hash: Box<str>,
    pub address: Box<str>,
    pub topic0: Box<str>,
    pub reason: Box<str>,
}

pub fn decode_dao_log(
    dao_code: &str,
    source: DaoLogSource,
    token_standard: Option<GovernanceTokenStandard>,
    log: &NormalizedEvmLog,
) -> Result<DecodedDaoEvent, DaoEventDecodeError> {
    let context = DecodeContext::new(dao_code, log);
    let topic0 = context.topic0()?;

    match source {
        DaoLogSource::Governor => decode_governor_event(&context, topic0),
        DaoLogSource::GovernorToken => decode_token_event(&context, topic0, token_standard),
        DaoLogSource::Timelock => decode_timelock_event(&context, topic0),
    }
}

pub fn dao_log_source_supports_topic0(source: DaoLogSource, topic0: &str) -> bool {
    match source {
        DaoLogSource::Governor => governor_topic0_supported(topic0),
        DaoLogSource::GovernorToken => token_topic0_supported(topic0),
        DaoLogSource::Timelock => timelock_topic0_supported(topic0),
    }
}

fn governor_topic0_supported(topic0: &str) -> bool {
    matches!(
        topic0,
        PROPOSAL_CREATED
            | PROPOSAL_QUEUED
            | PROPOSAL_EXTENDED
            | PROPOSAL_EXECUTED
            | PROPOSAL_CANCELED
            | VOTING_DELAY_SET
            | VOTING_PERIOD_SET
            | PROPOSAL_THRESHOLD_SET
            | QUORUM_NUMERATOR_UPDATED
            | LATE_QUORUM_VOTE_EXTENSION_SET
            | TIMELOCK_CHANGE
            | VOTE_CAST
            | VOTE_CAST_WITH_PARAMS
    )
}

fn token_topic0_supported(topic0: &str) -> bool {
    matches!(topic0, DELEGATE_CHANGED | DELEGATE_VOTES_CHANGED | TRANSFER)
}

fn timelock_topic0_supported(topic0: &str) -> bool {
    matches!(
        topic0,
        CALL_SCHEDULED
            | CALL_EXECUTED
            | CALL_SALT
            | CANCELLED
            | MIN_DELAY_CHANGE
            | ROLE_GRANTED
            | ROLE_REVOKED
            | ROLE_ADMIN_CHANGED
    )
}

fn decode_governor_event(
    context: &DecodeContext<'_>,
    topic0: &str,
) -> Result<DecodedDaoEvent, DaoEventDecodeError> {
    let event = match topic0 {
        PROPOSAL_CREATED => {
            context.expect_topic_count(1)?;
            let tokens = context.decode_data(&[
                ParamType::Uint(256),
                ParamType::Address,
                ParamType::Array(Box::new(ParamType::Address)),
                ParamType::Array(Box::new(ParamType::Uint(256))),
                ParamType::Array(Box::new(ParamType::String)),
                ParamType::Array(Box::new(ParamType::Bytes)),
                ParamType::Uint(256),
                ParamType::Uint(256),
                ParamType::String,
            ])?;
            DecodedGovernorEvent::ProposalCreated(ProposalCreatedEvent {
                proposal_id: token_uint(&tokens[0], context)?,
                proposer: token_address(&tokens[1], context)?,
                targets: token_address_array(&tokens[2], context)?,
                values: token_uint_array(&tokens[3], context)?,
                signatures: token_string_array(&tokens[4], context)?,
                calldatas: token_bytes_array(&tokens[5], context)?,
                vote_start: token_uint(&tokens[6], context)?,
                vote_end: token_uint(&tokens[7], context)?,
                description: token_string(&tokens[8], context)?,
            })
        }
        PROPOSAL_QUEUED => {
            context.expect_topic_count(1)?;
            let tokens = context.decode_data(&[ParamType::Uint(256), ParamType::Uint(256)])?;
            DecodedGovernorEvent::ProposalQueued(ProposalQueuedEvent {
                proposal_id: token_uint(&tokens[0], context)?,
                eta_seconds: token_uint(&tokens[1], context)?,
            })
        }
        PROPOSAL_EXTENDED => {
            context.expect_topic_count(2)?;
            let tokens = context.decode_data(&[ParamType::Uint(64)])?;
            DecodedGovernorEvent::ProposalExtended(ProposalExtendedEvent {
                proposal_id: context.topic_uint(1)?,
                extended_deadline: token_uint(&tokens[0], context)?,
            })
        }
        PROPOSAL_EXECUTED => {
            context.expect_topic_count(1)?;
            DecodedGovernorEvent::ProposalExecuted(decode_proposal_id_event(context)?)
        }
        PROPOSAL_CANCELED => {
            context.expect_topic_count(1)?;
            DecodedGovernorEvent::ProposalCanceled(decode_proposal_id_event(context)?)
        }
        VOTING_DELAY_SET => decode_parameter_change(context, "VotingDelaySet")?,
        VOTING_PERIOD_SET => decode_parameter_change(context, "VotingPeriodSet")?,
        PROPOSAL_THRESHOLD_SET => decode_parameter_change(context, "ProposalThresholdSet")?,
        QUORUM_NUMERATOR_UPDATED => decode_parameter_change(context, "QuorumNumeratorUpdated")?,
        LATE_QUORUM_VOTE_EXTENSION_SET => {
            context.expect_topic_count(1)?;
            let tokens = context.decode_data(&[ParamType::Uint(64), ParamType::Uint(64)])?;
            DecodedGovernorEvent::LateQuorumVoteExtensionSet(ParameterChangeEvent {
                old_value: token_uint(&tokens[0], context)?,
                new_value: token_uint(&tokens[1], context)?,
            })
        }
        TIMELOCK_CHANGE => {
            context.expect_topic_count(1)?;
            let tokens = context.decode_data(&[ParamType::Address, ParamType::Address])?;
            DecodedGovernorEvent::TimelockChange(TimelockChangeEvent {
                old_timelock: token_address(&tokens[0], context)?,
                new_timelock: token_address(&tokens[1], context)?,
            })
        }
        VOTE_CAST => {
            context.expect_topic_count(2)?;
            let tokens = context.decode_data(&[
                ParamType::Uint(256),
                ParamType::Uint(8),
                ParamType::Uint(256),
                ParamType::String,
            ])?;
            DecodedGovernorEvent::VoteCast(VoteCastEvent {
                voter: context.topic_address(1)?,
                proposal_id: token_uint(&tokens[0], context)?,
                support: token_u8(&tokens[1], context)?,
                weight: token_uint(&tokens[2], context)?,
                reason: token_string(&tokens[3], context)?,
            })
        }
        VOTE_CAST_WITH_PARAMS => {
            context.expect_topic_count(2)?;
            let tokens = context.decode_data(&[
                ParamType::Uint(256),
                ParamType::Uint(8),
                ParamType::Uint(256),
                ParamType::String,
                ParamType::Bytes,
            ])?;
            DecodedGovernorEvent::VoteCastWithParams(VoteCastWithParamsEvent {
                voter: context.topic_address(1)?,
                proposal_id: token_uint(&tokens[0], context)?,
                support: token_u8(&tokens[1], context)?,
                weight: token_uint(&tokens[2], context)?,
                reason: token_string(&tokens[3], context)?,
                params: token_bytes(&tokens[4], context)?,
            })
        }
        _ => return Ok(context.unsupported(DaoLogSource::Governor)),
    };

    Ok(DecodedDaoEvent::Governor(event))
}

fn decode_token_event(
    context: &DecodeContext<'_>,
    topic0: &str,
    token_standard: Option<GovernanceTokenStandard>,
) -> Result<DecodedDaoEvent, DaoEventDecodeError> {
    let event = match topic0 {
        DELEGATE_CHANGED => {
            context.expect_topic_count(4)?;
            DecodedTokenEvent::DelegateChanged(DelegateChangedEvent {
                delegator: context.topic_address(1)?,
                from_delegate: context.topic_address(2)?,
                to_delegate: context.topic_address(3)?,
            })
        }
        DELEGATE_VOTES_CHANGED => {
            context.expect_topic_count(2)?;
            let tokens = context.decode_data(&[ParamType::Uint(256), ParamType::Uint(256)])?;
            DecodedTokenEvent::DelegateVotesChanged(DelegateVotesChangedEvent {
                delegate: context.topic_address(1)?,
                previous_votes: token_uint(&tokens[0], context)?,
                new_votes: token_uint(&tokens[1], context)?,
            })
        }
        TRANSFER => {
            let standard = token_standard.ok_or_else(|| {
                context.error("token standard is required to decode Transfer events".to_owned())
            })?;
            let expected = standard.transfer_topic_count();
            if context.log.topics.len() != expected {
                return Err(context.error(format!(
                    "expected {} Transfer topic count {expected}, observed {}",
                    standard.label(),
                    context.log.topics.len()
                )));
            }
            DecodedTokenEvent::Transfer(match standard {
                GovernanceTokenStandard::Erc20 => {
                    let tokens = context.decode_data(&[ParamType::Uint(256)])?;
                    TokenTransferEvent {
                        from: context.topic_address(1)?,
                        to: context.topic_address(2)?,
                        value: token_uint(&tokens[0], context)?,
                        standard,
                    }
                }
                GovernanceTokenStandard::Erc721 => TokenTransferEvent {
                    from: context.topic_address(1)?,
                    to: context.topic_address(2)?,
                    value: context.topic_uint(3)?,
                    standard,
                },
            })
        }
        _ => return Ok(context.unsupported(DaoLogSource::GovernorToken)),
    };

    Ok(DecodedDaoEvent::Token(event))
}

fn decode_timelock_event(
    context: &DecodeContext<'_>,
    topic0: &str,
) -> Result<DecodedDaoEvent, DaoEventDecodeError> {
    let event = match topic0 {
        CALL_SCHEDULED => {
            context.expect_topic_count(3)?;
            let tokens = context.decode_data(&[
                ParamType::Address,
                ParamType::Uint(256),
                ParamType::Bytes,
                ParamType::FixedBytes(32),
                ParamType::Uint(256),
            ])?;
            DecodedTimelockEvent::CallScheduled(CallScheduledEvent {
                id: context.topic_bytes32(1)?,
                index: context.topic_uint(2)?,
                target: token_address(&tokens[0], context)?,
                value: token_uint(&tokens[1], context)?,
                data: token_bytes(&tokens[2], context)?,
                predecessor: token_fixed_bytes(&tokens[3], context)?,
                delay: token_uint(&tokens[4], context)?,
            })
        }
        CALL_EXECUTED => {
            context.expect_topic_count(3)?;
            let tokens = context.decode_data(&[
                ParamType::Address,
                ParamType::Uint(256),
                ParamType::Bytes,
            ])?;
            DecodedTimelockEvent::CallExecuted(CallExecutedEvent {
                id: context.topic_bytes32(1)?,
                index: context.topic_uint(2)?,
                target: token_address(&tokens[0], context)?,
                value: token_uint(&tokens[1], context)?,
                data: token_bytes(&tokens[2], context)?,
            })
        }
        CALL_SALT => {
            context.expect_topic_count(2)?;
            let tokens = context.decode_data(&[ParamType::FixedBytes(32)])?;
            DecodedTimelockEvent::CallSalt(CallSaltEvent {
                id: context.topic_bytes32(1)?,
                salt: token_fixed_bytes(&tokens[0], context)?,
            })
        }
        CANCELLED => {
            context.expect_topic_count(2)?;
            DecodedTimelockEvent::Cancelled(TimelockOperationIdEvent {
                id: context.topic_bytes32(1)?,
            })
        }
        MIN_DELAY_CHANGE => {
            context.expect_topic_count(1)?;
            let tokens = context.decode_data(&[ParamType::Uint(256), ParamType::Uint(256)])?;
            DecodedTimelockEvent::MinDelayChange(ParameterChangeEvent {
                old_value: token_uint(&tokens[0], context)?,
                new_value: token_uint(&tokens[1], context)?,
            })
        }
        ROLE_GRANTED => {
            context.expect_topic_count(4)?;
            DecodedTimelockEvent::RoleGranted(RoleAccountEvent {
                role: context.topic_bytes32(1)?,
                account: context.topic_address(2)?,
                sender: context.topic_address(3)?,
            })
        }
        ROLE_REVOKED => {
            context.expect_topic_count(4)?;
            DecodedTimelockEvent::RoleRevoked(RoleAccountEvent {
                role: context.topic_bytes32(1)?,
                account: context.topic_address(2)?,
                sender: context.topic_address(3)?,
            })
        }
        ROLE_ADMIN_CHANGED => {
            context.expect_topic_count(4)?;
            DecodedTimelockEvent::RoleAdminChanged(RoleAdminChangedEvent {
                role: context.topic_bytes32(1)?,
                previous_admin_role: context.topic_bytes32(2)?,
                new_admin_role: context.topic_bytes32(3)?,
            })
        }
        _ => return Ok(context.unsupported(DaoLogSource::Timelock)),
    };

    Ok(DecodedDaoEvent::Timelock(event))
}

fn decode_proposal_id_event(
    context: &DecodeContext<'_>,
) -> Result<ProposalIdEvent, DaoEventDecodeError> {
    let tokens = context.decode_data(&[ParamType::Uint(256)])?;
    Ok(ProposalIdEvent {
        proposal_id: token_uint(&tokens[0], context)?,
    })
}

fn decode_parameter_change(
    context: &DecodeContext<'_>,
    event_name: &str,
) -> Result<DecodedGovernorEvent, DaoEventDecodeError> {
    context.expect_topic_count(1)?;
    let tokens = context.decode_data(&[ParamType::Uint(256), ParamType::Uint(256)])?;
    let event = ParameterChangeEvent {
        old_value: token_uint(&tokens[0], context)?,
        new_value: token_uint(&tokens[1], context)?,
    };

    Ok(match event_name {
        "VotingDelaySet" => DecodedGovernorEvent::VotingDelaySet(event),
        "VotingPeriodSet" => DecodedGovernorEvent::VotingPeriodSet(event),
        "ProposalThresholdSet" => DecodedGovernorEvent::ProposalThresholdSet(event),
        "QuorumNumeratorUpdated" => DecodedGovernorEvent::QuorumNumeratorUpdated(event),
        _ => unreachable!("unsupported parameter change event"),
    })
}

struct DecodeContext<'a> {
    dao_code: &'a str,
    log: &'a NormalizedEvmLog,
}

impl<'a> DecodeContext<'a> {
    fn new(dao_code: &'a str, log: &'a NormalizedEvmLog) -> Self {
        Self { dao_code, log }
    }

    fn topic0(&self) -> Result<&str, DaoEventDecodeError> {
        self.log
            .topics
            .first()
            .map(String::as_str)
            .ok_or_else(|| self.error("missing topic0".to_owned()))
    }

    fn expect_topic_count(&self, expected: usize) -> Result<(), DaoEventDecodeError> {
        let observed = self.log.topics.len();
        if observed != expected {
            return Err(self.error(format!(
                "expected topic count {expected}, observed {observed}"
            )));
        }
        Ok(())
    }

    fn decode_data(&self, params: &[ParamType]) -> Result<Vec<Token>, DaoEventDecodeError> {
        let data = decode_hex(&self.log.data).map_err(|error| self.error(error))?;
        decode(params, &data).map_err(|error| self.error(error.to_string()))
    }

    fn topic_address(&self, index: usize) -> Result<String, DaoEventDecodeError> {
        let bytes = self.topic_bytes(index)?;
        Ok(format!("0x{}", hex::encode(&bytes[12..32])))
    }

    fn topic_uint(&self, index: usize) -> Result<String, DaoEventDecodeError> {
        let bytes = self.topic_bytes(index)?;
        Ok(ethabi::Uint::from_big_endian(&bytes).to_string())
    }

    fn topic_bytes32(&self, index: usize) -> Result<String, DaoEventDecodeError> {
        let bytes = self.topic_bytes(index)?;
        Ok(format!("0x{}", hex::encode(bytes)))
    }

    fn topic_bytes(&self, index: usize) -> Result<[u8; 32], DaoEventDecodeError> {
        let topic = self
            .log
            .topics
            .get(index)
            .ok_or_else(|| self.error(format!("missing topic at index {index}")))?;
        let bytes = decode_hex(topic).map_err(|error| self.error(error))?;
        bytes.try_into().map_err(|bytes: Vec<u8>| {
            self.error(format!("topic has {} bytes, expected 32", bytes.len()))
        })
    }

    fn unsupported(&self, source: DaoLogSource) -> DecodedDaoEvent {
        DecodedDaoEvent::UnsupportedTopic(UnsupportedTopicEvent {
            dao_code: self.dao_code.to_owned(),
            source,
            block_number: self.log.block_number,
            transaction_hash: self.log.transaction_hash.clone(),
            address: self.log.address.clone(),
            topic0: self.log.topics.first().cloned().unwrap_or_default(),
        })
    }

    fn error(&self, reason: String) -> DaoEventDecodeError {
        DaoEventDecodeError {
            dao_code: self.dao_code.into(),
            block_number: self.log.block_number,
            transaction_hash: self.log.transaction_hash.clone().into_boxed_str(),
            address: self.log.address.clone().into_boxed_str(),
            topic0: self
                .log
                .topics
                .first()
                .cloned()
                .unwrap_or_default()
                .into_boxed_str(),
            reason: reason.into_boxed_str(),
        }
    }
}

fn decode_hex(value: &str) -> Result<Vec<u8>, String> {
    let value = value.strip_prefix("0x").unwrap_or(value);
    if value.is_empty() {
        return Ok(Vec::new());
    }
    hex::decode(value).map_err(|error| format!("invalid hex data: {error}"))
}

fn token_uint(token: &Token, context: &DecodeContext<'_>) -> Result<String, DaoEventDecodeError> {
    match token {
        Token::Uint(value) => Ok(value.to_string()),
        token => Err(context.error(format!("expected uint token, got {token:?}"))),
    }
}

fn token_u8(token: &Token, context: &DecodeContext<'_>) -> Result<u8, DaoEventDecodeError> {
    match token {
        Token::Uint(value) => value
            .as_u32()
            .try_into()
            .map_err(|_| context.error(format!("uint token {value} does not fit u8"))),
        token => Err(context.error(format!("expected uint8 token, got {token:?}"))),
    }
}

fn token_address(
    token: &Token,
    context: &DecodeContext<'_>,
) -> Result<String, DaoEventDecodeError> {
    match token {
        Token::Address(value) => Ok(format!("0x{}", hex::encode(value.as_bytes()))),
        token => Err(context.error(format!("expected address token, got {token:?}"))),
    }
}

fn token_string(token: &Token, context: &DecodeContext<'_>) -> Result<String, DaoEventDecodeError> {
    match token {
        Token::String(value) => Ok(value.clone()),
        token => Err(context.error(format!("expected string token, got {token:?}"))),
    }
}

fn token_bytes(token: &Token, context: &DecodeContext<'_>) -> Result<String, DaoEventDecodeError> {
    match token {
        Token::Bytes(value) => Ok(format!("0x{}", hex::encode(value))),
        token => Err(context.error(format!("expected bytes token, got {token:?}"))),
    }
}

fn token_fixed_bytes(
    token: &Token,
    context: &DecodeContext<'_>,
) -> Result<String, DaoEventDecodeError> {
    match token {
        Token::FixedBytes(value) if value.len() == 32 => Ok(format!("0x{}", hex::encode(value))),
        Token::FixedBytes(value) => {
            Err(context.error(format!("expected bytes32 token, got {} bytes", value.len())))
        }
        token => Err(context.error(format!("expected bytes32 token, got {token:?}"))),
    }
}

fn token_address_array(
    token: &Token,
    context: &DecodeContext<'_>,
) -> Result<Vec<String>, DaoEventDecodeError> {
    match token {
        Token::Array(values) => values
            .iter()
            .map(|value| token_address(value, context))
            .collect(),
        token => Err(context.error(format!("expected address array token, got {token:?}"))),
    }
}

fn token_uint_array(
    token: &Token,
    context: &DecodeContext<'_>,
) -> Result<Vec<String>, DaoEventDecodeError> {
    match token {
        Token::Array(values) => values
            .iter()
            .map(|value| token_uint(value, context))
            .collect(),
        token => Err(context.error(format!("expected uint array token, got {token:?}"))),
    }
}

fn token_string_array(
    token: &Token,
    context: &DecodeContext<'_>,
) -> Result<Vec<String>, DaoEventDecodeError> {
    match token {
        Token::Array(values) => values
            .iter()
            .map(|value| token_string(value, context))
            .collect(),
        token => Err(context.error(format!("expected string array token, got {token:?}"))),
    }
}

fn token_bytes_array(
    token: &Token,
    context: &DecodeContext<'_>,
) -> Result<Vec<String>, DaoEventDecodeError> {
    match token {
        Token::Array(values) => values
            .iter()
            .map(|value| token_bytes(value, context))
            .collect(),
        token => Err(context.error(format!("expected bytes array token, got {token:?}"))),
    }
}

const PROPOSAL_CREATED: &str = "0x7d84a6263ae0d98d3329bd7b46bb4e8d6f98cd35a7adb45c274c8b7fd5ebd5e0";
const PROPOSAL_QUEUED: &str = "0x9a2e42fd6722813d69113e7d0079d3d940171428df7373df9c7f7617cfda2892";
const PROPOSAL_EXTENDED: &str =
    "0x541f725fb9f7c98a30cc9c0ff32fbb14358cd7159c847a3aa20a2bdc442ba511";
const PROPOSAL_EXECUTED: &str =
    "0x712ae1383f79ac853f8d882153778e0260ef8f03b504e2866e0593e04d2b291f";
const PROPOSAL_CANCELED: &str =
    "0x789cf55be980739dad1d0699b93b58e806b51c9d96619bfa8fe0a28abaa7b30c";
const VOTING_DELAY_SET: &str = "0xc565b045403dc03c2eea82b81a0465edad9e2e7fc4d97e11421c209da93d7a93";
const VOTING_PERIOD_SET: &str =
    "0x7e3f7f0708a84de9203036abaa450dccc85ad5ff52f78c170f3edb55cf5e8828";
const PROPOSAL_THRESHOLD_SET: &str =
    "0xccb45da8d5717e6c4544694297c4ba5cf151d455c9bb0ed4fc7a38411bc05461";
const QUORUM_NUMERATOR_UPDATED: &str =
    "0x0553476bf02ef2726e8ce5ced78d63e26e602e4a2257b1f559418e24b4633997";
const LATE_QUORUM_VOTE_EXTENSION_SET: &str =
    "0x7ca4ac117ed3cdce75c1161d8207c440389b1a15d69d096831664657c07dafc2";
const TIMELOCK_CHANGE: &str = "0x08f74ea46ef7894f65eabfb5e6e695de773a000b47c529ab559178069b226401";
const VOTE_CAST: &str = "0xb8e138887d0aa13bab447e82de9d5c1777041ecd21ca36ba824ff1e6c07ddda4";
const VOTE_CAST_WITH_PARAMS: &str =
    "0xe2babfbac5889a709b63bb7f598b324e08bc5a4fb9ec647fb3cbc9ec07eb8712";

const TRANSFER: &str = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const DELEGATE_CHANGED: &str = "0x3134e8a2e6d97e929a7e54011ea5485d7d196dd5f0ba4d4ef95803e8e3fc257f";
const DELEGATE_VOTES_CHANGED: &str =
    "0xdec2bacdd2f05b59de34da9b523dff8be42e5e38e818c82fdb0bae774387a724";

const CALL_SCHEDULED: &str = "0x4cf4410cc57040e44862ef0f45f3dd5a5e02db8eb8add648d4b0e236f1d07dca";
const CALL_EXECUTED: &str = "0xc2617efa69bab66782fa219543714338489c4e9e178271560a91b82c3f612b58";
const CALL_SALT: &str = "0x20fda5fd27a1ea7bf5b9567f143ac5470bb059374a27e8f67cb44f946f6d0387";
const CANCELLED: &str = "0xbaa1eb22f2a492ba1a5fea61b8df4d27c6c8b5f3971e63bb58fa14ff72eedb70";
const MIN_DELAY_CHANGE: &str = "0x11c24f4ead16507c69ac467fbd5e4eed5fb5c699626d2cc6d66421df253886d5";
const ROLE_GRANTED: &str = "0x2f8788117e7eff1d82e926ec794901d17c78024a50270940304540a733656f0d";
const ROLE_REVOKED: &str = "0xf6391f5c32d9c69d2a47ea670b442974b53935d1edc7fd64eb21e047a839171b";
const ROLE_ADMIN_CHANGED: &str =
    "0xbd79b86ffe0ab8e8776151514217cd7cacd52c909f66475c3af44e129f0b00ff";
