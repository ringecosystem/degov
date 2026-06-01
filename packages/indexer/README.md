# DeGov Indexer

`packages/indexer` is reserved for the upcoming Datalens-native governance
indexer.

The previous SQD/Subsquid processor runtime, migrations, codegen, local startup
scripts, and onchain-refresh worker have been removed. Do not build new work on
the old processor architecture.

## Current boundary

The package intentionally has no indexer runtime right now. Its `build` and
`test` scripts are placeholders so workspace commands can continue to run while
the Datalens implementation is introduced in follow-up work.

## Reference artifacts

The files under `reference/` are retained only as behavioral/API references for
the replacement implementation:

- `reference/schema.graphql`: previous GraphQL-visible data model.
- `reference/abi/`: contract ABIs used by the removed processor.

They are not runtime inputs and should not be used to revive the SQD processor
shell.

```bash
pnpm --filter @degov/indexer build
```
