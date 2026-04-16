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

export function expectedSiweContextFromConfig(
  degovConfig: { siteUrl: string; chain: { id: number } },
  nonce: string
): ExpectedSiweContext {
  const siteUrl = new URL(degovConfig.siteUrl);

  return {
    domain: siteUrl.host,
    uri: siteUrl.origin,
    chainId: degovConfig.chain.id,
    nonce,
  };
}

export function validateSiweContext(
  siweContext: SiweContext,
  expectedContext: ExpectedSiweContext
): void {
  if (siweContext.domain !== expectedContext.domain) {
    throw new Error("SIWE domain does not match the configured site");
  }

  if (siweContext.uri !== expectedContext.uri) {
    throw new Error("SIWE URI does not match the configured site");
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
