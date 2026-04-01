# Indexer Accuracy Round 02

## Context

- Follow-up after [20260331__indexer_accuracy_round_01.md](/code/helixbox/degov/docs/research/20260331__indexer_accuracy_round_01.md)
- Remaining local ENS anomalies before this round:
  - `5` negative current `Delegate` rows
  - `3` negative `Contributor` rows
- Goal of this round:
  - diagnose every remaining ENS anomaly, not a sample subset
  - determine whether these are new families or the same unresolved family
  - patch the handler and the diagnosis path so future runs can identify the same issue directly

## Remaining ENS anomalies diagnosed in this round

Negative current `Delegate` rows:

- `0x05fc40a28465eeae9bcdc4ba80046dbe10c95af6 -> 0x4aa5d5059aeb7d2796ae887081917160c0cadf66`
- `0x6767a09b76bc449a8b632b5a8c15939fcbf6bbb9 -> 0xe52c39327ff7576baec3dbfef0787bd62db6d726`
- `0x8fe48f229d1e9765207885d4b301188189c98bd7 -> 0x1208a26faa0f4ac65b42098419eb4daa5e580ac6`
- `0x9957800be665d7fa7b179da8878375c21c4af558 -> 0x035ebd096afa6b98372494c7f08f3402324117d3`
- `0x9aff567f556e3ba1c7b3cb239fff6e79a6f1b266 -> 0xa7860e99e3ce0752d1ac53b974e309fff80277c6`

Negative contributors:

- `0x1208a26faa0f4ac65b42098419eb4daa5e580ac6`
- `0x4aa5d5059aeb7d2796ae887081917160c0cadf66`
- `0x7cda10f1c4e11d9c536009e43f141743d11f2fed`

## Classification result

These `8` anomalies are not a new broad set of unrelated bugs.

They all reduce to one remaining tx-local family:

1. same delegator performs `DelegateChanged(0 -> old)`
2. same tx contains an incoming `Transfer` to the delegator
3. same delegator then performs `DelegateChanged(old -> new)`
4. the tx emits:
   - `old +delta`
   - `old -delta`
   - `new +delta`

Representative creation transactions:

- `0x476e3cdb61cd46961395ab4c635cbabc787e3b560aaf728827de226a9a2c75e3`
- `0xfcd94a373ba9eff6f7a7de65123226696a998fcd8535b85a6226de1d2f92005c`
- `0x50b3d94af83afc1c5ac9afefac8b27e290c44976646f4e15e662488c6e26a4da`
- `0xa9a2d0fa2d00d4f45d62e276d1c148dd0ffbfaa6a553b2a2989168d6f8a625a1`

## Root cause

The remaining bug was in the `match.side === "to"` branch of `TokenHandler.updateDelegateRolling()`.

Before this round:

- if a transfer touched the delegator, the handler still treated that transfer delta as belonging to the **current** `to-side` rolling unless a later chained redelegation was detected
- that logic was still too coarse for the real chain order:
  - the first leg `0 -> old` already had its exact relation materialized by `Transfer`
  - the second leg `old -> new` should **not** subtract that same transfer delta again

This produced two bad outcomes:

1. old leg double-count
   - `Transfer` materialized `0 -> old`
   - the later `old +delta` `DelegateVotesChanged` was also applied
   - old delegate power stayed too high until the later `old -delta`

2. new leg under-count
   - the `new +delta` `DelegateVotesChanged` incorrectly subtracted the same transfer delta
   - the new current relation started at `0` instead of the transferred balance
   - later ordinary transfer-out events drove the current relation negative

The `0x7cda...` negative contributor is the same family, not a separate one:

- its initial `0 -> old -> new` creation tx never credited the new delegate correctly
- later redelegation away from that delegate only subtracted the remaining visible power
- the contributor aggregate therefore drifted negative even though no current negative delegate row remained

## Fix

Changed file:

- `packages/indexer/src/handler/token.ts`

Implemented changes:

1. add `hasEarlierRollingForDelegator()`
   - detects when the current rolling is the second leg of a same-tx chained redelegation for the same delegator

2. tighten `delegate-change-transfer-only-delta` skip logic
   - skip only when:
     - transfer touches the delegator
     - there is no earlier from-side vote delta for this rolling
     - and there is no earlier rolling for the same delegator
   - this keeps the first `old +delta` classified as transfer-only
   - but stops swallowing the second `new +delta`

3. tighten transfer-delta subtraction
   - subtract transfer delta from a `to-side` relation only when there is no earlier rolling for the same delegator
   - this prevents the second leg `old -> new` from reusing the transfer delta that belonged to the first leg

4. fix `VotePowerCheckpoint` rolling attribution
   - `storeVotePowerCheckpoint()` no longer uses `delegateRollings[0]`
   - it now reuses the same sign-aware rolling matcher as relation materialization
   - this makes diagnosis output reflect the actual matched rolling instead of the first rolling in the tx

## Why this should cover all 8 remaining anomalies

For the `5` negative current delegate rows:

- each had a creation tx with the same `0 -> old`, transfer-in, `old -> new` shape
- each later showed normal transfer-out activity from the delegator
- once the second leg starts at the correct positive power, later transfer-out will reduce it back to `0` instead of crossing below `0`

For the `3` negative contributors:

- `0x1208...` and `0x4aa5...` are direct consequences of the negative current mapping family
- `0x7cda...` comes from the same creation-tx family, but its bad state survived as contributor drift after later redelegation removed the visible current edge
- once the second leg is correctly materialized, contributor totals stay balanced across the old and new delegates

## Regression coverage

Changed file:

- `packages/indexer/__tests__/token-vote-power.test.ts`

Added or updated regression coverage:

- `matches same-tx zero-to-old and old-to-new vote deltas by delta sign`
  - updated to use the real log order instead of invoking log `3` before log `2`
- `keeps the second leg of a transfer-backed chained redelegation when logs are processed in order`
  - covers the actual tx order seen in the ENS failures
  - validates:
    - old relation returns to `0`
    - new current relation is initialized with the transferred balance
    - contributor totals end at `old=0`, `new=+delta`

## Validation results

Commands run:

- `npx -y yarn@1.22.22 test __tests__/token-vote-power.test.ts __tests__/indexerAccuracyDiagnose.test.ts`
- `npx -y yarn@1.22.22 build`

Results:

- `34/34` tests passed
- build passed

## Remaining end-to-end status

This round fixes the remaining local ENS anomaly family at the handler level and adds regression coverage for the exact tx shape that was still missing.

End-to-end final audit recheck is still pending a clean full replay to chain head on a reliable RPC source.

That final verification step remains:

1. replay `ens-dao` from an empty database to chain head
2. run the accuracy audit
3. re-run address diagnosis only if audit still reports anomalies
