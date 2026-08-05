import type { Config } from "@/types/config";

function isIpv4Host(hostname: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
}

export function getPublicOriginFromHost(
  host: string | null | undefined
): string | null {
  const value = host?.split(",")[0]?.trim();
  if (!value) return null;
  if (/[/?#@\\[\]\s]/.test(value)) return null;

  try {
    const url = new URL(`https://${value}`);
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.hostname === "localhost" ||
      url.hostname.includes(":") ||
      isIpv4Host(url.hostname)
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

export function withRequestSiteUrl(
  config: Config,
  requestOrigin: string | null
): Config {
  if (!requestOrigin) return config;

  return {
    ...config,
    siteUrl: requestOrigin,
  };
}
