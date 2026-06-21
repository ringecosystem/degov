use super::*;
use crate::{
    BatchReadPlanConfig, ChainContracts, ChainReadMethod, PowerReconcileContext,
    plan_power_reconcile,
};

#[test]
fn test_bulk_chunk_size_defaults_to_preferred_values() {
    temp_env::with_vars(
        [
            ("DEGOV_INDEXER_TOKEN_EVENT_BULK_CHUNK_SIZE", None::<&str>),
            (
                "DEGOV_INDEXER_CONTRIBUTOR_ENSURE_BULK_CHUNK_SIZE",
                None::<&str>,
            ),
            (
                "DEGOV_INDEXER_DELEGATE_ROLLING_VOTE_UPDATE_CHUNK_SIZE",
                None::<&str>,
            ),
            (
                "DEGOV_INDEXER_VOTE_POWER_CHECKPOINT_BULK_CHUNK_SIZE",
                None::<&str>,
            ),
            (
                "DEGOV_INDEXER_RECOMPUTE_DELEGATE_COUNT_EFFECTIVE_CHUNK_SIZE",
                None::<&str>,
            ),
        ],
        || {
            assert_eq!(token_event_bulk_chunk_size(), 3_000);
            assert_eq!(contributor_ensure_bulk_chunk_size(), 3_000);
            assert_eq!(delegate_rolling_vote_update_chunk_size(), 1_000);
            assert_eq!(vote_power_checkpoint_bulk_chunk_size(), 3_000);
            assert_eq!(recompute_delegate_count_effective_chunk_size(), 3_000);
        },
    );
}

#[test]
fn test_bulk_chunk_size_env_values_are_capped_to_postgres_bind_limit() {
    temp_env::with_vars(
        [
            ("DEGOV_INDEXER_TOKEN_EVENT_BULK_CHUNK_SIZE", Some("100000")),
            (
                "DEGOV_INDEXER_CONTRIBUTOR_ENSURE_BULK_CHUNK_SIZE",
                Some("100000"),
            ),
            (
                "DEGOV_INDEXER_DELEGATE_ROLLING_VOTE_UPDATE_CHUNK_SIZE",
                Some("100000"),
            ),
            (
                "DEGOV_INDEXER_VOTE_POWER_CHECKPOINT_BULK_CHUNK_SIZE",
                Some("100000"),
            ),
            (
                "DEGOV_INDEXER_RECOMPUTE_DELEGATE_COUNT_EFFECTIVE_CHUNK_SIZE",
                Some("100000"),
            ),
        ],
        || {
            assert_eq!(
                token_event_bulk_chunk_size(),
                POSTGRES_BIND_PARAMETER_LIMIT / TOKEN_EVENT_BULK_BINDS_PER_ROW
            );
            assert_eq!(
                contributor_ensure_bulk_chunk_size(),
                POSTGRES_BIND_PARAMETER_LIMIT / CONTRIBUTOR_ENSURE_BULK_BINDS_PER_ROW
            );
            assert_eq!(
                delegate_rolling_vote_update_chunk_size(),
                POSTGRES_BIND_PARAMETER_LIMIT / DELEGATE_ROLLING_VOTE_UPDATE_BINDS_PER_ROW
            );
            assert_eq!(
                vote_power_checkpoint_bulk_chunk_size(),
                POSTGRES_BIND_PARAMETER_LIMIT / VOTE_POWER_CHECKPOINT_BULK_BINDS_PER_ROW
            );
            assert_eq!(
                recompute_delegate_count_effective_chunk_size(),
                POSTGRES_BIND_PARAMETER_LIMIT / RECOMPUTE_DELEGATE_COUNT_EFFECTIVE_BINDS_PER_ROW
            );
        },
    );
}

