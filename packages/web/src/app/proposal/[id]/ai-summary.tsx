import { useQuery } from "@tanstack/react-query";
import { marked } from "marked";
import { useMemo } from "react";

import { useDaoConfig } from "@/hooks/useDaoConfig";
import { getProposalSummary } from "@/services/ai-agent";

marked.use();
export const AiSummary = ({ id }: { id: string }) => {
  const daoConfig = useDaoConfig();
  const { data, isLoading } = useQuery({
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

  return isLoading ? (
    <div>Loading...</div>
  ) : (
    <div
      dangerouslySetInnerHTML={{
        __html: sanitizedHtml,
      }}
      className="markdown-body"
    />
  );
};
