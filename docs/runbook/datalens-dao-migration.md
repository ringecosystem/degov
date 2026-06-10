# Datalens DAO Production Migration Runbook

> Purpose: define the production cutover path for moving one or more DeGov DAO
> indexers from the SQD/v4 runtime to the Datalens-native runtime.
>
> Read this when: staging proof is complete and a DAO is ready for production
> migration under the HBX-244 manual migration wave.
>
> This does not define staging deployment mechanics or detailed incident
> diagnosis. Use `docs/runbook/datalens-staging-deployment.md` for staging proof
> and `docs/runbook/datalens-indexer-observability.md` for detailed health and
> troubleshooting checks.

## Migration Contract

This is an incompatible indexer migration. The normal production path is a
fresh shared Postgres indexer database, Datalens-native schema initialization,
and a clean reindex from each configured DAO's start block. The HBX-307
deployment model is one DB, one `DEGOV_INDEXER_CONTRACT_SET_MODE=all` indexer,
one GraphQL service, one worker, and scoped DAO routes or hostnames. Reusing an
existing SQD/v4 database is not allowed unless that specific deployment has a
written, validated DB reuse path with parity evidence and rollback coverage.

DB migrations alone cannot rewrite historical projections that were already
indexed under the old runtime. A schema migration can create or reshape tables,
but it does not replay old blocks through the new Datalens query planning,
event decode, projection, checkpoint, power refresh, or aggregate metric
semantics. Once old rows have been projected, the correct way to produce
Datalens-native history is to initialize a clean DB and reindex. Treat any
in-place rewrite as a separate migration design, not as the default production
runbook.

Keep this migration manual for HBX-244 coordination. Do not rely on Conductor
automation for cutover decisions.

## Source Documents

- Staging proof: `docs/runbook/datalens-staging-deployment.md`.
- Runtime health and validation checks:
  `docs/runbook/datalens-indexer-observability.md`.
- Tally/onchain comparison details: `docs/runbook/tally-comparison-e2e.md`.
- Compatibility policy:
  `docs/spec/datalens-dao-compatibility-matrix.md`.
- Datalens-native DB ownership: `apps/indexer/README.md`.

## Current Package Boundary

Be explicit about which checks are available now and which are acceptance
signals for later packages.

- Available now: Datalens connectivity, application auth, chain/dataset
  discovery, DB schema initialization, runtime packaging/readiness commands,
  GraphQL endpoint configuration, and web/API smoke checks.
- Available after projection packages land: checkpoint advancement, proposal
  rows, delegate rows, `data_metric.power_sum`, and row-family parity.
- Available after worker task processing lands: `onchain_refresh_task` drain,
  refreshed delegate power, and worker retry/error validation.

Do not declare a production DAO healthy from future-only signals until the
relevant projection or worker package has landed. Conversely, do not classify a
missing checkpoint, empty projection count, or undrained refresh queue as an
incident while the deployed package is still at the readiness boundary.

## Preconditions

All preconditions must be true before scheduling production cutover.

- Compatibility preflight passed for the DAO and any degraded fallback is
  documented according to
  `docs/spec/datalens-dao-compatibility-matrix.md`.
- Staging proof completed with the same DAO config shape, Datalens chain/dataset
  identity, and candidate image tag intended for production.
- Datalens server is deployed and reachable from the production indexer
  namespace.
- Datalens application auth is configured for the production application, such
  as `degov-live`, with token delivery through secret management.
- Required chain datasets are enabled in Datalens, especially the EVM log
  dataset selected by `DATALENS_DATASET_FAMILY` and `DATALENS_DATASET_NAME`.
- Datalens cache and object storage are healthy for the selected chain and
  historical ranges. Follow the cache checks in the observability runbook.
- DeGov Datalens-native image is built, published, and pinned by immutable tag,
  such as `ghcr.io/ringecosystem/degov/indexer:sha-<git-sha>`.
- Target DB initialization is ready: a new database can be created, credentials
  can be mounted, and `pnpm run indexer:migrate` can initialize the
  Datalens-native schema.
- The production indexer config file can be mounted through
  `DEGOV_INDEXER_CONFIG_FILE` and contains every contract set in the rollout
  plus `rpc.chains` URL env names for the shared worker.
- Production web/API cutover path is known: DB pointer, image tag, runtime
  entrypoint, GraphQL endpoint, and web config changes can be reverted
  independently.
- Old SQD/v4 production database and runtime can remain available throughout
  the validation window.

## Operator Inputs

Collect these per DAO before starting:

