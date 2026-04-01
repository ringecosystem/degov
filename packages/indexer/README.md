# DeGov Indexer

`packages/indexer` is the Subsquid-based governance indexer used by DeGov.

It reads DAO config, indexes governor/token/timelock events into PostgreSQL,
serves GraphQL, and includes tooling for replay, reconciliation, audit, and
single-address diagnosis.

## Quickstart

```bash
cd packages/indexer
just install
just up
just codegen
just build
just run
```

GraphQL is served on `http://localhost:4350/graphql`.

## Command groups

### Codegen

```bash
yarn run codegen:abi
yarn run codegen:schema
yarn run codegen
```

### Database

```bash
yarn run db:migrate
yarn run db:migrate:force
```

### Runtime

```bash
yarn run build
yarn run dev:start
yarn run dev:smart-start
yarn run dev:smart-start:force
yarn run dev:graphql
```

### Tests

```bash
yarn run test:unit
yarn run test:accuracy
yarn run test:integration
```

### Audit

```bash
yarn run audit:accuracy
yarn run audit:diagnose -- --address 0x... --code ens-dao
```

## Preferred developer entrypoints

For day-to-day local work, prefer the package `justfile`:

```bash
just build
just db-migrate
just smart-start
just test-accuracy
just diagnose-address 0x983110309620d911731ac0932219af06091b6744 ens-dao
```

## Docs

- [Indexer developer guide](../../docs/guides/20260325__indexer_developer_guide.md)
- [Indexer accuracy diagnosis](../../docs/guides/20260331__indexer_accuracy_diagnosis.md)
- [Indexer accuracy research](../../docs/research/20260401__indexer_accuracy_research.md)
- [Indexer architecture](../../docs/architecture/20260325__indexer_architecture.md)
