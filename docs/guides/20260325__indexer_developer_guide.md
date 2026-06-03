# DeGov Indexer Developer Guide

> Purpose: orient developers working on the Datalens-native DeGov indexer.
>
> Read this when: adding Rust indexer code, validating the current indexer
> placeholder, or checking the retained schema/reference artifacts.
>
> This does not document how to run the removed SQD/Subsquid processor.

## Current State

`apps/indexer` is the Rust application area for the Datalens-native governance
indexer. The old SQD/Subsquid processor runtime, TypeScript handlers, TypeORM
migrations, codegen commands, local SQD startup scripts, and GraphQL server
scripts have been removed.

The current checked-in indexer is intentionally a foundation rather than a full
runtime. It contains:

- Rust configuration and Datalens client readiness code.
- The canonical fresh PostgreSQL initialization schema in
  `apps/indexer/migrations/0001_init.sql`.
- Historical GraphQL and ABI reference artifacts in `apps/indexer/reference/`.
- Node-based transition checks for schema ownership, Rust conventions, DAO
  compatibility preflight policy, and Postgres initialization smoke tests.

## Repository Layout

```text
apps/
  web/       # Next.js web application managed by pnpm
  indexer/   # Rust Datalens-native indexer managed by Cargo

contracts/   # Foundry governance contract project
docs/        # Specs, runbooks, historical references, and research
```

The root pnpm workspace only manages `apps/web`. The root Cargo workspace owns
`apps/indexer`.

## Common Commands

From the repository root:

```bash
just indexer build
just indexer test
just indexer test-unit
```

From the indexer directory:

```bash
cd apps/indexer
just build
just test
```

`just indexer test` runs the current transition checks and Rust tests. It does
not start a historical processor or serve an indexer GraphQL endpoint yet.

## Database Schema

`apps/indexer/migrations/0001_init.sql` is the canonical fresh index database
initialization schema. The Datalens runtime applies it through `sqlx::migrate!`.
This is still a breaking indexer implementation change: operators must reset or
recreate the Postgres index database before adopting the Datalens-native
indexer.

Do not add in-place migrations for old SQD/Subsquid v3/v4 index databases. A
table-shape migration cannot recompute historical proposal state, votes,
delegations, contributor power, or aggregate metrics under the new indexing
semantics.

To smoke-test the schema against a clean database:

```bash
DEGOV_INDEXER_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/indexer \
  node apps/indexer/scripts/smoke-postgres-init.mjs
```

## Reference Artifacts

`apps/indexer/reference/schema.graphql` and `apps/indexer/reference/abi/` are
retained as behavior and API compatibility references for the replacement
implementation. They are not runtime inputs and must not be used to revive the
old SQD processor.

## Configuration

The current Rust foundation expects Datalens service configuration through
environment variables, including:

- `DATALENS_ENDPOINT`
- `DATALENS_APPLICATION`
- `DATALENS_TOKEN`
- `DATALENS_TIMEOUT_SECONDS`

See `docs/spec/datalens-indexer-architecture-contract.md` and
`docs/spec/datalens-rust-technical-conventions.md` for the full target
architecture and Rust stack.

## Related Docs

- [`docs/spec/datalens-indexer-architecture-contract.md`](../spec/datalens-indexer-architecture-contract.md)
- [`docs/spec/datalens-rust-technical-conventions.md`](../spec/datalens-rust-technical-conventions.md)
- [`docs/spec/datalens-dao-compatibility-matrix.md`](../spec/datalens-dao-compatibility-matrix.md)
- [`docs/spec/20260327__indexer_schema_reference.md`](../spec/20260327__indexer_schema_reference.md)