```sh
export DAO_CODE=<dao-code>
export CHAIN_ID=<chain-id>
export DATALENS_CHAIN_NAME=<configured-datalens-chain-name>
export DATALENS_DATASET_FAMILY=evm
export DATALENS_DATASET_NAME=logs
export DATALENS_APPLICATION=<production-datalens-application>
export DATALENS_ENDPOINT=<datalens-service-base-url>
export DEGOV_INDEXER_CONFIG_FILE=<mounted-indexer-config-file>
export DEGOV_INDEXER_CONTRACT_SET_MODE=all
export TARGET_DB_URL=<new-shared-datalens-postgres-url>
export OLD_DB_URL=<current-sqd-v4-postgres-url>
export CANDIDATE_IMAGE=ghcr.io/ringecosystem/degov/indexer:sha-<git-sha>
export DEGOV_INDEXER_GRAPHQL_ENDPOINT=<production-or-validation-graphql-url>
export DEGOV_WEB_URL=<production-web-base-url>
```

Use secret-backed variables for `DATALENS_TOKEN`, database passwords, Tally API
keys, and any RPC credentials. Do not paste secret values into tickets, logs,
or committed files.

## Staging Proof Gate

Complete staging proof before production cutover. For the shared deployment:

1. Deploy the Datalens-backed staging indexer with a fresh shared staging DB,
   `DEGOV_INDEXER_CONTRACT_SET_MODE=all`, and the same config-file shape.
2. Confirm Datalens server, application auth, chain dataset, and cache checks
   pass.
3. Confirm the current package boundary is understood for the deployed image.
4. After projection packages land, wait for every configured staging
   checkpoint to reach the intended target height and verify
   proposal/delegate/metric counts by DAO scope.
5. After worker packages land and if the DAO supports refresh, run onchain
   refresh and verify queue drain.
6. Run side-by-side checks against the old runtime, Tally, and direct onchain
   reads where supported.
7. Record the staging image tag, target height, validation outputs, known
   degraded surfaces, and rollback owner before production scheduling.

For detailed commands, use the staging and observability runbooks instead of
duplicating all checks here.

## Shared Production Cutover

Use this sequence for the shared production deployment. Individual DAO cutover
still happens through scoped routes, web config, and validation targets, not
through separate Datalens-native databases.

### 1. Freeze The Cutover Scope

Record the exact DAO set, image tag, current production DB pointers, shared
target DB name, current production image/env, scoped routes, and rollback
commit or GitOps revision. Keep this record outside the production DB being
changed.

Do not include unsupported DAOs. If compatibility preflight classifies a DAO as
unsupported, exclude it from active production workloads before continuing.

### 2. Create The Target DB

Create one new production target database for the all-mode Datalens-native
deployment. Use a name that clearly marks it as shared, Datalens-native, and
production, for example:

```text
degov_datalens_prod_all_contract_sets
```

Do not point the Datalens-native indexer at the existing SQD/v4 database unless
there is a validated DB reuse path for this exact deployment.

Initialize the target DB:

```sh
DEGOV_INDEXER_DATABASE_URL="$TARGET_DB_URL" pnpm run indexer:migrate
```

Expected signal: the command completes and the schema ownership check in
`apps/indexer/README.md` remains true. If initialization fails, stop the
cutover and keep production on the old runtime.

### 3. Deploy The Datalens-Backed Indexer

Deploy production validation workloads using:

- image `CANDIDATE_IMAGE`;
- one `run` entrypoint with `DEGOV_INDEXER_CONTRACT_SET_MODE=all`;
- `graphql` entrypoint only after DB initialization is complete;
- `worker` entrypoint only when worker task processing is supported and enabled
  for the configured contract sets;
- production Datalens endpoint, application, dataset, and mounted config file
  containing chain/dataset contract sets plus `rpc.chains`;
- `DEGOV_INDEXER_DATABASE_URL="$TARGET_DB_URL"`.

Keep the old SQD/v4 runtime serving production while the Datalens workload
indexes in parallel.

Current readiness-only packages should pass Datalens, DB, runtime, and GraphQL
configuration checks but will not yet process chunks. After projection packages
land, wait for the checkpoint to reach the agreed production target height
before cutover.

### 4. Wait For Processed Height

After projection packages land, monitor checkpoint height until the DAO reaches
the intended target height:

```sh
psql "$TARGET_DB_URL" -v dao="$DAO_CODE" -v chain="$CHAIN_ID" -x -c "
SELECT
  dao_code,
  chain_id,
  processed_height,
  target_height,
  target_height - processed_height AS lag_blocks,
  updated_at,
  last_error
FROM degov_indexer_checkpoint
WHERE dao_code = :'dao'
  AND chain_id = :'chain'::int;
"
```

