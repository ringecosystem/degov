# Datalens Indexer Observability Runbook

Purpose: define concrete operator checks for Datalens-backed DeGov indexers in
staging and production.

Read this when: a DeGov DAO is replaying, appears stale, shows empty pages, or
needs a before/after health check during the HBX-244 Datalens migration.

This does not describe the deployment path for staging or production. Use
`docs/runbook/datalens-dao-migration.md` for DAO migration sequencing and
`docs/runbook/tally-comparison-e2e.md` for Tally/onchain comparison.

## Inputs

Collect these values before running checks:

- DeGov DAO code, chain id, governor address, token address, optional timelock
  address, and configured start block.
- Datalens service base URL, such as `https://datalens.ringdao.com`.
- Datalens application identity, such as `degov-live`.
- Secret-backed Datalens bearer token. Do not print or paste the token into
  issue comments, logs, shell history, or committed files.
- DeGov indexer database URL. Deployed services use
  `DEGOV_INDEXER_DATABASE_URL`; the examples below use the same name.
- DeGov GraphQL endpoint, for example
  `https://indexer.next.degov.ai/<dao-code>/graphql`. Deployed services use
  `DEGOV_INDEXER_GRAPHQL_ENDPOINT`; the examples below use the same name.
- DeGov web base URL for the environment under test.

Use placeholders in the examples below:

```sh
export DAO_CODE=<dao-code>
export CHAIN_ID=<chain-id>
export DATALENS_CHAIN_NAME=<configured-datalens-chain-name>
export DATALENS_DATASET_KEY=evm.logs
export GOVERNOR_ADDRESS=<lowercase-governor-address>
export TOKEN_ADDRESS=<lowercase-token-address>
export DATALENS_GOVERNOR_ADDRESS="$GOVERNOR_ADDRESS"
export DATALENS_GOVERNOR_TOKEN_ADDRESS="$TOKEN_ADDRESS"
export DATALENS_GOVERNOR_TOKEN_STANDARD=<erc20-or-erc721>
export DATALENS_TIMELOCK_ADDRESS=<lowercase-timelock-address>
export DATALENS_ENDPOINT=<datalens-service-base-url>
export DATALENS_APPLICATION=<datalens-application>
export DATALENS_TOKEN=<secret-backed-token>
export DEGOV_INDEXER_DATABASE_URL=<postgres-url>
export DEGOV_INDEXER_GRAPHQL_ENDPOINT=<degov-graphql-url>
export DEGOV_WEB_URL=<degov-web-base-url>
```

If an older local script still expects the shorter runbook names, map them to
the deployed names explicitly:

```sh
export DEGOV_DATABASE_URL="$DEGOV_INDEXER_DATABASE_URL"
export DEGOV_GRAPHQL_ENDPOINT="$DEGOV_INDEXER_GRAPHQL_ENDPOINT"
```

## Failure Domain Map

Run the checks in this order so the failing layer is clear:

| Check | Current package status | Healthy signal | Failure domain |
| --- | --- | --- | --- |
| Datalens `/health` and discovery | Available now. | Service responds and native GraphQL discovery succeeds for the DeGov application. | Datalens service, route, or application auth. |
| Chain and dataset availability | Available now through Datalens discovery and a small native query. | Configured chain and `evm.logs` dataset are enabled and can be queried for a bounded range. | Datalens chain/dataset config. |
| DB/migration readiness | Available now. | Migrations apply and expected Datalens-native tables exist. | DeGov database URL, credentials, migration, or schema drift. |
| GraphQL and web smoke | Available now. | GraphQL responds; delegates/proposals pages load; synced percentage is plausible when data exists. | API compatibility, web/API config, or stale DB view. |
| Runtime readiness | Available now. | `run_indexer`, `run_worker`, and GraphQL packaging checks stay alive or report only config/readiness errors. | Process config, secret mounts, service readiness, or packaging. |
| Active chunk processing | Available after projection packages are implemented. | `processed_height` advances toward `target_height`; chunk processing and commit logs appear. | DeGov query planning, decode/projection, DB transaction, or checkpoint writes. |
| Row-family counters | Available after projection packages are implemented. | Proposal, vote, delegate, contributor, and `data_metric` totals are non-empty for an active DAO. | Decode/projection or idempotent writes. |
| Checkpoint commits | Available after projection packages are implemented. | Checkpoint advancement occurs only with committed projection writes. | DB transaction or checkpoint contract. |
| Onchain refresh queue draining | Available now when the worker is enabled with an RPC URL. | Pending work drains; failed and stale locked rows stay bounded. | ChainTool/RPC, onchain refresh worker, or lock recovery. |
| Tally/onchain audit | Run after projection and worker packages are implemented and basic health passes. | Sampled proposal and power values agree with direct reads or have classified findings. | Business correctness after basic health passes. |

