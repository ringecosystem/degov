import Link from "next/link";
import { useMemo } from "react";

import { AddressWithAvatar } from "@/components/address-with-avatar";
import ClipboardIconButton from "@/components/clipboard-icon-button";
import { OffchainDiscussionIcon, XIcon } from "@/components/icons";
import { ProposalStatus } from "@/components/proposal-status";
import { Skeleton } from "@/components/ui/skeleton";
import { useAiAnalysis } from "@/hooks/useAiAnalysis";
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
  data?: ProposalItem & { originalDescription: string; discussion?: string };
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
  const {
    data: aiAnalysisData,
    loading: aiAnalysisLoading,
  } = useAiAnalysis(data?.proposalId ?? null, {
    enabled: !!data?.proposalId,
    chainId: daoConfig?.chain?.id,
  });

  const proposalLink = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/proposal/${id}`;
  }, [id]);

  const explorerUrl = daoConfig?.chain?.explorers?.[0];
  const txHash = data?.transactionHash;
  const hasExplorerLink = !!explorerUrl && !!txHash;

  const proposalTitle = useMemo(() => {
    if (!data) return "";
    if (data.title) {
      return data.title;
    }

    const fallback = extractTitleAndDescription(
      data?.originalDescription ?? data?.description
    );
    return fallback.title;
  }, [data]);

  const hasDiscussionLinks =
    data?.discussion ||
    (daoConfig?.aiAgent?.endpoint && !aiAnalysisLoading && aiAnalysisData?.id);

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
          proposalTitle
        )}
        {proposalLink && (
          <ClipboardIconButton
            text={proposalLink}
            size={20}
            copyText="Copy link"
          />
        )}
      </h2>

      {isPending ? (
        <Skeleton className="h-[24px] w-[80%] my-1" />
      ) : (
        <div className="flex items-center gap-[10px] text-[12px] lg:text-[16px]">
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
            <div className="hidden lg:block">on</div>
            {hasExplorerLink ? (
              <Link
                href={`${explorerUrl}/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="hover:underline font-semibold"
              >
                {data?.blockTimestamp
                  ? formatTimeAgo(data?.blockTimestamp)
                  : ""}
              </Link>
            ) : (
              <span className="text-muted-foreground">
                {data?.blockTimestamp ? formatTimeAgo(data?.blockTimestamp) : ""}
              </span>
            )}
          </span>
          {hasDiscussionLinks && (
            <>
              <div className="w-px h-[10px] bg-muted-foreground" />
              {daoConfig?.aiAgent?.endpoint &&
                !aiAnalysisLoading &&
                aiAnalysisData?.id &&
                aiAnalysisData?.twitter_user?.username && (
                <a
                  href={`https://x.com/${aiAnalysisData.twitter_user?.username}/status/${aiAnalysisData.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-5 h-5 bg-light rounded-full flex justify-center items-center hover:opacity-80 transition-opacity"
                  title="X (Twitter)"
                >
                  <XIcon width={12} height={12} className="text-dark" />
                </a>
              )}
              {data?.discussion && (
                <a
                  href={data.discussion}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-5 h-5 bg-light rounded-full flex justify-center items-center hover:opacity-80 transition-opacity"
                  title="Discussion"
                >
                  <OffchainDiscussionIcon width={12} height={12} className="text-dark"/>
                </a>
              )}

            </>
          )}
        </div>
      )}
    </div>
  );
};
