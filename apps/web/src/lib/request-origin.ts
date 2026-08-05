import type { Config } from "@/types/config";

function isIpv4Host(hostname: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
}

function getHostname(origin: string): string | null {
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
}

function isDegovOwnedHost(hostname: string): boolean {
  return hostname === "degov.ai" || hostname.endsWith(".degov.ai");
}

function isVercelHost(hostname: string): boolean {
  return hostname === "vercel.app" || hostname.endsWith(".vercel.app");
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

export function getPublicOriginFromHeaders(headers: {
  get(name: string): string | null;
}): string | null {
  return (
    getPublicOriginFromHost(headers.get("x-forwarded-host")) ??
    getPublicOriginFromHost(headers.get("host"))
  );
}

export function shouldUseRequestSiteUrl(params: {
  config: Config;
  requestOrigin: string | null;
  requiresOrigin: boolean;
}): boolean {
  const { config, requestOrigin, requiresOrigin } = params;
  if (!requestOrigin) return false;
  if (requiresOrigin) return true;

  const configuredSiteUrl = config.siteUrl?.trim();
  if (!configuredSiteUrl) return false;

  const configuredHost = getHostname(configuredSiteUrl);
  const requestHost = getHostname(requestOrigin);
  if (!configuredHost || !requestHost || configuredHost === requestHost) {
    return false;
  }

  return isVercelHost(configuredHost) && isDegovOwnedHost(requestHost);
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
