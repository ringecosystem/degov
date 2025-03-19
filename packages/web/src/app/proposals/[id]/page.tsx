"use client";
import { useQueries, useQuery } from "@tanstack/react-query";
import { isNil } from "lodash-es";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useReadContract } from "wagmi";

import { AddressWithAvatar } from "@/components/address-with-avatar";
import ClipboardIconButton from "@/components/clipboard-icon-button";
import NotFound from "@/components/not-found";
import { ProposalStatus } from "@/components/proposal-status";
import { Skeleton } from "@/components/ui/skeleton";
import { abi as GovernorAbi } from "@/config/abi/governor";
import { DEFAULT_REFETCH_INTERVAL } from "@/config/base";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { proposalService } from "@/services/graphql";
import { ProposalState } from "@/types/proposal";
import { extractTitleAndDescription, parseDescription } from "@/utils";
import { formatShortAddress } from "@/utils/address";
import { formatTimestampToFriendlyDate } from "@/utils/date";

import ActionGroup from "./action-group";
import { ActionsTable } from "./actions-table";
import { CurrentVotes } from "./current-votes";
import { Proposal } from "./proposal";
import { Result } from "./result";
import Status from "./status";

const ACTIVE_STATES: ProposalState[] = [
  ProposalState.Pending,
  ProposalState.Active,
  ProposalState.Succeeded,
  ProposalState.Queued,
];

