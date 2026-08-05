import type { ProposalItem } from "@/services/graphql/types";
import type { Config } from "@/types/config";

import { extractTitleAndDescription, parseDescription } from "../utils/helpers.ts";

import { cleanMetadataText, truncateMetadataText } from "./metadata-text.ts";

const DESCRIPTION_MAX_LENGTH = 220;
const TITLE_MAX_LENGTH = 120;

function getPublicSiteUrl(config: Config | null | undefined): string | null {
  const value = config?.siteUrl?.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname === "localhost") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function buildDaoOrganizationJsonLd(
  config: Config | null | undefined
): string | null {
  const siteUrl = getPublicSiteUrl(config);
  if (!siteUrl || !config?.name) return null;

  const description = truncateMetadataText(
    cleanMetadataText(config.description),
    DESCRIPTION_MAX_LENGTH
  );

  return safeJsonLd({
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl}/#organization`,
    name: config.name,
    url: siteUrl,
    mainEntityOfPage: siteUrl,
    ...(description ? { description } : {}),
  });
}

export function buildProposalWebPageJsonLd(
  config: Config | null | undefined,
  proposal: ProposalItem | null | undefined
): string | null {
  const siteUrl = getPublicSiteUrl(config);
  if (!siteUrl || !config?.name || !proposal?.proposalId) return null;

  const proposalUrl = new URL(`/proposal/${proposal.proposalId}`, siteUrl).toString();
  const parsedDescription = parseDescription(proposal.description);
  const titleAndDescription = extractTitleAndDescription(
    parsedDescription.mainText
  );
  const name = truncateMetadataText(
    cleanMetadataText(proposal.title || titleAndDescription.title) ||
      `Proposal ${proposal.proposalId}`,
    TITLE_MAX_LENGTH
  );
  const description = truncateMetadataText(
    cleanMetadataText(
      titleAndDescription.description || parsedDescription.mainText
    ),
    DESCRIPTION_MAX_LENGTH
  );

  return safeJsonLd({
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${proposalUrl}#webpage`,
    url: proposalUrl,
    name,
    mainEntityOfPage: proposalUrl,
    isPartOf: {
      "@id": `${siteUrl}/#website`,
      name: `${config.name} governance site`,
      url: siteUrl,
    },
    about: {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: config.name,
      url: siteUrl,
    },
    identifier: proposal.proposalId,
    ...(description ? { description } : {}),
  });
}