#[test]
fn test_bulk_chunk_size_invalid_env_values_fall_back_to_defaults() {
    temp_env::with_vars(
        [
            ("DEGOV_INDEXER_TOKEN_EVENT_BULK_CHUNK_SIZE", Some("0")),
            (
                "DEGOV_INDEXER_CONTRIBUTOR_ENSURE_BULK_CHUNK_SIZE",
                Some("not-a-number"),
            ),
            (
                "DEGOV_INDEXER_DELEGATE_ROLLING_VOTE_UPDATE_CHUNK_SIZE",
                Some("0"),
            ),
            (
                "DEGOV_INDEXER_VOTE_POWER_CHECKPOINT_BULK_CHUNK_SIZE",
                Some("not-a-number"),
            ),
            (
                "DEGOV_INDEXER_RECOMPUTE_DELEGATE_COUNT_EFFECTIVE_CHUNK_SIZE",
                Some("0"),
            ),
        ],
        || {
            assert_eq!(token_event_bulk_chunk_size(), 3_000);
            assert_eq!(contributor_ensure_bulk_chunk_size(), 3_000);
            assert_eq!(delegate_rolling_vote_update_chunk_size(), 1_000);
            assert_eq!(vote_power_checkpoint_bulk_chunk_size(), 3_000);
            assert_eq!(recompute_delegate_count_effective_chunk_size(), 3_000);
        },
    );
}

#[test]
fn test_collect_contributor_ensure_candidates_dedupes_delegate_changed_targets() {
    let common = TokenEventCommon {
        contract_set_id: "scope".to_owned(),
        chain_id: 1,
        dao_code: "demo-dao".to_owned(),
        governor_address: "0xgovernor".to_owned(),
        token_address: "0xtoken".to_owned(),
        contract_address: "0xtoken".to_owned(),
        log_index: 1,
        transaction_index: 0,
        block_number: "10".to_owned(),
        block_timestamp: Some("1000".to_owned()),
        transaction_hash: "0xtx".to_owned(),
    };
    let batch = TokenProjectionBatch {
        event_order: Vec::new(),
        delegate_changed: Vec::new(),
        delegate_votes_changed: Vec::new(),
        token_transfers: Vec::new(),
        delegate_rollings: Vec::new(),
        operations: vec![
            TokenProjectionOperation::DelegateChanged {
                id: "a".to_owned(),
                common: common.clone(),
                delegator: "0xdelegator1".to_owned(),
                from_delegate: "0x0000000000000000000000000000000000000000".to_owned(),
                to_delegate: "0x00000000000000000000000000000000000000AA".to_owned(),
            },
            TokenProjectionOperation::DelegateChanged {
                id: "b".to_owned(),
                common: common.clone(),
                delegator: "0xdelegator2".to_owned(),
                from_delegate: "0x0000000000000000000000000000000000000000".to_owned(),
                to_delegate: "0x00000000000000000000000000000000000000aa".to_owned(),
            },
            TokenProjectionOperation::DelegateChanged {
                id: "c".to_owned(),
                common,
                delegator: "0xdelegator3".to_owned(),
                from_delegate: "0x0000000000000000000000000000000000000000".to_owned(),
                to_delegate: "0x0000000000000000000000000000000000000000".to_owned(),
            },
        ],
        reconcile_plan: plan_power_reconcile(
            &PowerReconcileContext {
                contract_set_id: "scope".to_owned(),
                dao_code: "demo-dao".to_owned(),
                chain_id: 1,
                contracts: ChainContracts {
                    governor: "0xgovernor".to_owned(),
                    governor_token: "0xtoken".to_owned(),
                    timelock: Some("0xtimelock".to_owned()),
                },
                from_block: 10,
                to_block: 10,
                target_height: Some(10),
                read_plan_config: BatchReadPlanConfig::default().validated(),
                current_power_method: ChainReadMethod::GetVotes,
            },
            &[],
        ),
    };

    let candidates = collect_contributor_ensure_candidates(&batch);

    assert_eq!(candidates.len(), 1);
    assert_eq!(
        candidates[0].account,
        "0x00000000000000000000000000000000000000aa"
    );
}

