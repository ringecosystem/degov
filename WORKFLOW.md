---
schema: conductor/repository-workflow-policy/1
execution:
  canonicalize_commands: []
  verify_commands:
    - just web lint
    - just indexer test-unit
  max_attempts: 3
  retry_backoff_seconds: 60
  command_timeout_seconds: 1800
context:
  read_first:
    - README.md
    - docs/README.md
landing:
  default_merge_method: squash
  allowed_merge_methods:
    - merge
    - squash
---

Use this repository policy as the working contract for Conductor-owned lanes in DeGov.

DeGov is an on-chain governance platform for DAO deployments. The repository contains a
Next.js web app, a Subsquid-based indexer, and Foundry smart contracts. Keep each change
scoped to the leased issue and preserve the existing package boundaries.

## Repository layout

- `packages/web`: Next.js application for DAO governance UI and configuration-driven runtime.
- `packages/indexer`: Subsquid indexer, GraphQL runtime, migrations, reconciliation, audits,
  and unit/integration/accuracy tests.
- `contracts`: Foundry contracts and deployment scripts.
- `degov.yml`, `.env.example`, `docker-compose.yml`, and `docker/`: local deployment and
  service configuration.
- `docs/`: repository documentation, especially indexer architecture, guides, runbooks, and
  schema reference.

## Command policy

Use root `just` commands first so package paths and flags stay consistent.

The default non-mutating verification gate is:

```sh
just web lint
just indexer test-unit
```

Run additional scoped commands only when the touched area requires them:

- Dependency/bootstrap changes: `just install`.
- Web runtime, route, component, or configuration changes: `just web lint`; add
  `just web build` when the change affects build-time config, Next.js routing, server code,
  or generated runtime config.
- Indexer processor, model, reconciliation, audit, or helper changes: `just indexer test-unit`.
- Indexer schema or ABI changes: `just indexer codegen`, then `just indexer build`, then the
  relevant `just indexer test-*` command.
- Indexer migration changes: `just indexer db-migrate` only against an intentional local/test
  database; never run force migrations unless the issue explicitly asks for it.
- Indexer accuracy or integration changes: use `just indexer test-accuracy`,
  `just indexer test-integration`, or the focused `verify-*`/`audit-*` commands named in the
  issue or related docs.
- Contract changes under `contracts`: run `make fmt` and `make test` from `contracts/` when
  Foundry is available; record the environment limitation if `forge` is not installed.

Do not run deployment or chain-writing commands (`make deploy`, broadcast scripts, production
migrations, or scripts requiring private keys) unless the issue explicitly requests that exact
operation and the required environment is intentionally provided.

## Execution rules

Read `README.md` and `docs/README.md` before changing code. For indexer work, also read the
relevant architecture, guide, runbook, or schema document linked from `docs/README.md`.

Keep secrets out of durable surfaces: issue comments, PR bodies, commit messages, logs, test
fixtures, generated config, and documentation. Use environment variables and example values only.

Use Conductor tracker tools for attempt results, terminal records, review handoff, repair
completion, and closeout. Do not hand-write lifecycle state into commit messages or issue
comments when a structured tracker record exists.
