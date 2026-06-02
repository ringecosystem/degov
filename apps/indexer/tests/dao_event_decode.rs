use degov_datalens_indexer::{
    DaoLogSource, DecodedDaoEvent, GovernanceTokenStandard, NormalizedEvmLog, decode_dao_log,
};
use ethabi::{Token, encode};
use serde_json::json;

#[test]
fn test_decode_governor_event_family_decodes_every_configured_topic() {
    let cases = vec![
        (
            proposal_created_log(),
            "ProposalCreated",
            DecodedDaoEvent::as_governor,
        ),
        (
            log(
                11,
                GOVERNOR,
                vec![PROPOSAL_QUEUED],
                encode(&[uint(42), uint(123)]),
            ),
            "ProposalQueued",
            DecodedDaoEvent::as_governor,
        ),
        (
            log(
                12,
                GOVERNOR,
                vec![PROPOSAL_EXTENDED, topic_uint(42).as_str()],
                encode(&[uint(456)]),
            ),
            "ProposalExtended",
            DecodedDaoEvent::as_governor,
        ),
        (
            log(13, GOVERNOR, vec![PROPOSAL_EXECUTED], encode(&[uint(42)])),
            "ProposalExecuted",
            DecodedDaoEvent::as_governor,
        ),
        (
            log(14, GOVERNOR, vec![PROPOSAL_CANCELED], encode(&[uint(42)])),
            "ProposalCanceled",
            DecodedDaoEvent::as_governor,
        ),
        (
            log(
                15,
                GOVERNOR,
                vec![VOTING_DELAY_SET],
                encode(&[uint(1), uint(2)]),
            ),
            "VotingDelaySet",
            DecodedDaoEvent::as_governor,
        ),
        (
            log(
                16,
                GOVERNOR,
                vec![VOTING_PERIOD_SET],
                encode(&[uint(3), uint(4)]),
            ),
            "VotingPeriodSet",
            DecodedDaoEvent::as_governor,
        ),
        (
            log(
                17,
                GOVERNOR,
                vec![PROPOSAL_THRESHOLD_SET],
                encode(&[uint(5), uint(6)]),
            ),
            "ProposalThresholdSet",
            DecodedDaoEvent::as_governor,
        ),
        (
            log(
                18,
                GOVERNOR,
                vec![QUORUM_NUMERATOR_UPDATED],
                encode(&[uint(7), uint(8)]),
            ),
            "QuorumNumeratorUpdated",
            DecodedDaoEvent::as_governor,
        ),
        (
            log(
                19,
                GOVERNOR,
                vec![LATE_QUORUM_VOTE_EXTENSION_SET],
                encode(&[uint(9), uint(10)]),
            ),
            "LateQuorumVoteExtensionSet",
            DecodedDaoEvent::as_governor,
        ),
        (
            log(
                20,
                GOVERNOR,
                vec![TIMELOCK_CHANGE],
                encode(&[
                    address("0000000000000000000000000000000000000001"),
                    address(TIMELOCK),
                ]),
            ),
            "TimelockChange",
            DecodedDaoEvent::as_governor,
        ),
        (
            log(
                21,
                GOVERNOR,
                vec![
                    VOTE_CAST,
                    topic_address("0000000000000000000000000000000000000a11").as_str(),
                ],
                encode(&[
                    uint(42),
                    Token::Uint(1.into()),
                    uint(99),
                    Token::String("aye".to_owned()),
                ]),
            ),
            "VoteCast",
            DecodedDaoEvent::as_governor,
        ),
        (
            log(
                22,
                GOVERNOR,
                vec![
                    VOTE_CAST_WITH_PARAMS,
                    topic_address("0000000000000000000000000000000000000a12").as_str(),
                ],
                encode(&[
                    uint(42),
                    Token::Uint(2.into()),
                    uint(100),
                    Token::String("reason".to_owned()),
                    Token::Bytes(vec![0xde, 0xad]),
                ]),
            ),
            "VoteCastWithParams",
            DecodedDaoEvent::as_governor,
        ),
    ];

    for (log, expected_name, accessor) in cases {
        let event = decode_dao_log("unit-dao", DaoLogSource::Governor, None, &log)
            .expect("decode governor event");
        let governor = accessor(&event).expect("governor event");

        assert_eq!(governor.event_name(), expected_name);
    }
}

