import { ProposalCloseIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { NewProposalAction } from "./action";
interface ReplacePanelProps {
  index: number;
  visible: boolean;
  onReplace: (type: "transfer" | "custom" | "xaccount") => void;
  onRemove: (index: number) => void;
}

export const ReplacePanel = ({
  index,
  visible,
  onReplace,
  onRemove,
}: ReplacePanelProps) => {
  return (
    <div
      className={cn(
        "flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px] shadow-card",
        visible ? "animate-in fade-in duration-300" : "hidden"
      )}
    >
      <header className="flex items-center justify-between">
        <h4 className="text-[18px] font-semibold">Action #{index}</h4>
        <Button
          className="h-[30px] gap-[5px] rounded-[100px] border border-foreground bg-card p-[10px]"
          variant="outline"
          onClick={() => onRemove(index)}
        >
          <ProposalCloseIcon width={16} height={16} className="text-current" />
          <span>Remove action</span>
        </Button>
      </header>
      <div className="mx-auto flex w-full max-w-[850px] flex-col gap-[20px]">
        <NewProposalAction
          type="transfer"
          onSwitch={() => onReplace("transfer")}
        />
        <NewProposalAction type="custom" onSwitch={() => onReplace("custom")} />
        <NewProposalAction
          type="xaccount"
          onSwitch={() => onReplace("xaccount")}
          tip="XAccount is the mechanism that enables cross-chain governance in degov. It allows users to construct and send governance calls in the source chain and then execute them in the target chain."
        />
      </div>
    </div>
  );
};
