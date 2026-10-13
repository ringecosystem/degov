# DeGov Indexer

`apps/indexer` contains the Rust Datalens-backed governance indexer.

The previous SQD/Subsquid processor runtime, migrations, codegen, local startup
scripts, and onchain-refresh worker have been removed. Do not build new work on
the old processor architecture.

## Current boundary

The package provides the indexer runner, PostgreSQL migrations and projections,
GraphQL service, Datalens readiness smoke, and optional onchain refresh worker.
It validates the deployed Datalens service base endpoint, application identity,
bearer token, timeout, finality mode, chain identity, dataset key, and query
block range limit at startup. The bearer token is loaded from environment or
secret-backed configuration and is redacted by config formatting.

The default deployment model is one shared Postgres indexer database, one
all-mode indexer process, one GraphQL service, one onchain refresh worker, and
scoped DAO routes or hostnames. Use `DEGOV_INDEXER_CONFIG_FILE` for multi-chain
contract sets and set `DEGOV_INDEXER_CONTRACT_SET_MODE=all` for normal
staging/production runs. `DEGOV_INDEXER_DAO_CODE` is a temporary debug filter,
not the default deployment unit.

## PostgreSQL schema ownership

`migrations/0001_init.sql` is the canonical fresh PostgreSQL initialization
schema for the Datalens-native DeGov indexer. The runtime applies it through
`sqlx::migrate!()` so startup and the explicit `migrate` command share the same
initialization path while keeping checkpoint, projection, and reconcile writes
inside explicit transaction boundaries.

The Datalens indexer upgrade is a breaking indexer implementation change.
Operators must reset or recreate the Postgres index database before adopting it
and then run the Datalens-native indexer from the configured start block. Do not
add historical in-place migrations for v3/v4 SQD/Subsquid index databases: a
table-shape migration cannot recompute historical proposal state, votes,
delegations, contributor power, or aggregate metrics under the new indexing
semantics.

`reference/schema.graphql` remains the compatibility reference for table and
field names consumed by the current web and square GraphQL/API paths. Edit
`migrations/0001_init.sql` for fresh database initialization, Rust SQL models
for typed access, and `reference/schema.graphql` only when a separate issue
explicitly changes the API-visible contract.

## Reference artifacts

The files under `reference/` are retained only as behavioral/API references for
the replacement implementation:

- `reference/schema.graphql`: previous GraphQL-visible data model.
- `reference/abi/`: contract ABIs used by the removed processor.

They are not runtime inputs and should not be used to revive the SQD processor
shell.

## Build and test

For a minimal local check, install Node.js 22 or newer and run this command from
the repository root:

```bash
node apps/indexer/scripts/indexer-diagnostics.test.mjs
```

It prints `Indexer diagnostics tests passed` on success. This test uses Node.js
built-ins, in-memory fixtures, and mocked RPC responses; it needs no package
installation, Rust toolchain, Docker, database, Datalens credentials, or live
RPC endpoint. It checks diagnostic helpers, not connectivity to external
services or end-to-end indexing.

For the broader build and test recipes, install `just`, the Rust/Cargo toolchain,
Node.js, and Docker with Compose v2 (used by the runtime packaging test). Run
these recipes from `apps/indexer`, not the repository root:

```bash
cd apps/indexer
just build
just test
```

Live Datalens readiness and local-stack integration checks require the configured
external services described below; passing the minimal local check does not
verify those services.

Use the root README's [Datalens-backed indexer deployment](../../README.md#datalens-backed-indexer-deployment)
section for the canonical environment, configuration, migration, and startup
workflow.
