"use client";

export const PROPOSAL_READ_EVENT_NAME = "degov_proposal_read";

export type ChannelGroup =
  | "organic-search"
  | "social-organic"
  | "documentation-referral"
  | "cross-product-degov-referral"
  | "ai-search-assistant-referral"
  | "other-external-referral"
  | "direct-unknown";

export type ProposalReadEventParams = {
  source_surface: "dao-sites";
  dao_slug_or_public_id: string;
  proposal_public_id: string;
  channel_group: ChannelGroup;
  route_locale: string;
};

declare global {
  interface Window {
    gtag?: (
      command: "event",
      eventName: string,
      params: ProposalReadEventParams
    ) => void;
  }
}

const SEARCH_HOST_SUBSTRINGS = ["google.", "yahoo."];
const SEARCH_HOST_DOMAINS = [
  "bing.com",
  "duckduckgo.com",
  "baidu.com",
  "yandex.com",
];

const SOCIAL_HOSTS = [
  "x.com",
  "twitter.com",
  "linkedin.com",
  "facebook.com",
  "discord.com",
  "telegram.org",
  "t.me",
];

const AI_REFERRER_HOSTS = [
  "chatgpt.com",
  "perplexity.ai",
  "copilot.microsoft.com",
  "gemini.google.com",
];

function normalizePublicId(value: string | null | undefined): string {
  return String(value ?? "").trim().slice(0, 160);
}

function normalizeHost(hostname: string | null | undefined): string {
  return String(hostname ?? "")
    .toLowerCase()
    .replace(/^www\./, "");
}

function hostMatchesDomain(hostname: string, candidate: string): boolean {
  return hostname === candidate || hostname.endsWith(`.${candidate}`);
}

function hostMatchesDomains(hostname: string, candidates: string[]): boolean {
  return candidates.some((candidate) => hostMatchesDomain(hostname, candidate));
}

export function getChannelGroupFromReferrer(
  referrer: string | null | undefined,
  currentHost: string | null | undefined
): ChannelGroup {
  if (!referrer) return "direct-unknown";

  let referrerUrl: URL;
  try {
    referrerUrl = new URL(referrer);
  } catch {
    return "direct-unknown";
  }

  const referrerHost = normalizeHost(referrerUrl.hostname);
  const current = normalizeHost(currentHost);

  if (current && referrerHost === current) {
    return "direct-unknown";
  }

  if (hostMatchesDomains(referrerHost, AI_REFERRER_HOSTS)) {
    return "ai-search-assistant-referral";
  }

  if (
    SEARCH_HOST_SUBSTRINGS.some((candidate) =>
      referrerHost.includes(candidate)
    ) ||
    hostMatchesDomains(referrerHost, SEARCH_HOST_DOMAINS)
  ) {
    return "organic-search";
  }

  if (hostMatchesDomains(referrerHost, SOCIAL_HOSTS)) {
    return "social-organic";
  }

  if (referrerHost === "docs.degov.ai") {
    return "documentation-referral";
  }

  if (referrerHost.endsWith(".degov.ai") || referrerHost === "degov.ai") {
    return "cross-product-degov-referral";
  }

  return "other-external-referral";
}

export function buildProposalReadEventParams({
  daoCode,
  proposalId,
  locale,
  referrer,
  currentHost,
}: {
  daoCode: string | null | undefined;
  proposalId: string | null | undefined;
  locale: string | null | undefined;
  referrer: string | null | undefined;
  currentHost: string | null | undefined;
}): ProposalReadEventParams {
  return {
    source_surface: "dao-sites",
    dao_slug_or_public_id: normalizePublicId(daoCode),
    proposal_public_id: normalizePublicId(proposalId),
    channel_group: getChannelGroupFromReferrer(referrer, currentHost),
    route_locale: normalizePublicId(locale) || "unknown",
  };
}

export function sendAnalyticsEvent(
  eventName: string,
  params: ProposalReadEventParams
): boolean {
  if (typeof window === "undefined" || typeof window.gtag !== "function") {
    return false;
  }

  window.gtag("event", eventName, params);
  return true;
}
