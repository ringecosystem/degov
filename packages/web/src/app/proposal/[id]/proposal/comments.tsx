import { useMemo } from "react";

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

interface CommentsProps {
  comments?: ProposalVoterItem[];
  totalVotingPower?: bigint;
}

export const Comments = ({ comments }: CommentsProps) => {
  const formatTokenAmount = useFormatGovernanceTokenAmount();

  const totalVotingPower = useMemo(() => {
    if (!comments?.length) return 0n;

    return comments.reduce((total, voter) => {
      const voterWeight = voter.weight ? BigInt(voter.weight) : 0n;
      return total + voterWeight;
    }, 0n);
  }, [comments]);

  const getVoteDisplay = (support: VoteType, reason?: string) => {
    const voteConfig = {
      [VoteType.For]: {
        icon: "✓",
        label: "For",
        bgColor: "bg-success",
        textColor: "text-white",
      },
      [VoteType.Against]: {
        icon: "✕",
        label: "Against",
        bgColor: "bg-danger",
        textColor: "text-white",
      },
      [VoteType.Abstain]: {
        icon: "—",
        label: "Abstain",
        bgColor: "bg-muted-foreground",
        textColor: "text-white",
      },
    };

    const config = voteConfig[support];

    return (
      <div className="flex flex-col items-start gap-[6px]">
        <div className={`flex items-center gap-[10px]`}>
          <span
            className={cn(
              `w-[16px] h-[16px] text-[10px] flex items-center justify-center rounded-full flex-shrink-0 text-background`,
              config.bgColor
            )}
          >
            {config.icon}
          </span>
          <span className={cn(config.textColor)}>{config.label}</span>
        </div>
        {reason && (
          <Tooltip>
            <TooltipTrigger>
              <div className="text-[12px] text-muted-foreground max-w-[180px] truncate leading-tight">
                {reason}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{reason}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  };

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
              className={cn(
                `w-[14px] h-[14px] text-[10px] flex items-center justify-center rounded-full flex-shrink-0 text-background bg-foreground`
              )}
            >
              ✓
            </span>
            <span
              className={cn(
                `w-[14px] h-[14px] text-[10px] flex items-center justify-center rounded-full flex-shrink-0 text-background bg-foreground`
              )}
            >
              ✕
            </span>
            <span
              className={cn(
                `w-[14px] h-[14px] text-[10px] flex items-center justify-center rounded-full flex-shrink-0 text-background bg-muted-foreground`
              )}
            >
              —
            </span>
          </div>
        ),
        key: "choice",
        width: "29%",
        className: "text-left",
        render: (record) => getVoteDisplay(record.support, record.reason),
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

          // Calculate percentage based on total voting power
          let percentage = "0%";
          if (totalVotingPower && totalVotingPower > 0n && voterWeight > 0n) {
            const percentageValue =
              Number((voterWeight * 10000n) / totalVotingPower) / 100;
            percentage = `${percentageValue.toFixed(2)}%`;
          }

          return (
            <div className="text-right">
              <div className="text-[14px] font-semibold text-foreground">
                {formattedAmount?.formatted} ({percentage})
              </div>
            </div>
          );
        },
      },
    ];
  }, [formatTokenAmount, totalVotingPower]);

  return (
    <div className="rounded-[14px] bg-card p-[20px]">
      <CustomTable
        dataSource={comments ?? []}
        columns={columns}
        isLoading={false}
        emptyText="No votes yet"
        rowKey="id"
        maxHeight="500px"
        tableClassName="table-fixed"
      />
    </div>
  );
};