## Current Package Boundary

HBX-264 documents observability while the checked-in DeGov indexer is still at
the packaging/readiness boundary:

- `run_indexer` loads Datalens and database configuration, verifies Datalens
  native GraphQL readiness, logs the configured chain/dataset/contracts, and
  keeps the service alive.
- `run_worker` checks `DEGOV_INDEXER_DATABASE_URL` and
  `DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED`. When enabled, it also requires
  `DEGOV_ONCHAIN_REFRESH_RPC_URL` and drains `onchain_refresh_task`; when
  disabled, it keeps the service alive for packaging/readiness checks.
- `graphql` checks `DEGOV_INDEXER_GRAPHQL_ENDPOINT` packaging/configuration.
- `migrate` applies the Datalens-native Postgres schema.

Do not classify queue draining as a runtime failure when the worker is disabled.
When the worker is enabled, missing queue drain points to RPC configuration,
worker execution, or lock recovery. The readiness checks still cover Datalens
connectivity, DB/migrations, GraphQL/API smoke, and process startup before
business parity checks.

## Datalens Health

Check the service base endpoint before checking the DeGov indexer:

```sh
curl -fsS "$DATALENS_ENDPOINT/health"
```

Expected signal: HTTP 200 from the service health endpoint. If this fails, do
not debug DeGov projection code yet; verify the Datalens service, ingress, DNS,
and network path first.

Check native discovery using the same application identity and bearer token the
indexer uses:

```sh
curl -fsS "$DATALENS_ENDPOINT/native/graphql" \
  -H "Authorization: Bearer $DATALENS_TOKEN" \
  -H "x-datalens-application: $DATALENS_APPLICATION" \
  -H "content-type: application/json" \
  --data '{"query":"query { __schema { queryType { name } } }"}'
```

Expected signal: a GraphQL response with a query root and no authentication
error. A 401/403 or application-scoped error is a Datalens auth failure. Confirm
the application id, token source, secret mount, and whether the token was
rotated.

Check that the configured chain and dataset are present in Datalens native
discovery. Schema introspection only proves the native GraphQL route is alive;
it does not verify the configured chain or dataset. The concrete discovery
check below verifies that a chain matching `DATALENS_CHAIN_NAME` or `CHAIN_ID`
has an enabled `evm.logs` dataset:

```sh
curl -fsS "$DATALENS_ENDPOINT/native/graphql" \
  -H "Authorization: Bearer $DATALENS_TOKEN" \
  -H "x-datalens-application: $DATALENS_APPLICATION" \
  -H "content-type: application/json" \
  --data '{"query":"query DatalensDiscovery { discovery { chains { identity datasets { datasetKey rangeKinds selectors enabled } } } }"}' \
  | node -e '
const fs = require("fs");
const body = JSON.parse(fs.readFileSync(0, "utf8"));
if (body.errors?.length) throw new Error(JSON.stringify(body.errors));
const chainName = process.env.DATALENS_CHAIN_NAME;
const chainId = String(process.env.CHAIN_ID || "");
const datasetKey = process.env.DATALENS_DATASET_KEY || "evm.logs";
const chains = body.data?.discovery?.chains || [];
const match = chains.find((chain) => {
  const identity = chain.identity || {};
  const configuredName = identity.configuredName || identity.configured_name;
  const numericId = identity.networkId?.numeric ?? identity.network_id?.numeric;
  return configuredName === chainName || String(numericId || "") === chainId;
});
const dataset = match?.datasets?.find((entry) => entry.datasetKey === datasetKey);
if (!match || !dataset || dataset.enabled !== true) {
  throw new Error(`missing enabled ${datasetKey} for ${chainName || chainId}`);
}
console.log(`enabled ${datasetKey} for ${chainName || chainId}`);
'
```

