import Link from "next/link";
import { useMemo } from "react";
import { useAccount } from "wagmi";

import { DEFAULT_PAGE_SIZE } from "@/config/base";
import type { ProposalItem } from "@/services/graphql/types";
import { extractTitleAndDescription } from "@/utils";
import { formatTimeAgo } from "@/utils/date";
import { VoteType } from "@/config/vote";

import { CustomTable } from "../custom-table";
import { ProposalStatus } from "../proposal-status";
import { Skeleton } from "../ui/skeleton";

import { useProposalData } from "./hooks/useProposalData";
import { VotePercentage } from "./vote-percentage";
import { VoteTotal } from "./vote-total";

import type { ColumnType } from "../custom-table";
import type { Address } from "viem";
import { VoteStatistics } from "../vote-statistics";

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
  const { address: connectedAddress } = useAccount();
  const { state, proposalStatusState, loadMoreData } = useProposalData(
    address,
    support,
    type === "active" ? 8 : DEFAULT_PAGE_SIZE
  );

  const getUserVoteStatus = (record: ProposalItem) => {
    if (!connectedAddress) return null;

    const userVote = record.voters?.find(
      (voter) => voter.voter.toLowerCase() === connectedAddress.toLowerCase()
    );

    if (!userVote) return null;

    switch (userVote.support) {
      case VoteType.For: // 1
        return {
          color: "bg-success",
          textColor: "text-success",
          label: "For",
        };
      case VoteType.Against: // 0
        return {
          color: "bg-danger",
          textColor: "text-danger",
          label: "Against",
        };
      case VoteType.Abstain: // 2
        return {
          color: "bg-muted-foreground",
          textColor: "text-muted-foreground",
          label: "Abstain",
        };
      default:
        return null;
    }
  };

  const columns = useMemo<ColumnType<ProposalItem>[]>(
    () => [
      {
        title: "Proposal",
        key: "description",
        width: "70%",
        className: "text-left",
        render: (record) => (
          <div className="space-y-2">
            <Link
              className="hover:underline text-base font-medium block"
              title={extractTitleAndDescription(record.description)?.title}
              href={`/proposal/${record.proposalId}`}
            >
              {extractTitleAndDescription(record.description)?.title}
            </Link>

            <div className="flex items-center gap-3 text-sm">
              {proposalStatusState?.isFetching ? (
                <Skeleton className="h-[20px] w-[60px]" />
              ) : (
                <ProposalStatus
                  status={proposalStatusState?.data?.[record.id]}
                  className="text-[12px] py-0 px-0 bg-transparent"
                />
              )}

              <span className="text-muted-foreground text-[12px]">
                {record.blockTimestamp
                  ? formatTimeAgo(record.blockTimestamp)
                  : ""}
              </span>

              {(() => {
                const userVoteStatus = getUserVoteStatus(record);

                if (userVoteStatus) {
                  return (
                    <div className="flex items-center gap-[5px]">
                      <div
                        className={`w-[10px] h-[10px] rounded-full ${userVoteStatus.color}`}
                      ></div>
                      <span
                        className={`${userVoteStatus.textColor} text-[12px]`}
                      >
                        {userVoteStatus.label}
                      </span>
                    </div>
                  );
                }

                return null;
              })()}
            </div>
          </div>
        ),
      },
      {
        title: "Votes",
        key: "votes",
        width: "30%",
        render: (record) => {
          return (
            <VoteStatistics
              forVotes={
                record.metricsVotesWeightForSum
                  ? BigInt(record.metricsVotesWeightForSum)
                  : 0n
              }
              againstVotes={
                record.metricsVotesWeightAgainstSum
                  ? BigInt(record.metricsVotesWeightAgainstSum)
                  : 0n
              }
              abstainVotes={
                record.metricsVotesWeightAbstainSum
                  ? BigInt(record.metricsVotesWeightAbstainSum)
                  : 0n
              }
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
