"use client";

import Image from "next/image";
import Link from "next/link";

import { Nav } from "@/app/nav";
import { ConnectButton } from "@/components/connect-button";
import { IndexerStatus } from "@/components/indexer-status";
import { ThemeButton } from "@/components/theme-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBlockSync } from "@/hooks/useBlockSync";

interface MobileMenuProps {
  children: React.ReactNode;
  open: boolean;
  onMenuToggle: () => void;
}

export const MobileMenu = ({
  children,
  open,
  onMenuToggle,
}: MobileMenuProps) => {
  const { currentBlock, indexedBlock, syncPercentage, status } = useBlockSync();

  return (
    <DropdownMenu open={open} onOpenChange={onMenuToggle}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-screen max-w-none rounded-none border-0 bg-background p-0 shadow-none"
        align="end"
        side="bottom"
        sideOffset={5}
        alignOffset={-10}
        avoidCollisions={false}
      >
        <div
          className="flex flex-col pb-[150px]"
          style={{ height: "calc(100vh - 45px)", width: "100vw" }}
        >
          <div className="flex items-center justify-between p-4 ">
            <ConnectButton onMenuToggle={onMenuToggle} />
            <ThemeButton />
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <Nav collapsed={false} onMenuToggle={onMenuToggle} />
          </div>
          <div className="absolute bottom-0 left-0 w-full">
            <div className="p-4">
              <IndexerStatus
                currentBlock={currentBlock}
                indexedBlock={indexedBlock}
                syncPercentage={syncPercentage}
                status={status}
              />
            </div>
            <p className="flex text-xs text-muted-foreground items-center justify-center gap-[5px] mb-[15px]">
              <span className="text-[12px]">Powered By</span>
              <Link
                href="https://degov.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:opacity-80 transition-all duration-300"
              >
                <Image
                  src="/assets/image/bottom-logo.svg"
                  alt="logo"
                  width={16}
                  height={16}
                  priority
                />
              </Link>
              <span className="text-[12px]">DeGov.AI</span>
            </p>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
