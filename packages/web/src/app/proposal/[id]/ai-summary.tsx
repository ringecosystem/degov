import { useQuery } from "@tanstack/react-query";
import { marked } from "marked";
import { useMemo } from "react";

import { useDaoConfig } from "@/hooks/useDaoConfig";
import { getProposalSummary } from "@/services/ai-agent";
import { Skeleton } from "@/components/ui/skeleton";

marked.use();

const AiSummaryLoading = () => {
  return (
    <div className="space-y-6">
      {/* AI Thinking Animation */}
      <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg border">
        <div className="flex gap-1">
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
          <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
        </div>
        <p className="text-sm text-muted-foreground font-medium">
          AI is analyzing the proposal...
        </p>
      </div>
    </div>
  );
};

export const AiSummary = ({ id }: { id: string }) => {
  const daoConfig = useDaoConfig();
  const { data, isLoading, error } = useQuery({
    queryKey: ["proposal-ai-summary", id, daoConfig?.indexer?.endpoint],
    queryFn: () =>
      getProposalSummary({
        chain: 46,
        indexer: daoConfig?.indexer?.endpoint ?? "",
        id: id as string,
      }),
  });

  const sanitizedHtml = useMemo(() => {
    const html = marked.parse(data?.data ?? "") as string;
    if (!html) return "";
    return html;
  }, [data?.data]);

  if (isLoading) {
    return <AiSummaryLoading />;
  }

  if (error) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>Failed to load AI summary. Please try again later.</p>
      </div>
    );
  }

  return (
    <div
      dangerouslySetInnerHTML={{
        __html: sanitizedHtml,
      }}
      className="markdown-body"
    />
  );
};
