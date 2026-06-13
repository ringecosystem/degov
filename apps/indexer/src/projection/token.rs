use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet};

use crate::{
    BatchReadPlanConfig, ChainContracts, ChainReadMethod, DecodedDaoEvent, DecodedTokenEvent,
    DelegateChangedEvent, DelegateVotesChangedEvent, GovernanceTokenStandard, NormalizedEvmLog,
    PowerReconcileContext, PowerReconcileEvent, PowerReconcilePlan, TokenTransferEvent,
    plan_power_reconcile,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenProjectionContext {
    pub contract_set_id: String,
    pub dao_code: String,
    pub governor_address: String,
    pub token_address: String,
    pub contracts: ChainContracts,
    pub token_standard: GovernanceTokenStandard,
    pub from_block: u64,
    pub to_block: u64,
    pub target_height: Option<u64>,
    pub read_plan_config: BatchReadPlanConfig,
    pub current_power_method: ChainReadMethod,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TokenProjectionEvent {
    pub log: NormalizedEvmLog,
    pub event: DecodedTokenEvent,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenProjectionBatch {
    pub event_order: Vec<String>,
    pub delegate_changed: Vec<DelegateChangedWrite>,
    pub delegate_votes_changed: Vec<DelegateVotesChangedWrite>,
    pub token_transfers: Vec<TokenTransferWrite>,
    pub delegate_rollings: Vec<DelegateRollingWrite>,
    pub operations: Vec<TokenProjectionOperation>,
    pub reconcile_plan: PowerReconcilePlan,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TokenProjectionError {
    MixedChainIds {
        expected: i32,
        actual: i32,
        log_id: String,
    },
    ConflictingDuplicateLog {
        log_id: String,
    },
    MismatchedTokenStandard {
        expected: GovernanceTokenStandard,
        actual: GovernanceTokenStandard,
        log_id: String,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenEventCommon {
    pub contract_set_id: String,
    pub chain_id: i32,
    pub dao_code: String,
    pub governor_address: String,
    pub token_address: String,
    pub contract_address: String,
    pub log_index: u64,
    pub transaction_index: u64,
    pub block_number: String,
    pub block_timestamp: Option<String>,
    pub transaction_hash: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DelegateChangedWrite {
    pub id: String,
    pub common: TokenEventCommon,
    pub delegator: String,
    pub from_delegate: String,
    pub to_delegate: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DelegateVotesChangedWrite {
    pub id: String,
    pub common: TokenEventCommon,
    pub delegate: String,
    pub previous_votes: String,
    pub new_votes: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TokenTransferWrite {
    pub id: String,
    pub common: TokenEventCommon,
    pub from: String,
    pub to: String,
    pub value: String,
    pub standard: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DelegateRollingWrite {
    pub id: String,
    pub common: TokenEventCommon,
    pub delegator: String,
    pub from_delegate: String,
    pub to_delegate: String,
    pub from_previous_votes: Option<String>,
    pub from_new_votes: Option<String>,
    pub to_previous_votes: Option<String>,
    pub to_new_votes: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DelegateWrite {
    pub id: String,
    pub common: TokenEventCommon,
    pub from_delegate: String,
    pub to_delegate: String,
    pub is_current: bool,
    pub power: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContributorWrite {
    pub id: String,
    pub common: TokenEventCommon,
    pub last_vote_block_number: Option<String>,
    pub last_vote_timestamp: Option<String>,
    pub power: String,
    pub balance: Option<String>,
    pub delegates_count_all: i64,
    pub delegates_count_effective: i64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DelegateMappingWrite {
    pub id: String,
    pub common: TokenEventCommon,
    pub from: String,
    pub to: String,
    pub power: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DataMetricTokenDelta {
    pub power_sum: String,
    pub member_count: i64,
}

impl Default for DataMetricTokenDelta {
    fn default() -> Self {
        Self {
            power_sum: "0".to_owned(),
            member_count: 0,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TokenProjectionOperation {
    DelegateChanged {
        id: String,
        common: TokenEventCommon,
        delegator: String,
        from_delegate: String,
        to_delegate: String,
    },
    DelegateVotesChanged {
        id: String,
        common: TokenEventCommon,
        delegate: String,
        previous_votes: String,
        new_votes: String,
    },
    Transfer {
        id: String,
        common: TokenEventCommon,
        from: String,
        to: String,
        value: String,
        standard: GovernanceTokenStandard,
    },
}

pub trait TokenProjectionRepository {
    type Error;

    fn apply(&mut self, batch: &TokenProjectionBatch) -> Result<(), Self::Error>;
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct InMemoryTokenProjectionRepository {
    delegate_changed: BTreeMap<String, DelegateChangedWrite>,
    delegate_votes_changed: BTreeMap<String, DelegateVotesChangedWrite>,
    token_transfers: BTreeMap<String, TokenTransferWrite>,
    delegate_rollings: BTreeMap<String, DelegateRollingWrite>,
    delegates: BTreeMap<String, DelegateWrite>,
    contributors: BTreeMap<String, ContributorWrite>,
    delegate_mappings: BTreeMap<String, DelegateMappingWrite>,
    data_metric: DataMetricTokenDelta,
    applied_operations: BTreeSet<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TokenRepositoryWriteError {}

impl InMemoryTokenProjectionRepository {
    pub fn delegate_changed(&self) -> &BTreeMap<String, DelegateChangedWrite> {
        &self.delegate_changed
    }

    pub fn delegates(&self) -> &BTreeMap<String, DelegateWrite> {
        &self.delegates
    }

    pub fn contributors(&self) -> &BTreeMap<String, ContributorWrite> {
        &self.contributors
    }

    pub fn delegate_mappings(&self) -> &BTreeMap<String, DelegateMappingWrite> {
        &self.delegate_mappings
    }

    pub fn data_metric(&self) -> &DataMetricTokenDelta {
        &self.data_metric
    }
}

impl TokenProjectionRepository for InMemoryTokenProjectionRepository {
    type Error = TokenRepositoryWriteError;

    fn apply(&mut self, batch: &TokenProjectionBatch) -> Result<(), Self::Error> {
        extend_map(&mut self.delegate_changed, &batch.delegate_changed, |row| {
            row.id.clone()
        });
        extend_map(
            &mut self.delegate_votes_changed,
            &batch.delegate_votes_changed,
            |row| row.id.clone(),
        );
        extend_map(&mut self.token_transfers, &batch.token_transfers, |row| {
            row.id.clone()
        });
        extend_map(
            &mut self.delegate_rollings,
            &batch.delegate_rollings,
            |row| row.id.clone(),
        );

        for operation in &batch.operations {
            if !self.applied_operations.insert(operation.id().to_owned()) {
                continue;
            }
            self.apply_operation(operation);
        }

        Ok(())
    }
}

impl InMemoryTokenProjectionRepository {
    fn apply_operation(&mut self, operation: &TokenProjectionOperation) {
        match operation {
            TokenProjectionOperation::DelegateChanged {
                common,
                delegator,
                from_delegate,
                to_delegate,
                ..
            } => self.apply_delegate_changed(common, delegator, from_delegate, to_delegate),
            TokenProjectionOperation::DelegateVotesChanged {
                common,
                delegate,
                previous_votes,
                new_votes,
                ..
            } => self.apply_delegate_votes_changed(common, delegate, previous_votes, new_votes),
            TokenProjectionOperation::Transfer {
                common,
                from,
                to,
                value,
                standard,
                ..
            } => self.apply_transfer(common, from, to, transfer_units(value, *standard)),
        }
    }

    fn apply_delegate_changed(
        &mut self,
        common: &TokenEventCommon,
        delegator: &str,
        from_delegate: &str,
        to_delegate: &str,
    ) {
        if !is_zero_address(to_delegate) {
            self.ensure_contributor(to_delegate, common);
        }
        let previous_mapping = self.delegate_mappings.get(delegator).cloned();
        let is_noop = previous_mapping
            .as_ref()
            .is_some_and(|mapping| mapping.to == to_delegate && from_delegate == to_delegate);
        if is_noop {
            return;
        }

        if let Some(previous) = previous_mapping {
            self.upsert_delegate_snapshot(common, delegator, &previous.to, false, "0");
            self.apply_delegate_count_delta(
                common,
                &previous.to,
                -1,
                if is_nonzero_decimal(&previous.power) {
                    -1
                } else {
                    0
                },
            );
            self.delegate_mappings.remove(delegator);
        }

        if is_zero_address(to_delegate) {
            return;
        }

        self.apply_delegate_count_delta(common, to_delegate, 1, 0);
        let mapping = DelegateMappingWrite {
            id: delegator.to_owned(),
            common: common.clone(),
            from: delegator.to_owned(),
            to: to_delegate.to_owned(),
            power: "0".to_owned(),
        };
        self.delegate_mappings
            .insert(mapping.id.clone(), mapping.clone());
        self.upsert_delegate_snapshot(common, delegator, to_delegate, true, &mapping.power);
    }

    fn apply_delegate_votes_changed(
        &mut self,
        common: &TokenEventCommon,
        delegate: &str,
        previous_votes: &str,
        new_votes: &str,
    ) {
        let delta = subtract_decimal_signed(new_votes, previous_votes);
        let Some((rolling_id, side)) =
            self.find_rolling_match(delegate, &delta, &common.transaction_hash, common.log_index)
        else {
            return;
        };
        let Some(rolling) = self.delegate_rollings.get_mut(&rolling_id) else {
            return;
        };
        match side {
            RollingSide::From => {
                rolling.from_previous_votes = Some(previous_votes.to_owned());
                rolling.from_new_votes = Some(new_votes.to_owned());
            }
            RollingSide::To => {
                rolling.to_previous_votes = Some(previous_votes.to_owned());
                rolling.to_new_votes = Some(new_votes.to_owned());
            }
        }
        let (from_delegate, to_delegate) = match side {
            RollingSide::From => (rolling.delegator.clone(), rolling.from_delegate.clone()),
            RollingSide::To => (rolling.delegator.clone(), rolling.to_delegate.clone()),
        };
        self.apply_delegate_delta(common, &from_delegate, &to_delegate, &delta);
    }

    fn apply_transfer(&mut self, common: &TokenEventCommon, from: &str, to: &str, value: String) {
        if let Some(mapping) = self.delegate_mappings.get(from).cloned() {
            self.apply_delegate_delta(common, &mapping.from, &mapping.to, &format!("-{value}"));
        }
        if let Some(mapping) = self.delegate_mappings.get(to).cloned() {
            self.apply_delegate_delta(common, &mapping.from, &mapping.to, &value);
        }
    }

    fn apply_delegate_delta(
        &mut self,
        common: &TokenEventCommon,
        from_delegate: &str,
        to_delegate: &str,
        delta: &str,
    ) {
        if is_zero_address(to_delegate) {
            return;
        }

        let Some(previous_mapping_power) = self
            .delegate_mappings
            .get(from_delegate)
            .filter(|mapping| mapping.to == to_delegate)
            .map(|mapping| mapping.power.clone())
        else {
            return;
        };
        let next_mapping_power = apply_signed_decimal(&previous_mapping_power, delta);
        if let Some(mapping) = self.delegate_mappings.get_mut(from_delegate)
            && mapping.to == to_delegate
        {
            mapping.power = next_mapping_power.clone();
        }

        let previous_effective = is_nonzero_decimal(&previous_mapping_power);
        let next_effective = is_nonzero_decimal(&next_mapping_power);
        if previous_effective != next_effective {
            self.apply_delegate_count_delta(
                common,
                to_delegate,
                0,
                if next_effective { 1 } else { -1 },
            );
        }
        self.upsert_delegate_snapshot(
            common,
            from_delegate,
            to_delegate,
            true,
            &next_mapping_power,
        );
    }

    fn upsert_delegate_snapshot(
        &mut self,
        common: &TokenEventCommon,
        from_delegate: &str,
        to_delegate: &str,
        is_current: bool,
        power: &str,
    ) {
        if is_zero_address(to_delegate) {
            return;
        }
        let id = delegate_ref(from_delegate, to_delegate);
        let row = DelegateWrite {
            id: id.clone(),
            common: common.clone(),
            from_delegate: from_delegate.to_owned(),
            to_delegate: to_delegate.to_owned(),
            is_current,
            power: power.to_owned(),
        };
        self.delegates.insert(id, row);
    }

    fn apply_delegate_count_delta(
        &mut self,
        common: &TokenEventCommon,
        delegate: &str,
        all_delta: i64,
        effective_delta: i64,
    ) {
        if is_zero_address(delegate) {
            return;
        }
        let contributor = self.ensure_contributor(delegate, common);
        contributor.delegates_count_all = (contributor.delegates_count_all + all_delta).max(0);
        contributor.delegates_count_effective =
            (contributor.delegates_count_effective + effective_delta).max(0);
    }

    fn ensure_contributor(
        &mut self,
        account: &str,
        common: &TokenEventCommon,
    ) -> &mut ContributorWrite {
        self.contributors
            .entry(account.to_owned())
            .or_insert_with(|| {
                self.data_metric.member_count += 1;
                ContributorWrite {
                    id: account.to_owned(),
                    common: common.clone(),
                    last_vote_block_number: None,
                    last_vote_timestamp: None,
                    power: "0".to_owned(),
                    balance: None,
                    delegates_count_all: 0,
                    delegates_count_effective: 0,
                }
            })
    }

    fn find_rolling_match(
        &self,
        delegate: &str,
        delta: &str,
        transaction_hash: &str,
        before_log_index: u64,
    ) -> Option<(String, RollingSide)> {
        let mut rollings = self
            .delegate_rollings
            .values()
            .filter(|rolling| rolling.common.transaction_hash == transaction_hash)
            .filter(|rolling| rolling.common.log_index < before_log_index)
            .filter(|rolling| rolling.from_delegate != rolling.to_delegate)
            .cloned()
            .collect::<Vec<_>>();
        rollings.sort_by_key(|rolling| std::cmp::Reverse(rolling.common.log_index));

        let from = rollings
            .iter()
            .find(|rolling| rolling.from_delegate == delegate && rolling.from_new_votes.is_none());
        let to = rollings
            .iter()
            .find(|rolling| rolling.to_delegate == delegate && rolling.to_new_votes.is_none());

        if is_negative_decimal(delta) {
            from.map(|rolling| (rolling.id.clone(), RollingSide::From))
                .or_else(|| to.map(|rolling| (rolling.id.clone(), RollingSide::To)))
        } else {
            to.map(|rolling| (rolling.id.clone(), RollingSide::To))
                .or_else(|| from.map(|rolling| (rolling.id.clone(), RollingSide::From)))
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum RollingSide {
    From,
    To,
}

impl TokenProjectionOperation {
    fn id(&self) -> &str {
        match self {
            Self::DelegateChanged { id, .. }
            | Self::DelegateVotesChanged { id, .. }
            | Self::Transfer { id, .. } => id,
        }
    }
}

pub fn project_token_events(
    context: &TokenProjectionContext,
    events: Vec<TokenProjectionEvent>,
) -> Result<TokenProjectionBatch, TokenProjectionError> {
    let governor_address = normalize_identifier(&context.governor_address);
    let token_address = normalize_identifier(&context.token_address);
    let chain_id = validate_chain_ids(&events)?;
    let mut deduped: BTreeMap<String, TokenProjectionEvent> = BTreeMap::new();

    for event in events {
        if let DecodedTokenEvent::Transfer(transfer) = &event.event
            && transfer.standard != context.token_standard
        {
            return Err(TokenProjectionError::MismatchedTokenStandard {
                expected: context.token_standard,
                actual: transfer.standard,
                log_id: event.log.id,
            });
        }

        if let Some(stored) = deduped.get(&event.log.id) {
            if stored != &event {
                return Err(TokenProjectionError::ConflictingDuplicateLog {
                    log_id: event.log.id,
                });
            }
            continue;
        }
        deduped.insert(event.log.id.clone(), event);
    }

    let mut ordered = deduped.into_values().collect::<Vec<_>>();
    ordered.sort_by_key(|event| {
        (
            event.log.block_number,
            event.log.transaction_index,
            event.log.log_index,
            event.log.id.clone(),
        )
    });

    let mut event_order = Vec::new();
    let mut delegate_changed = Vec::new();
    let mut delegate_votes_changed = Vec::new();
    let mut token_transfers = Vec::new();
    let mut delegate_rollings = Vec::new();
    let mut operations = Vec::new();
    let mut reconcile_events = Vec::new();

    for input in ordered {
        event_order.push(input.log.id.clone());
        reconcile_events.push(PowerReconcileEvent {
            block_number: input.log.block_number,
            block_timestamp_ms: input.log.block_timestamp_ms,
            transaction_hash: normalize_identifier(&input.log.transaction_hash),
            transaction_index: input.log.transaction_index,
            log_index: input.log.log_index,
            event: DecodedDaoEvent::Token(input.event.clone()),
        });

        let common = common(context, &governor_address, &token_address, &input.log);
        match &input.event {
            DecodedTokenEvent::DelegateChanged(event) => {
                let row = delegate_changed_write(&input.log.id, common.clone(), event);
                let rolling = delegate_rolling_write(&row);
                operations.push(TokenProjectionOperation::DelegateChanged {
                    id: input.log.id.clone(),
                    common,
                    delegator: row.delegator.clone(),
                    from_delegate: row.from_delegate.clone(),
                    to_delegate: row.to_delegate.clone(),
                });
                delegate_rollings.push(rolling);
                delegate_changed.push(row);
            }
            DecodedTokenEvent::DelegateVotesChanged(event) => {
                let row = delegate_votes_changed_write(&input.log.id, common.clone(), event);
                operations.push(TokenProjectionOperation::DelegateVotesChanged {
                    id: input.log.id.clone(),
                    common,
                    delegate: row.delegate.clone(),
                    previous_votes: row.previous_votes.clone(),
                    new_votes: row.new_votes.clone(),
                });
                delegate_votes_changed.push(row);
            }
            DecodedTokenEvent::Transfer(event) => {
                let row = token_transfer_write(&input.log.id, common.clone(), event);
                operations.push(TokenProjectionOperation::Transfer {
                    id: input.log.id.clone(),
                    common,
                    from: row.from.clone(),
                    to: row.to.clone(),
                    value: row.value.clone(),
                    standard: event.standard,
                });
                token_transfers.push(row);
            }
        }
    }

    let reconcile_context = PowerReconcileContext {
        contract_set_id: context.contract_set_id.clone(),
        dao_code: context.dao_code.clone(),
        chain_id,
        contracts: context.contracts.clone(),
        from_block: context.from_block,
        to_block: context.to_block,
        target_height: context.target_height,
        read_plan_config: context.read_plan_config,
        current_power_method: context.current_power_method,
    };
    let reconcile_plan = plan_power_reconcile(&reconcile_context, &reconcile_events);

    Ok(TokenProjectionBatch {
        event_order,
        delegate_changed,
        delegate_votes_changed,
        token_transfers,
        delegate_rollings,
        operations,
        reconcile_plan,
    })
}

fn common(
    context: &TokenProjectionContext,
    governor_address: &str,
    token_address: &str,
    log: &NormalizedEvmLog,
) -> TokenEventCommon {
    TokenEventCommon {
        contract_set_id: context.contract_set_id.clone(),
        chain_id: log.chain_id,
        dao_code: context.dao_code.clone(),
        governor_address: governor_address.to_owned(),
        token_address: token_address.to_owned(),
        contract_address: normalize_identifier(&log.address),
        log_index: log.log_index,
        transaction_index: log.transaction_index,
        block_number: log.block_number.to_string(),
        block_timestamp: log
            .block_timestamp_ms
            .map(|timestamp| (timestamp / 1_000).to_string()),
        transaction_hash: normalize_identifier(&log.transaction_hash),
    }
}

fn delegate_changed_write(
    log_id: &str,
    common: TokenEventCommon,
    event: &DelegateChangedEvent,
) -> DelegateChangedWrite {
    DelegateChangedWrite {
        id: log_id.to_owned(),
        common,
        delegator: normalize_identifier(&event.delegator),
        from_delegate: normalize_identifier(&event.from_delegate),
        to_delegate: normalize_identifier(&event.to_delegate),
    }
}

fn delegate_votes_changed_write(
    log_id: &str,
    common: TokenEventCommon,
    event: &DelegateVotesChangedEvent,
) -> DelegateVotesChangedWrite {
    DelegateVotesChangedWrite {
        id: log_id.to_owned(),
        common,
        delegate: normalize_identifier(&event.delegate),
        previous_votes: normalize_decimal(&event.previous_votes),
        new_votes: normalize_decimal(&event.new_votes),
    }
}

fn token_transfer_write(
    log_id: &str,
    common: TokenEventCommon,
    event: &TokenTransferEvent,
) -> TokenTransferWrite {
    TokenTransferWrite {
        id: log_id.to_owned(),
        common,
        from: normalize_identifier(&event.from),
        to: normalize_identifier(&event.to),
        value: normalize_decimal(&event.value),
        standard: token_standard_label(event.standard).to_owned(),
    }
}

fn delegate_rolling_write(row: &DelegateChangedWrite) -> DelegateRollingWrite {
    DelegateRollingWrite {
        id: row.id.clone(),
        common: row.common.clone(),
        delegator: row.delegator.clone(),
        from_delegate: row.from_delegate.clone(),
        to_delegate: row.to_delegate.clone(),
        from_previous_votes: None,
        from_new_votes: None,
        to_previous_votes: None,
        to_new_votes: None,
    }
}

fn validate_chain_ids(events: &[TokenProjectionEvent]) -> Result<i32, TokenProjectionError> {
    let Some(first) = events.first() else {
        return Ok(0);
    };
    for event in events.iter().skip(1) {
        if event.log.chain_id != first.log.chain_id {
            return Err(TokenProjectionError::MixedChainIds {
                expected: first.log.chain_id,
                actual: event.log.chain_id,
                log_id: event.log.id.clone(),
            });
        }
    }
    Ok(first.log.chain_id)
}

fn token_standard_label(standard: GovernanceTokenStandard) -> &'static str {
    match standard {
        GovernanceTokenStandard::Erc20 => "erc20",
        GovernanceTokenStandard::Erc721 => "erc721",
    }
}

fn transfer_units(value: &str, standard: GovernanceTokenStandard) -> String {
    match standard {
        GovernanceTokenStandard::Erc20 => normalize_decimal(value),
        GovernanceTokenStandard::Erc721 => "1".to_owned(),
    }
}

fn delegate_ref(from_delegate: &str, to_delegate: &str) -> String {
    format!("{from_delegate}_{to_delegate}")
}

fn zero_address() -> &'static str {
    "0x0000000000000000000000000000000000000000"
}

fn is_zero_address(account: &str) -> bool {
    normalize_identifier(account) == zero_address()
}

fn normalize_identifier(value: &str) -> String {
    value.to_ascii_lowercase()
}

fn extend_map<T: Clone>(target: &mut BTreeMap<String, T>, rows: &[T], key: impl Fn(&T) -> String) {
    for row in rows {
        target.insert(key(row), row.clone());
    }
}

fn normalize_decimal(value: &str) -> String {
    let trimmed = value.trim_start_matches('0');
    if trimmed.is_empty() {
        "0".to_owned()
    } else {
        trimmed.to_owned()
    }
}

fn is_nonzero_decimal(value: &str) -> bool {
    normalize_decimal(value) != "0"
}

fn is_negative_decimal(value: &str) -> bool {
    value.starts_with('-') && is_nonzero_decimal(value.trim_start_matches('-'))
}

fn apply_signed_decimal(current: &str, delta: &str) -> String {
    if let Some(delta) = delta.strip_prefix('-') {
        subtract_decimal_strings(current, delta)
    } else {
        add_decimal_strings(current, delta)
    }
}

fn subtract_decimal_signed(left: &str, right: &str) -> String {
    match compare_decimal_strings(left, right) {
        Ordering::Less => format!("-{}", subtract_decimal_strings(right, left)),
        Ordering::Equal => "0".to_owned(),
        Ordering::Greater => subtract_decimal_strings(left, right),
    }
}

fn add_decimal_strings(left: &str, right: &str) -> String {
    let mut carry = 0u8;
    let mut output = Vec::new();
    let mut left = left.as_bytes().iter().rev();
    let mut right = right.as_bytes().iter().rev();

    loop {
        let left_digit = left.next().map(|digit| digit - b'0');
        let right_digit = right.next().map(|digit| digit - b'0');
        if left_digit.is_none() && right_digit.is_none() && carry == 0 {
            break;
        }
        let sum = left_digit.unwrap_or_default() + right_digit.unwrap_or_default() + carry;
        output.push(b'0' + (sum % 10));
        carry = sum / 10;
    }

    output.reverse();
    normalize_decimal(&String::from_utf8(output).expect("decimal digits"))
}

fn subtract_decimal_strings(left: &str, right: &str) -> String {
    if compare_decimal_strings(left, right) == Ordering::Less {
        return "0".to_owned();
    }

    let mut borrow = 0i16;
    let mut output = Vec::new();
    let mut left = left.as_bytes().iter().rev();
    let mut right = right.as_bytes().iter().rev();

    while let Some(left_digit) = left.next().map(|digit| (digit - b'0') as i16) {
        let right_digit = right
            .next()
            .map(|digit| (digit - b'0') as i16)
            .unwrap_or_default();
        let mut diff = left_digit - borrow - right_digit;
        if diff < 0 {
            diff += 10;
            borrow = 1;
        } else {
            borrow = 0;
        }
        output.push(b'0' + diff as u8);
    }

    output.reverse();
    normalize_decimal(&String::from_utf8(output).expect("decimal digits"))
}

fn compare_decimal_strings(left: &str, right: &str) -> Ordering {
    let left = normalize_decimal(left.trim_start_matches('-'));
    let right = normalize_decimal(right.trim_start_matches('-'));
    left.len()
        .cmp(&right.len())
        .then_with(|| left.as_str().cmp(right.as_str()))
}