#[test]
fn test_collect_transaction_metadata_keys_dedupes_repeated_transaction_hashes() {
    let common = token_common("scope", "0xtx1", 10, 1);
    let batch = TokenProjectionBatch {
        event_order: Vec::new(),
        delegate_changed: Vec::new(),
        delegate_votes_changed: vec![
            delegate_votes_changed("a", common.clone(), "0xdelegate1", "0", "1"),
            delegate_votes_changed("b", common.clone(), "0xdelegate2", "1", "2"),
            delegate_votes_changed(
                "c",
                token_common("scope", "0xtx2", 12, 3),
                "0xdelegate3",
                "2",
                "3",
            ),
            delegate_votes_changed(
                "d",
                token_common("other-scope", "0xtx1", 13, 4),
                "0xdelegate4",
                "3",
                "4",
            ),
        ],
        token_transfers: Vec::new(),
        delegate_rollings: Vec::new(),
        operations: Vec::new(),
        reconcile_plan: empty_reconcile_plan(),
    };

    let keys = collect_transaction_metadata_keys(&batch);

    assert_eq!(
        keys,
        vec![
            TransactionMetadataKey {
                contract_set_id: "scope".to_owned(),
                transaction_hash: "0xtx1".to_owned(),
            },
            TransactionMetadataKey {
                contract_set_id: "scope".to_owned(),
                transaction_hash: "0xtx2".to_owned(),
            },
            TransactionMetadataKey {
                contract_set_id: "other-scope".to_owned(),
                transaction_hash: "0xtx1".to_owned(),
            },
        ]
    );
    assert_eq!(
        group_transaction_hashes_by_contract_set(&keys),
        vec![
            (
                "scope".to_owned(),
                vec!["0xtx1".to_owned(), "0xtx2".to_owned()]
            ),
            ("other-scope".to_owned(), vec!["0xtx1".to_owned()]),
        ]
    );
}

#[test]
fn test_batch_token_metadata_cache_marks_repeated_delegate_rolling_match_consumed() {
    let common = token_common("scope", "0xtx1", 10, 5);
    let key = TransactionMetadataKey::new(&common);
    let mut cache = BatchTokenMetadataCache::default();
    cache.push_rolling(
        key,
        DelegateRollingSnapshot {
            id: "rolling-1".to_owned(),
            log_index: 4,
            delegator: "0xdelegator".to_owned(),
            from_delegate: "0xfrom".to_owned(),
            to_delegate: "0xto".to_owned(),
            from_new_votes: None,
            to_new_votes: None,
        },
    );
    let first_match = cache
        .find_rolling_match(&common, "0xto", "1", 5)
        .expect("first match should use the to side");

    cache.mark_rolling_match(&common, &first_match, "8", "9");
    let second_match = cache.find_rolling_match(&common, "0xto", "1", 6);
    let updates = cache.drain_rolling_vote_updates();

    assert_eq!(first_match.side, RollingSide::To);
    assert!(second_match.is_none());
    assert_eq!(updates.len(), 1);
    assert_eq!(updates[0].id, "rolling-1");
    assert_eq!(updates[0].from_previous_votes, None);
    assert_eq!(updates[0].from_new_votes, None);
    assert_eq!(updates[0].to_previous_votes.as_deref(), Some("8"));
    assert_eq!(updates[0].to_new_votes.as_deref(), Some("9"));
}

