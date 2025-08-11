"use client";

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

import { Socials } from "../socials";

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
        sideOffset={6}
        alignOffset={-10}
        avoidCollisions={false}
      >
        <div
          className="flex flex-col"
          style={{ height: "calc(100vh - 45px)", width: "100vw" }}
        >
          <div className="flex items-center justify-between p-4 ">
            <ConnectButton onMenuToggle={onMenuToggle} />
            <ThemeButton />
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <Nav collapsed={false} onMenuToggle={onMenuToggle} />
          </div>

          <div className="p-4">
            <IndexerStatus
              currentBlock={currentBlock}
              indexedBlock={indexedBlock}
              syncPercentage={syncPercentage}
              status={status}
            />
          </div>
          <div className="mt-[10px] mb-[10px]">
            <Socials collapsed={false} />
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
