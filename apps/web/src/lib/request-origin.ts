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

function getKnownProductionOrigin(hostname: string): string | null {
  if (hostname === "degov-dev.vercel.app") {
    return "https://demo.degov.ai";
  }

  return null;
}

export function getKnownProductionOriginFromConfig(
  config: Config
): string | null {
  const configuredSiteUrl = config.siteUrl?.trim();
  if (!configuredSiteUrl) return null;

  const configuredHost = getHostname(configuredSiteUrl);
  if (!configuredHost) return null;

  return getKnownProductionOrigin(configuredHost);
}

export function withKnownProductionSiteUrl(
  config: Config,
  productionOrigin?: string | null
): Config {
  const knownProductionOrigin = getKnownProductionOriginFromConfig(config);
  if (!knownProductionOrigin) return config;

  return withRequestSiteUrl(config, productionOrigin ?? knownProductionOrigin);
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

function getPublicOriginFromUrlOrHost(value: string | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }

    return getPublicOriginFromHost(url.host);
  } catch {
    return getPublicOriginFromHost(value);
  }
}

export function getPublicOriginFromEnvironment(env: {
  DEGOV_PUBLIC_SITE_URL?: string;
  VERCEL_ENV?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
}): string | null {
  const explicitOrigin = getPublicOriginFromUrlOrHost(env.DEGOV_PUBLIC_SITE_URL);
  if (explicitOrigin) return explicitOrigin;

  if (env.VERCEL_ENV !== "production") return null;

  const productionOrigin = getPublicOriginFromUrlOrHost(
    env.VERCEL_PROJECT_PRODUCTION_URL
  );
  if (!productionOrigin) return null;

  const productionHost = getHostname(productionOrigin);
  if (!productionHost) return productionOrigin;

  return getKnownProductionOrigin(productionHost) ?? productionOrigin;
}

export function shouldUseEnvironmentSiteUrl(params: {
  requestOrigin: string | null;
  environmentOrigin: string | null;
}): boolean {
  const { requestOrigin, environmentOrigin } = params;
  if (!environmentOrigin) return false;
  if (!requestOrigin) return true;

  const requestHost = getHostname(requestOrigin);
  const environmentHost = getHostname(environmentOrigin);
  if (!requestHost || !environmentHost || requestHost === environmentHost) {
    return false;
  }

  return isVercelHost(requestHost) && isDegovOwnedHost(environmentHost);
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
