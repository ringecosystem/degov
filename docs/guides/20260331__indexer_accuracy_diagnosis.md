# DeGov Indexer Accuracy Diagnosis

This guide explains how to diagnose a single delegate address when the page
data does not match on-chain voting power.

The goal is to avoid guessing whether the issue is in the frontend, the
contributor aggregate, the current delegate mappings, or stale historical rows.

## When to use this

Use this flow when:

- a delegate page shows `Total Voting Power` that does not match the delegate
  list page
- the audit reports a vote mismatch for one address
- a DAO shows negative `Contributor` or `Delegate` rows
- you need to understand which indexed edge or transaction caused the mismatch

## Fast path

From the indexer package:

```bash
cd /code/helixbox/degov/packages/indexer
just diagnose-address 0x983110309620d911731ac0932219af06091b6744 ens-dao
```

This uses the built-in target config from
`scripts/indexer-accuracy-targets.yaml`.

## Custom target

If the DAO is not in the built-in target list, pass the required chain inputs
explicitly:

```bash
cd /code/helixbox/degov/packages/indexer
node ./scripts/indexer-accuracy-diagnose.js \
  --address 0x983110309620d911731ac0932219af06091b6744 \
  --endpoint https://indexer.degov.ai/ens-dao/graphql \
  --rpc-url https://ethereum-rpc.publicnode.com \
  --governor-token 0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72 \
  --governor 0x323A76393544d5ecca80cd6ef2A560C6a395b7E3
```

Useful optional flags:

- `--mapping-limit 50`: cap the number of incoming current mappings to inspect
- `--history-limit 12`: cap the history entries fetched for each bad mapping
- `--concurrency 10`: tune parallel chain reads
- `--json`: emit machine-readable output

## What the script checks

The script combines indexer GraphQL data with on-chain reads:

1. Reads the indexed `Contributor.power`
2. Reads on-chain current voting power with `getVotes(address)`
3. Finds current incoming `DelegateMapping` rows pointing to the address
4. For each mapping, reads on-chain:
   - `delegates(from)`
   - `balanceOf(from)`
5. Flags mismatches such as:
   - `power-not-cleared-after-balance-zero`
   - `indexed-power-higher-than-balance`
   - `indexed-power-lower-than-balance`
   - `stale-target-mismatch`
   - `stale-target-after-undelegate`
   - `negative-mapping-power`
6. For mismatched mappings only, fetches recent:
   - `DelegateChanged`
   - `TokenTransfer`
   - `VotePowerCheckpoint`

It also checks whether the target address itself already has:

- negative `Contributor` rows
- negative `Delegate` rows touching the address

For negative current `Delegate` rows, the script now also prints tx-local
signals that help identify the remaining ENS failure family:

- `noop-same-target=yes`: the delegator history contains a no-op
  `DelegateChanged(A -> A)` for the same delegate target
- `same-target-dc=<n>`: how many `DelegateChanged` rows in history point to the
  same target delegate
- `transfer-overlap-dc=<n>`: how many of those target-facing delegate changes
  share a transaction hash with a `Transfer`

That combination is the signature of the tx-local `DelegateRolling` /
`DelegateVotesChanged` mismatch family:

- multiple delegators appear in the same transaction
- or the same delegate target appears multiple times in the same transaction
- and one or more no-op `DelegateChanged(A -> A)` rows pollute rolling matching

## How to read the output

The script prints 4 sections:

- `Target`: DAO and chain inputs used for the run
- `Voting Power`: indexed contributor power, on-chain votes, and delta
- `Negative Rows`: whether the address already has negative historical rows
- `Mapping Checks`: how many incoming current mappings were checked and how much
  of the delta those mappings explain

If the script finds bad mappings, it prints a `Suspects` section with:

- `from -> to`
- indexed mapping power
- chain `balanceOf(from)`
- chain `delegates(from)`
- delta
- anomaly hint
- latest relevant `DelegateChanged`
- latest relevant `Transfer`
- latest relevant `VotePowerCheckpoint`

If it finds negative current `Delegate` rows, it also prints a
`Negative Delegate Analyses` section with:

- the negative row power
- the current `DelegateMapping` power for the same edge
- the classification hint
- tx-local rolling mismatch signals

## Example: ENS `0x983110...`

This command:

```bash
cd /code/helixbox/degov/packages/indexer
just diagnose-address 0x983110309620d911731ac0932219af06091b6744 ens-dao
```

was used to diagnose an ENS mismatch where:

- indexed contributor power was higher than chain votes by `+569`
- the script found one current incoming mapping:
  - `0xa47080... -> 0x983110...`
- the indexed mapping power was `569`
- on-chain `balanceOf(0xa47080...)` was `0`
- on-chain `delegates(0xa47080...)` still pointed to `0x983110...`

That showed the real bug: the relation target was still correct, but the
transfer-out had not cleared the current mapping power.

## Example: ENS negative delegate family

This command:

```bash
cd /code/helixbox/degov/packages/indexer
just diagnose-address 0x1f3d3a7a9c548be39539b39d7400302753e20591 ens-dao
```

now prints a `Negative Delegate Analyses` section such as:

```text
- 0x04b05... -> 0x1f3d...: row -3.32K, mapping ... power -3.32K,
  hint negative-mapping-from-tx-local-rolling-mismatch,
  signals noop-same-target=yes, same-target-dc=2, transfer-overlap-dc=2
```

Read that output as:

- the current edge itself is already negative
- the delegator history contains a no-op delegate change for the same target
- the target appears multiple times in delegate-change rows
- those delegate changes overlap with transfer rows in the same transaction

That is the signature of the ENS tx-local pairing bug fixed in
`packages/indexer/src/handler/token.ts`:

- `storeTokenTransfer()` must not skip the incoming transfer side just because a
  same-tx delegate change exists for that delegator
- `updateDelegateRolling()` must not let aggregate same-tx
  `DelegateVotesChanged` deltas override the exact transfer-backed relation
- no-op `DelegateChanged(A -> A)` rows must not be allowed to pollute rolling
  matching

The same family can also appear as `index-lower-than-chain`, not only as a
negative edge. In that variant, a same-tx outgoing delta that belongs to a
different delegator is subtracted from the wrong transfer-backed relation. The
diagnosis signature is usually:

- one negative current edge already exists for the same target
- another current mapping for the same target shows `indexed-power-lower-than-balance`
- the lower mapping and the negative edge share transaction-local overlap with
  `DelegateChanged` and `Transfer` rows

## Related commands

- `just verify-range <config> <start> <end>`: replay a small local block range
- `just verify-sample <delegator> [delegate]`: inspect a local replay result
- `just verify-negative-current [limit]`: inspect local current negative rows
- `pnpm audit:accuracy`: run the full audit
- `pnpm run audit:diagnose -- --address ... --code ...`: raw script entrypoint

## Related research

For the consolidated bug-family summary and the fixes that landed across the
recent ENS / Seamless / Ring investigations, see:

- [`docs/research/20260401__indexer_accuracy_research.md`](../research/20260401__indexer_accuracy_research.md)
