import Link from "next/link";
import { useMemo } from "react";

import { DEFAULT_PAGE_SIZE } from "@/config/base";
import type { ProposalItem } from "@/services/graphql/types";
import { extractTitleAndDescription } from "@/utils";
import { formatTimestampToFriendlyDate } from "@/utils/date";

import { CustomTable } from "../custom-table";
import { ProposalStatus } from "../proposal-status";
import { Skeleton } from "../ui/skeleton";

import { useProposalData } from "./hooks/useProposalData";
import { VotePercentage } from "./vote-percentage";
import { VoteTotal } from "./vote-total";

import type { ColumnType } from "../custom-table";
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
    <div className="flex justify-center items-center">
      <Link
        href="/proposals"
        className="text-foreground transition-colors hover:text-foreground/80"
      >
        View all
      </Link>
    </div>
  ) : (
    <div className="flex justify-center items-center">
      {
        <button
          onClick={loadMoreData}
          className="text-foreground transition-colors hover:text-foreground/80 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isLoading}
        >
          {isLoading ? "Loading..." : "View more"}
        </button>
      }
    </div>
  );
};

export function ProposalsTable({
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

  const columns = useMemo<ColumnType<ProposalItem>[]>(
    () => [
      {
        title: "Proposal",
        key: "description",
        width: "400px",
        className: "text-left",
        render: (record) => (
          <Link
            className="line-clamp-1 hover:underline"
            title={extractTitleAndDescription(record.description)?.title}
            href={`/proposals/${record.proposalId}`}
          >
            {extractTitleAndDescription(record.description)?.title}
          </Link>
        ),
      },
      {
        title: "Time",
        key: "blockTimestamp",
        width: "200px",
        render: (record) =>
          formatTimestampToFriendlyDate(record.blockTimestamp),
      },
      {
        title: "Status",
        key: "status",
        width: "200px",
        render: (record) => {
          return proposalStatusState?.isFetching ? (
            <Skeleton className="h-[30px] w-full" />
          ) : (
            <ProposalStatus status={proposalStatusState?.data?.[record.id]} />
          );
        },
      },
      {
        title: "Votes for",
        key: "votesFor",
        width: "200px",
        render: (record) => {
          return (
            <VotePercentage
              status="for"
              value={
                record.metricsVotesWeightForSum
                  ? BigInt(record.metricsVotesWeightForSum)
                  : 0n
              }
              total={
                record.metricsVotesWeightAgainstSum
                  ? BigInt(record.metricsVotesWeightAgainstSum)
                  : 0n
              }
            />
          );
        },
      },
      {
        title: "Votes against",
        key: "votesAgainst",
        width: "200px",
        render: (record) => {
          return (
            <VotePercentage
              status="against"
              value={
                record.metricsVotesWeightAgainstSum
                  ? BigInt(record.metricsVotesWeightAgainstSum)
                  : 0n
              }
              total={
                record.metricsVotesWeightForSum
                  ? BigInt(record.metricsVotesWeightForSum)
                  : 0n
              }
            />
          );
        },
      },
      {
        title: "Total votes",
        key: "totalVotes",
        width: "200px",
        render: (record) => {
          const metricsVotesWeightForSum = record?.metricsVotesWeightForSum
            ? BigInt(record.metricsVotesWeightForSum)
            : 0n;
          const metricsVotesWeightAgainstSum =
            record?.metricsVotesWeightAgainstSum
              ? BigInt(record.metricsVotesWeightAgainstSum)
              : 0n;
          const metricsVotesWeightAbstainSum =
            record?.metricsVotesWeightAbstainSum
              ? BigInt(record.metricsVotesWeightAbstainSum)
              : 0n;
          return (
            <VoteTotal
              totalVotes={
                metricsVotesWeightForSum +
                metricsVotesWeightAgainstSum +
                metricsVotesWeightAbstainSum
              }
              totalAddresses={record.voters?.length ?? 0}
            />
          );
        },
      },
    ],
    [proposalStatusState]
  );

  return (
    <div className="rounded-[14px] bg-card p-[20px]">
      <CustomTable
        dataSource={state.data}
        columns={columns as ColumnType<ProposalItem>[]}
        isLoading={state.isPending}
        emptyText="No proposals"
        rowKey="id"
        caption={
          state.hasNextPage && (
            <Caption
              type={type}
              data={state.data}
              loadMoreData={loadMoreData}
              isLoading={state.isFetchingNextPage}
            />
          )
        }
      />
    </div>
  );
}