Expected signal: the command prints `enabled evm.logs for <chain>`.

If the DeGov smoke command can run in the environment, also use the checked-in
startup boundary. This verifies Datalens auth and native GraphQL readiness, but
it still does not prove chunk processing or projection readiness:

```sh
pnpm run indexer:smoke-datalens
```

Run a concrete native query against the configured chain and `evm.logs` dataset.
Choose a bounded block range that is safe/finalized and small enough for the
application quota:

```sh
export DATALENS_TEST_FROM_BLOCK=<known-event-or-empty-safe-start-block>
export DATALENS_TEST_TO_BLOCK=<known-event-or-empty-safe-end-block>

curl -fsS "$DATALENS_ENDPOINT/native/graphql" \
  -H "Authorization: Bearer $DATALENS_TOKEN" \
  -H "x-datalens-application: $DATALENS_APPLICATION" \
  -H "content-type: application/json" \
  --data @- <<EOF
{
  "query": "query DatalensNativeQuery(\$input: QueryInput!) { query(input: \$input) { chain datasetKey range cache rows } }",
  "variables": {
    "input": {
      "chain": {
        "family": { "kind": "evm" },
        "configuredName": "$DATALENS_CHAIN_NAME",
        "networkId": { "numeric": $CHAIN_ID }
      },
      "datasetKey": { "family": "evm", "name": "logs" },
      "selector": {
        "kind": "evm_logs",
        "evmLogs": {
          "addresses": ["$GOVERNOR_ADDRESS", "$TOKEN_ADDRESS"],
          "topics": []
        }
      },
      "range": {
        "kind": "block",
        "start": $DATALENS_TEST_FROM_BLOCK,
        "end": $DATALENS_TEST_TO_BLOCK
      },
      "finality": "durable_only",
      "fields": {
        "include": ["block_number", "transaction_hash", "log_index", "address", "topics", "data"]
      }
    }
  }
}
EOF
```

Expected signal: a GraphQL response with `query.datasetKey` equal to `evm.logs`,
the requested chain identity, `cache` metadata, and a `rows` value. A zero-row
response is acceptable for an intentionally empty range; it still exercises the
target chain/dataset. Unsupported chain/dataset errors belong to Datalens
configuration, not DeGov projection.

## Datalens Cache Behavior

Repeat the native query above against the same chain, selector, and block range.
The native response currently exposes cache details in `query.cache`; no
cache-specific HTTP response headers are documented for this DeGov check.

Expected cache fields, when the Datalens service exposes them, include:

- `hit_ranges`
- `missing_ranges`
- `durable_hit_ranges`
- `hot_hit_ranges`
- `provider_fill_ranges`

A warm durable query over the same safe/finalized range should move toward
`hit_ranges` or `durable_hit_ranges` covering the range, with no persistent
`missing_ranges` or repeated `provider_fill_ranges` for the same chain, dataset,
selector, and range. Persistent provider fills, timeouts, or quota errors point
to Datalens cache/service capacity before DeGov decode/projection.

The current DeGov `run_indexer` package does not yet log cache fields per chunk.
When projection packages are implemented, add operator-visible log or metric
fields named `datalens_cache_hit_ranges`, `datalens_cache_missing_ranges`,
`datalens_cache_durable_hit_ranges`, `datalens_cache_hot_hit_ranges`, and
`datalens_cache_provider_fill_ranges` alongside DAO code, chain id, dataset,
selector summary, and block range.

## Current DB And Readiness Checks

Apply or verify the current Datalens-native database schema:

```sh
DEGOV_INDEXER_DATABASE_URL="$DEGOV_INDEXER_DATABASE_URL" pnpm run indexer:migrate
```

Expected signal: the migration command completes and logs that the
Datalens-native schema was applied. For a read-only check, confirm expected
tables exist:

