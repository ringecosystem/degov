import { Progress } from "@/components/ui/progress";
import { VOTE_CONFIG } from "@/config/vote";
import { useFormatGovernanceTokenAmount } from "@/hooks/useFormatGovernanceTokenAmount";

interface VotePercentageProps {
  status: "for" | "against" | "abstain";
  value: bigint;
  total: bigint;
}
export function VotePercentage({ status, value, total }: VotePercentageProps) {
  const formatTokenAmount = useFormatGovernanceTokenAmount();

  return (
    <div className="flex flex-col items-center gap-[4px]">
      <span className="text-[14px] font-normal text-foreground">
        {formatTokenAmount(value).formatted}
      </span>
      <Progress
        value={(Number(value) / Number(total)) * 100}
        indicatorClassName={VOTE_CONFIG.colors[status]}
        className="h-[4px] w-[60px]"
      />
    </div>
  );
}
