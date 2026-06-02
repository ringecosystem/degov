use degov_datalens_indexer::{
    BatchReadPlanConfig, BlockReadMode, ChainContracts, ChainReadMethod, ChainReadReason,
    DecodedDaoEvent, DecodedTokenEvent, DelegateChangedEvent, DelegateVotesChangedEvent,
    PowerActivityReason, PowerFreshnessState, PowerReconcileContext, PowerReconcileEvent,
    PowerRefreshReadSource, PowerRefreshStatus, TokenTransferEvent, plan_power_reconcile,
};

#[test]
fn test_plan_power_reconcile_dedupes_large_batch_before_chain_reads() {
    let events = (100_000..110_000)
        .map(|block_number| PowerReconcileEvent {
            block_number,
            block_timestamp_ms: Some(block_number * 1_000),
            transaction_hash: format!("0xtx{block_number}"),
            transaction_index: 0,
            log_index: 0,
            event: DecodedDaoEvent::Token(DecodedTokenEvent::Transfer(TokenTransferEvent {
                from: account("aaaa"),
                to: account("bbbb"),
                value: block_number.to_string(),
                standard: degov_datalens_indexer::GovernanceTokenStandard::Erc20,
            })),
        })
        .collect::<Vec<_>>();

    let plan = plan_power_reconcile(&context(100_000, 110_000, Some(110_010)), &events);

    assert_eq!(plan.metrics.candidate_count, 20_000);
    assert_eq!(plan.metrics.deduped_count, 19_998);
    assert_eq!(plan.metrics.read_count, 2);
    assert_eq!(plan.metrics.processed_count, 0);
    assert_eq!(plan.metrics.failed_count, 0);
    assert_eq!(plan.metrics.sync_lag_blocks, Some(10));
    assert_eq!(
        plan.freshness_state,
        PowerFreshnessState::SyncLag { lag_blocks: 10 }
    );
    assert_eq!(plan.candidates.len(), 2);
    assert_eq!(plan.chain_read_plan.reads.len(), 2);
}

#[test]
fn test_plan_power_reconcile_keeps_latest_activity_block_and_merges_reasons() {
    let acct = account("aaaa");
    let events = vec![
        PowerReconcileEvent {
            block_number: 100,
            block_timestamp_ms: Some(100_000),
            transaction_hash: "0xtx100".to_owned(),
            transaction_index: 0,
            log_index: 0,
            event: DecodedDaoEvent::Token(DecodedTokenEvent::Transfer(TokenTransferEvent {
                from: acct.clone(),
                to: account("bbbb"),
                value: "10".to_owned(),
                standard: degov_datalens_indexer::GovernanceTokenStandard::Erc20,
            })),
        },
        PowerReconcileEvent {
            block_number: 103,
            block_timestamp_ms: Some(103_000),
            transaction_hash: "0xtx103".to_owned(),
            transaction_index: 0,
            log_index: 0,
            event: DecodedDaoEvent::Token(DecodedTokenEvent::DelegateChanged(
                DelegateChangedEvent {
                    delegator: acct.clone(),
                    from_delegate: account("cccc"),
                    to_delegate: account("dddd"),
                },
            )),
        },
        PowerReconcileEvent {
            block_number: 101,
            block_timestamp_ms: Some(101_000),
            transaction_hash: "0xtx101".to_owned(),
            transaction_index: 0,
            log_index: 0,
            event: DecodedDaoEvent::Token(DecodedTokenEvent::DelegateVotesChanged(
                DelegateVotesChangedEvent {
                    delegate: acct.clone(),
                    previous_votes: "1".to_owned(),
                    new_votes: "999999".to_owned(),
                },
            )),
        },
        transfer_event(99, 0, 0, "0xtx99", &acct, &account("eeee")),
    ];

    let plan = plan_power_reconcile(&context(99, 103, Some(103)), &events);
    let candidate = plan
        .candidates
        .iter()
        .find(|candidate| candidate.account == acct)
        .expect("candidate");

    assert_eq!(candidate.latest_activity_block, 103);
    assert_eq!(
        candidate.reasons,
        [
            PowerActivityReason::DelegateChanged,
            PowerActivityReason::DelegateVotesChanged,
            PowerActivityReason::Transfer,
        ]
        .into()
    );
    assert_eq!(candidate.status.status, PowerRefreshStatus::Pending);
    assert_eq!(candidate.status.source, PowerRefreshReadSource::OnchainRpc);
    assert_eq!(candidate.status.first_seen_activity_block, 99);
    assert_eq!(candidate.status.last_seen_activity_block, 103);
    assert_eq!(candidate.status.last_seen_block_timestamp_ms, Some(103_000));
    assert_eq!(candidate.status.last_seen_transaction_hash, "0xtx103");
    assert_eq!(candidate.status.last_seen_transaction_index, 0);
    assert_eq!(candidate.status.last_seen_log_index, 0);
    assert_eq!(
        candidate.status.reason,
        "delegate-change+delegate-votes-changed+transfer"
    );
}

