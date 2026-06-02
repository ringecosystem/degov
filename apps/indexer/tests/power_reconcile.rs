use degov_datalens_indexer::{
    BatchReadPlanConfig, BlockReadMode, ChainContracts, ChainReadMethod, ChainReadReason,
    DecodedDaoEvent, DecodedGovernorEvent, DecodedTokenEvent, DelegateChangedEvent,
    DelegateVotesChangedEvent, PowerActivityReason, PowerFreshnessState, PowerReconcileContext,
    PowerReconcileEvent, PowerRefreshReadSource, PowerRefreshStatus, TokenTransferEvent,
    VoteCastEvent, plan_power_reconcile,
};

#[test]
fn test_plan_power_reconcile_dedupes_large_batch_before_chain_reads() {
    let events = (100_000..110_000)
        .map(|block_number| PowerReconcileEvent {
            block_number,
            transaction_hash: format!("0xtx{block_number}"),
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
            transaction_hash: "0xtx100".to_owned(),
            event: DecodedDaoEvent::Token(DecodedTokenEvent::Transfer(TokenTransferEvent {
                from: acct.clone(),
                to: account("bbbb"),
                value: "10".to_owned(),
                standard: degov_datalens_indexer::GovernanceTokenStandard::Erc20,
            })),
        },
        PowerReconcileEvent {
            block_number: 103,
            transaction_hash: "0xtx103".to_owned(),
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
            transaction_hash: "0xtx101".to_owned(),
            event: DecodedDaoEvent::Governor(DecodedGovernorEvent::VoteCast(VoteCastEvent {
                voter: acct.clone(),
                proposal_id: "42".to_owned(),
                support: 1,
                weight: "999999".to_owned(),
                reason: "from log, not final power".to_owned(),
            })),
        },
        PowerReconcileEvent {
            block_number: 99,
            transaction_hash: "0xtx99".to_owned(),
            event: DecodedDaoEvent::Token(DecodedTokenEvent::Transfer(TokenTransferEvent {
                from: acct.clone(),
                to: account("eeee"),
                value: "1".to_owned(),
                standard: degov_datalens_indexer::GovernanceTokenStandard::Erc20,
            })),
        },
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
            PowerActivityReason::Transfer,
            PowerActivityReason::VoteCast,
        ]
        .into()
    );
    assert_eq!(candidate.status.status, PowerRefreshStatus::Pending);
    assert_eq!(candidate.status.source, PowerRefreshReadSource::OnchainRpc);
    assert_eq!(candidate.status.first_seen_activity_block, 99);
    assert_eq!(candidate.status.last_seen_activity_block, 103);
    assert_eq!(candidate.status.last_seen_transaction_hash, "0xtx103");
    assert_eq!(
        candidate.status.reason,
        "delegate_changed,transfer,vote_cast"
    );
}

#[test]
fn test_plan_power_reconcile_does_not_write_log_derived_power() {
    let acct = account("aaaa");
    let events = vec![PowerReconcileEvent {
        block_number: 100,
        transaction_hash: "0xtx100".to_owned(),
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
        transaction_hash: "0xtx200".to_owned(),
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
    }
}

fn account(suffix: &str) -> String {
    format!("0x{suffix:0>40}")
}
