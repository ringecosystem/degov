use degov_datalens_indexer::{
    BatchReadPlanConfig, ChainContracts, ChainReadMethod, DecodedTokenEvent, DelegateChangedEvent,
    DelegateVotesChangedEvent, GovernanceTokenStandard, InMemoryTokenProjectionRepository,
    NormalizedEvmLog, PowerActivityReason, ReadRequirement, TokenProjectionContext,
    TokenProjectionError, TokenProjectionEvent, TokenProjectionRepository, TokenTransferEvent,
    project_token_events,
};
use serde_json::json;

#[test]
fn test_project_token_events_preserves_history_mappings_relations_and_reconcile_plan() {
    let batch = project_token_events(
        &context(GovernanceTokenStandard::Erc20),
        vec![
            TokenProjectionEvent {
                log: log(12, 0, 1),
                event: transfer(
                    account("BBBB"),
                    account("DDDD"),
                    "25",
                    GovernanceTokenStandard::Erc20,
                ),
            },
            TokenProjectionEvent {
                log: log(10, 0, 1),
                event: delegate_changed(account("BBBB"), zero(), account("CCCC")),
            },
            TokenProjectionEvent {
                log: log(11, 0, 1),
                event: delegate_votes_changed(account("CCCC"), "0", "100"),
            },
            TokenProjectionEvent {
                log: log(13, 0, 1),
                event: transfer(
                    account("DDDD"),
                    account("BBBB"),
                    "40",
                    GovernanceTokenStandard::Erc20,
                ),
            },
        ],
    )
    .expect("projection succeeds");

    assert_eq!(
        batch.event_order,
        vec![
            "evm:1:10:0xtx10:0:1".to_owned(),
            "evm:1:11:0xtx11:0:1".to_owned(),
            "evm:1:12:0xtx12:0:1".to_owned(),
            "evm:1:13:0xtx13:0:1".to_owned(),
        ]
    );
    assert_eq!(batch.delegate_changed.len(), 1);
    assert_eq!(batch.delegate_votes_changed.len(), 1);
    assert_eq!(batch.token_transfers.len(), 2);
    assert_eq!(batch.delegate_rollings.len(), 1);
    assert_eq!(batch.delegate_changed[0].delegator, account("bbbb"));
    assert_eq!(batch.delegate_votes_changed[0].delegate, account("cccc"));
    assert_eq!(batch.token_transfers[0].from, account("bbbb"));
    assert_eq!(batch.token_transfers[0].to, account("dddd"));

    let mut repository = InMemoryTokenProjectionRepository::default();
    repository.apply(&batch).expect("write succeeds");
    repository.apply(&batch).expect("replay write succeeds");

    let mapping = repository
        .delegate_mappings()
        .get(&account("bbbb"))
        .expect("current mapping");
    assert_eq!(mapping.to, account("cccc"));
    assert_eq!(mapping.power, "40");

    let relation = repository
        .delegates()
        .get(&format!("{}_{}", account("bbbb"), account("cccc")))
        .expect("current delegate relation");
    assert!(relation.is_current);
    assert_eq!(relation.power, "40");

    let delegate = repository
        .contributors()
        .get(&account("cccc"))
        .expect("delegate contributor");
    assert_eq!(delegate.delegates_count_all, 1);
    assert_eq!(delegate.delegates_count_effective, 1);
    assert_eq!(delegate.power, "0");
    assert_eq!(repository.data_metric().member_count, 1);
    assert_eq!(repository.data_metric().power_sum, "0");

    assert_eq!(batch.reconcile_plan.metrics.candidate_count, 7);
    assert_eq!(batch.reconcile_plan.metrics.deduped_count, 4);
    assert_eq!(batch.reconcile_plan.chain_read_plan.reads.len(), 3);
    let accounts = batch
        .reconcile_plan
        .candidates
        .iter()
        .map(|candidate| candidate.account.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        accounts,
        vec![account("bbbb"), account("cccc"), account("dddd")]
    );
    let bbbb = batch
        .reconcile_plan
        .candidates
        .iter()
        .find(|candidate| candidate.account == account("bbbb"))
        .expect("bbbb reconcile candidate");
    assert_eq!(
        bbbb.reasons,
        [
            PowerActivityReason::DelegateChanged,
            PowerActivityReason::Transfer,
        ]
        .into()
    );
    for read in &batch.reconcile_plan.chain_read_plan.reads {
        assert_eq!(read.requirement, ReadRequirement::Required);
        assert_eq!(read.key.method, ChainReadMethod::GetVotes);
    }
}

