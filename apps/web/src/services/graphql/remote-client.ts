import {
  GraphQLClient,
  type ClientError,
  type RequestOptions,
  type Variables,
} from "graphql-request";
import { cache } from "react";

import { clearRemoteToken, getRemoteToken } from "@/lib/auth/token-manager";
import { isAuthenticationRequired } from "@/utils/graphql-error-handler";
import {
  degovGraphqlApi,
  isDegovApiConfiguredClient,
} from "@/utils/remote-api";

export const createRemoteGraphQLClient = cache(() => {
  const endpoint = isDegovApiConfiguredClient()
    ? degovGraphqlApi()
    : undefined;
  if (!endpoint) {
    throw new Error("DeGov API endpoint is not configured");
  }
  return new GraphQLClient(endpoint);
});

export async function requestRemote<T, V extends Variables = Variables>(
  document: string,
  variables?: V,
  address?: string
): Promise<T> {
  const client = createRemoteGraphQLClient();
  const token = address ? getRemoteToken(address) : null;
  const requestHeaders = token
    ? { Authorization: `Bearer ${token}` }
    : undefined;

  try {
    const options = {
      document,
      variables,
      requestHeaders,
    } as unknown as RequestOptions<V, T>;
    return await client.request<T, V>(options);
  } catch (error) {
    if (address && isAuthenticationRequired(error)) {
      clearRemoteToken(address);
    }
    throw error as ClientError;
  }
}
