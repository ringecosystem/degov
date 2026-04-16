import * as CryptoJS from "crypto-js";
import { NextResponse } from "next/server";

import { Resp } from "@/types/api";
import { degovGraphqlApi } from "@/utils/remote-api";

import {
  checkSiweNonceRequest,
  createSiweRequestIdentity,
  logSiweThrottle,
} from "../../common/siwe-abuse-controls";
import {
  SIWE_NONCE_COOKIE_MAX_AGE_SECONDS,
  SIWE_NONCE_COOKIE_NAME,
  signSiweNonceCookieValue,
} from "../../common/siwe-nonce";
import { storeSiweNonce } from "../../common/siwe-nonce-store";

import type { NextRequest } from "next/server";

// Define a type for the source of the nonce for better type-safety
type NonceSource = "generated" | "remote";

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

  let nonce = CryptoJS.lib.WordArray.random(32).toString(CryptoJS.enc.Hex);
  // Initialize the source as 'generated'. This will be the default unless
  // we successfully fetch from the remote API.
  let source: NonceSource = "generated";

  const graphqlEndpoint = degovGraphqlApi();

  if (graphqlEndpoint) {
    try {
      // Define the GraphQL query.
      const graphqlQuery = {
        query: `
          query QueryNonce {
            nonce(input: {})
          }
        `,
      };

      // Send a POST request to the GraphQL API.
      const response = await fetch(graphqlEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(graphqlQuery),
      });

      if (!response.ok) {
        // If the HTTP status code is not in the 200-299 range, throw an error.
        throw new Error(
          `GraphQL request failed with status ${response.status}`
        );
      }

      const body = await response.json();

      if (body.data && body.data.nonce) {
        nonce = body.data.nonce;
        source = "remote"; // Update the source since we got it from the remote API.
      } else {
        // If the response format is not as expected, log a warning.
        // The code will proceed with the generated nonce.
        console.warn(
          "Nonce not found in GraphQL response, using fallback.",
          body
        );
      }
    } catch (error) {
      // If the fetch or subsequent processing fails, log the error.
      // The function will continue to use the locally generated fallback nonce.
      console.error("Failed to fetch nonce from GraphQL:", error);
    }
  }

  await storeSiweNonce(nonce);

  const response = NextResponse.json(Resp.ok({ nonce, source }));
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
