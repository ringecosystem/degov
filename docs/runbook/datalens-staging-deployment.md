# Datalens Staging Deployment Runbook

> Purpose: define the staging deployment path for selected DAOs running through
> one shared Datalens-native DeGov indexer deployment.
>
> Read this when: preparing or reviewing GitOps changes for the HBX-244 manual
> migration wave.
>
> This does not define production rollout policy; use
> `docs/runbook/datalens-dao-migration.md` before promotion.

## Deployment contract

Use `deploy/staging/datalens-indexer-daos.json` as the source-controlled
staging contract. It pins the Datalens-native image repository,
`degov-datalens-indexer` entrypoints, the shared fresh migration DB, all-mode
contract set config, scoped GraphQL routes, and worker state.

The release workflow publishes the indexer image as:

```text
ghcr.io/ringecosystem/degov/indexer:sha-<git-sha>
```

Deploy one workload set for the selected contract sets:

- one fresh Postgres index database initialized by
  `apps/indexer/migrations/0001_init.sql`;
- one `run` workload with `DEGOV_INDEXER_CONTRACT_SET_MODE=all`;
- one `graphql` workload backed by the shared DB;
- one `worker` workload backed by the shared DB and config-file `rpc.chains`;
- one or more scoped DAO hostnames or paths routed to the single GraphQL
  service.

Keep staging namespace, database name, image tag, and scoped GraphQL routes
separate from production. Do not share a production DB, production GraphQL
route, or production web config with a Datalens migration validation pod.

The Datalens GraphQL routes are additive during validation. Do not remove or
repoint existing DAO hostnames/endpoints until the new shared indexer DB reset,
all-mode indexing workload, GraphQL service, scoped routes, and web reads have
been validated together.

## Required environment

The shared indexer, GraphQL service, and worker must receive:

- `DEGOV_INDEXER_DATABASE_URL`: points to the fresh shared DB, for example
  `degov_datalens_migration_all_contract_sets`.
- `DEGOV_INDEXER_CONFIG_FILE`: path to the mounted config file containing
  `chains` contract sets and `rpc.chains` URL env names.
- `DEGOV_INDEXER_CONTRACT_SET_MODE=all`: runs every configured contract set.
  Set `DEGOV_INDEXER_DAO_CODE` only for a temporary debug filter.
- `DATALENS_ENDPOINT`: Datalens service base URL, not `/native/graphql`.
- `DATALENS_TOKEN`: application bearer token from GitOps-managed secrets.
- `DATALENS_APPLICATION`: `degov-staging` for staging validation.
- `DATALENS_DATASET_FAMILY` and `DATALENS_DATASET_NAME`.
- `DEGOV_INDEXER_GRAPHQL_BIND_ADDRESS`: local socket address for the service,
  for example `0.0.0.0:4350`.
- `DEGOV_INDEXER_GRAPHQL_ENDPOINT`: public GraphQL URL used by the service to
  derive an extra scoped path, for example
  `https://indexer.next.degov.ai/<dao-code>/graphql`.
- `DEGOV_INDEXER_GRAPHQL_PATH`: additional scoped route path when the public
  endpoint is not enough, for example `/<dao-code>/graphql`.

The mounted config file is the source of truth for chain ids, network names,
governor/token/timelock addresses, start blocks, and worker RPC env names. Keep
legacy `DATALENS_CHAINS_JSON` and single-contract envs only for local or
emergency single-DAO debug runs.

Run `migrate` against the fresh shared DB before starting `run`. Start
`graphql` only after the DB schema exists and the scoped staging web routes
point at the staging GraphQL service.

## Datalens dependency gate

Confirm these Datalens server dependencies before rollout:

- endpoint responds to the native GraphQL readiness smoke check;
- chain config includes the selected chain id/name and EVM log dataset;
- S3/cache backing the queried dataset is healthy for the selected range;
- application auth accepts the `degov-staging` token;
- the Datalens query block range limit is compatible with the chunk size
  configured in the DAO env.

Use the runtime smoke check with a token loaded from secret management:

```bash
pnpm run indexer:smoke-datalens
```

## Worker state

Keep `DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED=false` in staging GitOps until
checkpoint/status integration proves refresh tasks are created, processed,
retried, and surfaced in diagnostics. The staging contract records this as
`onchainRefreshWorker.enabled=false`.

When the worker is enabled later, deploy it as a separate workload using the
`worker` entrypoint. Prefer `rpc.chains` in `DEGOV_INDEXER_CONFIG_FILE` and
provide each referenced URL env from secrets, such as `DARWINIA_RPC_URL` or
`LISK_RPC_URL`. Keep `DEGOV_ONCHAIN_REFRESH_CURRENT_POWER_METHOD=getVotes`
unless a DAO requires `getCurrentVotes`. Power refresh must come from onchain
RPC reads, not log-derived fallback mode. Monitor `onchainRefreshBacklog` plus
`onchainRefreshErrors`.

## Rollout checks

Use the repo scripts for database and GraphQL checks. Kubernetes commands must
target the staging cluster and namespace; in Helixbox workspaces use
`kubectl --kubeconfig=avault/.kube/<cluster>.config`.

```bash
kubectl --kubeconfig=avault/.kube/<cluster>.config \
  -n <staging-namespace> rollout status deploy/degov-datalens-indexer

kubectl --kubeconfig=avault/.kube/<cluster>.config \
  -n <staging-namespace> logs deploy/degov-datalens-indexer --since=10m
```

Look for pod startup, configured contract sets, chain, dataset, DB migration,
GraphQL startup, and projection error fields in logs. Any projection error
should include enough context to identify the DAO, stream, block range,
contract set, and failing projection.

Check GraphQL availability:

```bash
curl -fsS "$DEGOV_INDEXER_GRAPHQL_ENDPOINT" \
  -H 'content-type: application/json' \
  --data '{"query":"query { dataMetrics(limit: 1) { proposalsCount } }"}'
```

Do not treat missing checkpoint advancement, worker task status, or page sync
percentage as current staging acceptance until the staging runner performs live
Datalens chunk processing and checkpoint commits.

## Future post-runner checks

After live Datalens chunk processing and checkpoint commits are enabled in
staging, reclassify these checks as required acceptance.

Check DB checkpoint progress and sync percentage:

```bash
pnpm run audit:reconcile -- \
  --database-url "$DEGOV_INDEXER_DATABASE_URL" \
  --json
```

The JSON output includes `processedHeight`, `targetHeight`, `lagBlocks`,
`syncPercent`, `reconcileBacklog`, `reconcileErrors`,
`onchainRefreshBacklog`, and `onchainRefreshErrors`.

For DAOs with Tally coverage, run the Tally/onchain comparison after indexing
reaches the intended target height. The Tally/onchain script reads DeGov
GraphQL endpoints from the targets file and does not accept a database URL.

```bash
pnpm run audit:tally-onchain -- \
  --targets-file apps/indexer/scripts/indexer-accuracy-targets.json \
  --json-file reports/tally-onchain-e2e.json \
  --markdown-file reports/tally-onchain-e2e.md
```

## Rollback

Rollback does not require an in-place DB migration because staging uses a fresh
Datalens migration database.

1. Revert the staging GitOps image tag to the previous known-good image.
2. Restore the previous env/config secret set and mounted indexer config file.
3. Repoint scoped staging web GraphQL endpoints to the previous staging
   endpoints.
4. Keep or set `DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED=false`.
5. Leave the failed shared `degov_datalens_migration_*` DB intact for
   inspection, or delete it only after the validation notes have been captured.
6. Re-run pod readiness and GraphQL availability checks against the restored
   deployment.
