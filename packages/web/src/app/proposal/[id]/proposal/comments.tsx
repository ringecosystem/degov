import {
  useMemo,
  useState,
  useTransition,
  useDeferredValue,
  useCallback,
} from "react";

import { AddressWithAvatar } from "@/components/address-with-avatar";
import type { ColumnType } from "@/components/custom-table";
import { CustomTable } from "@/components/custom-table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { VoteType } from "@/config/vote";
import { useFormatGovernanceTokenAmount } from "@/hooks/useFormatGovernanceTokenAmount";
import { cn } from "@/lib/utils";
import type { ProposalVoterItem } from "@/services/graphql/types";
import { formatTimeAgo } from "@/utils/date";

import { CommentModal } from "./comment-modal";

interface CommentsProps {
  comments?: ProposalVoterItem[];
  id: string;
  totalVotingPower?: bigint;
}

const PAGE_SIZE = 20;
export const Comments = ({ comments, id }: CommentsProps) => {
  const formatTokenAmount = useFormatGovernanceTokenAmount();
  const [currentCommentRow, setCurrentCommentRow] = useState<
    ProposalVoterItem | undefined
  >(undefined);

  const [voteFilters, setVoteFilters] = useState({
    [VoteType.For]: true,
    [VoteType.Against]: true,
    [VoteType.Abstain]: true,
  });

  const [isPending, startTransition] = useTransition();

  const deferredComments = useDeferredValue(comments);

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filteredComments = useMemo(() => {
    if (!deferredComments?.length) return [];
    const filtered = deferredComments.filter(
      (comment) => voteFilters[comment.support]
    );
    return filtered;
  }, [deferredComments, voteFilters]);

  const visibleComments = useMemo(() => {
    if (filteredComments.length <= PAGE_SIZE) {
      return filteredComments;
    }
    return filteredComments.slice(0, visibleCount);
  }, [filteredComments, visibleCount]);

  const loadMoreComments = useCallback(() => {
    if (visibleCount < filteredComments.length) {
      startTransition(() => {
        setVisibleCount((prev) =>
          Math.min(prev + PAGE_SIZE, filteredComments.length)
        );
      });
    }
  }, [visibleCount, filteredComments.length, startTransition]);

  const resetVisibleCount = useCallback(() => {
    setVisibleCount(PAGE_SIZE);
  }, []);

  const totalVotingPower = useMemo(() => {
    if (!comments?.length) return 0n;

    return comments.reduce((total, voter) => {
      const voterWeight = voter.weight ? BigInt(voter.weight) : 0n;
      return total + voterWeight;
    }, 0n);
  }, [comments]);

  const getVoteDisplay = (
    support: VoteType,
    reason?: string,
    onComment?: (reason: string) => void
  ) => {
    const voteConfig = {
      [VoteType.For]: {
        icon: "✓",
        label: "For",
        bgColor: "bg-success",
        textColor: "text-foreground",
      },
      [VoteType.Against]: {
        icon: "✕",
        label: "Against",
        bgColor: "bg-danger",
        textColor: "text-foreground",
      },
      [VoteType.Abstain]: {
        icon: "—",
        label: "Abstain",
        bgColor: "bg-muted-foreground",
        textColor: "text-foreground",
      },
    };

    const config = voteConfig?.[support];

    return (
      <div className="flex flex-col items-start gap-[6px]">
        <div className={`flex items-center gap-[10px]`}>
          <span
            className={cn(
              `w-[16px] h-[16px] text-[10px] flex items-center justify-center rounded-full flex-shrink-0 text-background`,
              config?.bgColor
            )}
          >
            {config?.icon}
          </span>
          <span className={cn(config?.textColor)}>{config?.label}</span>
        </div>
        {reason && (
          <Tooltip>
            <TooltipTrigger>
              <div
                className="text-[12px] text-muted-foreground max-w-[180px] truncate leading-tight cursor-pointer"
                onClick={() => onComment?.(reason)}
              >
                {reason}
              </div>
            </TooltipTrigger>
            <TooltipContent>Click to view comment</TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  };

  const toggleVoteFilter = useCallback(
    (voteType: VoteType) => {
      startTransition(() => {
        setVoteFilters((prev) => ({
          ...prev,
          [voteType]: !prev[voteType],
        }));
        resetVisibleCount();
      });
    },
    [startTransition, resetVisibleCount]
  );

  const columns = useMemo<ColumnType<ProposalVoterItem>[]>(() => {
    return [
      {
        title: "Voter",
        key: "voter",
        width: "26.5%",
        className: "text-left",
        render: (record) => (
          <AddressWithAvatar
            address={record.voter}
            avatarSize={30}
            className="gap-[5px]"
            textClassName="text-[14px] font-normal"
          />
        ),
      },
      {
        title: (
          <div className="flex items-center gap-[4px]">
            <span>Choice</span>
            <span
              onClick={() => toggleVoteFilter(VoteType.For)}
              className={cn(
                `w-[14px] h-[14px] text-[10px] flex items-center justify-center rounded-full flex-shrink-0 text-background cursor-pointer transition-all duration-200 hover:scale-110`,
                voteFilters[VoteType.For]
                  ? "bg-foreground"
                  : "bg-muted-foreground opacity-50"
              )}
            >
              ✓
            </span>
            <span
              onClick={() => toggleVoteFilter(VoteType.Against)}
              className={cn(
                `w-[14px] h-[14px] text-[10px] flex items-center justify-center rounded-full flex-shrink-0 text-background cursor-pointer transition-all duration-200 hover:scale-110`,
                voteFilters[VoteType.Against]
                  ? "bg-foreground"
                  : "bg-muted-foreground opacity-50"
              )}
            >
              ✕
            </span>
            <span
              onClick={() => toggleVoteFilter(VoteType.Abstain)}
              className={cn(
                `w-[14px] h-[14px] text-[10px] flex items-center justify-center rounded-full flex-shrink-0 text-background cursor-pointer transition-all duration-200 hover:scale-110`,
                voteFilters[VoteType.Abstain]
                  ? "bg-foreground"
                  : "bg-muted-foreground opacity-50"
              )}
            >
              —
            </span>
          </div>
        ),
        key: "choice",
        width: "29%",
        className: "text-left",
        render: (record) =>
          record
            ? getVoteDisplay(record.support, record.reason, () =>
                setCurrentCommentRow(record)
              )
            : null,
      },
      {
        title: "Date",
        key: "date",
        width: "22.25%",
        className: "text-center",
        render: (record) => <span>{formatTimeAgo(record.blockTimestamp)}</span>,
      },
      {
        title: "Voting Power",
        key: "votingPower",
        width: "22.25%",
        className: "text-right",
        render: (record) => {
          const voterWeight = record.weight ? BigInt(record.weight) : 0n;
          const formattedAmount = formatTokenAmount(voterWeight);

          let percentage = "0%";
          if (totalVotingPower && totalVotingPower > 0n && voterWeight > 0n) {
            const percentageValue =
              Number((voterWeight * 10000n) / totalVotingPower) / 100;
            percentage = `${percentageValue.toFixed(2)}%`;
          }

          return (
            <div className="text-right">
              <div className="text-[14px] text-foreground flex items-center justify-end gap-[5px]">
                <span>{formattedAmount?.formatted}</span>
                <span>({percentage})</span>
              </div>
            </div>
          );
        },
      },
    ];
  }, [formatTokenAmount, totalVotingPower, voteFilters, toggleVoteFilter]);

  const hasMoreItems = visibleCount < filteredComments.length;

  return (
    <div className="rounded-[14px] bg-card p-[20px] flex flex-col h-full min-h-0 shadow-card">
      <div className="overflow-x-auto lg:overflow-x-visible">
        <div className="min-w-[800px] lg:min-w-0">
          <CustomTable
            dataSource={visibleComments}
            columns={columns}
            isLoading={false}
            emptyText="No votes yet"
            rowKey="id"
            maxHeight="100%"
            tableClassName="table-fixed"
            bodyClassName={cn(
              "flex-1 min-h-0",
              !filteredComments?.length ? "hidden" : ""
            )}
            caption={
              hasMoreItems ? (
                <div className="flex justify-center py-4">
                  <button
                    onClick={loadMoreComments}
                    disabled={isPending}
                    className="text-foreground transition-colors hover:text-foreground/80"
                  >
                    {isPending
                      ? "Loading..."
                      : `Load More (${filteredComments.length - visibleCount})`}
                  </button>
                </div>
              ) : filteredComments.length > PAGE_SIZE ? (
                <div className="text-muted-foreground text-xs">
                  Showing all {filteredComments.length} votes
                </div>
              ) : null
            }
          />
        </div>
      </div>
      <CommentModal
        open={!!currentCommentRow?.reason}
        onOpenChange={() => setCurrentCommentRow(undefined)}
        commentData={currentCommentRow}
        id={id}
      />
    </div>
  );
};
