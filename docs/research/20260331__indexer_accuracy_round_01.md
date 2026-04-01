# Indexer Accuracy Round 01

## Context

- Audit report: `https://paste.rs/BdmXp`
- Generated at: `2026-03-31T16:08:36.095Z`
- Scope of this round:
  - diagnose every ENS anomaly from the report
  - start a local `ens-dao` full replay in the background
  - fix the root causes before validating against the local replay and live diagnosis scripts

## ENS anomaly families found in this round

### Family A: current mapping becomes negative after same-tx chained redelegation

Affected ENS samples from the audit:

- `0xa7860e99e3ce0752d1ac53b974e309fff80277c6`
- `0xe52c39327ff7576baec3dbfef0787bd62db6d726`
- `0x035ebd096afa6b98372494c7f08f3402324117d3`
- `0x4aa5d5059aeb7d2796ae887081917160c0cadf66`
- `0x1208a26faa0f4ac65b42098419eb4daa5e580ac6`

Shared transaction shape:

1. same delegator performs `DelegateChanged(0 -> old)`
2. same tx contains an incoming `Transfer` to the delegator
3. same delegator then performs `DelegateChanged(old -> new)`
4. the tx emits three `DelegateVotesChanged` rows:
   - `old +delta`
   - `old -delta`
   - `new +delta`

Root cause:

- `TokenHandler.findBestDelegateRollingMatch()` matched `DelegateVotesChanged` only by delegate address.
- It always preferred `from` side before `to` side.
- For the first `old +delta`, the handler incorrectly matched the later `old -> new` rolling as a `from` side update, which is semantically impossible for a positive delta in this tx shape.
- That poisoned the materialized relation and later left a negative `DelegateMapping` / current `Delegate`.

Fix:

- make rolling side selection sign-aware:
  - positive delta prefers `to` side
  - negative delta prefers `from` side
  - fallback to the old order only when sign does not disambiguate

### Family B: contributor aggregate drifts even when current mappings are already correct

Affected ENS samples from the audit:

- `0x809fa673fe2ab515faa168259cb14e2bedebf68e`
- `0x54becc7560a7be76d72ed76a1f5fee6c5a2a7ab6`
- `0x2b888954421b424c5d3d9ce9bb67c9bd47537d12`
- `0x8787fc2de4de95c53e5e3a4e5459247d9773ea52`
- `0x1f3d3a7a9c548be39539b39d7400302753e20591`
- `0x7cda10f1c4e11d9c536009e43f141743d11f2fed`

Observed shape:

- current `DelegateMapping` rows are already correct or empty
- current `Delegate` rows are also correct for the spot-checked addresses
- but `Contributor.power` is lower than chain votes

Root cause:

- `storeDelegate()` already resynchronized the current `Delegate` row from `DelegateMapping`
- but `Contributor.power` and `DataMetric.powerSum` still used the raw event delta (`currentDelegate.power`)
- when the final synchronized relation power differed from the raw event delta, contributor and metrics were left behind

Fix:

- update contributor and metric aggregates from the **effective net change** of the relation row:
  - `finalRelationPower - previousRelationPower`
- derive `delegatesCountEffective` from zero/non-zero transitions of the final relation row instead of the raw event delta

## Validation plan for this round

1. Add regression tests for Family A and Family B.
2. Run `npx -y yarn@1.22.22 test __tests__/token-vote-power.test.ts`.
3. Run `npx -y yarn@1.22.22 build`.
4. Keep the local `ens-dao` replay running with `just smart-start-force`.
5. After the local replay advances, re-run address diagnosis against the known ENS samples.

## Implemented in this round

Changed files:

- `packages/indexer/src/handler/token.ts`
- `packages/indexer/__tests__/token-vote-power.test.ts`

Code changes:

- `findBestDelegateRollingMatch()` now uses the vote delta sign to choose the correct rolling side:
  - positive delta prefers `to`
  - negative delta prefers `from`
- added `hasLaterRollingFromTarget()` to detect chained same-tx redelegation:
  - `0 -> old`
  - `old -> new`
- tightened the `delegate-change-transfer-only-delta` skip rule so it does not swallow the first leg of chained redelegation
- tightened the transfer-delta subtraction rule so the first `old +delta` in chained redelegation is not collapsed to `0`
- changed contributor and metric updates to apply the corrective delta only when:
  - the current relation is resynchronized from `DelegateMapping`
  - and the raw event delta is `0`
- kept the previous aggregate behavior for ordinary transfer / redelegation paths so existing relation totals are not amplified by stale historical rows

## Regression coverage added or validated

Validated tests:

- `updates contributor aggregates from the final synchronized relation delta`
- `matches same-tx zero-to-old and old-to-new vote deltas by delta sign`
- existing regression coverage for:
  - `does not let a zero-to-delegate transaction-local vote delta override the exact transfer-backed relation`
  - `does not subtract another delegator's same-tx vote delta from a transfer-backed relation`
  - `does not leave transfer-only power behind after a redelegation plus same-tx incoming transfer`
  - `keeps the current delegate row synchronized with delegate mapping after transfer updates`
  - `keeps the current delegate row at zero when a full transfer drains the current mapping`
  - `zeros the historical relation when a delegate change closes an old edge even if the stored row is stale`

Command results:

- `npx -y yarn@1.22.22 test __tests__/token-vote-power.test.ts __tests__/indexerAccuracyDiagnose.test.ts`
  - `33/33 passed`
- `npx -y yarn@1.22.22 build`
  - passed

## Full replay status

- Local full replay was started with `just smart-start-force`
- `DEGOV_CONFIG_PATH` is currently set to `https://api.degov.ai/dao/config/ens-dao`
- latest observed replay batches were advancing normally with heartbeat logs
- final end-to-end verification still depends on the full replay reaching the latest chain head

## Notes

- This round intentionally diagnoses **all ENS anomalies from the report**, not a sample subset.
- `seamless-dao` and `ring-dao` anomalies from this report still need separate passes after ENS stabilizes.
