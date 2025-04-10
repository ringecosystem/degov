import Image from "next/image";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DropdownProps {
  showCancel: boolean;
  handleCopyUrl: (e: Event) => void;
  handleCancelProposal: () => void;
}

export const Dropdown = ({
  showCancel,
  handleCopyUrl,
  handleCancelProposal,
}: DropdownProps) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Image
          src="/assets/image/more.svg"
          alt="more"
          width={36}
          height={36}
          className="cursor-pointer transition-opacity hover:opacity-80"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="flex w-[240px] flex-col gap-[10px] rounded-[14px] border-border/20 bg-card p-[10px]"
        align="end"
      >
        <DropdownMenuItem
          className="cursor-pointer p-[10px]"
          onSelect={handleCopyUrl}
        >
          <Image
            src="/assets/image/proposal/copy.svg"
            alt="copy"
            width={20}
            height={20}
          />
          <span>Copy URL</span>
        </DropdownMenuItem>

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
  );
};
