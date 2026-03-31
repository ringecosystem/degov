# DeGov Indexer Developer Guide

This guide explains how to work with `packages/indexer` after the OHH-32 to
OHH-38 indexing upgrade and the OHH-55 developer ergonomics pass.

## What lives in `packages/indexer`

`packages/indexer` is the Subsquid-based indexer that reads the DAO config from
`degov.yml`, ingests Governor, token, and timelock events, applies TypeORM
migrations, and serves the indexed data over GraphQL.

The package now exposes two command layers:

- `package.json` scripts for the canonical Node and Subsquid tasks.
- `justfile` recipes for a shorter day-to-day developer workflow.

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

## `justfile` recipes

The package-local `justfile` is intentionally thin: each recipe wraps an
existing `package.json` script, `commands.json` command, or package shell helper
without changing runtime behavior.

| Recipe | Underlying command | Use |
| --- | --- | --- |
| `just install` | `npx -y yarn@1.22.22 install --ignore-scripts` | Install the package with the pinned Yarn v1 toolchain. |
| `just clean` | `npx sqd clean` | Remove generated build output. |
| `just up` | `npx sqd up` | Start the local PostgreSQL container declared by the indexer package. |
| `just down` | `npx sqd down` | Stop the local PostgreSQL container. |
| `just codegen-abi` | `yarn run codegen:abi` | Rebuild ABI decoder bindings from `abi/*.json` into `src/abi/`. |
| `just codegen-schema` | `yarn run codegen:schema` | Rebuild TypeORM entities from `schema.graphql`. |
| `just codegen` | `yarn run codegen` | Run the full Subsquid code generation flow. |
| `just build` | `yarn run build` | Compile the indexer into `lib/`. |
| `just migrate-db` | `yarn run migrate:db` | Generate the additive migration for the current schema changes. |
| `just migrate-db-force` | `yarn run migrate:db -- --force` | Regenerate migrations without preserving the previous `db/` folder contents. |
| `just process` | `npx sqd process` | Start the processor only. |
| `just serve` | `npx sqd serve` | Start the GraphQL server only. |
| `just run` | `npx sqd run .` | Start the processor and GraphQL server together through Subsquid. |
| `just start` | `sh ./scripts/start.sh` | Apply migrations and start `lib/main.js` with `.env` loading. |
| `just smart-start` | `sh ./scripts/smart-start.sh` | Reset Docker services as needed, then build and start the indexer. |
| `just smart-start-force` | `sh ./scripts/smart-start.sh force` | Force a local reset, rerun codegen, and regenerate migrations before starting. |
| `just graphql-server` | `sh ./scripts/graphql-server.sh` | Launch the GraphQL server helper script directly. |
| `just diagnose-address <address> [code]` | `node ./scripts/indexer-accuracy-diagnose.js ...` | Diagnose one delegate address by comparing indexed aggregates and mappings against on-chain votes, balances, and delegate targets. |
| `just reconcile` | `yarn run build && node lib/reconcile.js` | Rebuild the package and compare indexed proposal data against on-chain truth. |
| `just replay-backfill` | `yarn run replay:backfill` | Run the bounded replay plus reconciliation flow from OHH-38. |
| `just test` | `yarn run test` | Run the deterministic Jest suite. |
| `just test-integration` | `yarn run test:integration` | Run the network-backed integration tests. |

## `package.json` scripts

The package scripts remain the source of truth for the actual commands:

| Script | Meaning |
| --- | --- |
| `codegen:abi` | Generate typed ABI helpers for the Governor and timelock JSON ABIs under `abi/`. |
| `codegen:schema` | Generate TypeORM entities from `schema.graphql`. |
| `codegen` | Run the full Subsquid code generation pipeline configured by `commands.json`. |
| `migrate:db` | Run `scripts/sqd-migration.mjs` to generate a migration while preserving the current `db/` folder by default. |
| `build` | Compile the indexer sources into `lib/` via `sqd build`. |
| `reconcile` | Execute the built reconciliation entrypoint at `lib/reconcile.js` to compare indexed state with chain truth. |
| `replay:backfill` | Run the replay and reconciliation helper script for bounded historical validation. |
| `test` | Run the default Jest suite in band. |
| `test:integration` | Run the dedicated integration tests for chain-backed helpers. |

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
just migrate-db
```

Use `just migrate-db-force` only when you intentionally want the migration
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
- [`docs/research/20260325__ohh-28_openzeppelin_governor_indexing_research.md`](../research/20260325__ohh-28_openzeppelin_governor_indexing_research.md)
- [`docs/plans/20260325__degov_projection_replay_reconciliation_rollout.md`](../plans/20260325__degov_projection_replay_reconciliation_rollout.md)
