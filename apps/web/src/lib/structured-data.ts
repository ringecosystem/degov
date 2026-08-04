import type { Config } from "@/types/config";

import { cleanMetadataText, truncateMetadataText } from "./metadata-text.ts";

const DESCRIPTION_MAX_LENGTH = 220;

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
