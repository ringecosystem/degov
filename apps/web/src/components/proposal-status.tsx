import { getDisplayText, getStatusColor } from "@/config/proposals";
import { cn } from "@/lib/utils";
import type { ProposalState } from "@/types/proposal";

interface ProposalStatusProps {
  status: ProposalState;
  className?: string;
}

export function ProposalStatus({ status, className }: ProposalStatusProps) {
  return (
    <span
      className={cn(
        "inline-block rounded-[14px] px-[18px] py-[4px] text-[14px] font-normal",
        getStatusColor(status).bg,
        getStatusColor(status).text,
        className
      )}
    >
      {getDisplayText(status)}
    </span>
  );
}
