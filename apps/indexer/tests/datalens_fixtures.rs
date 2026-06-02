use degov_datalens_indexer::{
    DecodedDaoEvent, DecodedGovernorEvent, DecodedTimelockEvent, DecodedTokenEvent,
    GovernanceTokenStandard, load_datalens_fixture, normalize_evm_log_rows,
};

#[test]
fn test_load_datalens_fixture_normalizes_and_decodes_representative_raw_logs() {
    let fixture = load_datalens_fixture("known-dao-ranges").expect("fixture loads");

    assert_eq!(fixture.name, "known-dao-ranges");
    assert_eq!(fixture.dao_ranges.len(), 4);
    assert_eq!(fixture.expected_checkpoint.next_block, 10_010);
    assert_eq!(fixture.expected_duplicate_replay.unique_log_count, 16);
    assert_eq!(fixture.expected_duplicate_replay.replayed_log_count, 18);
    assert_eq!(
        fixture
            .expected_decoded_events()
            .expect("expected events")
            .len(),
        16
    );

    let mut decoded_names = Vec::new();
    for page in &fixture.pages {
        let logs =
            normalize_evm_log_rows(page.chain_id, page.rows.clone()).expect("raw rows normalize");
        for log in logs {
            let decoded = fixture
                .decode_log(page, &log)
                .expect("fixture log decodes from raw row");
            decoded_names.push(event_name(&decoded).to_owned());
        }
    }

    assert_eq!(
        decoded_names,
        fixture
            .expected_decoded_events()
            .expect("expected events")
            .into_iter()
            .map(|event| event.event)
            .collect::<Vec<_>>()
    );

    let replay_rows = fixture
        .duplicate_replay_rows()
        .expect("duplicate replay rows");
    let replay_logs = normalize_evm_log_rows(1, replay_rows).expect("duplicate replay normalizes");

    assert_eq!(
        replay_logs.len(),
        fixture.expected_duplicate_replay.unique_log_count
    );
    for id in &fixture.expected_duplicate_replay.duplicate_log_ids {
        assert!(
            replay_logs.iter().any(|log| &log.id == id),
            "expected duplicate id {id} to survive dedupe"
        );
    }
}

#[test]
fn test_known_dao_range_fixture_expected_snapshot_documents_output_tables() {
    let fixture = load_datalens_fixture("known-dao-ranges").expect("fixture loads");
    let expected = fixture.expected_decoded_events().expect("expected events");

    assert_eq!(
        expected
            .iter()
            .map(|event| event.event.as_str())
            .collect::<Vec<_>>(),
        vec![
            "ProposalCreated",
            "VoteCast",
            "ProposalQueued",
            "ProposalExtended",
            "ProposalExecuted",
            "DelegateChanged",
            "DelegateVotesChanged",
            "Transfer(ERC20)",
            "Transfer(ERC721)",
            "CallScheduled",
            "CallSalt",
            "RoleGranted",
            "CallExecuted",
            "MinDelayChange",
            "Cancelled",
            "RoleRevoked",
        ]
    );

    assert!(
        expected
            .iter()
            .any(|event| event.table == "proposal_created")
    );
    assert!(expected.iter().any(|event| event.table == "vote_cast"));
    assert!(
        expected
            .iter()
            .any(|event| event.table == "token_transfers")
    );
    assert!(
        expected
            .iter()
            .any(|event| event.table == "timelock_operations")
    );
}

fn event_name(event: &DecodedDaoEvent) -> &'static str {
    match event {
        DecodedDaoEvent::Governor(event) => match event {
            DecodedGovernorEvent::ProposalCreated(_) => "ProposalCreated",
            DecodedGovernorEvent::ProposalQueued(_) => "ProposalQueued",
            DecodedGovernorEvent::ProposalExtended(_) => "ProposalExtended",
            DecodedGovernorEvent::ProposalExecuted(_) => "ProposalExecuted",
            DecodedGovernorEvent::VoteCast(_) => "VoteCast",
            event => event.event_name(),
        },
        DecodedDaoEvent::Token(DecodedTokenEvent::DelegateChanged(_)) => "DelegateChanged",
        DecodedDaoEvent::Token(DecodedTokenEvent::DelegateVotesChanged(_)) => {
            "DelegateVotesChanged"
        }
        DecodedDaoEvent::Token(DecodedTokenEvent::Transfer(event)) => match event.standard {
            GovernanceTokenStandard::Erc20 => "Transfer(ERC20)",
            GovernanceTokenStandard::Erc721 => "Transfer(ERC721)",
        },
        DecodedDaoEvent::Timelock(event) => match event {
            DecodedTimelockEvent::CallScheduled(_) => "CallScheduled",
            DecodedTimelockEvent::CallSalt(_) => "CallSalt",
            DecodedTimelockEvent::RoleGranted(_) => "RoleGranted",
            DecodedTimelockEvent::CallExecuted(_) => "CallExecuted",
            DecodedTimelockEvent::MinDelayChange(_) => "MinDelayChange",
            DecodedTimelockEvent::Cancelled(_) => "Cancelled",
            DecodedTimelockEvent::RoleRevoked(_) => "RoleRevoked",
            event => event.event_name(),
        },
        DecodedDaoEvent::UnsupportedTopic(_) => "UnsupportedTopic",
    }
}
