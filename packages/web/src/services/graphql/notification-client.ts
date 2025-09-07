import { GraphQLClient, type ClientError } from "graphql-request";
import { cache } from "react";

// Note: re-auth is handled by callers (e.g., hooks/components) explicitly.
import { clearRemoteToken, getRemoteToken } from "@/lib/auth/token-manager";
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
    const token = getRemoteToken();
    if (token) client.setHeaders({ Authorization: `Bearer ${token}` });
    return variables
      ? await client.request<T>(document, variables)
      : await client.request<T>(document);
  };

  try {
    return await doRequest();
  } catch (error) {
    // Surface 401 to the caller for manual authentication
    const err = error as ClientError;
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 401) {
      clearRemoteToken();
      throw err;
    }
    console.error("Notification GraphQL request error:", error);
    throw error;
  }
}