Expected signal: `processed_height` advances, `lag_blocks` trends down, and
`last_error` is empty. If the current deployed package is readiness-only, record
that checkpoint advancement is not available yet and do not proceed to data
cutover.

### 5. Run Onchain Refresh When Supported

After worker task processing lands, enable and run onchain refresh only for DAOs
whose compatibility preflight supports the refresh path. Check queue status:

```sh
psql "$TARGET_DB_URL" -v dao="$DAO_CODE" -v chain="$CHAIN_ID" -x -c "
SELECT
  status,
  count(*) AS rows,
  min(next_run_at) AS oldest_next_run_at,
  max(attempts) AS max_attempts,
  count(*) FILTER (
    WHERE locked_at IS NOT NULL
      AND locked_at < extract(epoch FROM now() - interval '15 minutes')
  ) AS stale_locks
FROM onchain_refresh_task
WHERE dao_code = :'dao'
  AND chain_id = :'chain'::int
GROUP BY status
ORDER BY status;
"
```

Expected signal: pending and processing rows drain, failed rows remain bounded
and actionable, and stale locks are zero or recovered. If worker task
processing has not landed, keep the worker disabled and do not treat an empty or
undrained refresh queue as production-ready power evidence.

### 6. Run Side-By-Side Validation

Run the required SQL and API checks against the target DB and validation
GraphQL endpoint. These are the minimum production cutover checks; use the
observability runbook for deeper diagnosis.

Checkpoint height:

```sh
psql "$TARGET_DB_URL" -v dao="$DAO_CODE" -v chain="$CHAIN_ID" -x -c "
SELECT processed_height, target_height, target_height - processed_height AS lag_blocks
FROM degov_indexer_checkpoint
WHERE dao_code = :'dao'
  AND chain_id = :'chain'::int;
"
```

Proposal count:

```sh
psql "$TARGET_DB_URL" -v dao="$DAO_CODE" -v chain="$CHAIN_ID" -x -c "
SELECT count(*) AS proposal_count
FROM proposal
WHERE dao_code = :'dao'
  AND chain_id = :'chain'::int;
"
```

Delegate count:

```sh
psql "$TARGET_DB_URL" -v dao="$DAO_CODE" -v chain="$CHAIN_ID" -x -c "
SELECT count(*) AS delegate_count
FROM delegate
WHERE dao_code = :'dao'
  AND chain_id = :'chain'::int
  AND is_current = true;
"
```

Power sum:

```sh
psql "$TARGET_DB_URL" -v dao="$DAO_CODE" -v chain="$CHAIN_ID" -x -c "
SELECT power_sum
FROM data_metric
WHERE dao_code = :'dao'
  AND chain_id = :'chain'::int
ORDER BY id
LIMIT 5;
"
```

Onchain refresh status:

```sh
psql "$TARGET_DB_URL" -v dao="$DAO_CODE" -v chain="$CHAIN_ID" -x -c "
SELECT status, count(*) AS rows
FROM onchain_refresh_task
WHERE dao_code = :'dao'
  AND chain_id = :'chain'::int
GROUP BY status
ORDER BY status;
"
```

GraphQL smoke:

```sh
curl -fsS "$DEGOV_INDEXER_GRAPHQL_ENDPOINT" \
  -H "content-type: application/json" \
  --data '{"query":"query { indexerStatus { processedHeight targetHeight syncedPercentage isSynced } proposalsPage(orderBy: [id_ASC], limit: 0) { totalCount } contributorsPage(orderBy: [id_ASC], limit: 0) { totalCount } dataMetrics(where: { id_eq: \"global\" }) { proposalsCount powerSum memberCount } }"}'
```

Web delegates/proposals smoke:

```sh
curl -fsSI "$DEGOV_WEB_URL/delegates"
curl -fsSI "$DEGOV_WEB_URL/proposals"
```

Side-by-side, Tally, and onchain audit:

```sh
pnpm run audit:tally-onchain \
  --targets-file apps/indexer/scripts/indexer-accuracy-targets.json \
  --json-file reports/tally-onchain-e2e.json \
  --markdown-file reports/tally-onchain-e2e.md
```

Use a targets file whose `indexerEndpoint` points at the validation GraphQL
endpoint backed by `TARGET_DB_URL`.

Use Tally mismatch results as diagnostics. Direct onchain reads remain
authoritative when Tally and DeGov disagree.

### 7. Switch Production

Switch production only after the staging gate and production validation checks
pass for the package capabilities that have landed.

