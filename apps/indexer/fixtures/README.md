# Datalens Fixtures

Purpose: deterministic, raw Datalens-native EVM log fixtures for indexer development and regression tests.
Read this when adding or updating fixture ranges. It does not define live Datalens connectivity or public RPC procedures.

## Layout

`known-dao-ranges/manifest.json` is the entrypoint for the Rust fixture loader. Each page points to a `raw-logs/*.json` file containing raw Datalens-shaped log rows:

- `block_number`
- `block_hash`
- `block_timestamp`
- `transaction_hash`
- `transaction_index`
- `log_index`
- `address`
- `topics`
- `data`
- `removed`

Expected outputs live under `known-dao-ranges/expected/`. They are explicit JSON snapshots for the decoded/projected output table intent, checkpoint expectation, and duplicate replay expectation.

## Known DAO Ranges

The checked-in rows are deterministic synthetic raw logs. They use real OpenZeppelin-compatible event signatures and ABI-encoded event payloads, but fixed placeholder contracts and compact block ranges so CI can run without live Datalens or public RPC.

| Range | DAO | Chain | Contracts | Blocks | Why chosen |
| --- | --- | --- | --- | --- | --- |
| `small-demo-lifecycle` | `demo-dao` | Ethereum, chain id 1 | Governor `0x1111...1111`, token `0x2222...2222`, timelock `0x3333...3333` | `10000..=10004` | Small proposal lifecycle coverage: created, vote cast, queued, extended, executed. |
| `ens-lisk-token-erc20-shape` | `ens-lisk-representative` | Ethereum, chain id 1 | Governor `0x1111...1111`, ERC20 token `0x2222...2222`, timelock `0x3333...3333` | `20000..=20002` | ENS/Lisk-style ERC20 delegation and transfer shapes. |
| `lisk-erc721-shape` | `lisk-representative` | Ethereum, chain id 1 | Governor `0x1111...1111`, ERC721 token `0x4444...4444`, timelock `0x3333...3333` | `30000..=30000` | ERC721-shaped transfer coverage for token-standard regression tests. |
| `timelock-heavy` | `timelock-heavy` | Ethereum, chain id 1 | Governor `0x1111...1111`, token `0x2222...2222`, timelock `0x3333...3333` | `40000..=40006` | Dense timelock coverage: schedule, salt, role grant, execute, delay change, cancel, revoke. |

## Replay And Checkpoints

`known-dao-ranges/raw-logs/duplicate-replay.json` contains the 16 unique rows plus two exact repeated rows. The loader tests assert normalization keeps 16 unique log ids and preserves the configured duplicate ids after replay dedupe.

`known-dao-ranges/expected/checkpoint.json` records the expected fixture checkpoint identity and final block advancement for the demo lifecycle range.
