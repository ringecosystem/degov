import { motion, AnimatePresence } from "framer-motion";
import { useState, useMemo } from "react";

import { DEFAULT_ANIMATION_DURATION } from "@/config/base";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { cn } from "@/lib/utils";
import type { ProposalItem } from "@/services/graphql/types";

import { AiReview } from "./ai-review";
import { Comments } from "./proposal/comments";
import { TabContent } from "./tab-content";

type TabType = "content" | "votes" | "ai-review";

interface TabsProps {
  data?: ProposalItem;
  isFetching: boolean;
}
const contentVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

export const Tabs = ({ data, isFetching }: TabsProps) => {
  const [activeTab, setActiveTab] = useState<TabType>("content");
  const daoConfig = useDaoConfig();

  const tabConfig = useMemo(() => {
    const baseTabs = [
      {
        key: "content" as TabType,
        label: "Content",
      },
      {
        key: "votes" as TabType,
        label: "Votes",
      },
    ];

    // Only show AI Review tab if aiAgent is configured
    if (daoConfig?.aiAgent?.endpoint) {
      baseTabs.push({
        key: "ai-review" as TabType,
        label: "AI Review",
      });
    }

    return baseTabs;
  }, [daoConfig?.aiAgent?.endpoint]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tab Navigation */}
      <div className="border-b border-border/20 mb-[20px]">
        <div className="flex gap-[32px]">
          {tabConfig.map((tab) => (
            <button
              key={tab.key}
              className={cn(
                "pb-[12px] text-[18px] font-semibold transition-colors relative",
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
          className={cn(
            "flex-1 min-h-0",
            activeTab === "votes" && "flex flex-col"
          )}
        >
          {activeTab === "content" && (
            <TabContent data={data} isFetching={isFetching} />
          )}

          {activeTab === "votes" && (
            <div className="flex-1 min-h-0">
              <Comments
                comments={data?.voters}
                id={data?.proposalId as string}
              />
            </div>
          )}

          {activeTab === "ai-review" && (
            <AiReview id={data?.proposalId as string} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