```sh
psql "$DEGOV_INDEXER_DATABASE_URL" -x -c "
SELECT
  to_regclass('public.degov_indexer_checkpoint') AS checkpoint_table,
  to_regclass('public.degov_indexer_reconcile_task') AS reconcile_task_table,
  to_regclass('squid_processor.status') AS squid_status_table;
"
```

Expected signal: each column resolves to the requested table name. Missing
tables are DB/migration readiness issues.

Check current process readiness boundaries. The first two commands are service
processes and are expected to keep running after readiness logs appear:

```sh
DEGOV_INDEXER_DATABASE_URL="$DEGOV_INDEXER_DATABASE_URL" pnpm run indexer
DEGOV_INDEXER_DATABASE_URL="$DEGOV_INDEXER_DATABASE_URL" DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED=false pnpm run indexer:worker
DEGOV_INDEXER_GRAPHQL_ENDPOINT="$DEGOV_INDEXER_GRAPHQL_ENDPOINT" pnpm run indexer:graphql
```

Expected signal: `indexer` verifies Datalens and processes configured ranges,
`indexer:worker` logs disabled worker readiness and waits, and `indexer:graphql`
logs the configured endpoint.

## Future DeGov Indexer Health

This section is available after projection packages are implemented. With the
current HBX-264 package, a stale checkpoint, missing chunk log, or empty row
family can simply mean the runtime is still in placeholder readiness mode.

Read checkpoint state for the workload:

```sh
psql "$DEGOV_INDEXER_DATABASE_URL" -v dao="$DAO_CODE" -v chain="$CHAIN_ID" -x -c "
SELECT
  dao_code,
  chain_id,
  stream_id,
  data_source_version,
  next_block,
  processed_height,
  target_height,
  target_height - processed_height AS lag_blocks,
  updated_at,
  last_error,
  lock_owner,
  locked_at
FROM degov_indexer_checkpoint
WHERE dao_code = :'dao'
  AND chain_id = :'chain'::int
ORDER BY updated_at DESC;
"
```

Expected signal:

- `processed_height` is present after the first committed chunk.
- `processed_height` advances between samples.
- `target_height` is at or below the configured safe height when safe-height
  mode is enabled.
- `lag_blocks` trends down during catch-up and remains bounded after sync.
- `last_error`, `lock_owner`, and stale `locked_at` are empty unless an active
  worker owns the row.

Check the SQD compatibility sync view used by existing synced-percentage
consumers:

```sh
psql "$DEGOV_INDEXER_DATABASE_URL" -x -c "
SELECT id, height, hash
FROM squid_processor.status
WHERE id = 0;
"
```

Expected signal: `height` follows the latest committed
`degov_indexer_checkpoint.processed_height`. If checkpoint height advances but
this table is stale, the DB transaction path is not updating the compatibility
sync view that GraphQL/web consumers may still read.

Inspect chunk logs around the same time window:

```sh
kubectl --kubeconfig=../avault/.kube/<cluster>.config logs <indexer-pod> --since=30m | grep -E \
  'processing Datalens indexer chunk|committed Datalens indexer chunk|Datalens indexer chunk failed|transaction failed'
```

Expected signal: each line like:

```text
processing Datalens indexer chunk dao_code=<dao> chain_id=<chain> from_block=<from> to_block=<to> target_height=<target>
```

is followed by:

```text
committed Datalens indexer chunk and advanced checkpoint dao_code=<dao> chain_id=<chain> processed_height=<to> target_height=<target>
```

If the first line appears without the commit line, classify the next error:

- `Datalens runner query error` means Datalens transport, auth, quota, or
  native query failure.
- `EVM log normalization error` means Datalens returned an unexpected row shape.
- `DAO event decode error` means ABI/topic/data did not match the DeGov decoder
  for the configured source.
- `projection error` means decoded rows reached business logic but failed
  projection invariants.
- `transaction failed; checkpoint was not advanced` means database writes or
  checkpoint transaction failed.

Datalens log queries are retried up to the configured query attempt limit before
the chunk fails. A chunk that eventually commits after slow Datalens responses
is a transient Datalens/cache/provider signal. A chunk that exhausts attempts
and emits `Datalens runner query error` is still pre-decode and pre-DB; check
service auth, quota, cache fill, and native query shape before projection code.

