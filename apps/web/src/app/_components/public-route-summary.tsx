import Link from "next/link";

import { buildDaoPublicSummaryFacts } from "@/lib/dao-public-summary";
import { cleanMetadataText, truncateMetadataText } from "@/lib/metadata";
import type { ProposalItem, ProposalListItem } from "@/services/graphql/types";
import type { Config } from "@/types/config";

import { proposalTitleAndSummary } from "../_server/public-seo";

function summarize(value?: string | null, maxLength = 220): string {
  return truncateMetadataText(cleanMetadataText(value), maxLength);
}

export function DaoPublicSummary({ config }: { config: Config }) {
  const facts = buildDaoPublicSummaryFacts(config);

  return (
    <section className="rounded-[14px] bg-card p-[20px] shadow-card">
      <h1 className="text-[26px] font-extrabold">{config.name}</h1>
      {config.description ? (
        <p className="mt-[10px] text-[14px] text-muted-foreground">
          {summarize(config.description, 320)}
        </p>
      ) : null}
      <nav className="mt-[15px] flex flex-wrap gap-[10px]" aria-label="Public DAO links">
        <Link className="underline" href="/proposals">
          View proposals
        </Link>
        {facts.officialWebsiteUrl ? (
          <a
            className="underline"
            href={facts.officialWebsiteUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Official website
          </a>
        ) : null}
        {facts.discussionUrl ? (
          <a
            className="underline"
            href={facts.discussionUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Discussion
          </a>
        ) : null}
        {facts.registrySourceUrl ? (
          <a
            className="underline"
            href={facts.registrySourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Registry source
          </a>
        ) : null}
      </nav>
      <dl className="mt-[18px] grid gap-[10px] text-[14px] sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Canonical DAO site</dt>
          <dd>{facts.canonicalSiteUrl ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Chain</dt>
          <dd>
            {facts.chain.name} ({facts.chain.id})
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Governor contract</dt>
          <dd>
            {facts.contracts.governor.url ? (
              <a
                className="underline"
                href={facts.contracts.governor.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {facts.contracts.governor.address}
              </a>
            ) : (
              facts.contracts.governor.address
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Governance token</dt>
          <dd>
            {facts.contracts.governanceToken.url ? (
              <a
                className="underline"
                href={facts.contracts.governanceToken.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {facts.contracts.governanceToken.address}
              </a>
            ) : (
              facts.contracts.governanceToken.address
            )}{" "}
            ({facts.contracts.governanceToken.standard})
          </dd>
        </div>
        {facts.contracts.timelock ? (
          <div>
            <dt className="text-muted-foreground">Timelock contract</dt>
            <dd>
              {facts.contracts.timelock.url ? (
                <a
                  className="underline"
                  href={facts.contracts.timelock.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {facts.contracts.timelock.address}
                </a>
              ) : (
                facts.contracts.timelock.address
              )}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-muted-foreground">Indexer start block</dt>
          <dd>{facts.indexer.startBlock}</dd>
        </div>
      </dl>
      <p className="mt-[15px] text-[13px] text-muted-foreground">
        Registry configuration is the source for DAO identity, chain, and contract links. This
        static summary does not claim live indexed governance freshness; proposal views show live
        indexer state when supported by the source.
      </p>
    </section>
  );
}

export function ProposalDirectoryPublicSummary({
  config,
  proposals,
  failed,
}: {
  config: Config;
  proposals: ProposalListItem[];
  failed: boolean;
}) {
  return (
    <section className="rounded-[14px] bg-card p-[20px] shadow-card">
      <h1 className="text-[26px] font-extrabold">{config.name} proposals</h1>
      <p className="mt-[10px] text-[14px] text-muted-foreground">
        Browse public governance proposals for {config.name}.
      </p>
      {failed ? (
        <p className="mt-[10px] text-[14px] text-muted-foreground">
          Proposal data is temporarily unavailable. This is not a permanent empty proposal state.
        </p>
      ) : null}
      {proposals.length > 0 ? (
        <ol className="mt-[15px] flex flex-col gap-[8px]">
          {proposals.map((proposal) => (
            <li key={proposal.proposalId}>
              <Link className="underline" href={`/proposal/${proposal.proposalId}`}>
                {summarize(proposal.title || `Proposal ${proposal.proposalId}`, 140)}
              </Link>
            </li>
          ))}
        </ol>
      ) : !failed ? (
        <p className="mt-[10px] text-[14px] text-muted-foreground">
          No public proposals are available from the indexer yet.
        </p>
      ) : null}
    </section>
  );
}

export function ProposalDetailPublicSummary({
  config,
  proposal,
  failed,
}: {
  config: Config;
  proposal?: ProposalItem;
  failed: boolean;
}) {
  if (failed) {
    return (
      <section className="rounded-[14px] bg-card p-[20px] shadow-card">
        <h1 className="text-[26px] font-extrabold">{config.name} proposal</h1>
        <p className="mt-[10px] text-[14px] text-muted-foreground">
          Proposal data is temporarily unavailable. This response does not classify the proposal as
          permanently absent.
        </p>
      </section>
    );
  }

  if (!proposal) {
    return (
      <section className="rounded-[14px] bg-card p-[20px] shadow-card">
        <h1 className="text-[26px] font-extrabold">{config.name} proposal</h1>
        <p className="mt-[10px] text-[14px] text-muted-foreground">
          Proposal data is not indexed yet. The page will continue checking whether this proposal
          exists on-chain.
        </p>
      </section>
    );
  }

  const { title, summary } = proposalTitleAndSummary(proposal);

  return (
    <section className="rounded-[14px] bg-card p-[20px] shadow-card">
      <h1 className="text-[26px] font-extrabold">{summarize(title, 160)}</h1>
      <p className="mt-[10px] text-[14px] text-muted-foreground">
        {summarize(summary, 420)}
      </p>
      <dl className="mt-[15px] grid gap-[8px] text-[14px] sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">DAO</dt>
          <dd>{config.name}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Proposal ID</dt>
          <dd>{proposal.proposalId}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Proposer</dt>
          <dd>{proposal.proposer}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Votes</dt>
          <dd>{proposal.metricsVotesCount}</dd>
        </div>
      </dl>
    </section>
  );
}
