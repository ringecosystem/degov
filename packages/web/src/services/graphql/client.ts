import { GraphQLClient } from "graphql-request";
import { cache } from "react";

export const createGraphQLClient = cache((endpoint: string) => {
  if (!endpoint) {
    throw new Error("Indexer endpoint is not configured");
  }
  return new GraphQLClient(endpoint);
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function request<T = any, V extends object = object>(
  endpoint: string,
  document: string,
  variables?: V
): Promise<T> {
  try {
    const client = createGraphQLClient(endpoint);

    if (variables) {
      return await client.request<T>(document, variables);
    } else {
      return await client.request<T>(document);
    }
  } catch (error) {
    console.error("GraphQL request error:", error);
    throw error;
  }
}
