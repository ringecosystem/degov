# Datalens Staging Deployment Runbook

> Purpose: define the staging deployment path for selected DAOs running the
> Datalens-native DeGov indexer.
>
> Read this when: preparing or reviewing GitOps changes for the HBX-244 manual
> migration wave.
>
> This does not define production rollout policy; use
> `docs/runbook/datalens-dao-migration.md` before promotion.

## Deployment contract

Use `deploy/staging/datalens-indexer-daos.json` as the source-controlled
staging contract. It pins the Datalens-native image repository,
`degov-datalens-indexer` entrypoints, selected DAO env, fresh migration DB
names, and worker state.

The release workflow publishes the indexer image as:

```text
ghcr.io/ringecosystem/degov/indexer:sha-<git-sha>
```

Deploy one workload set per selected DAO. Keep staging namespace, database
name, image tag, and GraphQL route separate from production. Do not share a
production DB, production GraphQL route, or production web config with a
Datalens migration validation pod.

The Datalens GraphQL route is additive during validation. Do not remove or
repoint existing DAO hostnames/endpoints until the new indexer DB reset,
indexing workload, GraphQL service, and web reads have been validated together.

## Required environment

Each DAO indexer deployment must receive:

- `DEGOV_INDEXER_DATABASE_URL`: points to a fresh DB whose name starts with
  `degov_datalens_migration_`.
- `DATALENS_ENDPOINT`: Datalens service base URL, not `/native/graphql`.
- `DATALENS_TOKEN`: application bearer token from GitOps-managed secrets.
- `DATALENS_APPLICATION`: `degov-staging` for staging validation.
- `DATALENS_CHAIN_FAMILY`, `DATALENS_CHAIN_NAME`, and `DATALENS_CHAIN_ID`.
- `DATALENS_DATASET_FAMILY` and `DATALENS_DATASET_NAME`.
- `DATALENS_CHAINS_JSON` when running structured multi-chain or multi-contract
  indexing. Keep the legacy single-contract envs during transition only when a
  single selected DAO still needs them.
- `DATALENS_GOVERNOR_ADDRESS`, `DATALENS_GOVERNOR_TOKEN_ADDRESS`,
  `DATALENS_GOVERNOR_TOKEN_STANDARD`, and `DATALENS_TIMELOCK_ADDRESS`.
- `DEGOV_INDEXER_GRAPHQL_BIND_ADDRESS`: local socket address for the service,
  for example `0.0.0.0:4350`.
- `DEGOV_INDEXER_GRAPHQL_ENDPOINT`: public GraphQL URL consumed by web and
  smoke checks, for example `https://indexer.next.degov.ai/<dao-code>/graphql`.
- `DEGOV_INDEXER_GRAPHQL_PATH`: public route path mounted by the service when
  it is not just `/graphql`, for example `/<dao-code>/graphql`.

Run `migrate` against the fresh DB before starting `run`. Start `graphql` only
after the DB schema exists and the staging web route points at the staging
GraphQL endpoint.

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
`worker` entrypoint. Provide `DEGOV_ONCHAIN_REFRESH_RPC_URL` from secrets and
keep `DEGOV_ONCHAIN_REFRESH_CURRENT_POWER_METHOD=getVotes` unless a DAO
requires `getCurrentVotes`. Power refresh must come from onchain RPC reads, not
log-derived fallback mode. Monitor `onchainRefreshBacklog` plus
`onchainRefreshErrors`.

## Rollout checks

Use the repo scripts for database and GraphQL checks. Kubernetes commands must
target the staging cluster and namespace; in Helixbox workspaces use
`kubectl --kubeconfig=avault/.kube/<cluster>.config`.

```bash
kubectl --kubeconfig=avault/.kube/<cluster>.config \
  -n <staging-namespace> rollout status deploy/<dao>-degov-datalens-indexer

kubectl --kubeconfig=avault/.kube/<cluster>.config \
  -n <staging-namespace> logs deploy/<dao>-degov-datalens-indexer --since=10m
```

Look for pod startup, configured DAO, chain, dataset, DB migration, GraphQL
startup, and projection error fields in logs. Any projection error should
include enough context to identify the DAO, stream, block range, and failing
projection.

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

Rollback does not require an in-place DB migration because staging uses fresh
Datalens migration databases.

1. Revert the staging GitOps image tag to the previous known-good image.
2. Restore the previous env/config secret set for the selected DAO.
3. Repoint the staging web GraphQL endpoint to the previous staging endpoint.
4. Keep or set `DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED=false`.
5. Leave the failed `degov_datalens_migration_*` DB intact for inspection, or
   delete it only after the validation notes have been captured.
6. Re-run pod readiness and GraphQL availability checks against the restored
   deployment.