#[test]
fn test_project_token_events_records_noop_delegate_change_without_mutating_current_mapping() {
    let mut repository = InMemoryTokenProjectionRepository::default();
    let first = project_token_events(
        &context(GovernanceTokenStandard::Erc20),
        vec![TokenProjectionEvent {
            log: log(10, 0, 1),
            event: delegate_changed(account("BBBB"), zero(), account("CCCC")),
        }],
    )
    .expect("projection succeeds");
    repository.apply(&first).expect("first write succeeds");

    let noop = project_token_events(
        &context(GovernanceTokenStandard::Erc20),
        vec![TokenProjectionEvent {
            log: log(11, 0, 1),
            event: delegate_changed(account("BBBB"), account("CCCC"), account("CCCC")),
        }],
    )
    .expect("projection succeeds");
    repository.apply(&noop).expect("noop write succeeds");

    assert_eq!(repository.delegate_changed().len(), 2);
    assert_eq!(repository.delegate_mappings().len(), 1);
    assert_eq!(
        repository
            .contributors()
            .get(&account("cccc"))
            .expect("delegate contributor")
            .delegates_count_all,
        1
    );
}

#[test]
fn test_project_token_events_undelegation_removes_mapping_without_zero_contributor() {
    let mut repository = InMemoryTokenProjectionRepository::default();
    let first = project_token_events(
        &context(GovernanceTokenStandard::Erc20),
        vec![TokenProjectionEvent {
            log: log(10, 0, 1),
            event: delegate_changed(account("BBBB"), zero(), account("CCCC")),
        }],
    )
    .expect("projection succeeds");
    let undelegate = project_token_events(
        &context(GovernanceTokenStandard::Erc20),
        vec![TokenProjectionEvent {
            log: log(11, 0, 1),
            event: delegate_changed(account("BBBB"), account("CCCC"), zero()),
        }],
    )
    .expect("projection succeeds");

    repository.apply(&first).expect("first write succeeds");
    repository
        .apply(&undelegate)
        .expect("undelegate write succeeds");

    assert!(repository.delegate_mappings().is_empty());
    assert!(!repository.contributors().contains_key(&zero()));
    assert_eq!(
        repository
            .contributors()
            .get(&account("cccc"))
            .expect("previous delegate contributor")
            .delegates_count_all,
        0
    );
}

#[test]
fn test_project_token_events_redelegation_closes_old_relation_and_opens_new_relation() {
    let mut repository = InMemoryTokenProjectionRepository::default();
    let initial = project_token_events(
        &context(GovernanceTokenStandard::Erc20),
        vec![
            TokenProjectionEvent {
                log: log(10, 0, 1),
                event: delegate_changed(account("AAAA"), zero(), account("BBBB")),
            },
            TokenProjectionEvent {
                log: log(10, 0, 2),
                event: delegate_votes_changed(account("BBBB"), "0", "100"),
            },
        ],
    )
    .expect("projection succeeds");
    let redelegate = project_token_events(
        &context(GovernanceTokenStandard::Erc20),
        vec![
            TokenProjectionEvent {
                log: log(11, 0, 1),
                event: delegate_changed(account("AAAA"), account("BBBB"), account("CCCC")),
            },
            TokenProjectionEvent {
                log: log(11, 0, 2),
                event: delegate_votes_changed(account("BBBB"), "100", "0"),
            },
            TokenProjectionEvent {
                log: log(11, 0, 3),
                event: delegate_votes_changed(account("CCCC"), "0", "100"),
            },
        ],
    )
    .expect("projection succeeds");

    repository.apply(&initial).expect("initial write succeeds");
    repository
        .apply(&redelegate)
        .expect("redelegate write succeeds");

    let mapping = repository
        .delegate_mappings()
        .get(&account("aaaa"))
        .expect("current mapping");
    assert_eq!(mapping.to, account("cccc"));
    assert_eq!(mapping.power, "100");
    assert!(!repository.delegates().contains_key(&format!(
        "{}_{}",
        account("bbbb"),
        account("aaaa")
    )));
    if let Some(old_relation) =
        repository
            .delegates()
            .get(&format!("{}_{}", account("aaaa"), account("bbbb")))
    {
        assert!(!old_relation.is_current);
    }
    let new_relation = repository
        .delegates()
        .get(&format!("{}_{}", account("aaaa"), account("cccc")))
        .expect("new current relation");
    assert!(new_relation.is_current);
    assert_eq!(new_relation.power, "100");
    assert_eq!(
        repository
            .contributors()
            .get(&account("bbbb"))
            .expect("old delegate contributor")
            .delegates_count_effective,
        0
    );
    assert_eq!(
        repository
            .contributors()
            .get(&account("cccc"))
            .expect("new delegate contributor")
            .delegates_count_effective,
        1
    );
}

