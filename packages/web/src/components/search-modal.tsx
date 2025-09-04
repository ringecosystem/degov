import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useDebounce } from "react-use";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DEFAULT_PAGE_SIZE } from "@/config/base";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import type { Types } from "@/services/graphql";
import { proposalService } from "@/services/graphql";
import { extractTitleAndDescription, parseDescription } from "@/utils";

// Helper function to strip HTML tags from text
const stripHtmlTags = (html: string): string => {
  return html
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/&nbsp;/g, " ") // Replace &nbsp; with space
    .replace(/&amp;/g, "&") // Replace &amp; with &
    .replace(/&lt;/g, "<") // Replace &lt; with <
    .replace(/&gt;/g, ">") // Replace &gt; with >
    .replace(/&quot;/g, '"') // Replace &quot; with "
    .replace(/&#39;/g, "'") // Replace &#39; with '
    .replace(/\s+/g, " ") // Replace multiple spaces with single space
    .trim(); // Remove leading/trailing whitespace
};

interface SearchModalProps {
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SearchModal({
  children,
  open = false,
  onOpenChange,
}: SearchModalProps) {
  const router = useRouter();
  const daoConfig = useDaoConfig();
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedValue] = React.useState("");

  useDebounce(
    () => {
      setDebouncedValue(search);
    },
    300,
    [search]
  );
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: [
        "proposals-search",
        debouncedSearch,
        daoConfig?.indexer?.endpoint,
      ],
      queryFn: async ({ pageParam = 0 }) =>
        proposalService.getProposalsByDescription(
          daoConfig?.indexer?.endpoint ?? "",
          {
            where: {
              description_containsInsensitive: debouncedSearch,
            },
            limit: DEFAULT_PAGE_SIZE,
            offset: pageParam,
            orderBy: "blockTimestamp_DESC_NULLS_LAST",
          }
        ),
      initialPageParam: 0,
      getNextPageParam: (lastPage, allPages, lastPageParam) => {
        if (!lastPage || lastPage.length < DEFAULT_PAGE_SIZE) {
          return undefined;
        }
        return lastPageParam + DEFAULT_PAGE_SIZE;
      },
      enabled: !!debouncedSearch && open && !!daoConfig?.indexer?.endpoint,
    });

  const flattenedData = React.useMemo(() => {
    return data?.pages.flat() || [];
  }, [data]);

  const renderSkeletons = () => {
    return Array(5)
      .fill(0)
      .map((_, i) => (
        <div key={i} className="py-[10px] border-b border-b-gray-1">
          <Skeleton className="h-[20px] w-full bg-card-background" />
        </div>
      ));
  };

  const loadMoreData = React.useCallback(() => {
    if (!isFetchingNextPage && hasNextPage) {
      fetchNextPage();
    }
  }, [isFetchingNextPage, hasNextPage, fetchNextPage]);

  React.useEffect(() => {
    if (!open) {
      setSearch("");
    }
  }, [open]);

  const handleSelect = React.useCallback(
    (item: Types.ProposalItem) => {
      router.push(`/proposal/${item.proposalId}`);
      onOpenChange?.(false);
    },
    [router, onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[800px] p-[20px] border-none shadow-lg flex flex-col gap-[20px] !rounded-[26px] bg-card backdrop-blur">
        <DialogHeader className="hidden">
          <DialogTitle>Search Proposals</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-[10px]">
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-[14px] border border-gray-1 h-[36px] rounded-[19px] px-[17px] py-[9px]"
          />
          <button
            onClick={() => onOpenChange?.(false)}
            className="rounded-full flex items-center justify-center focus:outline-none"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-foreground"
            >
              <path
                d="M6 18L18 6M6 6L18 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto max-h-[50vh]">
          {isLoading ? (
            renderSkeletons()
          ) : flattenedData && flattenedData.length > 0 ? (
            <div>
              {flattenedData.map((item, i) => {
                const titleAndDesc = extractTitleAndDescription(
                  item.description
                );
                const parsed = parseDescription(titleAndDesc?.description);
                const title = titleAndDesc?.title;
                const description = parsed.mainText;
                return (
                  <div
                    key={i}
                    onClick={() => {
                      handleSelect(item);
                    }}
                    className="flex items-start gap-[12px] py-[12px] border-b border-b-gray-1 last:border-b-0 hover:bg-card-background transition-colors cursor-pointer"
                  >
                    <div className="flex-shrink-0 mt-[2px]">
                      <svg
                        width="26"
                        height="20"
                        viewBox="0 0 26 20"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M24.4408 17.5367C24.4408 17.2774 24.1815 17.0181 23.9222 17.0181H14.1329L22.2366 8.91434C22.6256 8.52537 22.6256 7.81224 22.2366 7.42326L15.0405 0.291978C14.6515 -0.0970006 13.9384 -0.0970006 13.5494 0.291978L4.01945 9.82196C3.63047 10.2109 3.63047 10.9241 4.01945 11.313L9.72447 16.9532H1.55592C1.2966 16.9532 1.03728 17.2126 1.03728 17.4719L0 19.4816C0 19.7409 0.259319 20.0002 0.518639 20.0002H24.9595C25.2188 20.0002 25.4781 19.7409 25.4781 19.4816L24.4408 17.5367ZM10.7618 9.044L12.4473 10.8592L15.8833 7.35843L16.4019 7.9419L12.4473 11.9613L10.1783 9.62747L10.7618 9.044ZM7.06645 19.0926L7.58509 18.2498H17.893L18.4117 19.0926H7.06645Z"
                          fill="currentColor"
                          className="text-muted-foreground"
                        />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col gap-[4px]">
                      <div
                        className="font-medium text-[14px] line-clamp-1 text-foreground"
                        title={title}
                      >
                        {title}
                      </div>
                      {description && (
                        <div className="text-[12px] text-muted-foreground line-clamp-2 mt-[4px]">
                          {stripHtmlTags(description)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {hasNextPage && (
                <div className="flex justify-center items-center py-4">
                  <button
                    onClick={loadMoreData}
                    className="text-foreground transition-colors hover:text-foreground/80 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? "Loading..." : "Load more"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="py-6 text-center text-muted-foreground">
              {search ? "No results found." : "Start typing to search..."}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
