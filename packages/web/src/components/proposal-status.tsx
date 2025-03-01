import { getDisplayText, getStatusColor } from "@/config/proposals";
import { cn } from "@/lib/utils";
import type { ProposalState } from "@/types/proposal";

interface ProposalStatusProps {
  status: ProposalState;
}

export function ProposalStatus({ status }: ProposalStatusProps) {
  console.log("status", status);
  return (
    <span
      className={cn(
        "inline-block rounded-[14px] px-[18px] py-[4px] text-[14px] font-normal",
        getStatusColor(status).bg,
        getStatusColor(status).text
      )}
    >
      {getDisplayText(status)}
    </span>
  );
}
