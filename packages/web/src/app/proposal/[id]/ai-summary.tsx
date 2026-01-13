"use client";

import { useQuery } from "@tanstack/react-query";
import { marked } from "marked";
import { useMemo } from "react";

import { useDaoConfig } from "@/hooks/useDaoConfig";
import { proposalService } from "@/services/graphql";

marked.use();

const AiSummaryLoading = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 p-4 bg-card rounded-lg border border-border">
        <div className="flex gap-1">
          <div className="w-2 h-2 bg-foreground rounded-full animate-bounce [animation-delay:-0.3s]"></div>
          <div className="w-2 h-2 bg-foreground rounded-full animate-bounce [animation-delay:-0.15s]"></div>
          <div className="w-2 h-2 bg-foreground rounded-full animate-bounce"></div>
        </div>
        <p className="text-sm text-foreground font-medium">
          AI is analyzing the proposal...
        </p>
      </div>
    </div>
  );
};

export const AiSummary = ({ id }: { id: string }) => {
  const daoConfig = useDaoConfig();
  const chainId = daoConfig?.chain?.id;
  const { data, isLoading, error } = useQuery({
    queryKey: [
      "proposal-ai-summary",
      id,
      daoConfig?.indexer?.endpoint,
      chainId,
    ],
    queryFn: () =>
      proposalService.getProposalSummary({
        proposalId: id,
        chainId: Number(chainId),
        indexer: daoConfig?.indexer?.endpoint ?? "",
      }),
    enabled: !!daoConfig?.indexer?.endpoint && !!chainId,
  });

  const sanitizedHtml = useMemo(() => {
    const html = marked.parse(data ?? "") as string;
    if (!html) return "";
    return html;
  }, [data]);

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
