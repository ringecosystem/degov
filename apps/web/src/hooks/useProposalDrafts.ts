"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";

import { useSiweAuth } from "@/hooks/useSiweAuth";
import type {
  DeleteProposalDraftInput,
  SaveProposalDraftInput,
} from "@/services/graphql/types/proposal-drafts";
import { proposalDraftsService } from "@/services/proposal-drafts";
import { isAuthenticationRequired } from "@/utils/graphql-error-handler";

export const PROPOSAL_DRAFT_KEYS = {
  all: ["proposal-drafts"] as const,
  list: (daoCode: string, address?: string) =>
    ["proposal-drafts", "list", daoCode, address?.toLowerCase()] as const,
  detail: (daoCode: string, draftId: string, address?: string) =>
    [
      "proposal-drafts",
      "detail",
      daoCode,
      draftId,
      address?.toLowerCase(),
    ] as const,
};

function useAuthenticatedDraftRequest() {
  const { address, authenticate } = useSiweAuth();

  const request = useCallback(
    async <T>(action: (walletAddress: string) => Promise<T>): Promise<T> => {
      if (!address) {
        throw new Error("wallet_not_connected");
      }
      try {
        return await action(address);
      } catch (error) {
        if (!isAuthenticationRequired(error)) throw error;
        const auth = await authenticate();
        if (!auth.success) throw error;
        return action(address);
      }
    },
    [address, authenticate]
  );

  return { address, request };
}

export function useProposalDrafts(daoCode: string, enabled: boolean) {
  const { address, request } = useAuthenticatedDraftRequest();

  return useInfiniteQuery({
    queryKey: PROPOSAL_DRAFT_KEYS.list(daoCode, address),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      request((walletAddress) =>
        proposalDraftsService.list(
          { daoCode, first: 20, after: pageParam },
          walletAddress
        )
      ),
    getNextPageParam: (lastPage) =>
      lastPage.pageInfo.hasNextPage
        ? lastPage.pageInfo.endCursor ?? undefined
        : undefined,
    enabled: Boolean(enabled && daoCode && address),
    retry: 0,
  });
}

export function useProposalDraft(
  daoCode: string,
  draftId: string | undefined,
  enabled: boolean
) {
  const { address, request } = useAuthenticatedDraftRequest();

  return useQuery({
    queryKey: PROPOSAL_DRAFT_KEYS.detail(daoCode, draftId ?? "", address),
    queryFn: () =>
      request((walletAddress) =>
        proposalDraftsService.get(
          { daoCode, draftId: draftId! },
          walletAddress
        )
      ),
    enabled: Boolean(enabled && daoCode && draftId && address),
    retry: 0,
  });
}

export function useProposalDraftMutations(daoCode: string) {
  const queryClient = useQueryClient();
  const { address, request } = useAuthenticatedDraftRequest();

  const save = useMutation({
    mutationFn: (input: SaveProposalDraftInput) =>
      request((walletAddress) =>
        proposalDraftsService.save(input, walletAddress)
      ),
    onSuccess: (draft) => {
      queryClient.setQueryData(
        PROPOSAL_DRAFT_KEYS.detail(daoCode, draft.id, address),
        draft
      );
      return queryClient.invalidateQueries({
        queryKey: PROPOSAL_DRAFT_KEYS.list(daoCode, address),
      });
    },
  });

  const remove = useMutation({
    mutationFn: (input: DeleteProposalDraftInput) =>
      request((walletAddress) =>
        proposalDraftsService.delete(input, walletAddress)
      ),
    onSuccess: (_deleted, input) => {
      queryClient.removeQueries({
        queryKey: PROPOSAL_DRAFT_KEYS.detail(
          daoCode,
          input.draftId,
          address
        ),
      });
      return queryClient.invalidateQueries({
        queryKey: PROPOSAL_DRAFT_KEYS.list(daoCode, address),
      });
    },
  });

  return { save, remove };
}
