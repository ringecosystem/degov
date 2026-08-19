<div align="center">

![logo](docs/DeGov.AI.svg)

</div>

# DeGov.AI

DeGov.AI is an open-source, on-chain governance platform built for DAOs in the Ethereum related ecosystem. It leverages the [Governor Framework from OpenZeppelin](https://docs.openzeppelin.com/contracts/5.x/governance) to deliver a robust, flexible, and transparent governance solution for decentralized organizations. Check out the DAOs powered by DeGov.AI at [square.degov.ai](https://square.degov.ai).

## Features

- **Open**: Free and open-source, allowing anyone to set up their DAO's on-chain governance.
- **Secure governance model**: Built on the OpenZeppelin Governor framework, ensuring high security and reliability. See the [Governance Model](https://docs.degov.ai/governance/intro/model) for more details.

## Setup Instructions

The default Compose stack starts PostgreSQL and the web application using the
indexer endpoint in `degov.yml`:

```bash
git clone https://github.com/ringecosystem/degov.git
cd degov
cp .env.example .env
docker compose up -d
```

Open `http://localhost:3000`. To run the DeGov indexer locally, follow the
canonical Datalens-backed workflow below.

## Datalens-backed Indexer Deployment

The DeGov indexer is an application of the separately deployed
[Datalens service](https://github.com/ringecosystem/datalens). This repository
does not start `datalens serve`. Before starting DeGov, obtain a reachable
Datalens base URL plus an application name and bearer token authorized for the
required chains, `evm.logs`, and the `query` and `discovery` operations. See the
[Datalens application integration handbook](https://github.com/ringecosystem/datalens/blob/main/docs/runbook/application-integration-handbook.md)
for the service-side boundary.

### Prerequisites

- Git.
- Docker with Compose v2 (`docker compose`).
- Datalens application credentials described above.
- RPC URLs only when enabling onchain refresh.

### 1. Clone and configure the environment

```bash
git clone https://github.com/ringecosystem/degov.git
cd degov
cp .env.example .env
cp apps/indexer/indexer.example.yml apps/indexer/indexer.yml
```

Edit `.env` and replace at least these values:

```env
DEGOV_DB_PASSWORD=replace-with-a-secure-password
DEGOV_WEB_JWT_SECRET=replace-with-a-secure-secret
DEGOV_INDEXER_CONFIG_SOURCE=./apps/indexer/indexer.yml
DATALENS_ENDPOINT=https://your-datalens-service.example
DATALENS_APPLICATION=your-authorized-application
DATALENS_TOKEN=replace-with-an-application-token
```

`DATALENS_ENDPOINT` must be the service base URL, not `/native/graphql`.
Environment variables override values from the indexer config file. Keep tokens,
database credentials, and RPC URLs in environment-backed secrets rather than
committing them to YAML.

### 2. Configure DAO contract sets

Edit the untracked `apps/indexer/indexer.yml`. Replace the example chain names,
chain IDs, DAO codes, governor/token/timelock addresses, token standards, and
start blocks with the contract sets to index.

Normal shared deployments use:

```env
DEGOV_INDEXER_CONTRACT_SET_MODE=all
DEGOV_INDEXER_TARGET_HEIGHT=latest
DEGOV_INDEXER_RUN_ONCE=false
```

Leave `DEGOV_INDEXER_DAO_CODE` empty in normal `all` mode. Set it only as a
temporary filter for a bounded debug run. If onchain refresh is enabled, each
`rpc.chains.*.urlEnv` entry in `indexer.yml` must name a configured RPC secret,
such as `DARWINIA_RPC_URL` or `LISK_RPC_URL`.

Also edit `degov.yml` for the web application's DAO identity, chain, contracts,
and public indexer endpoint.

### 3. Initialize and start the local indexer stack

Start PostgreSQL, apply the fresh schema, and verify Datalens before starting
long-lived services:

```bash
docker compose up -d postgres
docker compose --profile indexer run --rm indexer-migrate
docker compose --profile indexer run --rm indexer smoke-datalens
docker compose --profile indexer up -d indexer indexer-graphql web-local-indexer
```

The local-indexer web application is available at `http://localhost:3001`, and
GraphQL is available at `http://localhost:4350/graphql`. The normal web service
on port 3000 continues to use the endpoint configured in `degov.yml`.

Verify GraphQL and inspect startup logs:

```bash
curl -fsS http://localhost:4350/graphql \
  -H 'content-type: application/json' \
  --data '{"query":"{ __typename }"}'
docker compose logs --tail=100 indexer indexer-graphql
```

### 4. Optional onchain refresh worker

The worker is disabled by default. Enable it only after configuring every RPC
environment variable referenced by `apps/indexer/indexer.yml`:

```env
DEGOV_ONCHAIN_REFRESH_WORKER_ENABLED=true
DARWINIA_RPC_URL=https://your-darwinia-rpc.example
```

Then start it separately:

```bash
docker compose --profile indexer up -d onchain-worker
```

When disabled, the worker stays alive and logs that it is disabled; this is
expected behavior.

### Deployment model and lifecycle

Staging and production use the same logical shape: one fresh shared indexer
database, an explicit `migrate` job, one `run` workload in all-contract-set
mode, one `graphql` workload, and an optional shared `worker`. Release images
are published as `ghcr.io/ringecosystem/degov/indexer:sha-<git-sha>`.

Moving from the previous SQD/v4 indexer requires a fresh database and a clean
reindex from each configured start block. In-place migration of an old indexer
database is not supported. See the [unified deployment contract](docs/config/contracts/datalens-indexer-unified-deployment.md),
[staging runbook](docs/runbook/datalens-staging-deployment.md), and
[observability runbook](docs/runbook/datalens-indexer-observability.md) for
production routing, rollout, and diagnostic details.

Stop the local stack without deleting its volumes:

```bash
docker compose --profile indexer down
```


We are also willing to provide hosting and maintenance services for your DAO's DeGov instance. Please contact us for more details.

## Contributing

We welcome community contributions! Fork the repository and submit a pull request. For major changes, please open an issue to discuss your proposal first.