#[test]
fn test_plan_power_reconcile_does_not_write_log_derived_power() {
    let acct = account("aaaa");
    let events = vec![PowerReconcileEvent {
        block_number: 100,
        block_timestamp_ms: Some(100_000),
        transaction_hash: "0xtx100".to_owned(),
        transaction_index: 0,
        log_index: 0,
        event: DecodedDaoEvent::Token(DecodedTokenEvent::DelegateVotesChanged(
            DelegateVotesChangedEvent {
                delegate: acct.clone(),
                previous_votes: "1".to_owned(),
                new_votes: "999999".to_owned(),
            },
        )),
    }];

    let plan = plan_power_reconcile(&context(100, 100, Some(100)), &events);
    let candidate = plan.candidates.first().expect("candidate");

    assert_eq!(candidate.account, acct);
    assert_eq!(candidate.observed_log_power, None);
    assert_eq!(candidate.status.status, PowerRefreshStatus::Pending);
    assert!(candidate.status.refresh_power);
    assert!(!candidate.status.refresh_balance);
    assert_eq!(
        candidate.reasons,
        [PowerActivityReason::DelegateVotesChanged].into()
    );
}

#[test]
fn test_plan_power_reconcile_emits_chaintool_get_votes_reads() {
    let acct = account("aaaa");
    let events = vec![PowerReconcileEvent {
        block_number: 200,
        block_timestamp_ms: Some(200_000),
        transaction_hash: "0xtx200".to_owned(),
        transaction_index: 0,
        log_index: 0,
        event: DecodedDaoEvent::Token(DecodedTokenEvent::Transfer(TokenTransferEvent {
            from: acct.clone(),
            to: account("bbbb"),
            value: "1".to_owned(),
            standard: degov_datalens_indexer::GovernanceTokenStandard::Erc20,
        })),
    }];

    let plan = plan_power_reconcile(&context(200, 200, Some(200)), &events);
    let read = plan
        .chain_read_plan
        .reads
        .iter()
        .find(|read| read.metadata.accounts.contains(&acct))
        .expect("account read");

    assert_eq!(read.key.chain_id, 1);
    assert_eq!(
        read.key.contract_address,
        "0x2222222222222222222222222222222222222222"
    );
    assert_eq!(read.key.method, ChainReadMethod::GetVotes);
    assert_eq!(read.key.block_mode, BlockReadMode::Fresh);
    assert_eq!(read.key.args, vec![acct]);
    assert_eq!(
        read.metadata.reasons,
        [ChainReadReason::TokenActivityPowerRefresh].into()
    );
    assert_eq!(read.activity_blocks, vec![200]);
}

