import { QuestionIcon } from "@/components/icons";
import { getProposalActionIcon } from "@/components/icons/proposal-actions-map";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { type ProposalActionType } from "@/config/proposals";
import { cn } from "@/lib/utils";
interface NewProposalActionProps {
  type: Exclude<ProposalActionType, "add">;
  tip?: string;
  onSwitch?: (type: Exclude<ProposalActionType, "add">) => void;
  active?: boolean;
  error?: boolean;
}

export const NewProposalAction = ({
  type,
  onSwitch,
  active,
  error,
  tip,
}: NewProposalActionProps) => {
  const IconComponent = getProposalActionIcon(type);

  if (type === "proposal") {
    return (
      <div
        className={cn(
          "relative flex cursor-pointer items-center gap-[10px] rounded-[14px] border border-gray-1 bg-card px-[20px] py-[15px] transition-opacity hover:opacity-80",
          active && "border-foreground"
        )}
        onClick={() => onSwitch?.("proposal")}
      >
        <IconComponent width={24} height={24} className="text-current" />
        <span className="text-[14px] font-normal text-foreground">
          Proposal
        </span>
        {error && (
          <span className="absolute right-[20px] top-1/2 h-[10px] w-[10px] -translate-y-1/2 rounded-full bg-danger"></span>
        )}
      </div>
    );
  }
  if (type === "transfer") {
    return (
      <div
        className={cn(
          "relative flex cursor-pointer items-center gap-[10px] rounded-[14px] border border-gray-1 bg-card px-[20px] py-[15px] transition-opacity hover:opacity-80",
          active && "border-foreground"
        )}
        onClick={() => onSwitch?.("transfer")}
      >
        <IconComponent width={24} height={24} className="text-current" />
        <span className="text-[14px] font-normal text-foreground">
          Transfer
        </span>
        {error && (
          <span className="absolute right-[20px] top-1/2 h-[10px] w-[10px] -translate-y-1/2 rounded-full bg-danger"></span>
        )}
      </div>
    );
  }
  if (type === "custom") {
    return (
      <div
        className={cn(
          "relative flex cursor-pointer items-center gap-[10px] rounded-[14px] border border-gray-1 bg-card px-[20px] py-[15px] transition-opacity hover:opacity-80",
          active && "border-foreground"
        )}
        onClick={() => onSwitch?.("custom")}
      >
        <IconComponent width={24} height={24} className="text-current" />
        <span className="text-[14px] font-normal text-foreground">Custom</span>
        {error && (
          <span className="absolute right-[20px] top-1/2 h-[10px] w-[10px] -translate-y-1/2 rounded-full bg-danger"></span>
        )}
      </div>
    );
  }
  if (type === "xaccount") {
    return (
      <div
        className={cn(
          "relative flex cursor-pointer items-center gap-[10px] rounded-[14px] border border-gray-1 bg-card px-[20px] py-[15px] transition-opacity hover:opacity-80",
          active && "border-foreground"
        )}
        onClick={() => onSwitch?.("custom")}
      >
        <IconComponent width={24} height={24} className="text-current" />
        <span className="text-[14px] font-normal text-foreground flex items-center gap-[5px]">
          XAccount Cross-chain
          {tip && (
            <Tooltip>
              <TooltipTrigger>
                <QuestionIcon
                  width={20}
                  height={20}
                  className="text-muted-foreground"
                />
              </TooltipTrigger>
              <TooltipContent className="max-w-[300px]">{tip}</TooltipContent>
            </Tooltip>
          )}
        </span>
        {error && (
          <span className="absolute right-[20px] top-1/2 h-[10px] w-[10px] -translate-y-1/2 rounded-full bg-danger"></span>
        )}
      </div>
    );
  }
  if (type === "preview") {
    return (
      <div
        className={cn(
          "flex cursor-pointer items-center gap-[10px] rounded-[14px] border border-gray-1 bg-card px-[20px] py-[15px] transition-opacity hover:opacity-80",
          active && "border-foreground"
        )}
        onClick={() => onSwitch?.("preview")}
      >
        <IconComponent width={24} height={24} className="text-current" />
        <span className="text-[14px] font-normal text-foreground">Preview</span>
      </div>
    );
  }
  return null;
};
