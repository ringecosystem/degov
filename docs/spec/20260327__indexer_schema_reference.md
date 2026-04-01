# DeGov Indexer Schema Reference

This document explains what each entity in
`packages/indexer/schema.graphql` represents, how it is populated, and which
query shape it is intended to support.

## How to read the schema

The schema mixes three kinds of entities:

- Append-only raw event tables that mirror on-chain logs one row per event.
- Derived projection tables that reshape raw logs into proposal or timelock
  timelines.
- Mutable snapshot tables that represent current state and are updated in
  place as later logs arrive.

The distinction matters for product queries. OHH-76 came from mixing a snapshot
query with a power-bearing projection query:

- `Contributor.delegatesCountAll` and `DelegateMapping` represent the current
  active delegator mapping for a delegate.
- `Delegate` represents effective non-zero power edges after applying vote-power
  deltas, so it can be smaller than the current active delegator count.

For Seamless DAO received delegations, the correct source of truth is:

- received delegation count: `Contributor.delegatesCountAll`
- received delegation list: `delegateMappings` / `delegateMappingsConnection`
- historical delegation changes: `DelegateChanged` and `DelegateRolling`
- effective power-bearing delegate edges: `delegates` / `Delegate`

## Vote power and delegation entities

### Raw ivotes events

| Entity | Populated by | Meaning | Typical use |
| --- | --- | --- | --- |
| `DelegateChanged` | `TokenHandler.storeDelegateChanged` | Append-only record of each `DelegateChanged` token event. | Audit who changed delegation at a given block/tx. |
| `DelegateVotesChanged` | `TokenHandler.storeDelegateVotesChanged` | Append-only record of vote-power changes emitted by the token. | Audit a delegate's power deltas from chain logs. |
| `TokenTransfer` | `TokenHandler.storeTokenTransfer` | Append-only record of ERC20/ERC721 transfers that can change voting units. | Explain why vote power moved without a delegation change. |
| `VotePowerCheckpoint` | `TokenHandler.storeVotePowerCheckpoint` | Timepoint-normalized checkpoint for an account's voting power, annotated with cause and related delegator/delegate fields when known. | Query vote power over time for reconciliation or UI charts. |

### Snapshot and rollup entities

| Entity | Populated by | Meaning | Typical use |
| --- | --- | --- | --- |
| `DelegateRolling` | `TokenHandler.storeDelegateChanged` and `TokenHandler.updateDelegateRolling` | Per-transaction working record that binds a delegation change to the later `DelegateVotesChanged` events in the same tx. | Debug how a delegate change affected both sides of the transfer. |
| `Delegate` | `TokenHandler.storeDelegate` | Mutable effective edge from `fromDelegate` to `toDelegate` with current non-zero delegated power. Zero-power edges are removed. | Query current effective power-bearing delegate edges. |
| `Contributor` | `TokenHandler.storeContributor` and `TokenHandler.storeDelegateChanged` | Mutable per-account snapshot for current voting power and delegator counters. | Query current members/delegates and headline counts. |
| `DelegateMapping` | `TokenHandler.storeDelegateChanged` and `TokenHandler.storeDelegate` | Mutable one-row-per-delegator snapshot of the delegator's current active delegate and current delegated power. Undelegation removes the row. | Query current received delegations or a wallet's latest delegate. |

## Governor event entities

These entities mirror OpenZeppelin Governor logs directly.

| Entity | Populated by | Meaning | Typical use |
| --- | --- | --- | --- |
| `ProposalCreated` | `GovernorHandler.storeProposalCreated` | Raw `ProposalCreated` log, including calldata arrays and vote bounds. | Audit the original proposal creation payload. |
| `ProposalQueued` | `GovernorHandler.storeProposalQueued` | Raw `ProposalQueued` log with ETA. | Audit when a proposal entered the queue. |
| `ProposalExtended` | `GovernorHandler.storeProposalExtended` | Raw `ProposalExtended` log with the new deadline. | Audit late-quorum deadline changes. |
| `ProposalExecuted` | `GovernorHandler.storeProposalExecuted` | Raw `ProposalExecuted` log. | Audit execution events independently of projections. |
| `ProposalCanceled` | `GovernorHandler.storeProposalCanceled` | Raw `ProposalCanceled` log. | Audit cancellations independently of projections. |
| `VotingDelaySet` | `GovernorHandler.storeVotingDelaySet` | Raw parameter change event for voting delay. | Inspect exact delay change logs. |
| `VotingPeriodSet` | `GovernorHandler.storeVotingPeriodSet` | Raw parameter change event for voting period. | Inspect exact period change logs. |
| `ProposalThresholdSet` | `GovernorHandler.storeProposalThresholdSet` | Raw parameter change event for proposal threshold. | Inspect threshold history from source logs. |
| `QuorumNumeratorUpdated` | `GovernorHandler.storeQuorumNumeratorUpdated` | Raw parameter change event for quorum numerator. | Inspect quorum numerator changes. |
| `LateQuorumVoteExtensionSet` | `GovernorHandler.storeLateQuorumVoteExtensionSet` | Raw parameter change event for late quorum extension. | Inspect anti-sniping configuration changes. |
| `TimelockChange` | `GovernorHandler.storeTimelockChange` | Raw governor timelock pointer change. | Audit which timelock a governor pointed to at a block. |
| `VoteCast` | `GovernorHandler.storeVoteCast` | Raw vote without extra params. | Audit votes for governors that use the basic cast path. |
| `VoteCastWithParams` | `GovernorHandler.storeVoteCastWithParams` | Raw vote with params bytes. | Audit votes for governors that emit parameterized votes. |

