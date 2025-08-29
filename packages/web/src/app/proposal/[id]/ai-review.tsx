import { useDaoConfig } from "@/hooks/useDaoConfig";

import { AiSummary } from "./ai-summary";

export const AiReview = ({ id }: { id: string }) => {
  const daoConfig = useDaoConfig();

  // Only render AI review if aiAgent is configured
  if (!daoConfig?.aiAgent?.endpoint) {
    return null;
  }

  return (
    <div className="flex flex-col gap-[20px]">
      <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px] shadow-card">
        <AiSummary id={id} />
      </div>
      {/* 
      <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px]">
        <h3 className="text-[26px] font-semibold text-foreground">
          Vote suggestion
        </h3>
        <p className="text-[14px] font-normal">
          Voters are encouraged to consider supporting this proposal if they
          favor a deflationary model for RING, which aims to enhance its
          long-term scarcity and value. The adjustments to staking rewards offer
          a sustainable and predictable incentive structure funded by the
          existing Treasury. Approving this proposal would align with the
          strategic shift owards a more stable and economically sound ecosystem
          for RING.
        </p>
      </div> */}
    </div>
  );
};
