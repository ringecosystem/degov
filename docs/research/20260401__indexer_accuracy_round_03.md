# Indexer Accuracy Round 03

## Context

- Follow-up mismatch after deploying image `sha-a803ca1`
- Audit sample:
  - `0x76a6d08b82034b397e7e09dae4377c18f132bbb8: index 6.99K, chain 9.87K, delta -2.88K`
- Initial suspicion was a bad deployment, but local repo state confirmed:
  - `HEAD = a803ca1`
  - the round 02 fix was already included in that commit

## What was wrong

The mismatch is on this current edge:

- `0x000ee9a6bcec9aadcc883bd52b2c9a75fb098991 -> 0x76a6d08b82034b397e7e09dae4377c18f132bbb8`

Observed:

- indexer mapping power: `5.97K`
- chain `balanceOf(from)`: `8.85K`
- delta: `-2.88K`

The exact transaction is:

- `0xad152230bc007989e34c678ec96584223e16a90ca437aae5ad88918da1217338`

Decoded order:

1. `Transfer` `0x04b0... -> 0x000ee9...` `823.49`
2. `Transfer` `0x9de4... -> 0x000ee9...` `2058.73`
3. `DelegateChanged` `0x000ee9... : 0x1f3d... -> 0x76a6...`
4. `DelegateVotesChanged` old delegate `0x1f3d...` decreases
5. `DelegateVotesChanged` new delegate `0x76a6...` increases

The two incoming transfers add up to the exact mismatch:

- `823.49 + 2058.73 = 2882.22`

So the bug was:

- the `to-side` relation materialization still subtracted same-tx incoming transfer delta
- even when the tx already had an earlier `from-side` vote delta for the old delegate

That is wrong for this tx shape.

## Root cause

In `TokenHandler.updateDelegateRolling()`:

- the `match.side === "to"` branch still did:
  - `relationDelta -= transferDeltaForDelegator(...)`
- the guard only checked:
  - `transferTouchesDelegator`
  - `!hasEarlierRollingForSameDelegator`

It did **not** check whether the old delegate had already emitted an earlier `DelegateVotesChanged` in the same tx.

For `old -> new redelegation + same-tx incoming transfer`:

- if there is an earlier `from-side` vote delta
- the new delegate's `+delta` already represents the full moved balance
- subtracting the transfer amount again undercounts the new current edge

## Fix

Changed file:

- `packages/indexer/src/handler/token.ts`

Change:

- in the `match.side === "to"` transfer-delta subtraction path, require:
  - `!hasEarlierVoteDeltaForDelegate(delegateVotesChanges, rollingFromDelegate, options.logIndex)`
  - in addition to the existing guards

Meaning:

- only subtract same-tx transfer delta when this really is a transfer-only `to-side` case
- do **not** subtract when the old delegate already has an earlier vote delta in the same tx

## Regression coverage

Changed file:

- `packages/indexer/__tests__/token-vote-power.test.ts`

Added:

- `does not subtract same-tx incoming transfer from a redelegation when the old delegate has a vote delta first`

This test covers the exact family behind `0x76a6...`:

1. delegator already has an old delegate and current mapping
2. same tx receives incoming transfers
3. same tx redelegates `old -> new`
4. old delegate emits an earlier negative vote delta
5. new delegate emits the positive vote delta
6. the final current mapping must equal the full post-transfer balance, not the balance minus incoming transfers

Also updated validation still passes for prior rounds.

## Validation

Commands run:

- `npx -y yarn@1.22.22 test __tests__/token-vote-power.test.ts -t "does not subtract same-tx incoming transfer from a redelegation when the old delegate has a vote delta first"`
- `npx -y yarn@1.22.22 test __tests__/token-vote-power.test.ts __tests__/indexerAccuracyDiagnose.test.ts`
- `npx -y yarn@1.22.22 build`

Results:

- targeted regression passed
- `35/35` tests passed
- build passed

## Operational note

At the time of investigation, `ens-dao` in the cluster was near head but still repeatedly restarted because the selected upstream RPC intermittently lacked the latest recent blocks:

- examples:
  - `block range extends beyond current head block`
  - `block not found with number ...`

That restart behavior does not explain the `0x76a6...` mismatch, because the bad transaction is an older block and was already indexed.

The mismatch is explained by the remaining `to-side` subtraction bug above.