## Proposal projection entities

These entities reshape the raw governor events into query-friendly proposal
state.

| Entity | Populated by | Meaning | Typical use |
| --- | --- | --- | --- |
| `Proposal` | `GovernorHandler.storeProposalCreated` plus later queue/extend/execute updates | Canonical proposal record enriched with title, timestamps, quorum, timelock metadata, and aggregate vote metrics. | Primary proposal query surface for the app. |
| `ProposalAction` | `GovernorHandler.storeProposalActions` | One row per action in a proposal payload. | Render proposal actions without reparsing arrays client-side. |
| `ProposalStateEpoch` | `GovernorHandler.storeInitialProposalStateEpochs`, `GovernorHandler.storeProposalStateEpoch`, and `TimelockHandler.ensureProposalStateEpoch` | Timeline segments for proposal states such as `Pending`, `Active`, `Queued`, `Executed`, or `Canceled`. | Reconstruct proposal lifecycle over time. |
| `VoteCastGroup` | `GovernorHandler.storeVoteCast` and `GovernorHandler.storeVoteCastWithParams` | Normalized vote record that unifies both vote event variants under one query shape linked to `Proposal`. | Render proposal voters without caring which raw event variant fired. |
| `GovernanceParameterCheckpoint` | `GovernorHandler.storeGovernanceParameterCheckpoint` | Normalized checkpoint for governor parameter changes with event name, parameter name, and value type. | Query configuration history without joining multiple raw tables. |
| `ProposalDeadlineExtension` | `GovernorHandler.storeProposalExtended` | Projection row for each deadline extension, storing previous and new deadlines. | Explain why a proposal stayed active longer than expected. |

## Timelock entities

These entities model timelock state beyond the raw governor queue/execution
events.

| Entity | Populated by | Meaning | Typical use |
| --- | --- | --- | --- |
| `TimelockOperation` | `GovernorHandler` queue sync helpers and `TimelockHandler.findOrCreateOperation` | Current state of a timelock operation, including proposal linkage, readiness window, call counts, and execution/cancel timestamps. | Query queue/execution status for a proposal or operation id. |
| `TimelockCall` | `GovernorHandler` queue sync helpers and `TimelockHandler.storeCallScheduled` / `storeCallExecuted` | Per-call breakdown inside a timelock operation, optionally linked back to a proposal action. | Render scheduled or executed calls for queued proposals. |
| `TimelockRoleEvent` | `TimelockHandler.storeRoleGranted`, `storeRoleRevoked`, `storeRoleAdminChanged` | Append-only AccessControl event log for the timelock. | Audit proposer/executor/admin role changes. |
| `TimelockMinDelayChange` | `TimelockHandler.storeMinDelayChange` | Append-only timelock minimum delay change log. | Audit queue delay policy changes over time. |

## Global metrics

| Entity | Populated by | Meaning | Typical use |
| --- | --- | --- | --- |
| `DataMetric` | `GovernorHandler.storeGlobalDataMetric`, `TokenHandler.storeDelegate`, and contributor-count helpers | Global aggregate counters and sums for proposals, votes, members, and voting power. | Lightweight system-wide stats on overview screens or health checks. |

## Query guidance

Use the following heuristics when adding or reviewing product queries:

- Choose raw event tables when the user needs an immutable audit trail.
- Choose projection tables when the UI needs proposal or timelock semantics
  rather than raw log shapes.
- Choose snapshot tables when the UI needs the latest current state.
- For delegate counts, confirm whether the product wants active mappings or
  effective non-zero power edges before picking `DelegateMapping` versus
  `Delegate`.

For delegation-specific reads:

- `delegatesCountAll` means how many delegators currently point at this
  delegate, even if some mappings do not currently contribute non-zero power.
- `delegatesCountEffective` tracks how many effective non-zero `Delegate` edges
  currently point at this delegate.
- `delegateMappingsConnection.totalCount` should match
  `Contributor.delegatesCountAll` for the same delegate.
- `delegatesConnection.totalCount` is expected to diverge when some active
  delegators have zero effective delegated power.
