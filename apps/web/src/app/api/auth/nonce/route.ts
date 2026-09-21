import * as CryptoJS from "crypto-js";
import { NextResponse } from "next/server";
import { SiweMessage } from "siwe";

import { Resp } from "@/types/api";
import { degovGraphqlApi } from "@/utils/remote-api";

import {
  checkSiweNonceRequest,
  createSiweRequestIdentity,
  logSiweThrottle,
} from "../../common/siwe-abuse-controls";
import {
  resolveSiweRequestOrigin,
  validateSiweContext,
} from "../../common/siwe-context";
import {
  SIWE_NONCE_COOKIE_MAX_AGE_SECONDS,
  SIWE_NONCE_COOKIE_NAME,
  signSiweNonceCookieValue,
} from "../../common/siwe-nonce";
import { storeSiweNonce } from "../../common/siwe-nonce-store";

import type { NextRequest } from "next/server";

// Define a type for the source of the nonce for better type-safety
type NonceSource = "generated" | "remote";

type RemoteChallenge = {
  id: string;
  message: string;
};

export async function POST(request: NextRequest) {
  const jwtSecretKey = process.env.JWT_SECRET_KEY;
  if (!jwtSecretKey) {
    return NextResponse.json(
      Resp.err("please contact admin about login issue, missing key"),
      { status: 400 }
    );
  }

  const identity = createSiweRequestIdentity(request.headers);
  const nonceRateLimit = checkSiweNonceRequest(identity);
  if (!nonceRateLimit.allowed) {
    logSiweThrottle("siwe_nonce_throttled", identity, nonceRateLimit);

    return NextResponse.json(Resp.err("too many nonce requests"), {
      status: 429,
      headers: {
        "Retry-After": String(nonceRateLimit.retryAfterSeconds ?? 1),
      },
    });
  }

  const input = await request.json().catch(() => ({}));
  const address = typeof input.address === "string" ? input.address : undefined;
  const chainId = Number.isSafeInteger(input.chainId) ? input.chainId : undefined;
  const wantsRemoteChallenge = address !== undefined || chainId !== undefined;

  if (wantsRemoteChallenge && (!address || !chainId || chainId <= 0)) {
    return NextResponse.json(Resp.err("invalid auth challenge request"), {
      status: 400,
    });
  }

  let nonce = CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Hex);
  let source: NonceSource = "generated";
  let challenge: RemoteChallenge | undefined;

  const graphqlEndpoint = degovGraphqlApi();

  if (graphqlEndpoint && wantsRemoteChallenge) {
    try {
      const requestOrigin = resolveSiweRequestOrigin(request.headers);
      const graphqlQuery = {
        query: `
          mutation AuthChallenge($input: AuthChallengeInput!) {
            authChallenge(input: $input) {
              id
              message
            }
          }
        `,
        variables: {
          input: {
            space: "degov",
            method: "EIP4361",
            address,
            chainRef: String(chainId),
          },
        },
      };

      const response = await fetch(graphqlEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: requestOrigin.origin,
        },
        body: JSON.stringify(graphqlQuery),
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(
          `GraphQL request failed with status ${response.status}`
        );
      }

      const body = await response.json();
      challenge = body.data?.authChallenge;
      if (!challenge?.id || !challenge.message) {
        throw new Error(
          body.errors?.[0]?.message || "Invalid auth challenge response"
        );
      }

      const message = new SiweMessage(challenge.message);
      if (message.address.toLowerCase() !== address!.toLowerCase()) {
        throw new Error("Auth challenge address does not match request");
      }
      validateSiweContext(message, {
        domain: requestOrigin.host,
        uri: requestOrigin.origin,
        chainId: chainId!,
        nonce: message.nonce,
      });

      nonce = message.nonce;
      source = "remote";
    } catch (error) {
      console.error("Failed to create remote auth challenge:", error);
      return NextResponse.json(Resp.err("failed to create auth challenge"), {
        status: 502,
      });
    }
  }

  await storeSiweNonce(nonce);

  const response = NextResponse.json(
    Resp.ok({
      nonce,
      source,
      challengeId: challenge?.id,
      message: challenge?.message,
    })
  );
  const signedNonce = await signSiweNonceCookieValue(nonce, jwtSecretKey);

  response.cookies.set({
    name: SIWE_NONCE_COOKIE_NAME,
    value: signedNonce,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SIWE_NONCE_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });

  return response;
}
