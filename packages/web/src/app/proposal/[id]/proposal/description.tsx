import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMemo } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { ProposalItem } from "@/services/graphql/types";
import { extractTitleAndDescription, parseDescription } from "@/utils";

marked.use();
const Loading = () => {
  return (
    <div className="flex flex-col h-[200px] w-full  gap-4">
      <Skeleton className="h-[28px] w-full" />
      <Skeleton className="h-[28px] w-full" />
      <Skeleton className="h-[28px] w-full" />
      <Skeleton className="h-[28px] w-full" />
      <Skeleton className="h-[28px] w-full" />
    </div>
  );
};
export const Description = ({
  data,
  isFetching,
}: {
  data?: ProposalItem;
  isFetching: boolean;
}) => {
  const { description } = useMemo(() => {
    const titleAndDesc = extractTitleAndDescription(data?.description);
    const parsed = parseDescription(titleAndDesc?.description);
    return {
      description: parsed.mainText,
    };
  }, [data?.description]);
  const sanitizedHtml = useMemo(() => {
    const html = marked.parse(description ?? "") as string;
    if (!html) return "";
    return DOMPurify.sanitize(html);
  }, [description]);

  return isFetching ? (
    <Loading />
  ) : (
    <div className="flex flex-col gap-[20px] bg-card p-[20px] rounded-[14px]">
      <div className="flex flex-col gap-[12px]">
        <h3 className="text-[26px] font-semibold text-foreground">
          Description
        </h3>
        <div className="markdown-body">
          <div
            style={{
              whiteSpace: "wrap",
              wordWrap: "break-word",
            }}
            className="text-balance"
            dangerouslySetInnerHTML={{
              __html: sanitizedHtml,
            }}
          ></div>
        </div>
      </div>
    </div>
  );
};
