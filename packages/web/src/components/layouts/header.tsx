"use client";
import { Search } from "lucide-react";
import React from "react";

import { ConnectButton } from "@/components/connect-button";
import { SearchModal } from "@/components/search-modal";
import { ThemeSelector } from "@/components/theme-selector";

export const Header = () => {
  const [open, setOpen] = React.useState(false);
  return (
    <header className="sticky top-0 z-10 w-full border-b border-gray-1 px-[30px] py-[20px] backdrop-blur-sm bg-background/80 shadow-sm">
      <div className="relative flex h-[36px] items-center justify-between">
        <div
          className={`flex h-[36px] w-[388px] items-center gap-[13px] rounded-[20px] border px-[17px] transition-all border-gray-1 bg-card`}
        >
          <Search className="h-[15px] w-[15px] text-foreground/50" />
          <input
            placeholder="Search proposals on this DAO"
            className="h-full flex-1 appearance-none bg-transparent outline-none placeholder:text-foreground/50 placeholder:text-[14px] placeholder:font-normal"
            readOnly
            onClick={() => setOpen(true)}
          />
        </div>
        <div className="flex items-center gap-[10px]">
          <ConnectButton />
          <ThemeSelector />
        </div>
        <SearchModal open={open} onOpenChange={setOpen}></SearchModal>
      </div>
    </header>
  );
};