#[test]
fn test_project_token_events_undelegation_old_side_delta_removes_relation_without_reverse() {
    let mut repository = InMemoryTokenProjectionRepository::default();
    let initial = project_token_events(
        &context(GovernanceTokenStandard::Erc20),
        vec![
            TokenProjectionEvent {
                log: log(10, 0, 1),
                event: delegate_changed(account("AAAA"), zero(), account("BBBB")),
            },
            TokenProjectionEvent {
                log: log(10, 0, 2),
                event: delegate_votes_changed(account("BBBB"), "0", "100"),
            },
        ],
    )
    .expect("projection succeeds");
    let undelegate = project_token_events(
        &context(GovernanceTokenStandard::Erc20),
        vec![
            TokenProjectionEvent {
                log: log(11, 0, 1),
                event: delegate_changed(account("AAAA"), account("BBBB"), zero()),
            },
            TokenProjectionEvent {
                log: log(11, 0, 2),
                event: delegate_votes_changed(account("BBBB"), "100", "0"),
            },
        ],
    )
    .expect("projection succeeds");

    repository.apply(&initial).expect("initial write succeeds");
    repository
        .apply(&undelegate)
        .expect("undelegate write succeeds");

    assert!(repository.delegate_mappings().is_empty());
    assert!(!repository.delegates().contains_key(&format!(
        "{}_{}",
        account("bbbb"),
        account("aaaa")
    )));
    if let Some(old_relation) =
        repository
            .delegates()
            .get(&format!("{}_{}", account("aaaa"), account("bbbb")))
    {
        assert!(!old_relation.is_current);
    }
    assert_eq!(
        repository
            .contributors()
            .get(&account("bbbb"))
            .expect("old delegate contributor")
            .delegates_count_effective,
        0
    );
}

#[test]
fn test_project_token_events_delegate_change_without_voting_units_does_not_emit_delegate_edge() {
    let batch = project_token_events(
        &context(GovernanceTokenStandard::Erc20),
        vec![TokenProjectionEvent {
            log: log(10, 0, 1),
            event: delegate_changed(account("AAAA"), zero(), account("BBBB")),
        }],
    )
    .expect("projection succeeds");
    let mut repository = InMemoryTokenProjectionRepository::default();

    repository.apply(&batch).expect("write succeeds");

    let mapping = repository
        .delegate_mappings()
        .get(&account("aaaa"))
        .expect("mapping is preserved");
    assert_eq!(mapping.to, account("bbbb"));
    assert_eq!(mapping.power, "0");
    assert!(repository.delegates().is_empty());
    assert_eq!(
        repository
            .contributors()
            .get(&account("bbbb"))
            .expect("delegate contributor")
            .delegates_count_all,
        1
    );
    assert_eq!(
        repository
            .contributors()
            .get(&account("bbbb"))
            .expect("delegate contributor")
            .delegates_count_effective,
        0
    );
}

#[test]
fn test_project_token_events_applies_same_transaction_delegate_vote_delta_to_relation() {
    let batch = project_token_events(
        &context(GovernanceTokenStandard::Erc20),
        vec![
            TokenProjectionEvent {
                log: log(10, 0, 1),
                event: delegate_changed(account("BBBB"), zero(), account("CCCC")),
            },
            TokenProjectionEvent {
                log: log(10, 0, 2),
                event: delegate_votes_changed(account("CCCC"), "0", "100"),
            },
        ],
    )
    .expect("projection succeeds");
    let mut repository = InMemoryTokenProjectionRepository::default();

    repository.apply(&batch).expect("write succeeds");

    let mapping = repository
        .delegate_mappings()
        .get(&account("bbbb"))
        .expect("current mapping");
    assert_eq!(mapping.power, "100");
    let relation = repository
        .delegates()
        .get(&format!("{}_{}", account("bbbb"), account("cccc")))
        .expect("current delegate relation");
    assert_eq!(relation.power, "100");
    assert_eq!(
        repository
            .contributors()
            .get(&account("cccc"))
            .expect("delegate contributor")
            .delegates_count_effective,
        1
    );
    assert_eq!(repository.data_metric().power_sum, "0");
}

#[test]
fn test_project_token_events_uses_erc721_unit_delta_for_relation_power() {
    let batch = project_token_events(
        &context(GovernanceTokenStandard::Erc721),
        vec![
            TokenProjectionEvent {
                log: log(10, 0, 1),
                event: delegate_changed(account("BBBB"), zero(), account("CCCC")),
            },
            TokenProjectionEvent {
                log: log(11, 0, 1),
                event: transfer(
                    account("DDDD"),
                    account("BBBB"),
                    "999",
                    GovernanceTokenStandard::Erc721,
                ),
            },
        ],
    )
    .expect("projection succeeds");
    let mut repository = InMemoryTokenProjectionRepository::default();

    repository.apply(&batch).expect("write succeeds");

    let mapping = repository
        .delegate_mappings()
        .get(&account("bbbb"))
        .expect("current mapping");
    assert_eq!(mapping.power, "1");
    assert_eq!(batch.token_transfers[0].standard, "erc721");
}

