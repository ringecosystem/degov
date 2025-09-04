import * as CryptoJS from "crypto-js";
import { NextResponse } from "next/server";

import { Resp } from "@/types/api";
import { degovGraphqlApi } from "@/utils/remote-api";


import { nonceCache } from "../../common/nonce-cache";

// Define a type for the source of the nonce for better type-safety
type NonceSource = "generated" | "remote";

export async function POST() {
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

  nonceCache.set(nonce);

  return NextResponse.json(Resp.ok({ nonce, source }));
}