#[test]
fn test_decode_token_event_family_decodes_delegation_and_erc20_transfer() {
    let delegate_changed = decode_dao_log(
        "unit-dao",
        DaoLogSource::GovernorToken,
        Some(GovernanceTokenStandard::Erc20),
        &log(
            30,
            TOKEN,
            vec![
                DELEGATE_CHANGED,
                topic_address("0000000000000000000000000000000000000b01").as_str(),
                topic_address("0000000000000000000000000000000000000b02").as_str(),
                topic_address("0000000000000000000000000000000000000b03").as_str(),
            ],
            vec![],
        ),
    )
    .expect("decode DelegateChanged");
    assert_eq!(
        delegate_changed
            .as_token()
            .expect("token event")
            .event_name(),
        "DelegateChanged"
    );

    let votes_changed = decode_dao_log(
        "unit-dao",
        DaoLogSource::GovernorToken,
        Some(GovernanceTokenStandard::Erc20),
        &log(
            31,
            TOKEN,
            vec![
                DELEGATE_VOTES_CHANGED,
                topic_address("0000000000000000000000000000000000000b04").as_str(),
            ],
            encode(&[uint(11), uint(12)]),
        ),
    )
    .expect("decode DelegateVotesChanged");
    assert_eq!(
        votes_changed.as_token().expect("token event").event_name(),
        "DelegateVotesChanged"
    );

    let transfer = decode_dao_log(
        "unit-dao",
        DaoLogSource::GovernorToken,
        Some(GovernanceTokenStandard::Erc20),
        &erc20_transfer_log(32),
    )
    .expect("decode ERC20 Transfer");

    match transfer.as_token().expect("token event") {
        degov_datalens_indexer::DecodedTokenEvent::Transfer(event) => {
            assert_eq!(event.standard, GovernanceTokenStandard::Erc20);
            assert_eq!(event.value, "500");
        }
        event => panic!("expected Transfer, got {event:?}"),
    }
}

#[test]
fn test_decode_erc721_transfer_reads_token_id_from_topic() {
    let decoded = decode_dao_log(
        "unit-dao",
        DaoLogSource::GovernorToken,
        Some(GovernanceTokenStandard::Erc721),
        &erc721_transfer_log(40),
    )
    .expect("decode ERC721 Transfer");

    match decoded.as_token().expect("token event") {
        degov_datalens_indexer::DecodedTokenEvent::Transfer(event) => {
            assert_eq!(event.standard, GovernanceTokenStandard::Erc721);
            assert_eq!(event.value, "777");
        }
        event => panic!("expected Transfer, got {event:?}"),
    }
}

#[test]
fn test_decode_token_transfer_rejects_bad_standard_topic_count_mismatch() {
    let error = decode_dao_log(
        "unit-dao",
        DaoLogSource::GovernorToken,
        Some(GovernanceTokenStandard::Erc20),
        &erc721_transfer_log(41),
    )
    .expect_err("ERC20 decoder must reject ERC721 transfer shape");

    let message = error.to_string();
    assert!(message.contains("unit-dao"));
    assert!(message.contains("block 41"));
    assert!(message.contains("tx 0xtx41"));
    assert!(message.contains(TOKEN));
    assert!(message.contains(TRANSFER));
    assert!(message.contains("expected ERC20 Transfer topic count 3, observed 4"));
}

#[test]
fn test_decode_timelock_event_family_decodes_every_configured_topic() {
    let cases = vec![
        (
            log(
                50,
                TIMELOCK,
                vec![
                    CALL_SCHEDULED,
                    topic_bytes32(1).as_str(),
                    topic_uint(0).as_str(),
                ],
                encode(&[
                    address("0000000000000000000000000000000000000c01"),
                    uint(99),
                    Token::Bytes(vec![0xaa]),
                    bytes32(2),
                    uint(60),
                ]),
            ),
            "CallScheduled",
        ),
        (
            log(
                51,
                TIMELOCK,
                vec![
                    CALL_EXECUTED,
                    topic_bytes32(1).as_str(),
                    topic_uint(0).as_str(),
                ],
                encode(&[
                    address("0000000000000000000000000000000000000c01"),
                    uint(99),
                    Token::Bytes(vec![0xaa]),
                ]),
            ),
            "CallExecuted",
        ),
        (
            log(
                52,
                TIMELOCK,
                vec![CALL_SALT, topic_bytes32(1).as_str()],
                encode(&[bytes32(3)]),
            ),
            "CallSalt",
        ),
        (
            log(
                53,
                TIMELOCK,
                vec![CANCELLED, topic_bytes32(1).as_str()],
                vec![],
            ),
            "Cancelled",
        ),
        (
            log(
                54,
                TIMELOCK,
                vec![MIN_DELAY_CHANGE],
                encode(&[uint(60), uint(120)]),
            ),
            "MinDelayChange",
        ),
        (
            log(
                55,
                TIMELOCK,
                vec![
                    ROLE_GRANTED,
                    topic_bytes32(4).as_str(),
                    topic_address("0000000000000000000000000000000000000d01").as_str(),
                    topic_address("0000000000000000000000000000000000000d02").as_str(),
                ],
                vec![],
            ),
            "RoleGranted",
        ),
        (
            log(
                56,
                TIMELOCK,
                vec![
                    ROLE_REVOKED,
                    topic_bytes32(4).as_str(),
                    topic_address("0000000000000000000000000000000000000d01").as_str(),
                    topic_address("0000000000000000000000000000000000000d02").as_str(),
                ],
                vec![],
            ),
            "RoleRevoked",
        ),
        (
            log(
                57,
                TIMELOCK,
                vec![
                    ROLE_ADMIN_CHANGED,
                    topic_bytes32(4).as_str(),
                    topic_bytes32(5).as_str(),
                    topic_bytes32(6).as_str(),
                ],
                vec![],
            ),
            "RoleAdminChanged",
        ),
    ];

    for (log, expected_name) in cases {
        let decoded = decode_dao_log("unit-dao", DaoLogSource::Timelock, None, &log)
            .expect("decode timelock event");
        assert_eq!(
            decoded.as_timelock().expect("timelock event").event_name(),
            expected_name
        );
    }
}

