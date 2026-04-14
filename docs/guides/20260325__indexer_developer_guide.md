# DeGov Indexer Developer Guide

This guide explains how to work with `packages/indexer` after the recent
indexing, reconciliation, and accuracy-debugging work.

## What lives in `packages/indexer`

`packages/indexer` is the Subsquid-based indexer that reads the DAO config from
`degov.yml`, ingests Governor, token, and timelock events, applies TypeORM
migrations, and serves the indexed data over GraphQL.

The package now exposes three entry layers:

- `package.json` scripts as the canonical grouped entrypoints.
- `justfile` recipes as the day-to-day wrapper layer.
- `scripts/` helpers for bounded replay, local verification, and audit tooling.

## Quickstart

From the repository root:

```bash
cd packages/indexer
just install
just codegen
just build
just up
just run
```

For the integrated replay and reconciliation flow:

```bash
cd packages/indexer
just replay-backfill
```

## Command layout

The command surface is grouped by responsibility:

- `codegen:*`
- `db:*`
- `dev:*`
- `test:*`
- `audit:*`

## `package.json` scripts

The package scripts remain the source of truth:

| Group | Scripts |
| --- | --- |
| Codegen | `codegen:abi`, `codegen:schema`, `codegen` |
| Database | `db:migrate`, `db:migrate:force` |
| Runtime | `build`, `dev:start`, `dev:smart-start`, `dev:smart-start:force`, `dev:graphql`, `dev:reconcile`, `dev:replay-backfill` |
| Tests | `test`, `test:unit`, `test:accuracy`, `test:integration` |
| Audit | `audit:accuracy`, `audit:diagnose` |

Backward-compatible aliases such as `migrate:db`, `reconcile`,
`replay:backfill`, and `audit:diagnose-address` are retained so existing
automation and habits do not break.

## `justfile` recipes

The package-local `justfile` mirrors the same groups and stays intentionally
thin. Use `just` for interactive workflows and `pnpm run <script>` when you
need the canonical script name.

## Common developer flows

### Build and run the local indexer

```bash
cd packages/indexer
just install
just codegen
just build
just up
just run
```

### Generate a schema migration

```bash
cd packages/indexer
just codegen
just db-migrate
```

Use `just db-migrate-force` only when you intentionally want the migration
generator to ignore the current `db/` contents and rebuild from the current
schema state.

### Serve the API against an already-built processor

```bash
cd packages/indexer
just process
just serve
```

### Validate a rollout with replay and reconciliation

```bash
cd packages/indexer
just replay-backfill
just test
```

This flow is described in more detail in
[`docs/plans/20260325__degov_projection_replay_reconciliation_rollout.md`](../plans/20260325__degov_projection_replay_reconciliation_rollout.md).

### Diagnose one bad delegate address

```bash
cd packages/indexer
just diagnose-address 0x983110309620d911731ac0932219af06091b6744 ens-dao
```

For the full workflow and output interpretation, see
[`docs/guides/20260331__indexer_accuracy_diagnosis.md`](./20260331__indexer_accuracy_diagnosis.md).

## Environment and config inputs

The indexer reads runtime settings from both repository config and environment
variables:

- `degov.yml`: DAO identity, contract addresses, chain settings, indexer start
  block, and default RPC list.
- `DEGOV_CONFIG_PATH`: overrides the config source and can point to a local file
  or a remote URL.
- `CHAIN_<chainId>` style RPC env vars such as `CHAIN_RPC_46`: override the RPC
  endpoints used by the processor.
- `DEGOV_INDEXER_START_BLOCK` / `DEGOV_INDEXER_END_BLOCK`: narrow replay or
  backfill ranges.
- `DATABASE_URL` or `DB_*`: configure the PostgreSQL connection used by the
  processor and reconciliation tooling.

## Related docs

- [`docs/architecture/20260325__indexer_architecture.md`](../architecture/20260325__indexer_architecture.md)
- [`docs/research/20260401__indexer_accuracy_research.md`](../research/20260401__indexer_accuracy_research.md)
- [`docs/research/20260325__ohh-28_openzeppelin_governor_indexing_research.md`](../research/20260325__ohh-28_openzeppelin_governor_indexing_research.md)
- [`docs/plans/20260325__degov_projection_replay_reconciliation_rollout.md`](../plans/20260325__degov_projection_replay_reconciliation_rollout.md)
