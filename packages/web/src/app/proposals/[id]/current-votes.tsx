import Image from "next/image";
import { useMemo } from "react";

import { Separator } from "@/components/ui/separator";
import { useFormatGovernanceTokenAmount } from "@/hooks/useFormatGovernanceTokenAmount";
import { useGovernanceParams } from "@/hooks/useGovernanceParams";

interface CurrentVotesProps {
  proposalVotesData: {
    againstVotes: bigint;
    forVotes: bigint;
    abstainVotes: bigint;
  };
}
export const CurrentVotes = ({ proposalVotesData }: CurrentVotesProps) => {
  const formatTokenAmount = useFormatGovernanceTokenAmount();
  const { data: govParams } = useGovernanceParams();
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

  return (
    <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px]">
      <h3 className="text-[18px] font-semibold">Current Votes</h3>
      <Separator className="!my-0 bg-border/20" />

      <div className="flex flex-col gap-[20px]">
        <div className="flex items-center justify-between gap-[10px]">
          <div className="flex items-center gap-[5px]">
            <Image
              src="/assets/image/proposal/error.svg"
              alt="error"
              width={20}
              height={20}
              className="rounded-full"
            />
            <span className="text-[14px] font-normal">Quorum</span>
          </div>

          <span>
            167.8M of {formatTokenAmount(govParams?.quorum ?? 0n).formatted}
          </span>
        </div>

        <div className="flex flex-col gap-[10px]">
          <div className="flex items-center justify-between gap-[10px]">
            <div className="flex items-center gap-[5px]">
              <Image
                src={
                  calculateMajoritySupport(proposalVotesData) === "Yes"
                    ? "/assets/image/proposal/check.svg"
                    : "/assets/image/proposal/error.svg"
                }
                alt="check"
                width={20}
                height={20}
                className="rounded-full"
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
  const total =
    votesData.forVotes + votesData.againstVotes + votesData.abstainVotes;

  if (total === 0n) return "No";

  const forPercentage = (Number(votesData.forVotes) / Number(total)) * 100;
  const againstPercentage =
    (Number(votesData.againstVotes) / Number(total)) * 100;

  const isSimpleMajority = votesData.forVotes > votesData.againstVotes;

  const isAbsoluteMajority = forPercentage > 50;

  if (isAbsoluteMajority) return "Yes";
  if (againstPercentage > 50) return "No";

  if (isSimpleMajority) return "Yes";

  return "No";
}
