import Image from "next/image";

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
            <Image
              src="/assets/image/light/more.svg"
              alt="more"
              width={36}
              height={36}
              className="cursor-pointer transition-opacity hover:opacity-80 dark:hidden"
            />
            <Image
              src="/assets/image/more.svg"
              alt="more"
              width={36}
              height={36}
              className="cursor-pointer transition-opacity hover:opacity-80 hidden dark:block"
            />
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="flex w-[240px] flex-col gap-[10px] rounded-[14px] border-border/20 bg-card p-[10px]"
          align="end"
        >
          {showCancel && (
            <DropdownMenuItem
              className="cursor-pointer p-[10px]"
              onSelect={handleCancelProposal}
            >
              <Image
                src="/assets/image/proposal/cancel.svg"
                alt="cancel"
                width={20}
                height={20}
              />
              <span>Cancel Proposal</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  );
};
