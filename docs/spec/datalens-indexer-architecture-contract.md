# Datalens Indexer Architecture Contract

> Purpose: define the target Datalens-native DeGov indexer architecture and
> correctness contract.
>
> Read this when: implementing or reviewing the DeGov migration from the removed
> SQD/Subsquid indexer to an application-owned Datalens consumer.
>
> This does not document how to run the old SQD handlers, and it does not define
> an in-place database migration from old indexed data.

## Target architecture

The new DeGov indexing engine is a Rust-first external application indexer. It
runs outside `datalens serve`, uses the Rust `datalens-sdk` client to query the
shared Datalens service, decodes governance data locally, and writes the DeGov
application database through DeGov-owned migrations and transactions.

Datalens is the historical data and cache service. DeGov owns the governance
runtime, workload configuration, database schema, checkpoint table, projection
logic, onchain reconcile logic, GraphQL-compatible persisted data, failure
policy, and deployment lifecycle.

The old SQD handlers and historical documentation are reference material for
business behavior, final persisted data, and GraphQL-visible semantics. They
must not be wrapped as the new runtime structure, and the new indexer must not
depend on SQD runtime concepts for scheduling, storage, or handler execution.

## Datalens integration model

The migration follows the external-business indexer pattern demonstrated in the
Datalens repository:

- `examples/degov-client` is the closest starting point. It is a Rust
  application indexer that uses only `datalens-sdk`, queries native Datalens EVM
  logs through the shared service, decodes `VoteCast` locally, owns SQLite
  migrations, stores checkpoints, writes vote rows and proposal totals in one
  transaction, and validates replay idempotency.
- `examples/ormp-client` confirms the same pattern for another product domain:
  query native logs through the SDK, decode in application code, write
  application-owned rows, and checkpoint only after successful business writes.
- `sdks/rust` is the supported Rust integration boundary. DeGov may use SDK
  request/response types, authentication headers, native query helpers, and
  error types. DeGov must not link Datalens server, edge, storage, executor,
  chain adapter, or internal indexer runtime crates.
- The Datalens application integration handbook and production runtime docs
  define Datalens as a shared service boundary, not as the owner of business
  tables.

Production DeGov extends the examples by covering all DeGov v4 governance
surfaces, using PostgreSQL instead of example SQLite, adding onchain reconcile
planning, preserving the existing GraphQL/API database contract, and recording
operational observability for long-running DAO workloads.

## Service and secret configuration

The shared Datalens service endpoint is:

```text
https://datalens.ringdao.com
```

Configure the Rust SDK from this service base endpoint. If the SDK version
accepts the base URL, pass `https://datalens.ringdao.com` and let the SDK append
`/native/graphql`. If the checked SDK version exposes only a GraphQL endpoint
field, derive `https://datalens.ringdao.com/native/graphql` from the base URL in
configuration code rather than committing a separate hardcoded service value.

The application identity is `degov-live` for the shared live service. The token
must be read from deployment secrets or local untracked environment variables.
Do not hardcode the token in code, issue text, logs, committed config, examples,
or docs.

The operational reference for the live token is the GitOps secret at:

```text
/code/helixbox/avault/gitops-helixbox/secrets/helixbox-nue/creds-datalens.yaml
```

Use lines 16-20 of that file as the deployment reference. The DeGov repository
should only refer to the secret location and environment variable names, not the
secret value.

Recommended indexer environment variables:

| Variable | Purpose |
| --- | --- |
| `DATALENS_ENDPOINT` | Shared service base URL, such as `https://datalens.ringdao.com`. |
| `DATALENS_APPLICATION` | Datalens application identity, such as `degov-live`. |
| `DATALENS_TOKEN` | Bearer token loaded from secret management. |
| `DEGOV_DATABASE_URL` | DeGov application database URL. |
| `DEGOV_CONFIG_PATH` | DAO/workload config path. |
| `DEGOV_RESET_CHECKPOINT` | Explicit fresh replay/reset-index switch. |

## Crate and package boundaries

The target implementation should introduce a Rust workspace area for the
Datalens-native indexer core. Exact names may be finalized by the implementation
issue, but the boundary should remain:

| Unit | Responsibility |
| --- | --- |
| `degov-datalens-indexer` binary | Process entrypoint, config loading, migrations, workload loop, signal handling, metrics setup. |
| `degov-indexer-core` library | Batch planning, event normalization, ABI decode orchestration, projection dispatch, checkpoint contract. |
| `degov-indexer-db` library or module | PostgreSQL transaction helpers, idempotent upserts, schema-owned repositories, checkpoint writes. |
| `degov-indexer-chain` library or module | ChainTool/RPC reconcile reads, batching, retry policy, historical power reads. |
| `degov-indexer-models` library or generated module | Shared database/API model types when useful for Rust writes and TypeScript compatibility checks. |

Existing TypeScript/Node components may remain where they preserve current
runtime or public API boundaries: web application code, GraphQL server
compatibility, generated client types, transitional scripts, and UI-facing
package layout. TypeScript must continue reading the same database/API contract;
it is not the new historical indexing engine.

## Data flow

For each configured DAO workload, the indexer must use this flow:

1. Read the DeGov-owned checkpoint for the workload identity.
2. Derive the next inclusive block range using DAO config, finality policy,
   chunk size, and Datalens quota limits.
3. Query Datalens native EVM logs through the Rust SDK for the configured chain,
   dataset, governor/token/timelock addresses, topic filters, and range.
4. Normalize raw log rows into stable event cursors using chain id, block
   number, transaction hash, transaction index, and log index.
5. Decode ABI events locally in the DeGov indexer. Unsupported or failed decodes
   are recorded according to handler policy and must not create unsafe business
   rows.
