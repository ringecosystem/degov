import type { Config } from "@/types/config";

import { cleanMetadataText, truncateMetadataText } from "./metadata-text.ts";

export {
  cleanMetadataText,
  truncateMetadataText,
} from "./metadata-text.ts";

import type { Metadata } from "next";

const DEFAULT_SITE_URL = "https://localhost";
const DEFAULT_TWITTER_HANDLE = "@ai_degov";
export const SOCIAL_PREVIEW_IMAGE_PATH =
  "/assets/image/degov-social-preview.png";
export const SOCIAL_PREVIEW_IMAGE_WIDTH = 1200;
export const SOCIAL_PREVIEW_IMAGE_HEIGHT = 630;
export const SOCIAL_PREVIEW_IMAGE_TYPE = "image/png";
const TITLE_MAX_LENGTH = 120;
const DESCRIPTION_MAX_LENGTH = 220;

function getMetadataBase(siteUrl?: string): URL {
  return new URL(siteUrl ?? DEFAULT_SITE_URL);
}

type SocialPreviewImage = {
  url: string;
  width: number;
  height: number;
  type: string;
  alt: string;
};

function buildSocialPreviewImage(
  siteUrl: string | undefined,
  alt: string
): SocialPreviewImage {
  return {
    url: new URL(
      SOCIAL_PREVIEW_IMAGE_PATH,
      siteUrl ?? DEFAULT_SITE_URL
    ).toString(),
    width: SOCIAL_PREVIEW_IMAGE_WIDTH,
    height: SOCIAL_PREVIEW_IMAGE_HEIGHT,
    type: SOCIAL_PREVIEW_IMAGE_TYPE,
    alt,
  };
}

function getPublicSiteUrl(config: Config | null | undefined): string | undefined {
  const value = config?.siteUrl?.trim();
  if (!value) return undefined;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname === "localhost") {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

function shortenProposalId(proposalId: string): string {
  if (proposalId.length <= 18) {
    return proposalId;
  }

  return `${proposalId.slice(0, 8)}...${proposalId.slice(-6)}`;
}

export function buildSiteMetadata(
  config: Config | null | undefined
): Metadata {
  const daoName = config?.name || "DeGov";
  const description = `${daoName} - DAO governance platform powered by DeGov.AI`;
  const publicSiteUrl = getPublicSiteUrl(config);
  const siteUrl = publicSiteUrl ?? DEFAULT_SITE_URL;
  const metadataBase = getMetadataBase(siteUrl);
  const socialImage = buildSocialPreviewImage(
    siteUrl,
    `${daoName} DAO governance share card`
  );

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
          url: socialImage.url,
          width: socialImage.width,
          height: socialImage.height,
          type: socialImage.type,
          alt: socialImage.alt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      site: DEFAULT_TWITTER_HANDLE,
      creator: DEFAULT_TWITTER_HANDLE,
      title: `${daoName} - Powered by DeGov.AI`,
      description,
      images: [
        {
          url: socialImage.url,
          alt: socialImage.alt,
        },
      ],
    },
    other: {
      configName: daoName,
    },
  };
}

export function buildHomeMetadata(
  config: Config | null | undefined
): Metadata {
  const publicSiteUrl = getPublicSiteUrl(config);
  if (!publicSiteUrl) {
    return {};
  }

  return {
    alternates: {
      canonical: publicSiteUrl,
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
  const publicSiteUrl = getPublicSiteUrl(config);
  const siteUrl = publicSiteUrl ?? DEFAULT_SITE_URL;
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
  const socialImage = buildSocialPreviewImage(
    siteUrl,
    `${daoName} proposal share card`
  );

  return {
    title: proposalTitle,
    description: proposalDescription,
    alternates: publicSiteUrl
      ? {
          canonical: proposalUrl,
        }
      : undefined,
    openGraph: {
      type: "article",
      siteName: daoName,
      title: socialTitle,
      description: proposalDescription,
      url: proposalUrl,
      images: [
        {
          url: socialImage.url,
          width: socialImage.width,
          height: socialImage.height,
          type: socialImage.type,
          alt: socialImage.alt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      site: DEFAULT_TWITTER_HANDLE,
      creator: DEFAULT_TWITTER_HANDLE,
      title: socialTitle,
      description: proposalDescription,
      images: [
        {
          url: socialImage.url,
          alt: socialImage.alt,
        },
      ],
    },
  };
}

export function buildProposalDirectoryMetadata(
  config: Config | null | undefined
): Metadata {
  const daoName = config?.name || "DeGov";
  const publicSiteUrl = getPublicSiteUrl(config);
  const siteUrl = publicSiteUrl ?? DEFAULT_SITE_URL;
  const proposalDirectoryUrl = new URL("/proposals", siteUrl).toString();
  const title = `${daoName} proposals`;
  const description = `Browse public governance proposals for ${daoName} on DeGov.AI.`;
  const socialImage = buildSocialPreviewImage(
    siteUrl,
    `${daoName} proposals share card`
  );

  return {
    title,
    description,
    alternates: publicSiteUrl
      ? {
          canonical: proposalDirectoryUrl,
        }
      : undefined,
    openGraph: {
      type: "website",
      siteName: daoName,
      title,
      description,
      url: proposalDirectoryUrl,
      images: [
        {
          url: socialImage.url,
          width: socialImage.width,
          height: socialImage.height,
          type: socialImage.type,
          alt: socialImage.alt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      site: DEFAULT_TWITTER_HANDLE,
      creator: DEFAULT_TWITTER_HANDLE,
      title,
      description,
      images: [
        {
          url: socialImage.url,
          alt: socialImage.alt,
        },
      ],
    },
  };
}
