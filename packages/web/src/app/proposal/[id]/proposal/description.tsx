import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMemo } from "react";

import { Skeleton } from "@/components/ui/skeleton";

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
  description,
  isFetching,
}: {
  description?: string;
  isFetching: boolean;
}) => {
  const sanitizedHtml = useMemo(() => {
    const html = marked.parse(description ?? "") as string;
    if (!html) return "";
    return DOMPurify.sanitize(html);
  }, [description]);

  return isFetching ? (
    <Loading />
  ) : (
    <div className="prose">
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
  );
};
