import { useEffect, useMemo, useState } from "react";

import type { ProposalItem } from "@/services/graphql/types";

import { AiSummary } from "../ai-summary";

import { Comments } from "./comments";
import { Description } from "./description";

type TabType = "description" | "ai-summary" | "comments";

export const Proposal = ({
  isFetching,
  data,
  id,
}: {
  isFetching: boolean;
  data?: ProposalItem;
  id: string;
}) => {
  const [activeTab, setActiveTab] = useState<TabType>("description");

  const comments = useMemo(() => {
    return data?.voters?.filter((voter) => voter.reason) ?? [];
  }, [data?.voters]);

  // Calculate total voting power from voters who have comments
  const totalVotingPower = useMemo(() => {
    if (!comments.length) return 0n;

    return comments.reduce((total, voter) => {
      const voterWeight = voter.weight ? BigInt(voter.weight) : 0n;
      return total + voterWeight;
    }, 0n);
  }, [comments]);
  const tabs = useMemo(() => {
    const baseTabs: { key: TabType; label: string }[] = [
      { key: "description", label: "Description" },
      { key: "ai-summary", label: "Ai Summary" },
    ];

    if (comments?.length > 0) {
      baseTabs.push({ key: "comments", label: "Comments" });
    }

    return baseTabs;
  }, [comments?.length]);

  useEffect(() => {
    return () => {
      setActiveTab("description");
    };
  }, []);

  return (
    <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px]">
      <h4 className="text-[26px] font-semibold">Proposal</h4>

      <div className="flex flex-col gap-[20px]">
        <div className="flex flex-col gap-[20px] border-b border-b-border/20">
          <div className="flex gap-[32px]">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                className={`pb-[12px] text-[16px] font-medium ${
                  activeTab === tab.key
                    ? "border-b-2 border-primary text-primary"
                    : "text-text-secondary hover:text-text-primary"
                }`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-[200px]">
          {activeTab === "description" && (
            <Description data={data} isFetching={isFetching} />
          )}
          {activeTab === "ai-summary" && <AiSummary id={id} />}
          {activeTab === "comments" && comments?.length && (
            <Comments comments={comments} totalVotingPower={totalVotingPower} />
          )}
        </div>
      </div>
    </div>
  );
};
