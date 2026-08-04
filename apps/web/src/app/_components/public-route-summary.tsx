import Link from "next/link";

import { cleanMetadataText, truncateMetadataText } from "@/lib/metadata";
import type { ProposalItem, ProposalListItem } from "@/services/graphql/types";
import type { Config } from "@/types/config";

import { proposalTitleAndSummary } from "../_server/public-seo";

function summarize(value?: string | null, maxLength = 220): string {
  return truncateMetadataText(cleanMetadataText(value), maxLength);
}

export function DaoPublicSummary({ config }: { config: Config }) {
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
        {config.links?.website ? (
          <a className="underline" href={config.links.website}>
            Official website
          </a>
        ) : null}
        {config.offChainDiscussionUrl ? (
          <a className="underline" href={config.offChainDiscussionUrl}>
            Discussion
          </a>
        ) : null}
      </nav>
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
  proposalId,
  invalidId,
  failed,
}: {
  config: Config;
  proposal?: ProposalItem;
  proposalId: string;
  invalidId: boolean;
  failed: boolean;
}) {
  if (invalidId) {
    return (
      <section className="rounded-[14px] bg-card p-[20px] shadow-card">
        <h1 className="text-[26px] font-extrabold">Proposal not found</h1>
        <p className="mt-[10px] text-[14px] text-muted-foreground">
          {proposalId} is not a valid proposal identifier for {config.name}.
        </p>
      </section>
    );
  }

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
        <h1 className="text-[26px] font-extrabold">Proposal not found</h1>
        <p className="mt-[10px] text-[14px] text-muted-foreground">
          No indexed proposal with this identifier is currently available for {config.name}.
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
