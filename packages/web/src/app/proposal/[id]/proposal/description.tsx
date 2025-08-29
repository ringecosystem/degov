import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMemo, useRef, useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import type { ProposalItem } from "@/services/graphql/types";
import { extractTitleAndDescription, parseDescription } from "@/utils";

marked.use();

const MAX_COLLAPSED_HEIGHT = 644;

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
  const [isExpanded, setIsExpanded] = useState(false);
  const [showToggle, setShowToggle] = useState(false);
  const markdownRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const checkHeight = () => {
      if (markdownRef.current) {
        const height = markdownRef.current.scrollHeight;
        setShowToggle(height > MAX_COLLAPSED_HEIGHT);
      }
    };

    if (sanitizedHtml) {
      requestAnimationFrame(checkHeight);
    }
  }, [sanitizedHtml]);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  return isFetching ? (
    <Loading />
  ) : (
    <div className="flex flex-col gap-[20px] bg-card p-[10px] lg:p-[20px] rounded-[14px] shadow-card">
      <div className="flex flex-col gap-[12px]">
        <div
          ref={markdownRef}
          className="markdown-body"
          style={{
            maxHeight:
              showToggle && !isExpanded ? `${MAX_COLLAPSED_HEIGHT}px` : "none",
            overflow: "hidden",
          }}
        >
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
        {showToggle && (
          <div
            className="flex flex-col border-t border-card-background pt-[20px] text-center cursor-pointer hover:opacity-80 transition-opacity duration-300"
            onClick={toggleExpanded}
          >
            <span>{isExpanded ? "Show less" : "Show more"}</span>
          </div>
        )}
      </div>
    </div>
  );
};
