import { jwtVerify } from "jose";

import type { AuthPayload } from "../../../types/api";

interface HeaderAccessor {
  get(name: string): string | null;
}

const textEncoder = new TextEncoder();

function decodeEncodedAuthPayload(encodedPayload: string): AuthPayload {
  return JSON.parse(Buffer.from(encodedPayload, "base64").toString());
}

export async function resolveAuthPayload(
  headers: HeaderAccessor
): Promise<AuthPayload | null> {
  const encodedPayload = headers.get("x-degov-auth-payload");
  if (encodedPayload) {
    try {
      return decodeEncodedAuthPayload(encodedPayload);
    } catch {
      return null;
    }
  }

  const authorizationHeader = headers.get("authorization");
  const bearerToken = authorizationHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearerToken) {
    return null;
  }

  const jwtSecretKey = process.env.JWT_SECRET_KEY;
  if (!jwtSecretKey) {
    return null;
  }

  try {
    const { payload } = await jwtVerify<AuthPayload>(
      bearerToken,
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
