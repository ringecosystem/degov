"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  CreateProposalCommentInput,
  DeleteProposalCommentInput,
  UpdateProposalCommentInput,
} from "@/services/graphql/types/proposal-comments";
import { proposalCommentsService } from "@/services/proposal-comments";

const proposalCommentsKey = (daoCode: string, proposalId: string) =>
  ["proposal-comments", daoCode, proposalId] as const;

export function useProposalComments(daoCode: string, proposalId: string) {
  const queryClient = useQueryClient();
  const queryKey = proposalCommentsKey(daoCode, proposalId);

  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      proposalCommentsService.list({
        daoCode,
        proposalId,
        first: 20,
        after: pageParam,
      }),
    getNextPageParam: (lastPage) =>
      lastPage.pageInfo.hasNextPage
        ? lastPage.pageInfo.endCursor ?? undefined
        : undefined,
    retry: 1,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const create = useMutation({
    mutationFn: ({
      input,
      address,
    }: {
      input: CreateProposalCommentInput;
      address: string;
    }) => proposalCommentsService.create(input, address),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({
      input,
      address,
    }: {
      input: UpdateProposalCommentInput;
      address: string;
    }) => proposalCommentsService.update(input, address),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: ({
      input,
      address,
    }: {
      input: DeleteProposalCommentInput;
      address: string;
    }) => proposalCommentsService.delete(input, address),
    onSuccess: invalidate,
  });

  return { query, create, update, remove };
}
