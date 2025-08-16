"use client";
import { useQueries, useQuery } from "@tanstack/react-query";
import { isNil } from "lodash-es";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useReadContract } from "wagmi";

import { Faqs } from "@/components/faqs";
import NotFound from "@/components/not-found";
import { LoadingState } from "@/components/ui/loading-spinner";
import { abi as GovernorAbi } from "@/config/abi/governor";
import { DEFAULT_REFETCH_INTERVAL } from "@/config/base";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { proposalService } from "@/services/graphql";
import { ProposalState } from "@/types/proposal";
import { parseDescription } from "@/utils";

import { CurrentVotes } from "./current-votes";
import Status from "./status";
import { Summary } from "./summary";
import { Tabs } from "./tabs";

const ACTIVE_STATES: ProposalState[] = [
  ProposalState.Pending,
  ProposalState.Active,
  ProposalState.Succeeded,
  ProposalState.Queued,
];

export default function ProposalDetailPage() {
  const daoConfig = useDaoConfig();

  const params = useParams();
  const id = params?.id;

  const validId = useMemo(() => {
    if (!id) return null;
    try {
      return BigInt(id as string);
    } catch {
      return null;
    }
  }, [id]);

  const proposalStatus = useReadContract({
    address: daoConfig?.contracts?.governor as `0x${string}`,
    abi: GovernorAbi,
    functionName: "state",
    args: [validId || 0n],
    chainId: daoConfig?.chain?.id,
    query: {
      refetchInterval: DEFAULT_REFETCH_INTERVAL,
      enabled:
        !!validId && !!daoConfig?.contracts?.governor && !!daoConfig?.chain?.id,
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
    enabled: !!validId && !!daoConfig?.indexer.endpoint,
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
        discussion: parsedDescription.discussion,
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

  if (!validId) {
    return <NotFound />;
  }

  if (isPending) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <LoadingState
          title="Proposal Loading"
          description="Loading proposal data, please wait..."
        />
      </div>
    );
  }

  if (!allData || allData.length === 0) {
    return <NotFound />;
  }
  return (
    <div className="flex w-full flex-col gap-[20px] h-full min-h-0">
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
      <div className="hidden lg:block">
        <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-[20px] flex-1 min-h-0">
          <div className="flex flex-col gap-[20px] min-h-0">
            <Summary
              data={data}
              isPending={isPending}
              proposalStatus={proposalStatus as { data: ProposalState }}
              proposalQueuedById={proposalQueuedById}
              isAllQueriesFetching={isAllQueriesFetching}
              onRefetch={refetchPageData}
              id={id as string}
            />
            <div className="flex-1 min-h-0">
              <Tabs data={data} isFetching={isPending} />
            </div>
          </div>
          <div className="space-y-[20px]">
            <CurrentVotes
              proposalVotesData={proposalVotesData}
              isLoading={proposalVotes?.isPending}
              blockTimestamp={data?.blockTimestamp}
              blockNumber={data?.blockNumber}
            />
            <Status
              data={data}
              status={proposalStatus?.data as ProposalState}
              proposalCanceledById={proposalCanceledById}
              proposalExecutedById={proposalExecutedById}
              proposalQueuedById={proposalQueuedById}
              isLoading={isAllQueriesFetching || isPending}
            />
            <Faqs type="proposal" />
          </div>
        </div>
      </div>
      <div className="lg:hidden flex flex-col gap-[20px]">
        <Summary
          data={data}
          isPending={isPending}
          proposalStatus={proposalStatus as { data: ProposalState }}
          proposalQueuedById={proposalQueuedById}
          isAllQueriesFetching={isAllQueriesFetching}
          onRefetch={refetchPageData}
          id={id as string}
        />
        <CurrentVotes
          proposalVotesData={proposalVotesData}
          isLoading={proposalVotes?.isPending}
          blockTimestamp={data?.blockTimestamp}
          blockNumber={data?.blockNumber}
        />
        <Tabs data={data} isFetching={isPending} />
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
  );
}
