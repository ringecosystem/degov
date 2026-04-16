import { jwtVerify } from "jose";

import type { AuthPayload } from "../../../types/api";

interface HeaderAccessor {
  get(name: string): string | null;
}

interface CookieAccessor {
  get(name: string): { value?: string } | undefined;
}

export const AUTH_COOKIE_NAME = "degov_auth";
export const AUTH_COOKIE_MAX_AGE_SECONDS = 5 * 60 * 60;

const textEncoder = new TextEncoder();

function decodeEncodedAuthPayload(encodedPayload: string): AuthPayload {
  return JSON.parse(Buffer.from(encodedPayload, "base64").toString());
}

async function verifyAuthToken(token: string): Promise<AuthPayload | null> {
  const jwtSecretKey = process.env.JWT_SECRET_KEY;
  if (!jwtSecretKey) {
    return null;
  }

  try {
    const { payload } = await jwtVerify<AuthPayload>(
      token,
      textEncoder.encode(jwtSecretKey)
    );

    if (typeof payload.address !== "string" || payload.address.length === 0) {
      return null;
    }

    return {
      address: payload.address.toLowerCase(),
    };
  } catch {
    return null;
  }
}

export async function resolveAuthPayload(
  headers: HeaderAccessor,
  cookies?: CookieAccessor
): Promise<AuthPayload | null> {
  const encodedPayload = headers.get("x-degov-auth-payload");
  if (encodedPayload) {
    try {
      return decodeEncodedAuthPayload(encodedPayload);
    } catch {
      return null;
    }
  }

  const cookieToken = cookies?.get(AUTH_COOKIE_NAME)?.value;
  if (cookieToken) {
    const cookiePayload = await verifyAuthToken(cookieToken);
    if (cookiePayload) {
      return cookiePayload;
    }
  }

  const authorizationHeader = headers.get("authorization");
  const bearerToken = authorizationHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearerToken) {
    return null;
  }

  return verifyAuthToken(bearerToken);
}
