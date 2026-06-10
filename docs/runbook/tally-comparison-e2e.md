# Tally Comparison E2E Runbook

Purpose: repeat the DeGov staging-vs-Tally data comparison for proposals and
sampled delegate voting power.

Read this when validating a DAO after an indexer rebuild, database reset, or
onchain power refresh change. This does not cover how to deploy the indexer or
how to repair mismatches found by the comparison.

## Scope

The comparison checks:

- proposal count and proposal identity
- proposal title, state/status, vote weights, snapshot, deadline, timestamps,
  and quorum where available
- delegate voting power and delegator count by sampled rank
- delegate token balance where Tally exposes it
- DeGov aggregate voting-power metrics as report context
- indexer sync height
- direct onchain `state`, `proposalSnapshot`, `proposalDeadline`, `quorum`,
  `getVotes`, `balanceOf`, and historical vote reads where available

The reusable validation script compares DeGov GraphQL against Tally data and
direct onchain reads. It supports live Tally API access, replayed Tally GraphQL
request bodies captured from `tally.xyz`, and fixture-backed dry-runs for CI.

## Inputs

For each DAO, collect:

- DeGov indexer endpoint, for example `https://indexer.next.degov.ai/ens-dao/graphql`
- Tally governance URL, for example `https://www.tally.xyz/gov/ens`
- Tally `organizationId`
- Tally `governorId`
- DeGov DAO code

The Tally `organizationId` and `governorId` are available in the page
`__NEXT_DATA__` payload or in the Tally GraphQL request variables captured from
the browser.

## Capture Tally Requests

Open the proposals page and inspect network requests:

```sh
playwright-cli open https://www.tally.xyz/gov/ens/proposals
playwright-cli requests
playwright-cli request <proposals-request-id>
playwright-cli --raw request-body <proposals-request-id> > /tmp/tally-proposals-req.json
```

Open the delegates page and capture the delegates and summary queries:

```sh
playwright-cli goto https://www.tally.xyz/gov/ens/delegates
playwright-cli requests
playwright-cli --raw request-body <delegates-request-id> > /tmp/tally-delegates-req.json
playwright-cli --raw request-body <organization-summary-request-id> > /tmp/tally-org-delegates-summary-req.json
```

Use the `api-key` header from the browser request when calling
`https://api.tally.xyz/query`. Do not commit the captured key.

## Run Validation

Dry-run the fixture/test path:

```sh
pnpm run test:indexer-scripts
```

Run live ENS/Lisk validation with the shared target file:

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

If the Tally API shape changes, capture the browser request bodies and add
`tallyProposalsRequestFile` or `tallyDelegatesRequestFile` to the relevant
target. The script will replay those request bodies against
`https://api.tally.xyz/query` and keep the same DeGov/onchain comparison logic.

## DeGov Queries

Summary query:

```graphql
query {
  indexerStatus { processedHeight targetHeight syncedPercentage isSynced }
  dataMetrics(where: { id_eq: "global" }) {
    powerSum
    memberCount
    chainId
    daoCode
  }
  proposalsPage(orderBy: [id_ASC], limit: 0) { totalCount }
  contributorsPage(orderBy: [id_ASC], limit: 0) { totalCount }
}
```

Proposal query:

```graphql
query {
  proposals(limit: 300, orderBy: [blockNumber_DESC]) {
    proposalId
    title
    description
    blockNumber
    metricsVotesWeightForSum
    metricsVotesWeightAgainstSum
    metricsVotesWeightAbstainSum
    metricsVotesCount
    stateEpochs {
      state
      startBlockNumber
    }
  }
}
```

Delegate power query:

```graphql
query($ids: [String!]) {
  contributors(where: { id_in: $ids }, limit: 100) {
    id
    power
    delegatesCountAll
  }
}
```

## Comparison Rules

- Convert DeGov `proposalId` from hex to decimal before matching Tally
  `onchainId`.
- Compare proposal title from the first non-empty markdown line after removing
  a leading heading marker.
- Compare `for`, `against`, and `abstain` raw vote weights exactly.
- Compare delegate power raw values exactly.
- Detect Tally-only and DeGov-only proposal/delegate rows and record identity
  findings with exact row ids or addresses.
- Compare delegate token balance when Tally exposes `tokenBalance` or
  `balance`.
- Read historical votes at a sampled proposal snapshot when available. The
  current delegate row does not represent historical voting power, so a
  successful historical chain read without a matching DeGov or Tally field is
  reported as `expected-representation-difference`.
- Use these conclusion values:
  - `degov-bug`: Tally and onchain agree, but DeGov differs or is missing.
  - `tally-bug`: DeGov and onchain agree, but Tally differs or is missing.
  - `chain-incompatibility`: the onchain read needed to adjudicate a mismatch
    is unsupported, reverts, or disagrees with both data sources.
  - `expected-representation-difference`: the values are not directly
    comparable because a source does not expose the same representation.
- Include DeGov aggregate power metrics as context when available. The script
  does not compare those metrics against a Tally aggregate.
- Sample several proposal ranges: latest, middle, and oldest.
- Sample delegates in multiple pages, for example top 80 by Tally voting power.

## Report Template

For each DAO, report:

```text
DAO:
Checked at:
DeGov endpoint:
Tally URL:

Sync:
- height:
- hash:

Proposals:
- DeGov count:
- Tally count:
- missing in DeGov:
- missing in Tally:
- sampled:
- mismatches:

Delegates:
- sampled:
- power mismatches:
- balance mismatches:
- historical vote findings:
- delegator-count mismatches:

DeGov aggregate context:
- powerSum:
- memberCount:

Findings:
- ...
```

## Interpreting Mismatches

If proposal ids, titles, and vote weights match, proposal indexing is generally
healthy even if display status differs. Check `stateEpochs` separately.

If delegate power differs but Tally matches direct onchain `getVotes`, treat it
as `degov-bug`. If DeGov matches direct onchain `getVotes` and Tally differs,
treat it as `tally-bug`.

If historical `getPastVotes` or `getPriorVotes` is unavailable, record the
read limitation with the finding. If the read succeeds but neither DeGov nor
Tally exposes a historical delegate-power row for that sampled snapshot, treat
the finding as `expected-representation-difference`.

If DeGov aggregate power looks inconsistent with sampled delegates, widen
delegate sampling before treating it as a product issue. The current script does
not adjudicate aggregate differences against Tally aggregate fields.
