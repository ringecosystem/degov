import { useState } from "react";

import { VoteType, VoteConfig } from "@/config/vote";
import { cn } from "@/lib/utils";

import { ResultTable } from "./result-table";
export const Result = () => {
  const [activeTab, setActiveTab] = useState(VoteType.For);

  const activeTabConfig = VoteConfig[activeTab];
  return (
    <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px]">
      <h4 className="mb-4 text-xl">Result details</h4>
      <div className="grid grid-cols-3 border-b border-border/20">
        {Object.values(VoteType).map((voteType) => (
          <div
            key={voteType}
            className="flex cursor-pointer flex-col gap-[10px] transition-opacity duration-300 hover:opacity-80"
            onClick={() => setActiveTab(voteType)}
          >
            <h5
              className={cn(
                "text-center text-[18px] font-semibold capitalize",
                activeTab === voteType
                  ? activeTabConfig.textColor
                  : "text-foreground",
                activeTab === voteType ? "font-semibold" : "font-normal"
              )}
            >
              {voteType}
            </h5>
            <div
              className={cn(
                "h-[4px] w-full",
                VoteConfig[voteType].bgColor,
                activeTab === voteType ? "visible" : "invisible"
              )}
            />
          </div>
        ))}
      </div>
      <ResultTable
        data={[
          {
            address: "0x123",
            vote: "For",
          },
          {
            address: "0x133",
            vote: "Against",
          },
        ]}
      />
    </div>
  );
};