Check row volume by event family for the indexed range:

```sh
psql "$DEGOV_INDEXER_DATABASE_URL" -v dao="$DAO_CODE" -v chain="$CHAIN_ID" -x -c "
WITH counts AS (
  SELECT 'proposal_created' AS family, count(*) AS rows, max(block_number) AS max_block
    FROM proposal_created WHERE dao_code = :'dao' AND chain_id = :'chain'::int
  UNION ALL
  SELECT 'proposal_lifecycle', count(*), max(block_number)
    FROM (
      SELECT dao_code, chain_id, block_number FROM proposal_queued
      UNION ALL SELECT dao_code, chain_id, block_number FROM proposal_executed
      UNION ALL SELECT dao_code, chain_id, block_number FROM proposal_canceled
      UNION ALL SELECT dao_code, chain_id, block_number FROM proposal_extended
    ) rows WHERE dao_code = :'dao' AND chain_id = :'chain'::int
  UNION ALL
  SELECT 'votes', count(*), max(block_number)
    FROM vote_cast_group WHERE dao_code = :'dao' AND chain_id = :'chain'::int
  UNION ALL
  SELECT 'delegation', count(*), max(block_number)
    FROM (
      SELECT dao_code, chain_id, block_number FROM delegate_changed
      UNION ALL SELECT dao_code, chain_id, block_number FROM delegate_votes_changed
      UNION ALL SELECT dao_code, chain_id, block_number FROM token_transfer
    ) rows WHERE dao_code = :'dao' AND chain_id = :'chain'::int
  UNION ALL
  SELECT 'timelock', count(*), max(block_number)
    FROM (
      SELECT dao_code, chain_id, block_number FROM timelock_operation
      UNION ALL SELECT dao_code, chain_id, scheduled_block_number AS block_number FROM timelock_call
      UNION ALL SELECT dao_code, chain_id, block_number FROM timelock_role_event
      UNION ALL SELECT dao_code, chain_id, block_number FROM timelock_min_delay_change
    ) rows WHERE dao_code = :'dao' AND chain_id = :'chain'::int
)
SELECT *
FROM counts
ORDER BY family;
"
```

Expected signal: active DAOs should show proposal and vote/delegation rows once
the checkpoint has crossed blocks containing those events. Empty row families
with advancing checkpoints usually mean query planning used the wrong address,
topic set, chain, dataset, or start block.

## Future Projection Sanity

This section is available after projection packages are implemented.

Check core projection counts:

```sh
psql "$DEGOV_INDEXER_DATABASE_URL" -v dao="$DAO_CODE" -v chain="$CHAIN_ID" -x -c "
SELECT
  count(*) AS proposal_count,
  coalesce(sum(metrics_votes_count), 0) AS proposal_vote_metric_count,
  max(block_number) AS latest_proposal_block
FROM proposal
WHERE dao_code = :'dao'
  AND chain_id = :'chain'::int;

SELECT
  count(*) AS vote_count,
  count(DISTINCT voter) AS voter_count,
  max(block_number) AS latest_vote_block
FROM vote_cast_group
WHERE dao_code = :'dao'
  AND chain_id = :'chain'::int;

SELECT
  count(*) AS contributor_count,
  count(*) FILTER (WHERE power > 0) AS contributors_with_power,
  count(*) FILTER (WHERE delegates_count_all > 0) AS delegates_with_mappings,
  coalesce(sum(power), 0) AS contributor_power_sum
FROM contributor
WHERE dao_code = :'dao'
  AND chain_id = :'chain'::int;

SELECT
  count(*) AS effective_delegate_edges,
  coalesce(sum(power), 0) AS effective_delegate_power
FROM delegate
WHERE dao_code = :'dao'
  AND chain_id = :'chain'::int
  AND is_current = true;
"
```

Expected signal:

- `proposal_count` is non-zero after the first proposal range is processed.
- `vote_count` and proposal vote metrics agree for sampled proposals.
- `contributors_with_power` is greater than zero for token-governed DAOs after
  onchain refresh has caught up.
- `effective_delegate_power` is not negative and does not exceed the expected
  current power domain without an explained contract behavior.

