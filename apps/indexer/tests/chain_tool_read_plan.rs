use degov_datalens_indexer::{
    BatchReadPlanConfig, BlockReadMode, ChainContracts, ChainReadExecutionReport, ChainReadMethod,
    ChainReadPlanBuilder, ChainReadReason, ChainReadResult, ChainReadValue, ReadRequirement,
};

#[test]
fn test_read_plan_dedupes_repeated_account_power_reads_in_large_datalens_batch() {
    let contracts = contracts();
    let mut builder =
        ChainReadPlanBuilder::new(1, contracts.clone(), BatchReadPlanConfig::default());

    for block_number in 10_000..20_000 {
        builder.add_account_power_refresh(
            "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            block_number,
            ChainReadReason::TokenActivityPowerRefresh,
        );
    }

    let plan = builder.build();

    assert_eq!(plan.metrics.requested_reads, 10_000);
    assert_eq!(plan.metrics.deduped_reads, 9_999);
    assert_eq!(plan.reads.len(), 1);
    assert_eq!(plan.reads[0].key.chain_id, 1);
    assert_eq!(plan.reads[0].key.contract_address, contracts.governor_token);
    assert_eq!(plan.reads[0].key.method, ChainReadMethod::GetVotes);
    assert_eq!(
        plan.reads[0].key.args,
        vec!["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]
    );
    assert_eq!(plan.reads[0].key.block_mode, BlockReadMode::Safe);
    assert_eq!(
        plan.reads[0].metadata.accounts,
        ["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_owned()].into()
    );
    assert_eq!(
        plan.reads[0].metadata.reasons,
        [ChainReadReason::TokenActivityPowerRefresh].into()
    );
    assert_eq!(plan.reads[0].requirement, ReadRequirement::Required);
    assert_eq!(plan.reads[0].activity_blocks.len(), 10_000);
}

#[test]
fn test_read_plan_dedupes_same_rpc_read_across_semantic_metadata() {
    let contracts = contracts();
    let mut builder =
        ChainReadPlanBuilder::new(1, contracts.clone(), BatchReadPlanConfig::default());

    builder.add_account_power_refresh(
        "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        100,
        ChainReadReason::TokenActivityPowerRefresh,
    );
    builder.add_account_power_refresh(
        "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        101,
        ChainReadReason::ProposalSnapshotPower,
    );
    builder.add_optional_enrichment_read(
        contracts.governor_token.clone(),
        ChainReadMethod::GetVotes,
        vec!["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_owned()],
        BlockReadMode::Safe,
    );

    let plan = builder.build();

    assert_eq!(plan.metrics.requested_reads, 3);
    assert_eq!(plan.metrics.deduped_reads, 2);
    assert_eq!(plan.reads.len(), 1);
    assert_eq!(plan.reads[0].requirement, ReadRequirement::Required);
    assert_eq!(plan.reads[0].activity_blocks, vec![100, 101]);
    assert_eq!(
        plan.reads[0].metadata.accounts,
        ["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_owned()].into()
    );
    assert_eq!(
        plan.reads[0].metadata.reasons,
        [
            ChainReadReason::OptionalEnrichment,
            ChainReadReason::ProposalSnapshotPower,
            ChainReadReason::TokenActivityPowerRefresh,
        ]
        .into()
    );
}

#[test]
fn test_read_plan_dedupes_repeated_account_proposal_and_operation_activity() {
    let contracts = contracts();
    let mut builder = ChainReadPlanBuilder::new(1, contracts, BatchReadPlanConfig::default());

    for block_number in 30_000..40_000 {
        builder.add_account_power_refresh(
            "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            block_number,
            ChainReadReason::TokenActivityPowerRefresh,
        );
        builder.add_proposal_refresh(
            "42",
            block_number,
            ChainReadReason::ProposalLifecycleRefresh,
        );
        builder.add_timelock_operation_refresh(
            "0xffff",
            block_number,
            ChainReadReason::TimelockLifecycleRefresh,
        );
    }

    let plan = builder.build();

    assert_eq!(plan.metrics.requested_reads, 50_000);
    assert_eq!(plan.metrics.deduped_reads, 49_995);
    assert_eq!(plan.reads.len(), 5);
    assert_eq!(
        plan.reads
            .iter()
            .filter(|read| read
                .metadata
                .accounts
                .contains("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"))
            .count(),
        1
    );
    assert_eq!(
        plan.reads
            .iter()
            .filter(|read| read.metadata.proposal_ids.contains("42"))
            .count(),
        3
    );
    assert_eq!(
        plan.reads
            .iter()
            .filter(|read| read.metadata.operation_ids.contains("0xffff"))
            .count(),
        1
    );
}

#[test]
fn test_read_plan_keeps_distinct_power_reads_when_block_semantics_differ() {
    let contracts = contracts();
    let mut builder = ChainReadPlanBuilder::new(1, contracts, BatchReadPlanConfig::default());

    builder.add_account_power_refresh(
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        100,
        ChainReadReason::TokenActivityPowerRefresh,
    );
    builder.add_account_past_power(
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        100,
        ChainReadReason::ProposalSnapshotPower,
    );
    builder.add_account_past_power(
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        101,
        ChainReadReason::ProposalSnapshotPower,
    );

    let plan = builder.build();
    let keys = plan
        .reads
        .iter()
        .map(|read| {
            (
                &read.key.method,
                &read.key.block_mode,
                &read.metadata.reasons,
            )
        })
        .collect::<Vec<_>>();

    assert_eq!(plan.metrics.requested_reads, 3);
    assert_eq!(plan.metrics.deduped_reads, 0);
    assert_eq!(keys.len(), 3);
    assert!(keys.contains(&(
        &ChainReadMethod::GetVotes,
        &BlockReadMode::Safe,
        &[ChainReadReason::TokenActivityPowerRefresh].into(),
    )));
    assert!(keys.contains(&(
        &ChainReadMethod::GetPastVotes,
        &BlockReadMode::AtBlock(100),
        &[ChainReadReason::ProposalSnapshotPower].into(),
    )));
    assert!(keys.contains(&(
        &ChainReadMethod::GetPastVotes,
        &BlockReadMode::AtBlock(101),
        &[ChainReadReason::ProposalSnapshotPower].into(),
    )));
}

#[test]
fn test_capability_plan_covers_required_governor_token_and_timelock_reads() {
    let contracts = contracts();
    let plan = ChainReadPlanBuilder::capability_detection_plan(
        1,
        contracts.clone(),
        BatchReadPlanConfig::default(),
    );

    assert_eq!(plan.metrics.requested_reads, 16);
    assert!(plan.metrics.deduped_reads > 0);
    assert_required(&plan, &contracts.governor, ChainReadMethod::CountingMode);
    assert_required(&plan, &contracts.governor, ChainReadMethod::ClockMode);
    assert_required(
        &plan,
        &contracts.governor,
        ChainReadMethod::ProposalSnapshot,
    );
    assert_required(
        &plan,
        &contracts.governor,
        ChainReadMethod::ProposalDeadline,
    );
    assert_required(&plan, &contracts.governor, ChainReadMethod::State);
    assert_required(&plan, &contracts.governor, ChainReadMethod::Quorum);
    assert_required(&plan, &contracts.governor_token, ChainReadMethod::Decimals);
    assert_required(&plan, &contracts.governor_token, ChainReadMethod::Delegates);
    assert_required(&plan, &contracts.governor_token, ChainReadMethod::BalanceOf);
    assert_required(&plan, &contracts.governor_token, ChainReadMethod::GetVotes);
    assert_required(
        &plan,
        &contracts.governor_token,
        ChainReadMethod::CurrentVotes,
    );
    assert_required(
        &plan,
        &contracts.governor_token,
        ChainReadMethod::GetPastVotes,
    );
    assert_required(
        &plan,
        &contracts.governor_token,
        ChainReadMethod::GetPriorVotes,
    );
    let timelock = contracts.timelock.as_deref().expect("timelock");
    assert_required(&plan, timelock, ChainReadMethod::TimelockEta);
    assert_required(&plan, timelock, ChainReadMethod::TimelockOperationState);
}

#[test]
fn test_read_plan_groups_required_reads_into_bounded_multicall_batches() {
    let contracts = contracts();
    let mut builder = ChainReadPlanBuilder::new(
        1,
        contracts,
        BatchReadPlanConfig {
            max_concurrency: 3,
            multicall_batch_size: 2,
        },
    );

    for account in [
        "0x0000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000002",
        "0x0000000000000000000000000000000000000003",
        "0x0000000000000000000000000000000000000004",
        "0x0000000000000000000000000000000000000005",
    ] {
        builder.add_account_power_refresh(account, 200, ChainReadReason::TokenActivityPowerRefresh);
    }

    let plan = builder.build();

    assert_eq!(plan.execution.max_concurrency, 3);
    assert_eq!(plan.execution.multicall_groups.len(), 3);
    assert_eq!(
        plan.execution
            .multicall_groups
            .iter()
            .map(|group| group.read_indexes.len())
            .collect::<Vec<_>>(),
        vec![2, 2, 1]
    );
}

#[test]
fn test_read_plan_clamps_zero_batch_config_to_valid_minimums() {
    let contracts = contracts();
    let mut builder = ChainReadPlanBuilder::new(
        1,
        contracts,
        BatchReadPlanConfig {
            max_concurrency: 0,
            multicall_batch_size: 0,
        },
    );

    builder.add_account_power_refresh(
        "0x0000000000000000000000000000000000000001",
        200,
        ChainReadReason::TokenActivityPowerRefresh,
    );

    let plan = builder.build();

    assert_eq!(plan.execution.max_concurrency, 1);
    assert_eq!(plan.metrics.multicall_batch_size, 1);
    assert_eq!(plan.execution.multicall_groups.len(), 1);
    assert_eq!(plan.execution.multicall_groups[0].read_indexes, vec![0]);
}

#[test]
fn test_read_execution_report_carries_lossless_read_values() {
    let contracts = contracts();
    let mut builder = ChainReadPlanBuilder::new(1, contracts, BatchReadPlanConfig::default());
    builder.add_account_power_refresh(
        "0x0000000000000000000000000000000000000001",
        200,
        ChainReadReason::TokenActivityPowerRefresh,
    );
    let plan = builder.build();

    let report = ChainReadExecutionReport {
        results: vec![ChainReadResult {
            read_index: 0,
            key: plan.reads[0].key.clone(),
            value: ChainReadValue::Integer("340282366920938463463374607431768211455".to_owned()),
        }],
        ..ChainReadExecutionReport::default()
    };

    assert_eq!(report.results[0].read_index, 0);
    assert_eq!(
        report.results[0].value,
        ChainReadValue::Integer("340282366920938463463374607431768211455".to_owned())
    );
}

fn assert_required(
    plan: &degov_datalens_indexer::ChainReadPlan,
    address: &str,
    method: ChainReadMethod,
) {
    assert!(
        plan.reads.iter().any(|read| {
            read.key.contract_address == address
                && read.key.method == method
                && read.requirement == ReadRequirement::Required
        }),
        "missing required read {method:?} for {address}",
    );
}

fn contracts() -> ChainContracts {
    ChainContracts {
        governor: "0x1111111111111111111111111111111111111111".to_owned(),
        governor_token: "0x2222222222222222222222222222222222222222".to_owned(),
        timelock: Some("0x3333333333333333333333333333333333333333".to_owned()),
    }
}