6. Build projection work for proposal, vote, token/delegation, timelock,
   contributor/delegate, relation, power, and aggregate metric domains.
7. Collect affected accounts and timepoints for ChainTool/RPC reconcile reads.
8. Execute onchain reconcile reads for final voting power values.
9. In one database transaction per committed batch, write raw audit rows,
   projections, reconcile results, aggregate updates, and the next checkpoint.
10. Advance the checkpoint only after all writes for the batch have committed.

The batch may be retried after any process, Datalens, RPC, or database failure.
Retrying the same batch must not duplicate rows or double-count aggregates.

## Transaction, checkpoint, and retry contract

The DeGov database is the checkpoint owner. Datalens coverage and cache state
are inputs to the query planner, not the business checkpoint.

Each committed batch must satisfy:

- raw event rows use stable unique keys such as chain id plus transaction hash
  plus log index, or a stricter event cursor when required;
- projection rows use stable business keys such as proposal id, proposal action
  index, proposal id plus voter, timelock operation id, account address, or
  delegation edge;
- mutable snapshots are updated through deterministic upserts or deletes;
- aggregate metrics are recomputed from committed facts or updated with
  idempotent deltas guarded by unique event application records;
- the checkpoint update is in the same transaction as the writes it covers;
- failures before commit leave the previous checkpoint intact;
- failures after commit are safe because the next run observes committed rows
  and resumes from the committed checkpoint.

Retry policy must classify transport, Datalens service, provider, RPC, and
database errors separately in logs and metrics. Permanent decode or unsupported
event outcomes are handler outcomes, not infrastructure success. They may be
skipped only when the skip decision is durable and auditable.

## Correctness contract

The final persisted database state must match DeGov v4 business semantics for
supported DAOs. Datalens implementation details may differ from SQD, but all
GraphQL, web, square, and audit-visible data must remain semantically
compatible with the current DeGov data contract.

The checked-in schema reference remains the compatibility target for entity
meaning. Later implementation issues may adjust physical table layout only if
the public API and documented semantics remain compatible or the change is
explicitly accepted as a contract change.

Required coverage:

| Domain | Contract |
| --- | --- |
| Proposals | Persist raw proposal lifecycle events and the canonical proposal projection, including description-derived title, proposer, targets, values, signatures/calldata, snapshot/deadline, quorum, queue/execute/cancel metadata, and state timeline. |
| Votes | Persist `VoteCast` and `VoteCastWithParams` audit rows, normalize them into one vote query shape, preserve support/reason/params where available, and update proposal vote counts and weights idempotently. |
| Token and delegation | Persist `DelegateChanged`, `DelegateVotesChanged`, token transfer audit rows, active delegation mappings, effective power-bearing delegate edges, and contributor/delegate snapshots. |
| Timelock | Persist governor queue/execute links, timelock operation state, timelock calls, role events, and minimum delay changes so proposal execution status remains explainable. |
| Contributors and delegates | Maintain current account snapshots, delegate profile visibility inputs, current received delegation counts, effective delegation counts, and last-vote or participation fields used by the app. |
| Relations | Preserve proposal-action, proposal-timelock, voter-proposal, delegator-delegate, account-power, and DAO-scoped relation keys used by existing queries. |
| Power | Use logs only to discover affected accounts and timepoints. Final current or historical voting power must come from ChainTool/RPC reconcile reads such as `getVotes`, `getPastVotes`, or `getPriorVotes`, selected according to the governor/token contract. |
| Aggregate metrics | Maintain `DataMetric`-equivalent totals for proposals, votes, members, delegates, voting power, and other overview metrics from committed facts or deterministic recomputation. |

Voting power has exactly one final source: onchain RPC reads through the
ChainTool/reconcile path. `DelegateVotesChanged`, transfers, and delegation logs
may identify accounts to reconcile and may be kept as audit evidence, but they
must not calculate final power values for persisted DeGov business state.

Fresh DB initialization and reset-index semantics are required. The migration is
not an in-place historical database migration. A reset run starts from configured
DAO start blocks, initializes the Datalens-native schema, and rebuilds DeGov
business state through the Datalens query and reconcile flow.

## Compatibility with TypeScript consumers

TypeScript consumers continue to use the existing web and API boundary while the
indexing engine changes. The Datalens-native indexer must preserve:

- table/entity meanings documented in the schema reference;
- GraphQL-visible field semantics, identifiers, relation cardinality, sorting
  expectations, and pagination behavior;
- square and web assumptions around proposal state, vote totals, delegate
  counts, current delegation mappings, and aggregate metrics;
- audit access to raw event data needed to explain projections.

If Rust writes directly to tables that TypeScript reads, the Rust model and DB
migrations must be validated against the TypeScript schema/query expectations.
If a compatibility GraphQL layer remains in TypeScript, it is justified as an
existing public API/runtime boundary, not as ownership of indexing logic.

## Observability and validation

The indexer must expose enough logs or metrics to answer:

- which DAO, chain, contract set, block range, and checkpoint were processed;
- how many native rows Datalens returned and how many decoded, skipped, failed,
  inserted, updated, or deduplicated;
- which reconcile reads were planned and completed;
- which transaction advanced the checkpoint;
- whether failures came from Datalens, RPC, database, decode policy, or
  invariant checks.

Validation for projection issues should include:

- unit tests for ABI decode and projection rules;
- database tests for idempotent replay and checkpoint atomicity;
- compatibility checks against representative GraphQL queries;
- sampled comparisons against the current SQD-derived reference behavior and
  direct onchain reads;
- live Datalens smoke checks using the deployed endpoint and a token loaded from
  secret management.

The Datalens health endpoint and native GraphQL endpoint have already been
verified for the shared service. Later implementation issues should repeat live
checks only as validation, without logging token values.