Check aggregate metrics:

```sh
psql "$DEGOV_INDEXER_DATABASE_URL" -v dao="$DAO_CODE" -v chain="$CHAIN_ID" -x -c "
SELECT
  id,
  proposals_count,
  votes_count,
  votes_with_params_count,
  votes_without_params_count,
  votes_weight_for_sum,
  votes_weight_against_sum,
  votes_weight_abstain_sum,
  power_sum,
  member_count
FROM data_metric
WHERE dao_code = :'dao'
  AND chain_id = :'chain'::int
ORDER BY id;
"
```

Expected signal: `data_metric` totals are present and broadly match the
projection counts. If raw tables contain rows but `data_metric` is empty or
stale, the failure is in projection aggregation rather than Datalens access.

Run a GraphQL projection smoke against the public endpoint:

```sh
curl -fsS "$DEGOV_INDEXER_GRAPHQL_ENDPOINT" \
  -H "content-type: application/json" \
  --data '{"query":"query { squidStatus { height hash } proposalsConnection(orderBy: [id_ASC]) { totalCount } contributorsConnection(orderBy: [id_ASC]) { totalCount } dataMetrics(where: { id_eq: \"global\" }) { proposalsCount votesCount powerSum memberCount } }"}'
```

Expected signal: GraphQL returns `squidStatus`, proposal/contributor counts, and
global metrics. If SQL is healthy but GraphQL is missing fields or returns
errors, classify the failure as API compatibility or GraphQL service config.

## Onchain Refresh Sanity

This section applies when `run_worker` is enabled with
`DEGOV_ONCHAIN_REFRESH_RPC_URL`. The worker drains `onchain_refresh_task`; the
older `degov_indexer_reconcile_task` table remains a separate diagnostic queue.

Check the native Datalens-era reconcile queue:

```sh
psql "$DEGOV_INDEXER_DATABASE_URL" -v dao="$DAO_CODE" -v chain="$CHAIN_ID" -x -c "
SELECT
  task_type,
  status,
  count(*) AS rows,
  min(next_run_at) AS oldest_next_run_at,
  max(attempts) AS max_attempts,
  count(*) FILTER (WHERE locked_at < now() - interval '15 minutes') AS stale_locks
FROM degov_indexer_reconcile_task
WHERE dao_code = :'dao'
  AND chain_id = :'chain'::int
GROUP BY task_type, status
ORDER BY task_type, status;
"
```

Check the compatibility onchain refresh table consumed by existing diagnostics:

```sh
psql "$DEGOV_INDEXER_DATABASE_URL" -v dao="$DAO_CODE" -v chain="$CHAIN_ID" -x -c "
SELECT
  status,
  count(*) AS rows,
  min(next_run_at) AS oldest_next_run_at,
  max(attempts) AS max_attempts,
  count(*) FILTER (WHERE locked_at IS NOT NULL AND locked_at < (extract(epoch FROM now() - interval '15 minutes') * 1000)::NUMERIC(78, 0)) AS stale_locks
FROM onchain_refresh_task
WHERE dao_code = :'dao'
  AND chain_id = :'chain'::int
GROUP BY status
ORDER BY status;
"
```

Expected signal:

- `pending` and `processing` rows drain when workers are running.
- `failed` rows stay bounded and include actionable `error` values.
- Stale locks are zero or recovered by the worker's lock timeout policy.
- `completed` rows grow after workers successfully refresh contributors.

Inspect failed refresh rows:

```sh
psql "$DEGOV_INDEXER_DATABASE_URL" -v dao="$DAO_CODE" -v chain="$CHAIN_ID" -x -c "
SELECT id, task_type, subject_id, attempts, error, updated_at
FROM degov_indexer_reconcile_task
WHERE dao_code = :'dao'
  AND chain_id = :'chain'::int
  AND status = 'failed'
ORDER BY updated_at DESC
LIMIT 20;

SELECT id, account, refresh_balance, refresh_power, attempts, error, updated_at
FROM onchain_refresh_task
WHERE dao_code = :'dao'
  AND chain_id = :'chain'::int
  AND status = 'failed'
ORDER BY updated_at DESC
LIMIT 20;
"
```

