"use client";
import { Search } from "lucide-react";
import { SearchModal } from "@/components/search-modal";
import { ConnectButton } from "@/components/connect-button";
import React from "react";
export const Header = () => {
  const [open, setOpen] = React.useState(false);
  return (
    <header className="sticky top-0 z-10 w-full border-b border-[#474747] px-[30px] py-[20px] backdrop-blur-sm bg-background/80 shadow-sm">
      <div className="relative flex h-[36px] items-center justify-between">
        <div
          className={`flex h-[36px] w-[388px] items-center gap-[13px] rounded-[20px] border px-[17px] transition-all border-border bg-card`}
        >
          <Search className="h-[15px] w-[15px] text-white/50" />
          <input
            placeholder="Search proposals on DeGov"
            className="h-full flex-1 appearance-none bg-transparent outline-none"
            readOnly
            onClick={() => setOpen(true)}
          />
        </div>

        <ConnectButton />
        <SearchModal open={open} onOpenChange={setOpen}></SearchModal>
      </div>
    </header>
  );
};
