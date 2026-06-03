# DeGov Indexer

`apps/indexer` is reserved for the upcoming Datalens-native governance
indexer.

The previous SQD/Subsquid processor runtime, migrations, codegen, local startup
scripts, and onchain-refresh worker have been removed. Do not build new work on
the old processor architecture.

## Current boundary

The package now contains the initial Rust configuration and Datalens client
boundary for the upcoming runtime. It validates the deployed Datalens service
base endpoint, application identity, bearer token, timeout, finality mode, chain
identity, dataset key, and query block range limit at startup. The bearer token
is loaded from environment or secret-backed configuration and is redacted by
config formatting.

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

```bash
just build
just test
```