If power is empty while logs and projections are present, verify sync-lag mode:

```sh
psql "$DEGOV_INDEXER_DATABASE_URL" -v dao="$DAO_CODE" -v chain="$CHAIN_ID" -x -c "
SELECT
  processed_height,
  target_height,
  target_height - processed_height AS lag_blocks
FROM degov_indexer_checkpoint
WHERE dao_code = :'dao'
  AND chain_id = :'chain'::int;
"
```

Expected signal: onchain refresh may be intentionally delayed until
`processed_height` is within the configured refresh lag of `target_height`. If
lag is small and queues still do not drain, debug ChainTool/RPC credentials,
provider rate limits, stale locks, and worker concurrency.

Check reconcile seed progress by comparing discovered accounts to queued or
processed refresh work:

```sh
psql "$DEGOV_INDEXER_DATABASE_URL" -v dao="$DAO_CODE" -v chain="$CHAIN_ID" -x -c "
WITH discovered AS (
  SELECT account FROM vote_power_checkpoint WHERE dao_code = :'dao' AND chain_id = :'chain'::int
  UNION
  SELECT account FROM token_balance_checkpoint WHERE dao_code = :'dao' AND chain_id = :'chain'::int
  UNION
  SELECT id AS account FROM contributor WHERE dao_code = :'dao' AND chain_id = :'chain'::int
),
legacy_refresh AS (
  SELECT account FROM onchain_refresh_task WHERE dao_code = :'dao' AND chain_id = :'chain'::int
)
SELECT
  (SELECT count(*) FROM discovered) AS discovered_accounts,
  (SELECT count(*) FROM legacy_refresh) AS refresh_accounts,
  (SELECT count(*) FROM discovered d WHERE NOT EXISTS (
    SELECT 1 FROM legacy_refresh r WHERE lower(r.account) = lower(d.account)
  )) AS discovered_without_refresh_task;
"
```

Expected signal: discovered accounts should eventually have refresh coverage
unless the DAO or token standard is explicitly configured to skip that path.

## Web And API Smoke

Check GraphQL availability:

```sh
curl -fsS "$DEGOV_INDEXER_GRAPHQL_ENDPOINT" \
  -H "content-type: application/json" \
  --data '{"query":"query { squidStatus { height hash } }"}'
```

Check application pages:

```sh
curl -fsSI "$DEGOV_WEB_URL/proposals"
curl -fsSI "$DEGOV_WEB_URL/delegates"
```

Expected signal: HTTP 200 or the environment's expected redirect for both
pages. If pages fail but GraphQL and SQL are healthy, classify the issue as web
routing, web environment config, or frontend data handling.

Check synced percentage from public data:

```sh
curl -fsS "$DEGOV_INDEXER_GRAPHQL_ENDPOINT" \
  -H "content-type: application/json" \
  --data '{"query":"query { squidStatus { height hash } }"}'
```

Compare `squidStatus.height` with `degov_indexer_checkpoint.target_height`.
The synced percentage is:

```text
min(100, squidStatus.height / target_height * 100)
```

If synced percentage is low and checkpoint lag is high, the indexer is still
catching up. If synced percentage is low while checkpoint is current, debug the
compatibility sync table or GraphQL status resolver.

## Tally And Onchain Audit

After projection packages, worker task processing, service checks, checkpoint
commits, projections, refresh queues, and web/API smoke checks are healthy, run
the comparison runbook:

```sh
TALLY_API_KEY=<redacted> pnpm run audit:tally-onchain \
  --targets-file apps/indexer/scripts/indexer-accuracy-targets.json \
  --proposal-limit 300 \
  --delegate-limit 100 \
  --deterministic-proposals 30 \
  --random-proposals 20 \
  --deterministic-delegates 40 \
  --random-delegates 20 \
  --json-file reports/tally-onchain-e2e.json \
  --markdown-file reports/tally-onchain-e2e.md
```

Use this only after basic health passes. Tally/onchain mismatch findings are
business-correctness signals, not first-line service health checks.

## Troubleshooting Matrix

