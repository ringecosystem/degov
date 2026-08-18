import { createRemoteGraphQLClient, requestRemote } from "./remote-client";

import type { Variables } from "graphql-request";

export const createNotificationGraphQLClient = createRemoteGraphQLClient;

export async function requestNotification<
  T = unknown,
  V extends Variables = Variables,
>(
  document: string,
  variables: V | undefined,
  address: string
): Promise<T> {
  return requestRemote<T, V>(document, variables, address);
}