#[test]
fn test_batch_token_metadata_cache_uses_delegate_specific_rolling_candidates() {
    let common = token_common("scope", "0xtx1", 10, 5);
    let key = TransactionMetadataKey::new(&common);
    let mut cache = BatchTokenMetadataCache::default();
    for index in 0..100 {
        cache.push_rolling(
            key.clone(),
            DelegateRollingSnapshot {
                id: format!("unrelated-{index}"),
                log_index: 9 - index % 3,
                delegator: format!("0xdelegator{index}"),
                from_delegate: format!("0xfrom{index}"),
                to_delegate: format!("0xto{index}"),
                from_new_votes: None,
                to_new_votes: None,
            },
        );
    }
    cache.push_rolling(
        key,
        DelegateRollingSnapshot {
            id: "rolling-target".to_owned(),
            log_index: 8,
            delegator: "0xdelegator".to_owned(),
            from_delegate: "0xfrom".to_owned(),
            to_delegate: "0xtarget".to_owned(),
            from_new_votes: None,
            to_new_votes: None,
        },
    );

    let rolling_match = cache
        .find_rolling_match(&common, "0xtarget", "1", 10)
        .expect("target delegate should match");

    assert_eq!(rolling_match.id, "rolling-target");
    assert_eq!(rolling_match.side, RollingSide::To);
    assert!(
        cache
            .find_rolling_match(&common, "0xtarget", "1", 8)
            .is_none()
    );
}

#[test]
fn test_batch_token_metadata_cache_counts_transfers_from_current_batch() {
    let common = token_common("scope", "0xtx1", 10, 1);
    let other_transaction = token_common("scope", "0xtx2", 10, 2);
    let untracked_scope = token_common("untracked-scope", "0xtx1", 10, 3);
    let batch = TokenProjectionBatch {
        event_order: Vec::new(),
        delegate_changed: Vec::new(),
        delegate_votes_changed: vec![
            delegate_votes_changed("votes-1", common.clone(), "0xdelegate1", "0", "1"),
            delegate_votes_changed(
                "votes-2",
                other_transaction.clone(),
                "0xdelegate2",
                "1",
                "2",
            ),
        ],
        token_transfers: vec![
            token_transfer("transfer-1", common.clone(), "0xfrom1", "0xto1", "10"),
            token_transfer("transfer-2", common.clone(), "0xfrom2", "0xto2", "20"),
            token_transfer("transfer-3", untracked_scope, "0xfrom3", "0xto3", "30"),
        ],
        delegate_rollings: Vec::new(),
        operations: Vec::new(),
        reconcile_plan: empty_reconcile_plan(),
    };
    let keys = collect_transaction_metadata_keys(&batch);
    let mut cache = BatchTokenMetadataCache::default();

    cache.preload_transfer_counts(&batch, &keys);

    assert_eq!(cache.transfer_count(&common), 2);
    assert_eq!(cache.transfer_count(&other_transaction), 0);
}

#[test]
fn test_delegate_mapping_cache_keeps_only_final_dirty_state_per_account() {
    let common = token_common("scope", "0xtx1", 10, 5);
    let mut cache = DelegateMappingCache::default();

    cache.stage_relation(
        &common,
        "0xdelegator",
        Some(DelegateMappingSnapshot {
            common: common.clone(),
            from: "0xdelegator".to_owned(),
            to: "0xdelegate1".to_owned(),
            power: "10".to_owned(),
        }),
    );
    cache.stage_relation(
        &common,
        "0xdelegator",
        Some(DelegateMappingSnapshot {
            common: common.clone(),
            from: "0xdelegator".to_owned(),
            to: "0xdelegate2".to_owned(),
            power: "25".to_owned(),
        }),
    );

    assert_eq!(cache.dirty.len(), 1);
    assert_eq!(
        cache.get(&common, "0xdelegator"),
        Some(Some(DelegateMappingSnapshot {
            common: common.clone(),
            from: "0xdelegator".to_owned(),
            to: "0xdelegate2".to_owned(),
            power: "25".to_owned(),
        }))
    );
}

