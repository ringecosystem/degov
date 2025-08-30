import { useState, useEffect } from "react";

import { useDaoConfig } from "@/hooks/useDaoConfig";
import { getAiAnalysis } from "@/services/ai-agent";
import type { ProposalItem } from "@/services/graphql/types";
import type { AiAnalysisData } from "@/types/ai-analysis";

import { ActionsTable } from "./actions-table";
import { Description } from "./proposal/description";

export const TabContent = ({
  data,
  isFetching,
}: {
  data?: ProposalItem;
  isFetching: boolean;
}) => {
  const daoConfig = useDaoConfig();
  const [aiAnalysisData, setAiAnalysisData] = useState<AiAnalysisData | null>(
    null
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchAiAnalysis = async () => {
      if (
        !data?.proposalId ||
        !daoConfig?.aiAgent?.endpoint ||
        !daoConfig?.chain?.id
      ) {
        return;
      }

      setLoading(true);
      try {
        const result = await getAiAnalysis(
          daoConfig.aiAgent.endpoint,
          data.proposalId,
          daoConfig.chain.id
        );

        if (result.code === 0 && result.data) {
          setAiAnalysisData(result.data);
        }
      } catch (error) {
        console.error("Failed to fetch AI analysis:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAiAnalysis();
  }, [data?.proposalId, daoConfig?.aiAgent?.endpoint, daoConfig?.chain?.id]);

  return (
    <div className="flex flex-col gap-[20px]">
      {data?.discussion ||
      (daoConfig?.aiAgent?.endpoint && aiAnalysisData?.id) ? (
        <div className="flex flex-col gap-[20px] p-[10px] lg:p-[20px] rounded-[14px] bg-card shadow-card">
          <div className="flex flex-col gap-[12px]">
            <h3 className="text-[18px] font-semibold text-foreground border-b border-card-background pb-[20px]">
              Offchain discussion
            </h3>
            {data?.discussion && (
              <a
                href={data?.discussion}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[14px] lg:text-[16px] underline"
              >
                {data?.discussion}
              </a>
            )}
            {daoConfig?.aiAgent?.endpoint && !loading && aiAnalysisData?.id && (
              <a
                href={`https://x.com/${aiAnalysisData.twitter_user.username}/status/${aiAnalysisData.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[14px] lg:text-[16px] underline break-all"
              >
                https://x.com/{aiAnalysisData.twitter_user.username}/status/
                {aiAnalysisData.id}
              </a>
            )}
          </div>
        </div>
      ) : null}
      <Description data={data} isFetching={isFetching} />
      <ActionsTable data={data} isFetching={isFetching} />
    </div>
  );
};