#[test]
fn test_decode_marks_unsupported_topic_explicitly() {
    let decoded = decode_dao_log(
        "unit-dao",
        DaoLogSource::Governor,
        None,
        &log(70, GOVERNOR, vec![UNKNOWN_TOPIC], vec![]),
    )
    .expect("unsupported topic result");

    match decoded {
        DecodedDaoEvent::UnsupportedTopic(event) => {
            assert_eq!(event.dao_code, "unit-dao");
            assert_eq!(event.source, DaoLogSource::Governor);
            assert_eq!(event.topic0, UNKNOWN_TOPIC);
        }
        event => panic!("expected unsupported topic, got {event:?}"),
    }
}

fn proposal_created_log() -> NormalizedEvmLog {
    log(
        10,
        GOVERNOR,
        vec![PROPOSAL_CREATED],
        encode(&[
            uint(42),
            address("0000000000000000000000000000000000000a01"),
            Token::Array(vec![address("0000000000000000000000000000000000000a02")]),
            Token::Array(vec![uint(1)]),
            Token::Array(vec![Token::String("upgrade()".to_owned())]),
            Token::Array(vec![Token::Bytes(vec![0x12, 0x34])]),
            uint(100),
            uint(200),
            Token::String("Proposal title".to_owned()),
        ]),
    )
}

fn erc20_transfer_log(block_number: u64) -> NormalizedEvmLog {
    log(
        block_number,
        TOKEN,
        vec![
            TRANSFER,
            topic_address("0000000000000000000000000000000000000e01").as_str(),
            topic_address("0000000000000000000000000000000000000e02").as_str(),
        ],
        encode(&[uint(500)]),
    )
}

fn erc721_transfer_log(block_number: u64) -> NormalizedEvmLog {
    log(
        block_number,
        TOKEN,
        vec![
            TRANSFER,
            topic_address("0000000000000000000000000000000000000e01").as_str(),
            topic_address("0000000000000000000000000000000000000e02").as_str(),
            topic_uint(777).as_str(),
        ],
        vec![],
    )
}

fn log(block_number: u64, address: &str, topics: Vec<&str>, data: Vec<u8>) -> NormalizedEvmLog {
    NormalizedEvmLog {
        id: format!("evm:46:{block_number}:0xtx{block_number}:0:0"),
        chain_id: 46,
        block_number,
        block_hash: format!("0xblock{block_number}"),
        block_timestamp_ms: Some(block_number * 1_000),
        transaction_hash: format!("0xtx{block_number}"),
        transaction_index: 0,
        log_index: 0,
        address: address.to_owned(),
        topics: topics.into_iter().map(str::to_owned).collect(),
        data: format!("0x{}", hex::encode(data)),
        removed: false,
        raw_payload: json!({}),
    }
}

fn uint(value: u64) -> Token {
    Token::Uint(value.into())
}

fn address(value: &str) -> Token {
    Token::Address(value.parse().expect("address"))
}

fn bytes32(value: u8) -> Token {
    Token::FixedBytes(vec![value; 32])
}

fn topic_address(value: &str) -> String {
    format!("0x{value:0>64}")
}

fn topic_uint(value: u64) -> String {
    format!("0x{value:064x}")
}

fn topic_bytes32(value: u8) -> String {
    format!("0x{}", hex::encode(vec![value; 32]))
}

const GOVERNOR: &str = "0x1111111111111111111111111111111111111111";
const TOKEN: &str = "0x2222222222222222222222222222222222222222";
const TIMELOCK: &str = "0x3333333333333333333333333333333333333333";
const UNKNOWN_TOPIC: &str = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

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
