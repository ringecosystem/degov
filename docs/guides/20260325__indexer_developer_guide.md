# DeGov Indexer Developer Guide

> Purpose: orient developers working on the Datalens-native DeGov indexer.
>
> Read this when: adding Rust indexer code, validating its runtime boundaries,
> or checking the retained schema/reference artifacts.
>
> This does not document how to run the removed SQD/Subsquid processor.

## Current State

`apps/indexer` is the Rust application area for the Datalens-native governance
indexer. The old SQD/Subsquid processor runtime, TypeScript handlers, TypeORM
migrations, codegen commands, local SQD startup scripts, and GraphQL server
scripts have been removed.

The checked-in runtime contains:

- Rust configuration, Datalens client readiness, indexing, decoding, and
  projection code.
- The canonical fresh PostgreSQL initialization schema in
  `apps/indexer/migrations/0001_init.sql`.
- GraphQL and onchain refresh worker entrypoints.
- Historical GraphQL and ABI reference artifacts in `apps/indexer/reference/`.
- Rust and Node-based checks for runtime packaging, schema ownership,
  compatibility, projection behavior, and Postgres initialization.

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

`just indexer test` runs the indexer checks and Rust tests. For the canonical
configuration, migration, and startup workflow, use the root
[deployment guide](../../README.md#datalens-backed-indexer-deployment).

### Offline Rust convention check

With Node.js 22 or newer, run this from the repository root to check only the
indexer's Rust sources and Cargo manifests/lockfiles:

```bash
DEGOV_RUST_CONVENTIONS_ROOT=apps/indexer node apps/indexer/scripts/check-rust-conventions.mjs
```

`DEGOV_RUST_CONVENTIONS_ROOT` selects the directory to scan; relative paths are
resolved from the current working directory. Without it, the script scans the
repository. It skips `target` and `node_modules` directories. Success prints
`Rust convention check passed`; violations print file paths and reasons and
exit with status 1. Check those files against the
[Rust technical conventions](../spec/datalens-rust-technical-conventions.md),
including library logging/error boundaries and the alloy dependency rule.

This is a static, offline check using Node.js built-ins. It needs no package
installation, Rust compiler, Docker, database, Datalens credentials, or RPC
endpoint. Passing it does not prove that Rust compiles or that database,
Datalens, or onchain integration works; run the relevant tests separately.

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

To initialize a fresh database manually:

```bash
DEGOV_INDEXER_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/indexer pnpm run indexer:migrate
```

The Rust `migration_schema` integration test covers clean initialization,
required tables, repeated migrator execution, and the single init migration
contract.

## Reference Artifacts

`apps/indexer/reference/schema.graphql` and `apps/indexer/reference/abi/` are
retained as behavior and API compatibility references for the replacement
implementation. They are not runtime inputs and must not be used to revive the
old SQD processor.

## Configuration

The Rust runtime expects Datalens service configuration through environment
variables, including:

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
