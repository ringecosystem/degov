import { Loader2 } from "lucide-react";
import Image from "next/image";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DropdownProps {
  isLoading: boolean;
  showCancel: boolean;
  explorerUrl: string;
  handleCopyUrl: (e: Event) => void;
  handleCancelProposal: () => void;
}

export const Dropdown = ({
  isLoading,
  showCancel,
  explorerUrl,
  handleCopyUrl,
  handleCancelProposal,
}: DropdownProps) => {
  return (
    <>
      {isLoading ? (
        <Loader2 className="h-[36px] w-[36px] animate-spin" />
      ) : (
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
            <DropdownMenuItem asChild className="cursor-pointer p-[10px]">
              <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
                <Image
                  src="/assets/image/proposal/explorer.svg"
                  alt="block"
                  width={20}
                  height={20}
                />
                <span>View on Block Explorer</span>
              </a>
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
      )}
    </>
  );
};

//    href={`${daoConfig?.network?.explorer?.url}/tx/${data?.transactionHash}`}
