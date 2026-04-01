# DeGov Indexer Accuracy Research

This document consolidates the ENS and multi-DAO accuracy debugging work that
previously lived in several round-by-round notes.

Use this file as the current research summary for indexer data-accuracy bugs.

## Scope

The recent accuracy work focused on:

- `ens-dao`
- `seamless-dao`
- `ring-dao`

The dominant class of bugs was not frontend rendering.
It was incorrect materialization of current delegation relations inside the
indexer when same-transaction token transfers and delegation changes interacted.

## Main bug families

### Family 1: missing optional governance reads should not kill the processor

Symptom:

- timelock `GRACE_PERIOD()` reverted on some DAOs
- processor retried RPCs and then exited

Root cause:

- optional contract reads were not classifying some wrapped revert messages as
  “function unavailable”

Fix summary:

- broaden missing-function error recognition in chaintool optional reads

### Family 2: no-op delegate changes polluted relation state

Symptom:

- current relation power became negative after later transfers
- examples included `DelegateChanged(A -> A)` no-op rows

Root cause:

- no-op delegate changes still mutated relation aggregates and mapping state

Fix summary:

- no-op `DelegateChanged` now records history only
- it no longer rewrites current relation aggregates

### Family 3: batch flush revived deleted or zeroed relation state

Symptom:

- undelegated mappings or zero-power rows reappeared after batch flush

Root cause:

- dirty caches still contained removed entities

Fix summary:

- forgetting a mapping or delegate now also clears the dirty-cache copy

### Family 4: address normalization mismatch

Symptom:

- `DelegateChanged` and `DelegateVotesChanged` within the same logical path
  failed to match
- historical relations or contributor totals drifted

Root cause:

- some relation fields were stored or compared with checksum casing while later
  matching used lowercase normalized addresses

Fix summary:

- all relation-critical addresses are normalized before persistence and before
  matching

### Family 5: same-tx `DelegateChanged + Transfer + DelegateVotesChanged`
double-counted relations

Symptom:

- current relation power became too high
- delegate list and detail page diverged

Root cause:

- transfer-backed relation updates and aggregate vote-delta updates both
  materialized the same edge

Fix summary:

- if the same transaction already has a transfer-backed exact relation for the
  same delegator side, the aggregate vote path no longer re-adds it

### Family 6: current `Delegate` drifted from `DelegateMapping`

Symptom:

- `DelegateMapping.power` was correct, but current `Delegate.power` was
  negative or stale

Root cause:

- current `Delegate` behaved like an independent aggregate instead of a
  materialized view of the current mapping

Fix summary:

- current `Delegate` now synchronizes to `DelegateMapping.power`
- contributor and metric aggregates use corrective deltas only in the narrow
  synchronization case

### Family 7: chained redelegation in a single transaction

Canonical shape:

1. `DelegateChanged(0 -> old)`
2. incoming `Transfer`
3. `DelegateChanged(old -> new)`
4. same-tx `DelegateVotesChanged` sequence:
   - `old +delta`
   - `old -delta`
   - `new +delta`

Observed bad outcomes before the fixes:

- old relation double-counted
- new relation initialized at `0`
- later normal transfer-out pushed the new current edge negative
- contributor totals drifted

Fix summary:

- rolling match is sign-aware
- same-tx rolling match respects the delegator and event ordering
- transfer-only skip logic only applies when there is no earlier old-side vote
  delta and no earlier same-delegator rolling
- to-side transfer-delta subtraction only applies in real transfer-only cases
  and no longer undercounts redelegation-to-new
- vote-power checkpoints use the same rolling matcher instead of “first rolling
  in transaction”

## Operational note: near-head RPC freshness

At chain head, `ens-dao` may still restart because the selected RPC upstream
temporarily does not serve the newest recent blocks.

This is an operational stability issue, not a historical indexing correctness
issue.

The separate stabilization plan is tracked in:

- [20260401__ens_indexer_head_rpc_restart_plan.md](/code/helixbox/abyss/daily/plan/20260401__ens_indexer_head_rpc_restart_plan.md)

## How to validate accuracy now

### Address diagnosis

From `packages/indexer`:

```bash
just diagnose-address 0x983110309620d911731ac0932219af06091b6744 ens-dao
```

This compares:

- indexer `Contributor.power`
- on-chain `getVotes(address)`
- current incoming `DelegateMapping`
- on-chain `balanceOf(from)` and `delegates(from)`

### Targeted local replay

```bash
just verify-range https://api.degov.ai/dao/config/ens-dao 23733020 23733040
```

Then inspect local results with:

```bash
just verify-sample <delegator> <delegate>
just verify-negative-current 20
```

### Full audit

```bash
yarn run audit:accuracy
```

Or through `just`:

```bash
just audit-accuracy
```

## Related docs

- [20260325__indexer_developer_guide.md](/code/helixbox/degov/docs/guides/20260325__indexer_developer_guide.md)
- [20260331__indexer_accuracy_diagnosis.md](/code/helixbox/degov/docs/guides/20260331__indexer_accuracy_diagnosis.md)
- [20260325__indexer_architecture.md](/code/helixbox/degov/docs/architecture/20260325__indexer_architecture.md)