export default function ProposalDetailPage() {
  const daoConfig = useDaoConfig();
  const { id } = useParams();

  const proposalStatus = useReadContract({
    address: daoConfig?.contracts?.governor as `0x${string}`,
    abi: GovernorAbi,
    functionName: "state",
    args: [id ? BigInt(id as string) : 0n],
    chainId: daoConfig?.chain?.id,
    query: {
      refetchInterval: DEFAULT_REFETCH_INTERVAL,
      enabled:
        !!id && !!daoConfig?.contracts?.governor && !!daoConfig?.chain?.id,
    },
  });

  const isActive = useMemo(() => {
    return ACTIVE_STATES.includes(proposalStatus?.data as ProposalState);
  }, [proposalStatus?.data]);

  const {
    data: allData,
    isPending,
    refetch: refetchProposal,
  } = useQuery({
    queryKey: ["proposal", id, daoConfig?.indexer?.endpoint],
    queryFn: () =>
      proposalService.getAllProposals(daoConfig?.indexer.endpoint as string, {
        where: {
          proposalId_eq: id as string,
        },
      }),
    enabled: !!id && !!daoConfig?.indexer.endpoint,
    refetchInterval: isActive ? DEFAULT_REFETCH_INTERVAL : false,
  });

  const data = useMemo(() => {
    if (allData?.[0]) {
      const data = {
        ...allData?.[0],
      };

      const parsedDescription = parseDescription(data?.description);

      return {
        ...data,
        description: parsedDescription.mainText,
        signatureContent: parsedDescription.signatureContent,
        originalDescription: data?.description,
      };
    }
    return undefined;
  }, [allData]);

  const proposalVotes = useReadContract({
    address: daoConfig?.contracts?.governor as `0x${string}`,
    abi: GovernorAbi,
    functionName: "proposalVotes",
    args: [data?.proposalId ? BigInt(data?.proposalId) : 0n],
    chainId: daoConfig?.chain?.id,
    query: {
      refetchInterval: isActive ? DEFAULT_REFETCH_INTERVAL : false,
      enabled:
        !!data?.proposalId &&
        !!daoConfig?.contracts?.governor &&
        !!daoConfig?.chain?.id,
    },
  });

  const [
    {
      data: proposalCanceledById,
      isPending: isProposalCanceledByIdPending,
      refetch: refetchProposalCanceledById,
    },
    {
      data: proposalExecutedById,
      isPending: isProposalExecutedByIdPending,
      refetch: refetchProposalExecutedById,
    },
    {
      data: proposalQueuedById,
      isPending: isProposalQueuedByIdPending,
      refetch: refetchProposalQueuedById,
    },
  ] = useQueries({
    queries: [
      {
        queryKey: [
          "proposalCanceledById",
          data?.proposalId,
          daoConfig?.indexer?.endpoint,
        ],
        queryFn: async () => {
          const result = await proposalService.getProposalCanceledById(
            daoConfig?.indexer?.endpoint as string,
            data?.proposalId as string
          );
          return result ?? null;
        },
        enabled:
          !isNil(data?.proposalId) && !isNil(daoConfig?.indexer?.endpoint),
        refetchInterval: isActive ? DEFAULT_REFETCH_INTERVAL : false,
      },
      {
        queryKey: [
          "proposalExecutedById",
          data?.proposalId,
          daoConfig?.indexer?.endpoint,
        ],
        queryFn: async () => {
          const result = await proposalService.getProposalExecutedById(
            daoConfig?.indexer?.endpoint as string,
            data?.proposalId as string
          );
          return result ?? null;
        },
        enabled:
          !isNil(data?.proposalId) && !isNil(daoConfig?.indexer?.endpoint),
        refetchInterval: isActive ? DEFAULT_REFETCH_INTERVAL : false,
      },
      {
        queryKey: [
          "proposalQueuedById",
          data?.proposalId,
          daoConfig?.indexer?.endpoint,
        ],
        queryFn: async () => {
          const result = await proposalService.getProposalQueuedById(
            daoConfig?.indexer?.endpoint as string,
            data?.proposalId as string
          );
          return result ?? null;
        },
        enabled:
          !isNil(data?.proposalId) && !isNil(daoConfig?.indexer?.endpoint),
        refetchInterval: isActive ? DEFAULT_REFETCH_INTERVAL : false,
      },
    ],
  });

  const isAllQueriesFetching = [
    isProposalCanceledByIdPending,
    isProposalExecutedByIdPending,
    isProposalQueuedByIdPending,
  ].some((query) => query);

  const proposalVotesData = useMemo(() => {
    return {
      againstVotes: proposalVotes.data?.[0] ?? 0n,
      forVotes: proposalVotes.data?.[1] ?? 0n,
      abstainVotes: proposalVotes.data?.[2] ?? 0n,
    };
  }, [proposalVotes.data]);

  const refetchPageData = useCallback(() => {
    refetchProposal();
    proposalStatus?.refetch();
    proposalVotes?.refetch();
    [
      refetchProposalCanceledById,
      refetchProposalExecutedById,
      refetchProposalQueuedById,
    ].forEach((query) => query());
  }, [
    refetchProposal,
    proposalStatus,
    proposalVotes,
    refetchProposalCanceledById,
    refetchProposalExecutedById,
    refetchProposalQueuedById,
  ]);

  if (!id) {
    return <NotFound />;
  }
  return (
    <div className="flex w-full flex-col gap-[20px] ">
      <div className="flex items-center gap-1 text-[18px] font-extrabold">
        <Link
          className="text-muted-foreground hover:underline"
          href="/proposals"
        >
          Proposals
        </Link>
        <span className="text-muted-foreground">/</span>
        <span>Proposal</span>
      </div>

      <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px]">
        <div className="flex items-center justify-between gap-[20px]">
          {isPending ? (
            <Skeleton className="h-[37px] w-[100px]" />
          ) : (
            <ProposalStatus status={proposalStatus?.data as ProposalState} />
          )}

          <ActionGroup
            data={data}
            status={proposalStatus?.data as ProposalState}
            proposalCanceledById={proposalCanceledById}
            proposalExecutedById={proposalExecutedById}
            proposalQueuedById={proposalQueuedById}
            isAllQueriesFetching={isAllQueriesFetching}
            onRefetch={refetchPageData}
          />
        </div>

        <h2 className="text-[36px] font-extrabold">
          {isPending ? (
            <Skeleton className="h-[36px] w-[200px]" />
          ) : (
            extractTitleAndDescription(data?.description)?.title
          )}
        </h2>

        {isPending ? (
          <Skeleton className="h-[24px] w-[80%] my-1" />
        ) : (
          <div className="flex items-center gap-[20px]">
            <div className="flex items-center gap-[5px]">
              <span>Proposed by</span>
              {!!data?.proposer && (
                <AddressWithAvatar
                  address={data?.proposer as `0x${string}`}
                  avatarSize={24}
                  className="gap-[5px]"
                />
              )}
            </div>
            <div className="h-1 w-1 rounded-full bg-muted-foreground"></div>
            <div className="flex items-center gap-[5px]">
              <span>ID {formatShortAddress(data?.proposalId as string)}</span>
              <ClipboardIconButton text={id as string} size={14} />
            </div>
            <div className="h-1 w-1 rounded-full bg-muted-foreground"></div>
            <span>
              Proposed on: {formatTimestampToFriendlyDate(data?.blockTimestamp)}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-[20px]">
        <div className="space-y-[20px]">
          <Result data={data} isFetching={isPending} />
          <ActionsTable data={data} isFetching={isPending} />
          <Proposal data={data} isFetching={isPending} />
        </div>
        <div className="space-y-[20px]">
          <CurrentVotes
            proposalVotesData={proposalVotesData}
            isLoading={proposalVotes?.isPending}
            blockTimestamp={data?.blockTimestamp}
          />
          <Status
            data={data}
            status={proposalStatus?.data as ProposalState}
            proposalCanceledById={proposalCanceledById}
            proposalExecutedById={proposalExecutedById}
            proposalQueuedById={proposalQueuedById}
            isLoading={isAllQueriesFetching || isPending}
          />
        </div>
      </div>
    </div>
  );
}
