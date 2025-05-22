import Image from "next/image";
import { useMemo } from "react";
import { useReadContract } from "wagmi";

import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { abi as governorAbi } from "@/config/abi/governor";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useFormatGovernanceTokenAmount } from "@/hooks/useFormatGovernanceTokenAmount";

const CurrentVotesSkeleton = () => {
  return (
    <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px]">
      <h3 className="text-[18px] font-semibold">Current Votes</h3>
      <Separator className="!my-0 bg-border/20" />

      <div className="flex flex-col gap-[20px]">
        <div className="flex items-center justify-between gap-[10px]">
          <div className="flex items-center gap-[5px]">
            <Skeleton className="h-[20px] w-[20px] rounded-full" />
            <span className="text-[14px] font-normal">Quorum</span>
          </div>
          <Skeleton className="h-[18px] w-[120px]" />
        </div>

        <div className="flex flex-col gap-[10px]">
          <div className="flex items-center justify-between gap-[10px]">
            <div className="flex items-center gap-[5px]">
              <Skeleton className="h-[20px] w-[20px] rounded-full" />
              <span className="text-[14px] font-normal">Majority support</span>
            </div>
            <Skeleton className="h-[18px] w-[40px]" />
          </div>

          <Skeleton className="h-[6px] w-full rounded-[2px]" />
        </div>

        <div className="flex items-center justify-between gap-[10px]">
          <div className="flex items-center gap-[5px]">
            <span className="inline-block h-[16px] w-[16px] rounded-full bg-success" />
            <span className="text-[14px] font-normal">For</span>
          </div>
          <Skeleton className="h-[18px] w-[80px]" />
        </div>

        <div className="flex items-center justify-between gap-[10px]">
          <div className="flex items-center gap-[5px]">
            <span className="inline-block h-[16px] w-[16px] rounded-full bg-danger" />
            <span className="text-[14px] font-normal">Against</span>
          </div>
          <Skeleton className="h-[18px] w-[80px]" />
        </div>

        <div className="flex items-center justify-between gap-[10px]">
          <div className="flex items-center gap-[5px]">
            <span className="inline-block h-[16px] w-[16px] rounded-full bg-muted-foreground" />
            <span className="text-[14px] font-normal">Abstain</span>
          </div>
          <Skeleton className="h-[18px] w-[80px]" />
        </div>
      </div>
    </div>
  );
};