| Symptom | First checks | Likely domain | Action |
| --- | --- | --- | --- |
| Datalens auth failure | Native discovery returns 401/403 or application error. | Datalens auth. | Verify `DATALENS_APPLICATION`, token secret mount, token rotation, and application allowlist. Do not log the token. |
| Empty Datalens rows and empty DeGov projections | Native query over a known event range returns no rows; after projection packages are implemented, checkpoint advances and row family counts stay zero. | DeGov query planning or Datalens chain/dataset config. | Confirm chain id/name, dataset `evm.logs`, governor/token/timelock addresses, topic filters, start block, and finality mode. Test a small known event range. |
| Empty processor logs in current package | `run_indexer` verified Datalens and is waiting; no chunk logs are emitted. | Placeholder readiness boundary. | This is expected before projection packages are implemented. Do not restart as a runtime failure solely because chunk logs are absent. |
| Empty processor logs after projection package lands | No chunk logs for the DAO and checkpoint is stale. | Runtime startup or workload config. | Check pod readiness, process args, `DEGOV_CONFIG_PATH`, DAO enabled flag, database connectivity, and whether the worker is watching the expected namespace/config. |
| Decode mismatch | Logs show `DAO event decode error`; raw Datalens rows exist. | Decode/projection boundary. | Confirm ABI, event topic, token standard, timelock address, and whether the event is unsupported for the DAO compatibility policy. Unsupported events must be durable and auditable if skipped. |
| Timestamp unit error | Proposals have implausible `vote_start_timestamp`, `vote_end_timestamp`, or page dates. | Decode/projection. | Compare raw `block_timestamp` values with expected seconds. Millisecond values are usually 1000x too large; second values interpreted as milliseconds are usually near 1970. |
| Checkpoint stuck | `processing` chunk log repeats or `processed_height` does not advance. | Datalens query, DB transaction, decode/projection, or checkpoint. | Match the last processing log to the next error. If transaction failed, inspect DB errors and confirm checkpoint is advanced only inside the write transaction. |
| Checkpoint advances but pages are stale | `degov_indexer_checkpoint.processed_height` advances while `squid_processor.status.height` or GraphQL `squidStatus.height` is stale. | DB compatibility view or API. | Verify the checkpoint transaction updates `squid_processor.status`; restart GraphQL/API if it caches status unexpectedly. |
| Power refresh backlog | `pending`/`processing` refresh rows grow; contributors have zero power. | Onchain refresh or ChainTool/RPC. | Check sync-lag mode, stale locks, failed row errors, RPC credentials, provider rate limits, and reconcile worker concurrency. |
| Failed refresh rows repeat | Failed rows show the same account or subject with rising attempts. | Onchain refresh input or chain read. | Inspect the exact `error`, confirm token standard, vote-read method (`getVotes`, `getCurrentVotes`, `getPastVotes`, or `getPriorVotes`), and whether the account/timepoint is valid for the DAO. |
| GraphQL unavailable | SQL checks are healthy; GraphQL smoke fails. | Web/API. | Check GraphQL service readiness, endpoint routing, database URL, schema compatibility, and public endpoint configuration. |
| Delegates/proposals page fails | GraphQL smoke is healthy; page HEAD/GET fails or renders empty. | Web/API or frontend query shape. | Check web deployment config, DAO route, GraphQL endpoint env, browser console/network errors, and whether the page query expects fields not present in the compatibility schema. |

## Operator Notes

- Classify failures by the first unhealthy layer. Do not treat Tally mismatch as
  a Datalens outage when Datalens, checkpoint, projection, refresh, and GraphQL
  checks are healthy.
- Classify missing chunk processing, row-family counters, checkpoint commits,
  and refresh queue draining against the feature flags and runtime processes
  that are actually enabled for the DAO.
- Checkpoint advancement without matching projection rows is a serious
  correctness issue after projection packages are implemented. The batch
  contract requires projection writes and checkpoint advancement in one
  transaction.
- A replay may be healthy with zero onchain power until the refresh worker is
  enabled, has a working RPC URL, and catches up with pending
  `onchain_refresh_task` rows. Confirm lag before restarting workers.
- For active incidents, capture the DAO code, chain id, block range,
  checkpoint row, the last processing/commit/error log lines, queue counts, and
  one GraphQL smoke response.
