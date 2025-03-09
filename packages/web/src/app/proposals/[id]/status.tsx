import { isNil } from "lodash-es";
import Image from "next/image";
import React, { useMemo } from "react";

import { AddressWithAvatar } from "@/components/address-with-avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfig } from "@/hooks/useConfig";
import { useGovernanceParams } from "@/hooks/useGovernanceParams";
import type {
  ProposalCanceledByIdItem,
  ProposalExecutedByIdItem,
  ProposalItem,
  ProposalQueuedByIdItem,
} from "@/services/graphql/types";
import { ProposalState } from "@/types/proposal";
import { formatTimestampToDayTime, getTimeRemaining } from "@/utils/date";

const StatusSkeleton = () => {
  const stagesCount = 4;
  const stages = Array(stagesCount).fill(null);

  return (
    <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px]">
      <h3 className="text-[18px] text-white">Status</h3>
      <Separator className="bg-border/20" />
      <div className="relative">
        <div className="absolute bottom-0 left-[14px] top-3 w-0.5 bg-white/10" />

        {stages.map((_, index) => (
          <div
            key={index}
            className="mb-6 flex w-full items-center justify-between"
          >
            <div className="flex items-center gap-[10px]">
              <div className="z-10 mr-[13px] h-[28px] w-[28px]">
                <Skeleton className="h-[28px] w-[28px] rounded-full" />
              </div>
              <div className="flex flex-col gap-[5px]">
                <Skeleton className="h-[10px] w-[60px]" />
                <Skeleton className="h-[16px] w-[120px]" />
                {index === 0 && (
                  <Skeleton className="h-[14px] w-[100px]" />
                )}{" "}
              </div>
            </div>
            {index < 3 && <Skeleton className="h-[16px] w-[16px]" />}
          </div>
        ))}
      </div>
    </div>
  );
};

interface ProposalStage {
  title: string;
  icon: React.ReactNode;
  timestamp?: string;
  isActive?: boolean;
  tag?: string;
  address?: `0x${string}`;
  viewOnExplorer?: string;
  remaining?: string;
}

interface StatusProps {
  data?: ProposalItem;
  status: ProposalState;
  proposalCanceledById?: ProposalCanceledByIdItem;
  proposalExecutedById?: ProposalExecutedByIdItem;
  proposalQueuedById?: ProposalQueuedByIdItem;
  isLoading?: boolean;
}

