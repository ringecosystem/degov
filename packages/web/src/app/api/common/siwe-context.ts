export interface SiweContext {
  domain?: string;
  uri?: string;
  chainId?: number;
  nonce?: string;
  expirationTime?: string;
  notBefore?: string;
}

export interface ExpectedSiweContext {
  domain: string;
  uri: string;
  chainId: number;
  nonce: string;
  now?: Date;
}

type HeaderReader = Pick<Headers, "get">;

function firstHeaderValue(value: string | null): string | null {
  return value?.split(",")[0]?.trim() || null;
}

function isLocalHost(host: string): boolean {
  const hostname = host.split(":")[0]?.toLowerCase();
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  );
}

function resolveSiweRequestOrigin(headers: HeaderReader): URL {
  const forwardedHost = firstHeaderValue(headers.get("x-forwarded-host"));
  const host = forwardedHost ?? firstHeaderValue(headers.get("host"));

  if (!host) {
    throw new Error("Unable to resolve SIWE request host");
  }

  const origin = headers.get("origin");
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host === host) {
        return originUrl;
      }
    } catch {
      // Fall back to forwarded headers below.
    }
  }

  const forwardedProto = firstHeaderValue(headers.get("x-forwarded-proto"));
  const protocol =
    forwardedProto === "http" || forwardedProto === "https"
      ? forwardedProto
      : isLocalHost(host)
        ? "http"
        : "https";

  return new URL(`${protocol}://${host}`);
}

export function expectedSiweContextFromRequest(
  degovConfig: { chain: { id: number } },
  headers: HeaderReader,
  nonce: string
): ExpectedSiweContext {
  const requestOrigin = resolveSiweRequestOrigin(headers);

  return {
    domain: requestOrigin.host,
    uri: requestOrigin.origin,
    chainId: degovConfig.chain.id,
    nonce,
  };
}

export function validateSiweContext(
  siweContext: SiweContext,
  expectedContext: ExpectedSiweContext
): void {
  if (siweContext.domain !== expectedContext.domain) {
    throw new Error("SIWE domain does not match the request origin");
  }

  if (siweContext.uri !== expectedContext.uri) {
    throw new Error("SIWE URI does not match the request origin");
  }

  if (siweContext.chainId !== expectedContext.chainId) {
    throw new Error("SIWE chainId is not supported");
  }

  if (siweContext.nonce !== expectedContext.nonce) {
    throw new Error("SIWE nonce does not match the issued nonce");
  }

  const now = expectedContext.now ?? new Date();

  if (siweContext.expirationTime) {
    const expirationTimeMs = new Date(siweContext.expirationTime).getTime();

    if (!Number.isFinite(expirationTimeMs)) {
      throw new Error("SIWE expirationTime is not a valid date");
    }

    if (expirationTimeMs <= now.getTime()) {
      throw new Error("SIWE message has expired");
    }
  }

  if (siweContext.notBefore) {
    const notBeforeMs = new Date(siweContext.notBefore).getTime();

    if (!Number.isFinite(notBeforeMs)) {
      throw new Error("SIWE notBefore is not a valid date");
    }

    if (notBeforeMs > now.getTime()) {
      throw new Error("SIWE message is not yet valid");
    }
  }
}