#[test]
fn test_delegate_mapping_cache_preloads_hits_and_misses_without_overwriting_dirty_state() {
    let common = token_common("scope", "0xtx1", 10, 5);
    let mut cache = DelegateMappingCache::default();

    cache.stage_relation(
        &common,
        "0xdirty",
        Some(DelegateMappingSnapshot {
            common: common.clone(),
            from: "0xdirty".to_owned(),
            to: "0xstaged".to_owned(),
            power: "77".to_owned(),
        }),
    );
    cache.set_preloaded(
        &common,
        "0xhit",
        Some(DelegateMappingSnapshot {
            common: common.clone(),
            from: "0xhit".to_owned(),
            to: "0xdelegate".to_owned(),
            power: "10".to_owned(),
        }),
    );
    cache.set_preloaded(&common, "0xmiss", None);
    cache.set_preloaded(
        &common,
        "0xdirty",
        Some(DelegateMappingSnapshot {
            common: common.clone(),
            from: "0xdirty".to_owned(),
            to: "0xpreloaded".to_owned(),
            power: "12".to_owned(),
        }),
    );

    assert_eq!(
        cache
            .get(&common, "0xhit")
            .flatten()
            .map(|mapping| mapping.to),
        Some("0xdelegate".to_owned())
    );
    assert_eq!(cache.get(&common, "0xmiss"), Some(None));
    assert_eq!(
        cache
            .get(&common, "0xdirty")
            .flatten()
            .map(|mapping| (mapping.to, mapping.power)),
        Some(("0xstaged".to_owned(), "77".to_owned()))
    );
}

#[test]
fn test_delegate_mapping_cache_preloaded_hit_stages_effective_count_recompute() {
    let common = token_common("scope", "0xtx1", 10, 5);
    let mut cache = DelegateMappingCache::default();

    cache.set_preloaded(
        &common,
        "0xhit",
        Some(DelegateMappingSnapshot {
            common: common.clone(),
            from: "0xhit".to_owned(),
            to: "0xdelegate".to_owned(),
            power: "0".to_owned(),
        }),
    );

    assert!(cache.effective_count_delegates.contains_key(&(
        common.contract_set_id.clone(),
        contributor_ref("0xdelegate"),
    )));
}

#[test]
fn test_delegate_mapping_cache_keeps_relation_dirty_after_power_update() {
    let relation_common = token_common("scope", "0xrelation", 10, 5);
    let power_common = token_common("scope", "0xpower", 11, 6);
    let mut cache = DelegateMappingCache::default();

    cache.stage_relation(
        &relation_common,
        "0xdelegator",
        Some(DelegateMappingSnapshot {
            common: relation_common.clone(),
            from: "0xdelegator".to_owned(),
            to: "0xdelegate".to_owned(),
            power: "0".to_owned(),
        }),
    );
    cache.stage_power(
        &power_common,
        "0xdelegator",
        DelegateMappingSnapshot {
            common: relation_common.clone(),
            from: "0xdelegator".to_owned(),
            to: "0xdelegate".to_owned(),
            power: "25".to_owned(),
        },
    );

    let dirty = cache
        .dirty
        .values()
        .next()
        .expect("dirty relation should be staged");
    let DelegateMappingDirty::Relation(snapshot) = dirty else {
        panic!("power update should preserve relation upsert semantics");
    };
    assert_eq!(snapshot.common.transaction_hash, "0xrelation");
    assert_eq!(snapshot.power, "25");
}

