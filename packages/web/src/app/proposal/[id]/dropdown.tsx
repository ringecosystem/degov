import { MoreIcon, CancelIcon } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DropdownProps {
  showCancel: boolean;
  handleCancelProposal: () => void;
}

export const Dropdown = ({
  showCancel,
  handleCancelProposal,
}: DropdownProps) => {
  return (
    showCancel && (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <span>
            <MoreIcon
              width={36}
              height={36}
              className="cursor-pointer transition-opacity hover:opacity-80 text-current"
            />
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="flex w-[240px] flex-col gap-[10px] rounded-[14px] border-border/20 bg-card p-[10px]"
          align="end"
        >
          {showCancel && (
            <DropdownMenuItem
              className="cursor-pointer p-[10px] text-foreground hover:opacity-80 focus:text-foreground"
              onSelect={handleCancelProposal}
            >
              <CancelIcon width={20} height={20} className="text-current" />
              <span>Cancel Proposal</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  );
};
