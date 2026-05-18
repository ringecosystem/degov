# Tally Comparison E2E Runbook

Purpose: repeat the DeGov staging-vs-Tally data comparison for proposals,
delegates, and voting power.

Read this when validating a DAO after an indexer rebuild, database reset, or
onchain power refresh change. This does not cover how to deploy the indexer or
how to repair mismatches found by the comparison.

## Scope

The comparison checks:

- proposal count and proposal identity
- proposal title and vote weights
- delegate voting power and delegator count by sampled rank
- aggregate delegated voting power
- indexer sync height

The current script compares DeGov GraphQL against the public Tally web app
GraphQL calls captured from `tally.xyz`.

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

## DeGov Queries

Summary query:

```graphql
query {
  squidStatus { height hash }
  dataMetrics(where: { id_eq: "global" }) {
    powerSum
    memberCount
    chainId
    daoCode
  }
  proposalsConnection(orderBy: [id_ASC]) { totalCount }
  contributorsConnection(orderBy: [id_ASC]) { totalCount }
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
- Compare aggregate power as both raw difference and percentage difference.
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
- delegator-count mismatches:

Aggregate power:
- DeGov:
- Tally:
- raw diff:
- percent diff:

Findings:
- ...
```

## Interpreting Mismatches

If proposal ids, titles, and vote weights match, proposal indexing is generally
healthy even if display status differs. Check `stateEpochs` separately.

If delegate power differs but Tally matches direct onchain `getVotes`, treat it
as a DeGov power refresh issue.

If aggregate power differs while top delegate samples match, widen delegate
sampling before treating it as a product issue. Tally aggregate fields may have
slightly different inclusion rules.