const Status: React.FC<StatusProps> = ({
  data,
  status,
  proposalCanceledById,
  proposalExecutedById,
  proposalQueuedById,
  isLoading,
}) => {
  const daoConfig = useConfig();
  const { data: govParams } = useGovernanceParams();

  const votingPeriodStarted = useMemo(() => {
    if (isNil(data?.blockTimestamp) || isNil(govParams?.votingDelay)) return "";
    return (
      BigInt(data?.blockTimestamp) + (govParams?.votingDelay ?? 0n) * 1000n
    );
  }, [data?.blockTimestamp, govParams?.votingDelay]);

  const votingPeriodEnded = useMemo(() => {
    if (votingPeriodStarted === "" || isNil(govParams?.votingPeriod)) return "";
    return votingPeriodStarted + (govParams?.votingPeriod ?? 0n) * 1000n;
  }, [votingPeriodStarted, govParams?.votingPeriod]);

  const stages: ProposalStage[] = useMemo(() => {
    const baseStages = [
      {
        title: "Publish onChain",
        timestamp: formatTimestampToDayTime(data?.blockTimestamp),
        icon: (
          <Image
            src="/assets/image/proposal/status-published.svg"
            alt="published"
            width={28}
            height={28}
          />
        ),
        address: data?.proposer as `0x${string}`,
        viewOnExplorer: `${daoConfig?.network?.explorer?.[0]}/tx/${data?.transactionHash}`,
      },
      {
        title: "Start voting period",
        timestamp: formatTimestampToDayTime(String(votingPeriodStarted)),
        icon: (
          <Image
            src="/assets/image/proposal/status-started.svg"
            alt="started"
            width={28}
            height={28}
          />
        ),
      },
      {
        title: "End voting period",
        timestamp: formatTimestampToDayTime(String(votingPeriodEnded)),
        icon: (
          <Image
            src="/assets/image/proposal/status-ended.svg"
            alt="ended"
            width={28}
            height={28}
          />
        ),
        remaining: getTimeRemaining(Number(votingPeriodEnded)) ?? "",
      },
    ];
    switch (status) {
      case ProposalState.Pending:
      case ProposalState.Active:
      case ProposalState.Queued:
      case ProposalState.Executed:
      case ProposalState.Succeeded:
        return [
          ...baseStages,
          {
            title: "Queue proposal",
            timestamp: proposalQueuedById?.blockTimestamp
              ? formatTimestampToDayTime(proposalQueuedById?.blockTimestamp)
              : "",
            icon: (
              <Image
                src="/assets/image/proposal/status-queued.svg"
                alt="queued"
                width={28}
                height={28}
              />
            ),
            viewOnExplorer: `${daoConfig?.network?.explorer?.[0]}/tx/${proposalQueuedById?.transactionHash}`,
          },
          {
            title: "Execute proposal",
            timestamp: proposalExecutedById?.blockTimestamp
              ? formatTimestampToDayTime(proposalExecutedById?.blockTimestamp)
              : "",
            icon: (
              <Image
                src="/assets/image/proposal/status-executed.svg"
                alt="executed"
                width={28}
                height={28}
              />
            ),
            viewOnExplorer: `${daoConfig?.network?.explorer?.[0]}/tx/${proposalExecutedById?.transactionHash}`,
          },
        ]?.map((v) => {
          if (status === ProposalState.Pending) {
            return {
              ...v,
              isActive: v.title === "Publish onChain",
            };
          }
          if (status === ProposalState.Active) {
            return {
              ...v,
              isActive:
                v.title === "Publish onChain" ||
                v.title === "Start voting period",
            };
          }
          if (status === ProposalState.Succeeded) {
            return {
              ...v,
              isActive:
                v.title === "Publish onChain" ||
                v.title === "Start voting period" ||
                v.title === "End voting period",
            };
          }

          if (status === ProposalState.Queued) {
            return {
              ...v,
              isActive: v.title !== "Execute proposal",
            };
          }

          if (status === ProposalState.Executed) {
            return {
              ...v,
              isActive: true,
            };
          }

          return {
            ...v,
            isActive: true,
          };
        });
      case ProposalState.Canceled:
        return [
          ...baseStages?.map((v) => ({
            ...v,
            isActive: true,
          })),

          {
            title: "Proposal canceled",
            timestamp: formatTimestampToDayTime(
              proposalCanceledById?.blockTimestamp
            ),
            icon: (
              <Image
                src="/assets/image/proposal/done.svg"
                alt="done"
                width={28}
                height={28}
              />
            ),
            isActive: true,
          },
        ];
      case ProposalState.Defeated:
        return [
          ...baseStages?.map((v) => ({
            ...v,
            isActive: true,
          })),
          {
            title: "Proposal defeated",
            icon: (
              <Image
                src="/assets/image/proposal/done.svg"
                alt="done"
                width={28}
                height={28}
              />
            ),
            isActive: true,
          },
        ];
      case ProposalState.Expired:
        return [
          ...baseStages?.map((v) => ({
            ...v,
            isActive: true,
          })),
          {
            title: "Queue proposal",
            timestamp: proposalQueuedById?.blockTimestamp
              ? formatTimestampToDayTime(proposalQueuedById?.blockTimestamp)
              : "",
            icon: (
              <Image
                src="/assets/image/proposal/status-queued.svg"
                alt="queued"
                width={28}
                height={28}
              />
            ),
            isActive: true,
          },
          {
            title: "Execute proposal",
            icon: (
              <Image
                src="/assets/image/proposal/done.svg"
                alt="done"
                width={28}
                height={28}
              />
            ),
            isActive: false,
          },
        ];
      default:
        return baseStages;
    }
  }, [
    data,
    proposalCanceledById,
    proposalExecutedById,
    proposalQueuedById,
    daoConfig?.network?.explorer,
    votingPeriodEnded,
    votingPeriodStarted,
    status,
  ]);

  if (isLoading) {
    return <StatusSkeleton />;
  }

  return (
    <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px]">
      <h3 className="text-[18px] text-white">Status</h3>
      <Separator className="bg-border/20" />
      <div className="relative">
        <div className="absolute bottom-0 left-[14px] top-3 w-0.5 bg-white/10" />

        {stages.map((stage, index) => (
          <div
            key={index}
            className={`mb-6 flex w-full items-center justify-between ${
              stage.isActive ? "opacity-100" : "opacity-50"
            }`}
          >
            <div className="flex items-center gap-[10px]">
              <div className="z-10 mr-[13px] h-[28px] w-[28px] text-white">
                {stage.icon}
              </div>
              <div className="flex items-center justify-between gap-[10px]">
                <div>
                  {!!stage?.timestamp && (
                    <div className="text-[10px] text-muted-foreground">
                      {stage.timestamp}
                    </div>
                  )}

                  <span className="text-[16px] font-semibold text-white">
                    {stage.title}
                  </span>
                  {stage.address && (
                    <AddressWithAvatar
                      address={stage.address}
                      className="flex gap-[5px]"
                      textClassName="text-[10px]"
                      avatarSize={14}
                    />
                  )}
                  {stage.remaining && (
                    <div className="text-[10px] text-muted-foreground">
                      {stage.remaining}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {stage.viewOnExplorer && (
              <a
                href={stage.viewOnExplorer}
                target="_blank"
                rel="noopener noreferrer"
                title="View on Explorer"
                className="hover:opacity-80 transition-opacity duration-300"
              >
                <Image
                  src="/assets/image/external-link.svg"
                  alt="arrow"
                  width={16}
                  height={16}
                />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Status;
