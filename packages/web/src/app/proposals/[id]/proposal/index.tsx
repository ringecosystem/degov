import { useEffect, useMemo, useState } from "react";

import type { ProposalItem } from "@/services/graphql/types";
import { extractTitleAndDescription } from "@/utils";

import { Comments } from "./comments";
import { Description } from "./description";

export const Proposal = ({
  isFetching,
  data,
}: {
  isFetching: boolean;
  data?: ProposalItem;
}) => {
  const [activeTab, setActiveTab] = useState<"description" | "comments">(
    "description"
  );

  const description = useMemo(() => {
    return extractTitleAndDescription(data?.description)?.description;
  }, [data?.description]);

  const comments = useMemo(() => {
    return data?.voters?.filter((voter) => voter.reason) ?? [];
  }, [data?.voters]);

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
          {comments?.length > 0 && (
            <div className="flex gap-[32px]">
              <button
                className={`pb-[12px] text-[16px] font-medium ${
                  activeTab === "description"
                    ? "border-b-2 border-primary text-primary"
                    : "text-text-secondary hover:text-text-primary"
                }`}
                onClick={() => setActiveTab("description")}
              >
                Description
              </button>
              <button
                className={`pb-[12px] text-[16px] font-medium ${
                  activeTab === "comments"
                    ? "border-b-2 border-primary text-primary"
                    : "text-text-secondary hover:text-text-primary"
                }`}
                onClick={() => setActiveTab("comments")}
              >
                Comments
              </button>
            </div>
          )}
        </div>
        <div className="min-h-[200px]">
          {activeTab === "description" && (
            <Description description={description} isFetching={isFetching} />
          )}
          {activeTab === "comments" && comments?.length && (
            <Comments comments={comments} />
          )}
        </div>
      </div>
    </div>
  );
};