Cut over in this order:

1. Point the production indexer deployment at `CANDIDATE_IMAGE` and the
   Datalens-native env.
2. Point the production DB secret or DB pointer at `TARGET_DB_URL`.
3. Point the production GraphQL/API route at the Datalens-backed service if it
   was using a validation-only route.
4. Point the production web config at the production GraphQL endpoint.
5. Roll the affected workloads and confirm readiness.
6. Repeat GraphQL and web smoke checks against the public production URLs.

Keep the old SQD/v4 runtime and DB available but out of the public serving path
until the validation window passes.

### 8. Stop The Old Runtime

After production traffic is served by the Datalens-backed DB/image/env and the
public smoke checks pass, stop or scale down the old SQD/v4 runtime for this
DAO. Do not delete the old DB, volumes, secrets, or SQD-specific resources yet.

## Scoped DAO Route Cutover

Use scoped route cutovers only after at least one DAO has completed validation
against the shared Datalens deployment and rollback is understood. A batch is a
list of DAO routes/web configs cut over to the shared DB-backed GraphQL service,
not a set of separate Datalens-native DBs.

Batch controls:

- Keep one shared target DB for the all-mode Datalens deployment. Do not create
  new DAO-specific Datalens-native DBs unless rollback requires a temporary
  validation fork.
- Require every DAO in the batch to pass compatibility preflight and staging
  proof before the batch starts.
- Freeze one image tag for the batch unless a DAO has a documented exception.
- Cut over DAOs in small waves with a validation pause between waves.
- Stop the batch on the first unexplained Datalens, checkpoint, projection,
  refresh, GraphQL, or web failure.
- Roll back only the affected DAO when failures are DAO-specific. Roll back the
  whole batch only when the failure is shared infrastructure, image, schema, or
  Datalens application behavior.
- Track old DB pointers, shared target DB pointer, and scoped route/web config
  per DAO so rollback never depends on memory or shell history.

Minimum batch record:

| DAO | Old DB | Shared target DB | Image | Target height | Refresh supported | Validation owner | Cutover status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `<dao-code>` | `<old-db>` | `<target-db>` | `<sha-tag>` | `<height>` | `yes/no` | `<owner>` | `<pending/done/rollback>` |

## Rollback

Rollback is a pointer/config revert, not a destructive data operation.

1. Revert production image, env, GraphQL route, web config, and DB pointer to
   the previous SQD/v4 runtime values.
2. Roll the affected production workloads.
3. Confirm the old GraphQL endpoint and web delegates/proposals pages are
   healthy.
4. Keep the Datalens target DB for inspection unless it contains known
   sensitive test data that must be handled by the normal secret/data policy.
5. Keep the old SQD/v4 DB until the validation window passes and cleanup is
   explicitly approved.

Do not delete old data immediately. Immediate deletion removes the fastest
rollback path and destroys evidence needed to diagnose projection or refresh
mismatches.

## Post-Migration Cleanup

Cleanup is a separate, explicit action after the validation window passes. It
must not be bundled into initial cutover.

Before cleanup:

- Confirm the DAO has served production from Datalens for the agreed validation
  window.
- Confirm rollback is no longer required for that DAO.
- Confirm backups or retention requirements for the old SQD/v4 DB and volumes.
- Get explicit confirmation naming the DAO and resources to remove.

Allowed cleanup scope after confirmation:

- old SQD/v4 indexer deployment, processor, and worker resources;
- old SQD/v4-specific config and secrets that are not shared by web/API;
- old SQD/v4 DB, PVC, volume, or backup objects after retention approval;
- obsolete SQD-specific service routes and monitoring alerts.

Do not delete shared production web, GraphQL, registry, Datalens, object
storage, or chain dataset resources as part of SQD cleanup.

## Stop Conditions

Stop the migration and keep or restore the old production runtime when any of
these occur:

- Datalens health, auth, chain discovery, dataset query, cache, or object
  storage checks fail.
- DB initialization fails or the target DB is not clean when a clean DB is
  required.
- The deployed image cannot pass its current runtime readiness boundary.
- After projection packages land, checkpoint height does not advance or
  advances without matching projection rows.
- After worker packages land, onchain refresh fails repeatedly or power data
  cannot be explained by direct chain reads.
- GraphQL smoke fails after SQL checks pass.
- Production web delegates or proposals pages fail after cutover.
- Tally/onchain audit finds a DeGov mismatch that direct chain reads confirm.

When stopped before cutover, leave production on the old runtime. When stopped
after cutover, execute rollback and preserve both old and target DBs for
diagnosis.
