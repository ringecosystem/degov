# DeGov Docs

This directory collects project documentation that is specific to the code in
this repository.

## Indexer

The checked-in SQD/Subsquid indexer runtime has been removed while DeGov moves
to a Datalens-native indexer. The documents below describe historical behavior
or API/data-model reference material unless a newer document says otherwise.

- [Datalens Rust technical conventions][datalens-rust-conventions]
- [Developer guide](./guides/20260325__indexer_developer_guide.md)
- [Accuracy diagnosis guide](./guides/20260331__indexer_accuracy_diagnosis.md)
- [Datalens DAO migration runbook](./runbook/datalens-dao-migration.md)
- [Accuracy research summary](./research/20260401__indexer_accuracy_research.md)
- [Architecture overview](./architecture/20260325__indexer_architecture.md)
- [Datalens indexer architecture contract](./spec/datalens-indexer-architecture-contract.md)
- [Datalens DAO compatibility matrix](./spec/datalens-dao-compatibility-matrix.md)
- [Schema reference](./spec/20260327__indexer_schema_reference.md)
- [OpenZeppelin governance research](./research/20260325__ohh-28_openzeppelin_governor_indexing_research.md)

## Plans

- [Projection replay, reconciliation, and rollout](./plans/20260325__degov_projection_replay_reconciliation_rollout.md)

[datalens-rust-conventions]: ./spec/datalens-rust-technical-conventions.md
