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
`scripts/indexer-accuracy-targets.json`.

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

## Related commands

- `just verify-range <config> <start> <end>`: replay a small local block range
- `just verify-sample <delegator> [delegate]`: inspect a local replay result
- `just verify-negative-current [limit]`: inspect local current negative rows
- `yarn audit:accuracy`: run the full audit
- `yarn audit:diagnose-address --address ... --code ...`: raw script entrypoint