#[test]
fn test_plan_power_reconcile_uses_same_block_log_position_for_latest_status() {
    let acct = account("aaaa");
    let events = vec![
        transfer_event(300, 2, 1, "0xtx300b", &acct, &account("bbbb")),
        transfer_event(300, 1, 9, "0xtx300a", &acct, &account("cccc")),
        transfer_event(300, 2, 5, "0xtx300c", &acct, &account("dddd")),
    ];

    let plan = plan_power_reconcile(&context(300, 300, Some(300)), &events);
    let candidate = plan
        .candidates
        .iter()
        .find(|candidate| candidate.account == acct)
        .expect("candidate");

    assert_eq!(candidate.latest_activity_block, 300);
    assert_eq!(candidate.latest_transaction_index, 2);
    assert_eq!(candidate.latest_log_index, 5);
    assert_eq!(candidate.status.last_seen_transaction_hash, "0xtx300c");
}

#[test]
fn test_plan_power_reconcile_skips_zero_addresses_from_transfer_and_delegate_changes() {
    let zero = "0x0000000000000000000000000000000000000000".to_owned();
    let acct = account("aaaa");
    let events = vec![
        transfer_event(400, 0, 0, "0xtx400", &zero, &acct),
        PowerReconcileEvent {
            block_number: 401,
            block_timestamp_ms: Some(401_000),
            transaction_hash: "0xtx401".to_owned(),
            transaction_index: 0,
            log_index: 0,
            event: DecodedDaoEvent::Token(DecodedTokenEvent::DelegateChanged(
                DelegateChangedEvent {
                    delegator: acct.clone(),
                    from_delegate: zero.clone(),
                    to_delegate: acct.clone(),
                },
            )),
        },
    ];

    let plan = plan_power_reconcile(&context(400, 401, Some(401)), &events);

    assert!(
        !plan
            .candidates
            .iter()
            .any(|candidate| candidate.account == zero)
    );
    assert!(
        plan.candidates
            .iter()
            .any(|candidate| candidate.account == acct)
    );
}

#[test]
fn test_plan_power_reconcile_can_emit_current_votes_fallback_reads() {
    let acct = account("aaaa");
    let mut context = context(500, 500, Some(500));
    context.current_power_method = ChainReadMethod::CurrentVotes;

    let plan = plan_power_reconcile(
        &context,
        &[transfer_event(
            500,
            0,
            0,
            "0xtx500",
            &acct,
            &account("bbbb"),
        )],
    );
    let read = plan
        .chain_read_plan
        .reads
        .iter()
        .find(|read| read.metadata.accounts.contains(&acct))
        .expect("account read");

    assert_eq!(read.key.method, ChainReadMethod::CurrentVotes);
}

#[test]
fn test_plan_power_reconcile_is_fresh_when_processor_is_past_target_height() {
    let plan = plan_power_reconcile(&context(600, 610, Some(600)), &[]);

    assert_eq!(plan.freshness_state, PowerFreshnessState::Fresh);
    assert_eq!(plan.metrics.sync_lag_blocks, None);
}

fn context(from_block: u64, to_block: u64, target_height: Option<u64>) -> PowerReconcileContext {
    PowerReconcileContext {
        dao_code: "unit-dao".to_owned(),
        chain_id: 1,
        contracts: ChainContracts {
            governor: "0x1111111111111111111111111111111111111111".to_owned(),
            governor_token: "0x2222222222222222222222222222222222222222".to_owned(),
            timelock: "0x3333333333333333333333333333333333333333".to_owned(),
        },
        from_block,
        to_block,
        target_height,
        read_plan_config: BatchReadPlanConfig::default(),
        current_power_method: ChainReadMethod::GetVotes,
    }
}

fn account(suffix: &str) -> String {
    format!("0x{suffix:0>40}")
}

fn transfer_event(
    block_number: u64,
    transaction_index: u64,
    log_index: u64,
    transaction_hash: &str,
    from: &str,
    to: &str,
) -> PowerReconcileEvent {
    PowerReconcileEvent {
        block_number,
        block_timestamp_ms: Some(block_number * 1_000),
        transaction_hash: transaction_hash.to_owned(),
        transaction_index,
        log_index,
        event: DecodedDaoEvent::Token(DecodedTokenEvent::Transfer(TokenTransferEvent {
            from: from.to_owned(),
            to: to.to_owned(),
            value: "1".to_owned(),
            standard: degov_datalens_indexer::GovernanceTokenStandard::Erc20,
        })),
    }
}
