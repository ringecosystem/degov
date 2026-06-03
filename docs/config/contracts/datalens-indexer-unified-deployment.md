# Datalens Indexer Unified Deployment Contract

> Purpose: define the DEGOV-side config contract GitOps should render for the
> unified Datalens indexer deployment.
>
> Read this when: preparing local, staging, or production deployment config for
> the all-contract-set Datalens indexer.
>
> This does not contain cluster-specific manifests, sealed secrets, or external
> GitOps repository edits.

## Deployment shape

Local, staging, and production should use the same shape:

- one fresh Postgres indexer database;
- one `migrate` job or command applying the existing
  `apps/indexer/migrations/0001_init.sql`;
- one `run` workload with `DEGOV_INDEXER_CONTRACT_SET_MODE=all`;
- one `graphql` workload backed by the shared DB;
- one `worker` workload backed by the shared DB and the same config file;
- multiple scoped DAO routes or hostnames pointing at the single GraphQL
  service.

Do not add migration files for this rollout. Moving from the old SQD/v4 runtime
to the Datalens-native runtime remains a fresh DB initialization and reindex.

## Required runtime env

All indexer workloads need:

```text
DEGOV_INDEXER_DATABASE_URL=<shared-fresh-postgres-url>
DEGOV_INDEXER_CONFIG_FILE=/app/indexer.yml
DATALENS_ENDPOINT=<datalens-service-base-url>
DATALENS_APPLICATION=<degov-staging-or-degov-live>
DATALENS_TOKEN=<secret-backed-token>
DATALENS_DATASET_FAMILY=evm
DATALENS_DATASET_NAME=logs
```

The `run` workload additionally needs:

```text
DEGOV_INDEXER_CONTRACT_SET_MODE=all
DEGOV_INDEXER_TARGET_HEIGHT=latest
DEGOV_INDEXER_RUN_ONCE=false
```

Leave `DEGOV_INDEXER_DAO_CODE` unset for normal all-mode runs. Set it only for
a temporary debug filter against the shared config file.

## Config file

Render a mounted config file at `DEGOV_INDEXER_CONFIG_FILE`. The file should
contain the multi-chain contract sets and worker RPC env references:

```yaml
datalens:
  endpoint: https://datalens.ringdao.com
  application: degov-live
  finality: durable_only
  dataset:
    family: evm
    name: logs
  queryLimits:
    blockRangeLimit: 1000

rpc:
  chains:
    "46":
      urlEnv: DARWINIA_RPC_URL
    "1135":
      urlEnv: LISK_RPC_URL

chains:
  - chainId: 46
    networkName: darwinia
    contracts:
      - daoCode: degov-demo-dao
        governor: "0xC9EA55E644F496D6CaAEDcBAD91dE7481Dcd7517"
        governorToken: "0xbC9f58566810F7e853e1eef1b9957ac82F9971df"
        tokenStandard: ERC20
        timelock: "0x6AB15C6ada9515A8E21321e241013dB457C8576c"
        startBlock: 5873342
  - chainId: 1135
    networkName: lisk
    contracts:
      - daoCode: lisk-dao
        governor: "0x58a61b1807a7bDA541855DaAEAEe89b1DDA48568"
        governorToken: "0x2eE6Eca46d2406454708a1C80356a6E63b57D404"
        tokenStandard: ERC20
        timelock: "0x2294A7f24187B84995A2A28112f82f07BE1BceAD"
        startBlock: 568752
```

Environment variables override file values. Keep `DATALENS_TOKEN`,
`DEGOV_INDEXER_DATABASE_URL`, and each `rpc.chains.*.urlEnv` value in secrets.

## GraphQL routes

Run one GraphQL service and route scoped DAO endpoints to it:

```text
/graphql
/<dao-code>/graphql
```

The service derives extra scoped paths from
`DEGOV_INDEXER_GRAPHQL_ENDPOINT` or `DEGOV_INDEXER_GRAPHQL_PATH`. Preserve
existing DAO hostnames during validation, then repoint them to the shared
GraphQL service after DB, indexer, worker, GraphQL, and web checks pass.

## Rollout guardrails

- Render one shared DB secret for the Datalens-native indexer.
- Mount the same config file into the `run` and `worker` workloads.
- Keep old DAO-specific DBs and runtimes available until scoped route cutover
  and rollback validation pass.
- Enable the worker only when `rpc.chains` URL envs are secret-backed and
  checkpoint/status/onchain diagnostics are ready for the deployed package.
- Do not edit external GitOps repositories from the DEGOV code change; apply
  this contract in the GitOps repo as a separate rollout step.
