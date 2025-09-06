import { GraphQLClient, ClientError } from "graphql-request";
import { cache } from "react";

import { clearToken, getToken } from "@/lib/auth/token-manager";
import { ensureAuthenticated } from "@/lib/auth/auth-client";
import { degovGraphqlApi } from "@/utils/remote-api";

export const createNotificationGraphQLClient = cache(() => {
  const endpoint = degovGraphqlApi();
  if (!endpoint) {
    throw new Error("DeGov API endpoint is not configured");
  }
  return new GraphQLClient(endpoint);
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function requestNotification<T = any, V extends object = object>(
  document: string,
  variables?: V
): Promise<T> {
  const client = createNotificationGraphQLClient();

  const doRequest = async (): Promise<T> => {
    const token = getToken();
    if (token) client.setHeaders({ Authorization: `Bearer ${token}` });
    return variables
      ? await client.request<T>(document, variables)
      : await client.request<T>(document);
  };

  try {
    return await doRequest();
  } catch (error) {
    // Retry once on 401 after re-authentication
    const err = error as ClientError;
    const status = (err as any)?.response?.status;
    if (status === 401) {
      clearToken();
      const ok = await ensureAuthenticated();
      if (ok) {
        return await doRequest();
      }
    }
    console.error("Notification GraphQL request error:", error);
    throw error;
  }
}