#[test]
fn test_collect_delegate_mapping_preload_candidates_includes_operations_and_rollings() {
    let common = token_common("scope", "0xtx1", 10, 5);
    let key = TransactionMetadataKey::new(&common);
    let mut metadata_cache = BatchTokenMetadataCache::default();
    metadata_cache.push_rolling(
        key,
        DelegateRollingSnapshot {
            id: "rolling-1".to_owned(),
            log_index: 4,
            delegator: "0xrollingDelegator".to_owned(),
            from_delegate: "0xrollingFrom".to_owned(),
            to_delegate: "0xrollingTo".to_owned(),
            from_new_votes: None,
            to_new_votes: None,
        },
    );
    let batch = TokenProjectionBatch {
        event_order: Vec::new(),
        delegate_changed: Vec::new(),
        delegate_votes_changed: vec![delegate_votes_changed(
            "votes",
            common.clone(),
            "0xrollingTo",
            "1",
            "2",
        )],
        token_transfers: Vec::new(),
        delegate_rollings: Vec::new(),
        operations: vec![
            TokenProjectionOperation::Transfer {
                id: "transfer".to_owned(),
                common: common.clone(),
                from: "0x0000000000000000000000000000000000000000".to_owned(),
                to: "0xtransferTo".to_owned(),
                value: "5".to_owned(),
                standard: GovernanceTokenStandard::Erc20,
            },
            TokenProjectionOperation::DelegateChanged {
                id: "changed".to_owned(),
                common,
                delegator: "0xchangedDelegator".to_owned(),
                from_delegate: "0xold".to_owned(),
                to_delegate: "0xnew".to_owned(),
            },
        ],
        reconcile_plan: empty_reconcile_plan(),
    };

    let candidates = collect_delegate_mapping_preload_candidates(&batch, &metadata_cache);
    let ids = candidates
        .into_iter()
        .map(|candidate| candidate.id)
        .collect::<std::collections::BTreeSet<_>>();

    assert_eq!(
        ids,
        [
            "0xchangeddelegator",
            "0xrollingdelegator",
            "0xrollingfrom",
            "0xrollingto",
            "0xtransferto",
        ]
        .into_iter()
        .map(str::to_owned)
        .collect::<std::collections::BTreeSet<_>>()
    );
}

#[test]
fn test_collect_vote_power_checkpoint_inserts_preserves_cause_and_rolling_relation() {
    let common = token_common("scope", "0xtx1", 10, 5);
    let key = TransactionMetadataKey::new(&common);
    let mut metadata_cache = BatchTokenMetadataCache::default();
    metadata_cache.transfer_counts.insert(key.clone(), 1);
    metadata_cache.push_rolling(
        key,
        DelegateRollingSnapshot {
            id: "rolling-1".to_owned(),
            log_index: 4,
            delegator: "0xdelegator".to_owned(),
            from_delegate: "0xfrom".to_owned(),
            to_delegate: "0xto".to_owned(),
            from_new_votes: None,
            to_new_votes: None,
        },
    );
    let rows = collect_vote_power_checkpoint_inserts(
        &metadata_cache,
        &[delegate_votes_changed("votes", common, "0xto", "10", "15")],
    )
    .expect("checkpoint rows");

    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].delta, "5");
    assert_eq!(rows[0].cause, "delegate-change+transfer");
    assert_eq!(rows[0].delegator.as_deref(), Some("0xdelegator"));
    assert_eq!(rows[0].from_delegate.as_deref(), Some("0xfrom"));
    assert_eq!(rows[0].to_delegate.as_deref(), Some("0xto"));
}

#[test]
fn test_collect_vote_power_checkpoint_inserts_keeps_delegate_votes_changed_cause_without_metadata()
{
    let common = token_common("scope", "0xtx1", 10, 5);
    let metadata_cache = BatchTokenMetadataCache::default();
    let rows = collect_vote_power_checkpoint_inserts(
        &metadata_cache,
        &[delegate_votes_changed(
            "votes",
            common,
            "0xdelegate",
            "20",
            "5",
        )],
    )
    .expect("checkpoint rows");

    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].delta, "-15");
    assert_eq!(rows[0].cause, "delegate-votes-changed");
    assert_eq!(rows[0].delegator, None);
    assert_eq!(rows[0].from_delegate, None);
    assert_eq!(rows[0].to_delegate, None);
}

