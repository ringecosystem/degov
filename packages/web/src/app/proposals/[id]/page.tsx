"use client";
import { useQueries, useQuery } from "@tanstack/react-query";
import { isNil } from "lodash-es";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { useReadContract } from "wagmi";

import { AddressWithAvatar } from "@/components/address-with-avatar";
import ClipboardIconButton from "@/components/clipboard-icon-button";
import NotFound from "@/components/not-found";
import { ProposalStatus } from "@/components/proposal-status";
import { Skeleton } from "@/components/ui/skeleton";
import { abi as GovernorAbi } from "@/config/abi/governor";
import { useConfig } from "@/hooks/useConfig";
import { proposalService } from "@/services/graphql";
import type { ProposalState } from "@/types/proposal";
import { extractTitleAndDescription } from "@/utils";
import { formatShortAddress } from "@/utils/address";
import { formatTimestampToFriendlyDate } from "@/utils/date";

import ActionGroup from "./action-group";
import { ActionsTable } from "./actions-table";
import { CurrentVotes } from "./current-votes";
import { Proposal } from "./proposal";
import { Result } from "./result";
import Status from "./status";

export default function ProposalDetailPage() {
  const daoConfig = useConfig();
  const { id } = useParams();

  const { data, isFetching } = useQuery({
    queryKey: ["proposal", id],
    queryFn: () =>
      proposalService.getProposalById(
        daoConfig?.indexer.endpoint as string,
        id as string
      ),
    enabled: !!id && !!daoConfig?.indexer.endpoint,
  });

  const proposalStatus = useReadContract({
    address: daoConfig?.contracts?.governorContract as `0x${string}`,
    abi: GovernorAbi,
    functionName: "state",
    args: [data?.proposalId ? BigInt(data?.proposalId) : 0n],
    query: {
      enabled: !!data?.proposalId && !!daoConfig?.contracts?.governorContract,
    },
  });

  const proposalVotes = useReadContract({
    address: daoConfig?.contracts?.governorContract as `0x${string}`,
    abi: GovernorAbi,
    functionName: "proposalVotes",
    args: [data?.proposalId ? BigInt(data?.proposalId) : 0n],
    query: {
      enabled: !!data?.proposalId && !!daoConfig?.contracts?.governorContract,
    },
  });

  const proposalQueries = useQueries({
    queries: [
      {
        queryKey: ["proposalCanceledById", data?.id],
        queryFn: () =>
          proposalService.getProposalCanceledById(
            daoConfig?.indexer?.endpoint as string,
            data?.proposalId as string
          ),
        enabled:
          !isNil(data?.proposalId) && !isNil(daoConfig?.indexer?.endpoint),
      },
      {
        queryKey: ["proposalExecutedById", data?.id],
        queryFn: () =>
          proposalService.getProposalExecutedById(
            daoConfig?.indexer?.endpoint as string,
            data?.proposalId as string
          ),
        enabled:
          !isNil(data?.proposalId) && !isNil(daoConfig?.indexer?.endpoint),
      },
      {
        queryKey: ["proposalQueuedById", data?.id],
        queryFn: () =>
          proposalService.getProposalQueuedById(
            daoConfig?.indexer?.endpoint as string,
            data?.proposalId as string
          ),
        enabled:
          !isNil(data?.proposalId) && !isNil(daoConfig?.indexer?.endpoint),
      },
    ],
  });

  const [
    { data: proposalCanceledById },
    { data: proposalExecutedById },
    { data: proposalQueuedById },
  ] = proposalQueries;

  const isAllQueriesFetching = proposalQueries.some(
    (query) => query.isFetching
  );

  const proposalVotesData = useMemo(() => {
    return {
      againstVotes: proposalVotes.data?.[0] ?? 0n,
      forVotes: proposalVotes.data?.[1] ?? 0n,
      abstainVotes: proposalVotes.data?.[2] ?? 0n,
    };
  }, [proposalVotes.data]);

  if (!id) {
    return <NotFound />;
  }
  return (
    <>
      <div className="flex w-full flex-col gap-[20px] p-[30px]">
        <div className="flex items-center gap-1 text-[18px] font-extrabold">
          <span className="text-muted-foreground">Proposals</span>
          <span className="text-muted-foreground">/</span>
          <span>Proposal</span>
        </div>

        <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px]">
          <div className="flex items-center justify-between gap-[20px]">
            {isFetching ? (
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
            />
          </div>

          <h2 className="text-[36px] font-extrabold">
            {isFetching ? (
              <Skeleton className="h-[36px] w-[200px]" />
            ) : (
              extractTitleAndDescription(data?.description)?.title
            )}
          </h2>

          <div className="flex items-center gap-[20px]">
            <div className="flex items-center gap-[5px]">
              <span>Proposed by</span>
              {isFetching ? (
                <Skeleton className="h-[24px] w-[24px]" />
              ) : (
                !!data?.proposer && (
                  <AddressWithAvatar
                    address={data?.proposer as `0x${string}`}
                    avatarSize={24}
                    className="gap-[5px]"
                  />
                )
              )}
            </div>
            <div className="h-1 w-1 rounded-full bg-muted-foreground"></div>
            <div className="flex items-center gap-[5px]">
              {isFetching ? (
                <Skeleton className="h-[24px] w-[24px]" />
              ) : (
                <>
                  <span>
                    ID {formatShortAddress(data?.proposalId as string)}
                  </span>
                  <ClipboardIconButton text={id as string} size={14} />
                </>
              )}
            </div>
            <div className="h-1 w-1 rounded-full bg-muted-foreground"></div>
            {isFetching ? (
              <Skeleton className="h-[24px] w-[24px]" />
            ) : (
              <span>
                Proposed on:{" "}
                {formatTimestampToFriendlyDate(data?.blockTimestamp)}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_360px] gap-[20px]">
          <div className="space-y-[20px]">
            <Result />
            <ActionsTable />
            <Proposal data={data} isFetching={isFetching} />
          </div>

          <div className="space-y-[20px]">
            <CurrentVotes proposalVotesData={proposalVotesData} />
            <Status
              data={data}
              isFetching={isFetching}
              status={proposalStatus?.data as ProposalState}
              proposalCanceledById={proposalCanceledById}
              proposalExecutedById={proposalExecutedById}
              proposalQueuedById={proposalQueuedById}
              isAllQueriesFetching={isAllQueriesFetching}
            />
          </div>
        </div>
      </div>
    </>
  );
}
