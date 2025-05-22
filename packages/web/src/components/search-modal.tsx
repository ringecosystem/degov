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
import { extractTitleAndDescription } from "@/utils";

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
              className="text-muted-foreground"
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
              {flattenedData.map((item, i) => (
                <div
                  key={i}
                  onClick={() => {
                    handleSelect(item);
                  }}
                  className="flex text-[14px] py-[10px] border-b border-b-gray-1 last:border-b-0 hover:bg-card-background transition-colors cursor-pointer"
                >
                  <div
                    className="flex-1 line-clamp-1"
                    title={extractTitleAndDescription(item.description)?.title}
                  >
                    {extractTitleAndDescription(item.description)?.title}
                  </div>
                </div>
              ))}

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
