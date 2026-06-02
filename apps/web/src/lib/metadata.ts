import type { Config } from "@/types/config";

import type { Metadata } from "next";

const DEFAULT_SITE_URL = "https://localhost";
const DEFAULT_TWITTER_HANDLE = "@ai_degov";
const TITLE_MAX_LENGTH = 120;
const DESCRIPTION_MAX_LENGTH = 220;

function getMetadataBase(siteUrl?: string): URL {
  return new URL(siteUrl ?? DEFAULT_SITE_URL);
}

function buildDefaultOgImageUrl(siteUrl?: string): string {
  return new URL("/assets/image/og.png", siteUrl ?? DEFAULT_SITE_URL).toString();
}

function shortenProposalId(proposalId: string): string {
  if (proposalId.length <= 18) {
    return proposalId;
  }

  return `${proposalId.slice(0, 8)}...${proposalId.slice(-6)}`;
}

export function cleanMetadataText(value?: string | null): string {
  if (!value) {
    return "";
  }

  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncateMetadataText(
  value: string,
  maxLength: number
): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

export function buildSiteMetadata(
  config: Config | null | undefined
): Metadata {
  const daoName = config?.name || "DeGov";
  const description = `${daoName} - DAO governance platform powered by DeGov.AI`;
  const siteUrl = config?.siteUrl ?? DEFAULT_SITE_URL;
  const metadataBase = getMetadataBase(siteUrl);
  const ogImageUrl = buildDefaultOgImageUrl(siteUrl);

  return {
    title: {
      template: `%s | ${daoName}`,
      default: `${daoName}`,
    },
    description,
    icons: config?.logo
      ? {
          icon: [{ url: config.logo }],
          shortcut: [config.logo],
        }
      : undefined,
    metadataBase,
    openGraph: {
      type: "website",
      siteName: daoName,
      title: `${daoName} - Powered by DeGov.AI`,
      description,
      url: siteUrl,
      images: [
        {
          url: ogImageUrl,
          width: 512,
          height: 512,
          alt: `${daoName} - DAO governance platform`,
        },
      ],
    },
    twitter: {
      card: "summary",
      site: DEFAULT_TWITTER_HANDLE,
      creator: DEFAULT_TWITTER_HANDLE,
      title: `${daoName} - Powered by DeGov.AI`,
      description,
      images: [ogImageUrl],
    },
    other: {
      configName: daoName,
    },
  };
}

type ProposalMetadataOptions = {
  config: Config | null | undefined;
  proposalId: string;
  title?: string | null;
  description?: string | null;
};

export function buildProposalMetadata({
  config,
  proposalId,
  title,
  description,
}: ProposalMetadataOptions): Metadata {
  const daoName = config?.name || "DeGov";
  const siteUrl = config?.siteUrl ?? DEFAULT_SITE_URL;
  const ogImageUrl = buildDefaultOgImageUrl(siteUrl);
  const normalizedTitle = cleanMetadataText(title);
  const normalizedDescription = cleanMetadataText(description);
  const proposalTitle = truncateMetadataText(
    normalizedTitle || `Proposal ${shortenProposalId(proposalId)}`,
    TITLE_MAX_LENGTH
  );
  const proposalDescription = truncateMetadataText(
    normalizedDescription ||
      `${daoName} governance proposal ${shortenProposalId(proposalId)} on DeGov.AI.`,
    DESCRIPTION_MAX_LENGTH
  );
  const proposalUrl = new URL(`/proposal/${proposalId}`, siteUrl).toString();
  const socialTitle = `${proposalTitle} | ${daoName}`;

  return {
    title: proposalTitle,
    description: proposalDescription,
    alternates: {
      canonical: proposalUrl,
    },
    openGraph: {
      type: "article",
      siteName: daoName,
      title: socialTitle,
      description: proposalDescription,
      url: proposalUrl,
      images: [
        {
          url: ogImageUrl,
          width: 512,
          height: 512,
          alt: `${daoName} proposal share card`,
        },
      ],
    },
    twitter: {
      card: "summary",
      site: DEFAULT_TWITTER_HANDLE,
      creator: DEFAULT_TWITTER_HANDLE,
      title: socialTitle,
      description: proposalDescription,
      images: [ogImageUrl],
    },
  };
}
