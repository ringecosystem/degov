import Link from "next/link";
import { useCallback, useMemo } from "react";

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
  currentPage: number;
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
  const { state, proposalVotesState, proposalStatusState, loadMoreData } =
    useProposalData(address, support);

  const totalVotes = useCallback(
    (proposalId: string) => {
      return (
        (proposalVotesState?.data?.[proposalId]?.againstVotes ?? 0n) +
        (proposalVotesState?.data?.[proposalId]?.forVotes ?? 0n) +
        (proposalVotesState?.data?.[proposalId]?.abstainVotes ?? 0n)
      );
    },
    [proposalVotesState]
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
          return proposalVotesState?.isFetching ? (
            <Skeleton className="h-[30px] w-full" />
          ) : (
            <VotePercentage
              status="for"
              value={proposalVotesState?.data?.[record.id]?.forVotes}
              total={totalVotes(record.id)}
            />
          );
        },
      },
      {
        title: "Votes against",
        key: "votesAgainst",
        width: "200px",
        render: (record) => {
          return proposalVotesState?.isFetching ? (
            <Skeleton className="h-[30px] w-full" />
          ) : (
            <VotePercentage
              status="against"
              value={proposalVotesState?.data?.[record.id]?.againstVotes}
              total={totalVotes(record.id)}
            />
          );
        },
      },
      {
        title: "Total votes",
        key: "totalVotes",
        width: "200px",
        render: (record) => {
          return proposalVotesState?.isFetching ? (
            <Skeleton className="h-[30px] w-full" />
          ) : (
            <VoteTotal
              totalVotes={totalVotes(record.id)}
              totalAddresses={record.voters?.length ?? 0}
            />
          );
        },
      },
    ],
    [proposalVotesState, proposalStatusState, totalVotes]
  );

  return (
    <div className="rounded-[14px] bg-card p-[20px]">
      <CustomTable
        dataSource={state.data}
        columns={columns as ColumnType<ProposalItem>[]}
        isLoading={state.isFetching}
        emptyText="No proposals"
        rowKey="id"
        caption={
          <Caption
            type={type}
            data={state.data}
            currentPage={state.currentPage}
            loadMoreData={loadMoreData}
            isLoading={state.isFetching}
          />
        }
      />
    </div>
  );
}
