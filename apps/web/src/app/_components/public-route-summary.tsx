import Link from "next/link";

import { cleanMetadataText, truncateMetadataText } from "@/lib/metadata";
import type { ProposalItem, ProposalListItem } from "@/services/graphql/types";
import type { Config } from "@/types/config";

import { proposalTitleAndSummary } from "../_server/public-seo";

function summarize(value?: string | null, maxLength = 220): string {
  return truncateMetadataText(cleanMetadataText(value), maxLength);
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

function escapeHtml(value: string | number): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function proposalDetailPublicSummaryHtml({
  config,
  proposal,
  failed,
}: {
  config: Config;
  proposal?: ProposalItem;
  failed: boolean;
}) {
  if (failed) {
    return `<section><h1>${escapeHtml(config.name)} proposal</h1><p>Proposal data is temporarily unavailable. This response does not classify the proposal as permanently absent.</p></section>`;
  }

  if (!proposal) {
    return `<section><h1>${escapeHtml(config.name)} proposal</h1><p>Proposal data is not indexed yet. The page will continue checking whether this proposal exists on-chain.</p></section>`;
  }

  const { title, summary } = proposalTitleAndSummary(proposal);

  return [
    "<section>",
    `<h1>${escapeHtml(summarize(title, 160))}</h1>`,
    `<p>${escapeHtml(summarize(summary, 420))}</p>`,
    "<dl>",
    `<div><dt>DAO</dt><dd>${escapeHtml(config.name)}</dd></div>`,
    `<div><dt>Proposal ID</dt><dd>${escapeHtml(proposal.proposalId)}</dd></div>`,
    `<div><dt>Proposer</dt><dd>${escapeHtml(proposal.proposer)}</dd></div>`,
    `<div><dt>Votes</dt><dd>${escapeHtml(proposal.metricsVotesCount)}</dd></div>`,
    "</dl>",
    "</section>",
  ].join("");
}
