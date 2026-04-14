# DeGov Projection Replay, Reconciliation, and Rollout

This flow is designed for the additive migration introduced around `OHH-32` and the downstream field adoption in `OHH-37`.

## Replay / backfill workflow

Use a shadow PostgreSQL database or a fresh clone of the production indexer database. The replay flow intentionally targets a bounded end block so the run is repeatable and produces a stable reconciliation artifact.

```bash
cd packages/indexer
pnpm replay:backfill
```

Environment controls:

- `DEGOV_CONFIG_PATH`: DAO config path or URL. Defaults to `../../degov.yml`.
- `DEGOV_INDEXER_START_BLOCK`: optional replay override for a narrower historical slice.
- `DEGOV_INDEXER_END_BLOCK`: optional replay upper bound. If omitted, `scripts/replay-backfill.sh` resolves the current head block from the configured RPC set and freezes the run at that height.
- `DEGOV_RECONCILIATION_OUTPUT`: optional absolute or relative JSON report path.
- `DEGOV_RECONCILE_PROPOSAL_LIMIT`: number of proposals to reconcile after replay. Default `25`.
- `DEGOV_RECONCILE_VOTE_SAMPLES`: number of historical vote samples per proposal. Default `5`.

What the script does:

1. Builds the indexer.
2. Applies migrations to the selected database.
3. Replays processor data up to the chosen `DEGOV_INDEXER_END_BLOCK`.
4. Runs `node lib/reconcile.js` and writes a JSON artifact under `artifacts/reconciliation/`.

## Reconciliation scope

`lib/reconcile.js` verifies the additive projection against chain truth for each sampled proposal:

- `state(proposalId)` using projection-side state derivation from proposal fields, vote aggregates, and timelock metadata
- `proposalSnapshot(proposalId)`
- `proposalDeadline(proposalId)`
- `quorum(snapshot)`
- sampled historical voting power via `getPastVotes`, with automatic fallback to `getPriorVotes`

The JSON output includes:

- coverage counts for `proposal_action`, `proposal_state_epoch`, `governance_parameter_checkpoint`, `vote_power_checkpoint`, and `timelock_operation`
- per-proposal field checks
- per-account vote-power samples
- mismatch counts suitable for CI or release gating

Any non-zero mismatch count causes `reconcile` to exit non-zero.

## Release order

1. Deploy additive schema and handlers that write new fields and new tables while preserving legacy tables.
2. Run replay/backfill against a shadow database, freeze the run at a specific end block, and archive the reconciliation JSON.
3. Fix mismatches until reconciliation passes for the required proposal and vote samples.
4. Switch downstream consumers to `proposalDeadline`, `queueReadyAt`, `queueExpiresAt`, `clockMode`, `quorum`, `proposal_action`, `proposal_state_epoch`, `vote_power_checkpoint`, and timelock projections.
5. Keep legacy reads available during the cutover window.
6. Degrade and remove old logic only after downstream regression checks and reconciliation artifacts remain green.

## Pre-release checklist

- Replay/backfill completed against the target config and bounded end block.
- Reconciliation JSON archived with zero field mismatches and zero sampled vote mismatches.
- Coverage counts show the expected additive tables are populated for the target DAO scope.
- Regression tests pass in `packages/indexer`.
- Downstream smoke checks confirm proposal detail pages still render proposal timing, quorum, timelock timing, and vote power correctly after query cutover.
