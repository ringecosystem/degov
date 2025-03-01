import { useFormatGovernanceTokenAmount } from "@/hooks/useFormatGovernanceTokenAmount";

interface VoteTotalProps {
  totalVotes: bigint;
  totalAddresses: number;
}
export function VoteTotal({ totalVotes, totalAddresses }: VoteTotalProps) {
  const formatTokenAmount = useFormatGovernanceTokenAmount();

  return (
    <div className="flex flex-col items-center gap-[4px]">
      <span className="text-[14px] font-normal text-foreground">
        {formatTokenAmount(totalVotes).formatted}
      </span>
      <span className="text-[10px] text-muted-foreground">
        {totalAddresses} Addresses
      </span>
    </div>
  );
}
