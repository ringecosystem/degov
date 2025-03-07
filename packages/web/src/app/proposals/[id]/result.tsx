import { useCallback, useMemo, useState } from "react";

import { VoteType, VoteConfig, voteTypeLabel } from "@/config/vote";
import { cn } from "@/lib/utils";
import type { ProposalItem } from "@/services/graphql/types";

import { ResultTable } from "./result-table";

interface ResultProps {
  data?: ProposalItem;
  isFetching: boolean;
}

export const Result = ({ data, isFetching }: ResultProps) => {
  const [activeTab, setActiveTab] = useState<VoteType>(VoteType.For);
  const [page, setPage] = useState(1);

  const activeTabConfig = VoteConfig[activeTab];
  const dataSource = useMemo(() => {
    if (!data || !data.voters) return [];
    return data?.voters?.filter((voter) => voter.support === activeTab);
  }, [data, activeTab]);

  const handleTabClick = useCallback(
    (voteType: VoteType) => {
      setActiveTab(voteType);
      setPage(1);
    },
    [setActiveTab, setPage]
  );

  return (
    <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px]">
      <h4 className="mb-4 text-xl">Result details</h4>
      <div className="grid grid-cols-3 border-b border-border/20">
        {voteTypeLabel.map((voteType) => (
          <div
            key={voteType.value}
            className="flex cursor-pointer flex-col gap-[10px] transition-opacity duration-300 hover:opacity-80"
            onClick={() => handleTabClick(voteType.value)}
          >
            <h5
              className={cn(
                "text-center text-[18px] font-semibold capitalize",
                activeTab === voteType.value
                  ? activeTabConfig.textColor
                  : "text-foreground",
                activeTab === voteType.value ? "font-semibold" : "font-normal"
              )}
            >
              {voteType.label}
            </h5>
            <div
              className={cn(
                "h-[4px] w-full",
                VoteConfig[voteType.value].bgColor,
                activeTab === voteType.value ? "visible" : "invisible"
              )}
            />
          </div>
        ))}
      </div>
      <ResultTable
        data={dataSource}
        isFetching={isFetching}
        page={page}
        setPage={setPage}
      />
    </div>
  );
};
