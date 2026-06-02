# Datalens Rust Technical Conventions

> Purpose: defines the required Rust conventions for the Datalens-native DeGov
> indexer before implementation starts. Read this before adding Rust indexer
> crates, ChainTool code, projection code, Datalens client wrappers, repository
> code, or reconcile workers. This document does not describe the historical
> SQD/Subsquid runtime.

## Integration model

DeGov must be implemented as an external Datalens application indexer, not as a
plugin inside `datalens serve`.

Datalens provides historical native data and cache access. DeGov owns the
governance business schema, checkpoint state, projection tables, reconcile
tasks, and GraphQL-compatible persisted data that the web application consumes.

The reference model is Datalens' Rust `examples/degov-client`: it uses the
external `datalens-sdk`, queries `datalens serve` through `/native/graphql`,
decodes governance logs locally, owns its application database schema and
checkpoint, and writes projection data transactionally. The production DeGov
indexer should keep that boundary and extend it for production requirements.

Large Datalens ranges must flow through these stages:

1. Fetch native batches from Datalens through a DeGov-owned client trait.
2. Apply local deterministic ordering before decode and projection.
3. Decode governance logs locally.
4. Plan batch-level onchain reads through ChainTool.
5. Write checkpoint, projection, and reconcile state in explicit database
   transactions.

## Required stack

- Language: Rust.
- Runtime: `tokio`.
- Datalens access: `datalens-sdk` behind DeGov-owned traits.
- EVM RPC and ChainTool: `alloy`.
- ABI decoding: `alloy-dyn-abi`, `alloy-json-abi`, and
  `alloy-primitives`.
- EVM primitive types: `alloy-primitives` addresses, hashes, topics, and
  U256-like values.
- Database: `sqlx` with Postgres as the production target.
- CLI: `clap`.
- Configuration: `figment` plus environment variables.
- Metrics: `prometheus`.
- Library logging facade: `log`.
- Logging output boundary: `tracing-log` plus `tracing-subscriber` in binary
  entrypoints.
- Library errors: `thiserror`.
- Binary/tool errors: `anyhow` only at the outer executable boundary.

Any deviation from this stack must be documented in the implementation plan
that introduces the deviation and must explain the operational tradeoff.

## Rust workspace shape

The indexer should be introduced under `packages/indexer` as a Rust workspace or
crate set. The workspace should keep clear boundaries between:

- Datalens client traits and SDK adapters.
- Governance ABI decode.
- ChainTool RPC and batch read planning.
- Projection and reconcile logic.
- Database repositories and transaction helpers.
- Binary/CLI entrypoints.

Library crates should expose deterministic interfaces that can be tested
without running `datalens serve`, a live EVM RPC endpoint, or Postgres unless
the test is explicitly marked as integration coverage.

## Logging convention

Library crates, projection code, ChainTool, Datalens client wrappers, database
repositories, checkpoint code, and reconcile code must use the `log` facade:

```rust
log::debug!("planning onchain reads for batch");
log::info!("projection batch committed");
log::warn!("retrying rpc read after transient failure");
```

They must not directly use:

- `tracing::debug!`, `tracing::info!`, `tracing::warn!`, or sibling macros.
- `#[tracing::instrument]`.
- `tracing_subscriber` initialization.

The binary or CLI entrypoint owns output initialization with
`tracing_log::LogTracer` and `tracing_subscriber::fmt()`. This keeps library
code compatible with the current Datalens workspace convention: libraries emit
through `log`, and the process boundary decides how logs are formatted and
exported.

## Error convention

Library crates must expose typed `thiserror` errors instead of raw
`anyhow::Error`. Error enums must preserve stable categories for:

- Config.
- Datalens client.
- Decode.
- Database.
- RPC.
- Unsupported DAO.
- Projection.
- Checkpoint.
- Reconcile.
- Internal failures.

Stable categories are required for retry policy, fail-fast policy, metrics, and
operator diagnostics. Error variants may wrap lower-level sources, but callers
must be able to classify the failure without string matching.

Executable binaries and one-off tools may use `anyhow::Result` at the outermost
boundary to add human-readable context and simplify process-level error
reporting.

## ChainTool convention

ChainTool must use `alloy` for EVM RPC and onchain reads. It must not introduce
`ethers` unless a later issue explicitly accepts the tradeoff. Mixing EVM type
ecosystems inside the indexer is not allowed.

ChainTool must support:

- Batch-level read planning.
- Read deduplication before execution.
- Bounded concurrency.
- Retry and backoff for retryable RPC failures.
- Request timeout handling.
- Multicall where it is appropriate for the target chain and call shape.
- Metrics for requested, deduped, and executed reads.

Projection code should request semantic reads from ChainTool rather than owning
RPC batching details directly.

## Database convention

Database access must use `sqlx`. The production database target is Postgres.
Local or fixture-only support for another database may be added only when it
improves tests without distorting Postgres behavior.

The Datalens migration uses fresh database initialization and reset-index
semantics. It does not need historical in-place migration compatibility with the
removed SQD/Subsquid runtime.

Checkpoint writes, projection writes, and reconcile task writes must have
explicit transaction boundaries. A batch commit must not persist a checkpoint
unless the associated projection and reconcile writes for that transaction also
commit successfully.

Large integer vote and power values must preserve the current DeGov DB and
GraphQL semantics without precision loss. Rust code should carry these values as
lossless integer or decimal representations through decode, projection,
storage, and API-compatible persistence. It must not coerce vote or power values
through floating-point types.

## Datalens client convention

The implementation must wrap `datalens-sdk` behind DeGov-owned traits. This
keeps tests deterministic and isolates the application from SDK transport
changes, including a possible blocking-to-async transition.

The trait boundary should model the data DeGov needs from native Datalens
batches, not expose every SDK detail to projection code. SDK adapters may be
thin, but projection and reconcile code should depend on DeGov traits.

## Implementation plan requirements

The implementation plan for the first Rust indexer issue must:

- Cite this document as the conventions source of truth.
- List the Rust stack above and explain any deviation.
- Keep logging output initialization in the binary/CLI boundary.
- Add typed `thiserror` library errors with stable categories before broad
  callers depend on error strings.
- Use `alloy` for ChainTool and ABI decode, with no `ethers` dependency in the
  Rust indexer workspace.
- Use `sqlx` with explicit transaction boundaries for checkpoint, projection,
  and reconcile writes.
- Include tests or lint checks for the logging convention when Rust source files
  are introduced.