#[test]
fn test_project_token_events_rejects_registry_standard_mismatch() {
    let err = project_token_events(
        &context(GovernanceTokenStandard::Erc20),
        vec![TokenProjectionEvent {
            log: log(10, 0, 1),
            event: transfer(
                account("BBBB"),
                account("CCCC"),
                "1",
                GovernanceTokenStandard::Erc721,
            ),
        }],
    )
    .expect_err("standard mismatch is rejected");

    assert_eq!(
        err,
        TokenProjectionError::MismatchedTokenStandard {
            expected: GovernanceTokenStandard::Erc20,
            actual: GovernanceTokenStandard::Erc721,
            log_id: "evm:1:10:0xtx10:0:1".to_owned(),
        }
    );
}

#[test]
fn test_project_token_events_rejects_conflicting_duplicate_log() {
    let err = project_token_events(
        &context(GovernanceTokenStandard::Erc20),
        vec![
            TokenProjectionEvent {
                log: log(10, 0, 1),
                event: delegate_votes_changed(account("BBBB"), "0", "1"),
            },
            TokenProjectionEvent {
                log: log(10, 0, 1),
                event: delegate_votes_changed(account("BBBB"), "0", "2"),
            },
        ],
    )
    .expect_err("conflicting duplicate log is rejected");

    assert_eq!(
        err,
        TokenProjectionError::ConflictingDuplicateLog {
            log_id: "evm:1:10:0xtx10:0:1".to_owned(),
        }
    );
}

#[test]
fn test_project_token_events_rejects_mixed_chain_input() {
    let mut second = log(11, 0, 1);
    second.chain_id = 2;

    let err = project_token_events(
        &context(GovernanceTokenStandard::Erc20),
        vec![
            TokenProjectionEvent {
                log: log(10, 0, 1),
                event: delegate_votes_changed(account("BBBB"), "0", "1"),
            },
            TokenProjectionEvent {
                log: second,
                event: delegate_votes_changed(account("CCCC"), "0", "1"),
            },
        ],
    )
    .expect_err("mixed chain input is rejected");

    assert_eq!(
        err,
        TokenProjectionError::MixedChainIds {
            expected: 1,
            actual: 2,
            log_id: "evm:1:11:0xtx11:0:1".to_owned(),
        }
    );
}

fn context(token_standard: GovernanceTokenStandard) -> TokenProjectionContext {
    TokenProjectionContext {
        dao_code: "unit-dao".to_owned(),
        governor_address: account("aaaa"),
        token_address: account("1111"),
        contracts: ChainContracts {
            governor: account("aaaa"),
            governor_token: account("1111"),
            timelock: account("2222"),
        },
        token_standard,
        from_block: 10,
        to_block: 20,
        target_height: Some(20),
        read_plan_config: BatchReadPlanConfig {
            max_concurrency: 4,
            multicall_batch_size: 10,
        },
        current_power_method: ChainReadMethod::GetVotes,
    }
}

fn log(block_number: u64, transaction_index: u64, log_index: u64) -> NormalizedEvmLog {
    NormalizedEvmLog {
        id: format!("evm:1:{block_number}:0xtx{block_number}:{transaction_index}:{log_index}"),
        chain_id: 1,
        block_number,
        block_hash: format!("0xblock{block_number}"),
        block_timestamp_ms: Some((1_700_000_000 + block_number) * 1_000),
        transaction_hash: format!("0xtx{block_number}"),
        transaction_index,
        log_index,
        address: account("1111"),
        topics: vec![],
        data: "0x".to_owned(),
        removed: false,
        raw_payload: json!({ "blockNumber": block_number }),
    }
}

fn transfer(
    from: String,
    to: String,
    value: &str,
    standard: GovernanceTokenStandard,
) -> DecodedTokenEvent {
    DecodedTokenEvent::Transfer(TokenTransferEvent {
        from,
        to,
        value: value.to_owned(),
        standard,
    })
}

fn delegate_changed(
    delegator: String,
    from_delegate: String,
    to_delegate: String,
) -> DecodedTokenEvent {
    DecodedTokenEvent::DelegateChanged(DelegateChangedEvent {
        delegator,
        from_delegate,
        to_delegate,
    })
}

fn delegate_votes_changed(
    delegate: String,
    previous_votes: &str,
    new_votes: &str,
) -> DecodedTokenEvent {
    DecodedTokenEvent::DelegateVotesChanged(DelegateVotesChangedEvent {
        delegate,
        previous_votes: previous_votes.to_owned(),
        new_votes: new_votes.to_owned(),
    })
}

fn account(suffix: &str) -> String {
    format!("0x{:0>40}", suffix.to_ascii_lowercase())
}

fn zero() -> String {
    "0x0000000000000000000000000000000000000000".to_owned()
}
