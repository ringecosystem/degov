import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

import { DEFAULT_ANIMATION_DURATION } from "@/config/base";
import { cn } from "@/lib/utils";
import type { ProposalItem } from "@/services/graphql/types";

import { AiReview } from "./ai-review";
import { Comments } from "./proposal/comments";
import { TabContent } from "./tab-content";

type TabType = "content" | "votes" | "ai-review";

interface TabsProps {
  data?: ProposalItem;
  isFetching: boolean;
  proposalVotesData: {
    againstVotes: bigint;
    forVotes: bigint;
    abstainVotes: bigint;
  };
}
const contentVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

const tabConfig = [
  {
    key: "content" as TabType,
    label: "Content",
  },
  {
    key: "votes" as TabType,
    label: "Votes",
  },
  {
    key: "ai-review" as TabType,
    label: "AI Review",
  },
];

export const Tabs = ({ data, isFetching }: TabsProps) => {
  const [activeTab, setActiveTab] = useState<TabType>("content");

  return (
    <div className="space-y-[20px]">
      {/* Tab Navigation */}
      <div className="border-b border-border/20">
        <div className="flex gap-[32px]">
          {tabConfig.map((tab) => (
            <button
              key={tab.key}
              className={cn(
                "pb-[12px] text-[26px] font-semibold transition-colors relative",
                activeTab === tab.key
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {activeTab === tab.key && (
                <motion.div
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary"
                  layoutId="activeTab"
                  transition={{ duration: DEFAULT_ANIMATION_DURATION }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial="initial"
          animate="animate"
          exit="exit"
          variants={contentVariants}
          transition={{ duration: DEFAULT_ANIMATION_DURATION }}
        >
          {activeTab === "content" && (
            <TabContent data={data} isFetching={isFetching} />
          )}

          {activeTab === "votes" && <Comments comments={data?.voters} />}

          {activeTab === "ai-review" && <AiReview />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