#[test]
fn test_delegate_snapshot_cache_keeps_only_final_dirty_state_per_relation() {
    let common = token_common("scope", "0xtx1", 10, 5);
    let mut cache = DelegateSnapshotCache::default();

    cache.stage(&common, "0xdelegator", "0xdelegate", true, "10");
    cache.stage(&common, "0xdelegator", "0xdelegate", true, "25");

    let snapshots = cache.drain_snapshots();

    assert_eq!(snapshots.len(), 1);
    assert_eq!(snapshots[0].from_delegate, "0xdelegator");
    assert_eq!(snapshots[0].to_delegate, "0xdelegate");
    assert!(snapshots[0].is_current);
    assert_eq!(snapshots[0].power, "25");
}

#[test]
fn test_contributor_ensure_cache_accumulates_contributor_count_by_scope() {
    let common = token_common("scope", "0xtx1", 10, 5);
    let other_common = token_common("other-scope", "0xtx2", 11, 6);
    let mut cache = ContributorEnsureCache::default();

    cache.stage_contributor_count_increment(&common);
    cache.stage_contributor_count_increment(&common);
    cache.stage_contributor_count_increment(&other_common);

    assert_eq!(
        cache
            .contributor_count_increments
            .get(&DataMetricIncrementScope::from(&common))
            .map(|increment| increment.count),
        Some(2)
    );
    assert_eq!(cache.contributor_count_increments.len(), 2);
}

#[test]
fn test_token_decimal_helpers_match_postgres_numeric_shape() {
    assert_eq!(signed_decimal_delta("100", "40"), "60");
    assert_eq!(signed_decimal_delta("40", "100"), "-60");
    assert_eq!(signed_decimal_delta("00040", "40"), "0");
    assert_eq!(add_signed_decimal("100", "60"), "160");
    assert_eq!(add_signed_decimal("100", "-60"), "40");
    assert_eq!(add_signed_decimal("40", "-100"), "-60");
    assert_eq!(add_signed_decimal("-40", "100"), "60");
    assert_eq!(add_signed_decimal("-40", "-100"), "-140");
}

fn token_common(
    contract_set_id: &str,
    transaction_hash: &str,
    log_index: u64,
    transaction_index: u64,
) -> TokenEventCommon {
    TokenEventCommon {
        contract_set_id: contract_set_id.to_owned(),
        chain_id: 1,
        dao_code: "demo-dao".to_owned(),
        governor_address: "0xgovernor".to_owned(),
        token_address: "0xtoken".to_owned(),
        contract_address: "0xtoken".to_owned(),
        log_index,
        transaction_index,
        block_number: "10".to_owned(),
        block_timestamp: Some("1000".to_owned()),
        transaction_hash: transaction_hash.to_owned(),
    }
}

fn delegate_votes_changed(
    id: &str,
    common: TokenEventCommon,
    delegate: &str,
    previous_votes: &str,
    new_votes: &str,
) -> DelegateVotesChangedWrite {
    DelegateVotesChangedWrite {
        id: id.to_owned(),
        common,
        delegate: delegate.to_owned(),
        previous_votes: previous_votes.to_owned(),
        new_votes: new_votes.to_owned(),
    }
}

fn token_transfer(
    id: &str,
    common: TokenEventCommon,
    from: &str,
    to: &str,
    value: &str,
) -> TokenTransferWrite {
    TokenTransferWrite {
        id: id.to_owned(),
        common,
        from: from.to_owned(),
        to: to.to_owned(),
        value: value.to_owned(),
        standard: "erc20".to_owned(),
    }
}

fn empty_reconcile_plan() -> crate::PowerReconcilePlan {
    plan_power_reconcile(
        &PowerReconcileContext {
            contract_set_id: "scope".to_owned(),
            dao_code: "demo-dao".to_owned(),
            chain_id: 1,
            contracts: ChainContracts {
                governor: "0xgovernor".to_owned(),
                governor_token: "0xtoken".to_owned(),
                timelock: Some("0xtimelock".to_owned()),
            },
            from_block: 10,
            to_block: 10,
            target_height: Some(10),
            read_plan_config: BatchReadPlanConfig::default().validated(),
            current_power_method: ChainReadMethod::GetVotes,
        },
        &[],
    )
}