interface CurrentVotesProps {
  proposalVotesData: {
    againstVotes: bigint;
    forVotes: bigint;
    abstainVotes: bigint;
  };
  isLoading?: boolean;
  blockTimestamp?: string;
}
export const CurrentVotes = ({
  proposalVotesData,
  blockTimestamp,
  isLoading,
}: CurrentVotesProps) => {
  const daoConfig = useDaoConfig();
  const formatTokenAmount = useFormatGovernanceTokenAmount();

  const { data: quorumData, isLoading: isQuorumLoading } = useReadContract({
    address: daoConfig?.contracts?.governor as `0x${string}`,
    abi: governorAbi,
    functionName: "quorum" as const,
    args: [blockTimestamp ? BigInt(Number(blockTimestamp) / 1000) : BigInt(0)],
    chainId: daoConfig?.chain?.id,
    query: {
      enabled:
        Boolean(daoConfig?.contracts?.governor) &&
        Boolean(blockTimestamp) &&
        Boolean(daoConfig?.chain?.id),
    },
  });

  const percentage = useMemo(() => {
    const total =
      proposalVotesData.againstVotes +
      proposalVotesData.forVotes +
      proposalVotesData.abstainVotes;
    if (total === 0n) {
      return { forPercentage: 0, againstPercentage: 0, abstainPercentage: 0 };
    }

    const forPercentage =
      (Number(proposalVotesData.forVotes) / Number(total)) * 100;

    const againstPercentage =
      (Number(proposalVotesData.againstVotes) / Number(total)) * 100;

    const abstainPercentage =
      (Number(proposalVotesData.abstainVotes) / Number(total)) * 100;

    return { forPercentage, againstPercentage, abstainPercentage };
  }, [proposalVotesData]);

  const quorum = useMemo(() => {
    const total = proposalVotesData.forVotes + proposalVotesData.abstainVotes;
    return total;
  }, [proposalVotesData]);

  if (isLoading) {
    return <CurrentVotesSkeleton />;
  }

  return (
    <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px]">
      <h3 className="text-[18px] font-semibold">Current Votes</h3>
      <Separator className="!my-0 bg-border/20" />

      <div className="flex flex-col gap-[20px]">
        <div className="flex items-center justify-between gap-[10px]">
          <div className="flex items-center gap-[5px]">
            <Image
              src={
                quorum > proposalVotesData?.againstVotes
                  ? "/assets/image/light/proposal/check.svg"
                  : "/assets/image/light/proposal/error.svg"
              }
              alt="error"
              width={20}
              height={20}
              className="rounded-full block dark:hidden"
            />
            <Image
              src={
                quorum > proposalVotesData?.againstVotes
                  ? "/assets/image/proposal/check.svg"
                  : "/assets/image/proposal/error.svg"
              }
              alt="error"
              width={20}
              height={20}
              className="rounded-full hidden dark:block"
            />
            <span className="text-[14px] font-normal">Quorum</span>
          </div>
          {isQuorumLoading ? (
            <Skeleton className="h-[18px] w-[120px]" />
          ) : (
            <span>
              {formatTokenAmount(quorum).formatted} of{" "}
              {formatTokenAmount(quorumData ?? 0n).formatted}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-[10px]">
          <div className="flex items-center justify-between gap-[10px]">
            <div className="flex items-center gap-[5px]">
              <Image
                src={
                  calculateMajoritySupport(proposalVotesData) === "Yes"
                    ? "/assets/image/light/proposal/check.svg"
                    : "/assets/image/light/proposal/error.svg"
                }
                alt="check"
                width={20}
                height={20}
                className="rounded-full block dark:hidden"
              />
              <Image
                src={
                  calculateMajoritySupport(proposalVotesData) === "Yes"
                    ? "/assets/image/proposal/check.svg"
                    : "/assets/image/proposal/error.svg"
                }
                alt="check"
                width={20}
                height={20}
                className="rounded-full hidden dark:block"
              />
              <span className="text-[14px] font-normal">Majority support</span>
            </div>

            <span>{calculateMajoritySupport(proposalVotesData)}</span>
          </div>

          <div className="flex h-[6px] w-full items-center rounded-[2px]">
            <div
              className="h-full rounded-[2px] bg-success"
              style={{
                width: `${percentage?.forPercentage}%`,
              }}
            />
            <div
              className=" h-full rounded-[2px] bg-danger"
              style={{
                width: `${percentage?.againstPercentage}%`,
              }}
            />
            <div
              className="h-full rounded-[2px] bg-muted-foreground"
              style={{
                width: `${percentage?.abstainPercentage}%`,
              }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-[10px]">
          <div className="flex items-center gap-[5px]">
            <span className="inline-block h-[16px] w-[16px] rounded-full bg-success" />
            <span className="text-[14px] font-normal">For</span>
          </div>

          <span>{formatTokenAmount(proposalVotesData.forVotes).formatted}</span>
        </div>

        <div className="flex items-center justify-between gap-[10px]">
          <div className="flex items-center gap-[5px]">
            <span className="inline-block h-[16px] w-[16px] rounded-full bg-danger" />
            <span className="text-[14px] font-normal">Against</span>
          </div>

          <span>
            {formatTokenAmount(proposalVotesData.againstVotes).formatted}
          </span>
        </div>

        <div className="flex items-center justify-between gap-[10px]">
          <div className="flex items-center gap-[5px]">
            <span className="inline-block h-[16px] w-[16px] rounded-full bg-muted-foreground" />
            <span className="text-[14px] font-normal">Abstain</span>
          </div>

          <span>
            {formatTokenAmount(proposalVotesData.abstainVotes).formatted}
          </span>
        </div>
      </div>
    </div>
  );
};

function calculateMajoritySupport(votesData: {
  againstVotes: bigint;
  forVotes: bigint;
  abstainVotes: bigint;
}): string {
  return votesData.forVotes > votesData.againstVotes ? "Yes" : "No";
}
