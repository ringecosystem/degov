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

## PostgreSQL schema ownership

`schema/postgres.sql` is the canonical PostgreSQL schema source for the
Datalens-native DeGov indexer fresh initialization path. Future Rust repository
code should initialize a fresh database by applying this file with `sqlx` and
should keep checkpoint, projection, and reconcile writes inside explicit
transaction boundaries.

The Datalens indexer upgrade is a breaking indexer implementation change.
Operators must reset or recreate the Postgres index database before adopting it
and then run the Datalens-native indexer from the configured start block. Do not
add historical in-place migrations for v3/v4 SQD/Subsquid index databases: a
table-shape migration cannot recompute historical proposal state, votes,
delegations, contributor power, or aggregate metrics under the new indexing
semantics.

`reference/schema.graphql` remains the compatibility reference for table and
field names consumed by the current web and square GraphQL/API paths. Edit
`schema/postgres.sql` for database initialization, Rust SQL models for typed
access, and `reference/schema.graphql` only when a separate issue explicitly
changes the API-visible contract.

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
DEGOV_INDEXER_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/indexer node ./scripts/smoke-postgres-init.mjs
```
