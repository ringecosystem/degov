import Link from "next/link";

import { AddressWithAvatar } from "@/components/address-with-avatar";
import ClipboardIconButton from "@/components/clipboard-icon-button";
import { ProposalStatus } from "@/components/proposal-status";
import { Skeleton } from "@/components/ui/skeleton";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import type {
  ProposalItem,
  ProposalQueuedByIdItem,
} from "@/services/graphql/types";
import type { ProposalState } from "@/types/proposal";
import { extractTitleAndDescription } from "@/utils";
import { formatTimeAgo } from "@/utils/date";

import ActionGroup from "./action-group";

interface SummaryProps {
  data?: ProposalItem & { originalDescription: string };
  isPending: boolean;
  proposalStatus?: { data: ProposalState };
  proposalQueuedById?: ProposalQueuedByIdItem;
  isAllQueriesFetching: boolean;
  onRefetch: () => void;
  id: string | string[];
}

export const Summary = ({
  data,
  isPending,
  proposalStatus,
  proposalQueuedById,
  isAllQueriesFetching,
  onRefetch,
  id,
}: SummaryProps) => {
  const daoConfig = useDaoConfig();

  return (
    <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[10px] lg:p-[20px] shadow-card">
      <div className="flex items-center justify-between gap-[20px]">
        {isPending ? (
          <Skeleton className="h-[37px] w-[100px]" />
        ) : (
          <ProposalStatus status={proposalStatus?.data as ProposalState} />
        )}

        <ActionGroup
          data={data}
          status={proposalStatus?.data as ProposalState}
          proposalQueuedById={proposalQueuedById}
          isAllQueriesFetching={isAllQueriesFetching}
          onRefetch={onRefetch}
        />
      </div>

      <h2 className="text-[16px] lg:text-[26px] font-semibold flex items-center gap-[10px]">
        {isPending ? (
          <Skeleton className="h-[36px] w-[200px]" />
        ) : (
          extractTitleAndDescription(data?.description)?.title
        )}
        <ClipboardIconButton
          text={`${window.location.origin}/proposal/${id}`}
          size={20}
          copyText="Copy link"
        />
      </h2>

      {isPending ? (
        <Skeleton className="h-[24px] w-[80%] my-1" />
      ) : (
        <div className="flex items-center gap-[20px] lg:gap-[5px]  text-[12px] lg:text-[16px]">
          <div className="flex items-center gap-[5px]">
            <span className="hidden lg:block">Proposed by</span>
            {!!data?.proposer && (
              <AddressWithAvatar
                address={data?.proposer as `0x${string}`}
                avatarSize={24}
                className="gap-[5px] font-semibold"
              />
            )}
          </div>
          <span className="text-foreground flex items-center gap-[5px]">
            <div className="hidden lg:block">On</div>
            <Link
              href={`${daoConfig?.chain?.explorers?.[0]}/tx/${data?.transactionHash}`}
              target="_blank"
              rel="noreferrer"
              className="hover:underline font-semibold"
            >
              {data?.blockTimestamp ? formatTimeAgo(data?.blockTimestamp) : ""}
            </Link>
          </span>
        </div>
      )}
    </div>
  );
};
