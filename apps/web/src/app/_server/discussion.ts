import {
  discussionTargetInput,
  discussionTargetInputs,
} from "@/services/discussion-target";
import { degovGraphqlApi } from "@/utils/remote-api";

async function requestDiscussionApi(
  query: string,
  variables: Record<string, unknown>,
  adminToken?: string
) {
  const endpoint = degovGraphqlApi();
  if (!endpoint) return null;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(adminToken
        ? { "X-Discussion-Admin-Token": adminToken }
        : undefined),
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok || result.errors?.length) {
    throw new Error(
      result.errors?.[0]?.message ||
        `Discussion API request failed with status ${response.status}`
    );
  }
  return result.data;
}

export async function ensureDiscussionTarget(
  daoCode: string,
  proposalId: string
): Promise<void> {
  const adminToken = process.env.DISCUSSION_ADMIN_TOKEN?.trim();
  if (!adminToken) return;

  for (const input of discussionTargetInputs(daoCode, proposalId)) {
    const existing = await requestDiscussionApi(
      `query DiscussionTarget($input: DiscussionTargetInput!) {
        discussionTarget(input: $input) {
          id
        }
      }`,
      { input }
    );
    if (existing?.discussionTarget) return;
  }

  await requestDiscussionApi(
    `mutation RegisterDiscussionTarget($input: RegisterDiscussionTargetInput!) {
      registerDiscussionTarget(input: $input) {
        id
      }
    }`,
    { input: discussionTargetInput(daoCode, proposalId) },
    adminToken
  );
}
