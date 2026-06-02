import { AiSummary } from "./ai-summary";

export const AiReview = ({ id }: { id: string }) => {
  return (
    <div className="flex flex-col gap-[20px]">
      <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px] shadow-card">
        <AiSummary id={id} />
      </div>
    </div>
  );
};
