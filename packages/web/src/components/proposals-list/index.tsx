import Link from "next/link";

import { DEFAULT_PAGE_SIZE } from "@/config/base";
import type { ProposalItem } from "@/services/graphql/types";
import { extractTitleAndDescription } from "@/utils";
import { formatTimeAgo } from "@/utils/date";

import { ProposalStatus } from "../proposal-status";
import { useProposalData } from "../proposals-table/hooks/useProposalData";
import { Skeleton } from "../ui/skeleton";

import type { Address } from "viem";

const Caption = ({
  type,
  loadMoreData,
  isLoading,
}: {
  type: "active" | "all";
  data: ProposalItem[];
  loadMoreData: () => void;
  isLoading: boolean;
}) => {
  return type === "active" ? (
    <div className="flex justify-center items-center w-full border border-border/20  bg-card rounded-[14px] px-4 py-2">
      <Link
        href="/proposals"
        className="w-full text-center text-foreground transition-colors hover:text-foreground/80"
      >
        View all
      </Link>
    </div>
  ) : (
    <div className="flex justify-center items-center w-full border border-border/20  bg-card rounded-[14px] px-4 py-2">
      {
        <button
          onClick={loadMoreData}
          className="text-foreground transition-colors hover:text-foreground/80 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isLoading}
        >
          {isLoading ? "Loading..." : "View More"}
        </button>
      }
    </div>
  );
};

export function ProposalsList({
  type,
  address,
  support,
}: {
  type: "active" | "all";
  address?: Address;
  support?: "1" | "2" | "3";
}) {
  const { state, proposalStatusState, loadMoreData } = useProposalData(
    address,
    support,
    type === "active" ? 8 : DEFAULT_PAGE_SIZE
  );

  if (state.isPending) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-[14px] bg-card p-4">
            <Skeleton className="h-6 w-3/4 mb-2" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (state.data.length === 0) {
    return (
      <div className="rounded-[14px] bg-card p-[20px] text-center text-foreground/60">
        No proposals
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {state.data.map((record) => (
        <div
          key={record.id}
          className="rounded-[14px] bg-card p-4 border border-border/20"
        >
          <div className="space-y-3">
            <Link
              className="block text-base font-medium text-foreground hover:text-foreground/80 transition-colors line-clamp-2"
              title={extractTitleAndDescription(record.description)?.title}
              href={`/proposal/${record.proposalId}`}
            >
              {extractTitleAndDescription(record.description)?.title}
            </Link>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-[12px]">
                {record.blockTimestamp
                  ? formatTimeAgo(record.blockTimestamp)
                  : ""}
              </span>

              {proposalStatusState?.isFetching ? (
                <Skeleton className="h-[20px] w-[60px]" />
              ) : (
                <ProposalStatus
                  status={proposalStatusState?.data?.[record.id]}
                  className="text-[12px] py-1 px-3 rounded-full"
                />
              )}
            </div>
          </div>
        </div>
      ))}

      {state.hasNextPage && (
        <Caption
          type={type}
          data={state.data}
          loadMoreData={loadMoreData}
          isLoading={state.isFetchingNextPage}
        />
      )}
    </div>
  );
}
