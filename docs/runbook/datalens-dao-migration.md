# Datalens DAO Migration Runbook

> Purpose: define the production sequence for migrating one DAO into the
> Datalens-native DeGov indexer.
>
> Read this when: preparing a DAO for staging or production indexing.
>
> This does not describe Tally comparison details; use
> `docs/runbook/tally-comparison-e2e.md` after the DAO passes compatibility
> preflight and indexing completes.

## Compatibility preflight

Run compatibility preflight before adding a DAO to staging or production. The
DAO must pass the policy in
`docs/spec/datalens-dao-compatibility-matrix.md`.

Preflight must collect:

- DAO code, chain id, governor address, token address, token standard, start
  block, and optional timelock address from the registry entry.
- Contract bytecode presence for each configured address.
- Governor method probe results for required methods such as
  `proposalSnapshot`, `proposalDeadline`, `proposalVotes`, `quorum`, and
  `state`.
- Token event shape, especially `Transfer` indexed argument count.
- Token vote-read support: `getVotes` or `getCurrentVotes`, and `getPastVotes`
  or `getPriorVotes`.
- Required governor and token event availability for the migration range.

The preflight result must be one of:

| Result | Action |
| --- | --- |
| Supported | Add the DAO to staging and continue with replay validation. |
| Degraded | Add the DAO only after recording the fallback and confirming it preserves DeGov semantics. |
| Unsupported | Do not add the DAO to active staging or production workloads. |

## Unsupported DAOs

Unsupported DAOs must be removed from active staging and production runs before
deployment. Record the DAO code, chain id, failed surface, observed behavior,
and reason in deployment registry metadata or release notes.

Do not leave unsupported DAOs in the active registry as silently skipped
workloads. Examples that must stay excluded until a later compatibility issue
extends support include `ring-protocol-dao` and public-nouns style registry
entries with ERC20/ERC721 token-shape mismatch.

## Migration sequence

1. Run compatibility preflight and store the result with the deployment change.
2. For degraded DAOs, verify every fallback listed by preflight is allowed by
   the compatibility matrix.
3. Exclude unsupported DAOs from active staging and production registry files.
4. Deploy the staging registry and run a fresh replay from the configured start
   block.
5. Confirm no fail-fast compatibility errors advanced a checkpoint.
6. Run the Tally comparison runbook as a diagnostic check, then verify any
   mismatch against direct chain reads before treating it as a DeGov issue.
7. Promote only supported or explicitly degraded DAO entries to production.
