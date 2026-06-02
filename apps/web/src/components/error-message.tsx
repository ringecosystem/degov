import { cn } from "@/lib/utils";

import { ProposalActionErrorIcon } from "./icons";
export const ErrorMessage = ({
  message,
  className,
}: {
  message?: string;
  className?: string;
}) => {
  return (
    <span className={cn("flex items-center gap-[5px]", className)} role="alert">
      <ProposalActionErrorIcon width={16} height={16} />
      <span className="text-[12px] text-foreground">{message}</span>
    </span>
  );
};
