# OHH-28 OpenZeppelin Governor Indexing Research

This document captures the parts of OHH-28 that directly shape the current
`degov` indexer implementation and future upgrades.

## Why this research matters

OHH-28 established the correctness rules for indexing OpenZeppelin Governor
contracts:

- proposal state is only partially event-driven
- vote power must be read at the Governor snapshot timepoint
- timelock state and AccessControl history are required for a complete
  execution view
- reconciliation against contract views is required when correctness matters
  more than ingestion speed alone

The current OHH-32 to OHH-38 branch applies those conclusions in code. This
document keeps the high-signal parts of that research inside the repository.

## Contract families that matter

| Contract family | Why it matters to the indexer |
| --- | --- |
| `Governor` / `IGovernor` | Defines proposal creation, voting, queuing, execution, cancellation, and derived proposal state. |
| `GovernorVotes` / `GovernorVotesComp` | Defines how proposal snapshot vote power is resolved from `IVotes`. |
| `GovernorCountingSimple` | Defines `Against`, `For`, and `Abstain` semantics. |
| `GovernorVotesQuorumFraction` | Defines quorum as a snapshot-time calculation, not a live vote total. |
| `GovernorSettings` | Adds mutable governance parameters such as voting delay, voting period, and proposal threshold. |
| `GovernorPreventLateQuorum` | Allows `proposalDeadline` to move when quorum arrives late. |
| `GovernorTimelockControl` / `GovernorTimelockCompound` | Adds queue, execute, cancel, and expiry paths that are not visible from Governor events alone. |
| `TimelockController` | Emits the low-level scheduling and execution events needed to explain queued proposals. |
| `AccessControl` | Emits the role history needed to explain who can queue, execute, or cancel. |
| `Votes`, `ERC20Votes`, `ERC20VotesComp`, `ERC721Votes`, `IVotes` | Define delegation edges, checkpoint history, and historical vote-power lookups. |

## Proposal state model

OpenZeppelin Governor uses these canonical states:

| State | Important indexing note |
| --- | --- |
| `Pending` | Derived from `ProposalCreated` plus the snapshot start timepoint. |
| `Active` | Derived from time progression, not a dedicated event. |
| `Canceled` | Can come from Governor or timelock cancellation paths. |
| `Defeated` | Derived after deadline when quorum or vote outcome fails. |
| `Succeeded` | Derived after deadline when quorum and vote outcome pass. |
| `Queued` | Only appears when a timelock extension is present. |
| `Expired` | Only appears for timelock variants that have a grace-period expiry model. |
| `Executed` | Final execution state. |

The key conclusion is that the indexer cannot treat emitted events as the whole
state machine. Some transitions only become visible when time moves forward or
when a contract view is queried.

## Event groups to index

### Governor proposal events

- `ProposalCreated`
- `ProposalCanceled`
- `ProposalExecuted`
- `ProposalQueued`
- `ProposalExtended`
- `VoteCast`
- `VoteCastWithParams`

### Governance parameter events

- `VotingDelaySet`
- `VotingPeriodSet`
- `ProposalThresholdSet`
- `QuorumNumeratorUpdated`
- `LateQuorumVoteExtensionSet`
- `TimelockChange`

### Vote-power and delegation events

- `DelegateChanged`
- `DelegateVotesChanged`
- token `Transfer` events for the voting token

### Timelock and role events

- `CallScheduled`
- `CallExecuted`
- `Cancelled`
- `CallSalt`
- `MinDelayChange`
- `RoleGranted`
- `RoleRevoked`
- `RoleAdminChanged`

## Vote-power correctness rules

OHH-28 established a few rules that the indexer must not violate:

1. Use proposal snapshot vote power, not current balance.
2. Use `getPastVotes(snapshot)` or `getPriorVotes(snapshot)` semantics, not
   live vote totals.
3. Track `DelegateChanged` and `DelegateVotesChanged` together.
4. Track token transfers because voting units can move even when delegation
   edges do not.
5. Do not derive quorum from delegated vote totals; quorum is based on the
   snapshot supply calculation.
6. Treat same-timepoint checkpoint merges carefully when materializing
   historical vote-power tables.

These rules directly explain why the current schema includes vote-power
checkpoints and transfer history alongside raw voting events.

## Timelock and execution-path conclusions

For complete proposal visualization, the indexer must combine Governor data with
timelock data:

- `ProposalQueued` alone is not enough to explain queued execution state.
- `CallScheduled` and `CallExecuted` expose the actual execution payload and
  timing.
- role events explain which accounts can administer, queue, execute, or cancel.
- timelock cancellations can affect proposal state even when no new Governor
  event is emitted.

## How the current implementation reflects OHH-28

The integrated PR #567 branch applies the research in four concrete ways:

1. Proposal indexing is additive and scoped by chain and governor identity.
2. Vote-power history is materialized through checkpoint-style entities.
3. Timelock and AccessControl events are indexed together with Governor events.
4. Replay and reconciliation tooling exists so proposal state and vote-power
   projections can be checked against on-chain views.

## Practical guidance for future changes

When modifying the indexer, treat these as non-negotiable:

- preserve scoped entity keys
- keep raw event ingestion and derived projections conceptually separate
- validate proposal state against contract views when changing handler logic
- validate vote-power projections against historical vote APIs when changing
  token indexing logic
- include timelock data whenever changing queue or execution-related behavior

## Source trail

- OHH-28 Linear research comment
- PR #567 integration summary and validation notes
- current `packages/indexer` handler, schema, replay, and reconciliation code
