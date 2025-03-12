"use client";
import { useCallback, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { useAccount, useReadContract } from "wagmi";

import { TransactionToast } from "@/components/transaction-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { abi as GovernorAbi } from "@/config/abi/governor";
import useCancelProposal from "@/hooks/useCancelProposal";
import useCastVote from "@/hooks/useCastVote";
import { useContractGuard } from "@/hooks/useContractGuard";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import useExecuteProposal from "@/hooks/useExecute";
import { useGovernanceParams } from "@/hooks/useGovernanceParams";
import useQueueProposal from "@/hooks/useQueue";
import type {
  ProposalCanceledByIdItem,
  ProposalExecutedByIdItem,
  ProposalItem,
  ProposalQueuedByIdItem,
} from "@/services/graphql/types";
import { ProposalState } from "@/types/proposal";

import { ActionGroupDisplay } from "./action-group-display";
import { CancelProposal } from "./cancel-proposal";
import { Dropdown } from "./dropdown";
import { Voting } from "./voting";

interface ActionGroupProps {
  data?: ProposalItem & { originalDescription: string };
  status?: ProposalState;
  proposalCanceledById?: ProposalCanceledByIdItem;
  proposalExecutedById?: ProposalExecutedByIdItem;
  proposalQueuedById?: ProposalQueuedByIdItem;
  isAllQueriesFetching: boolean;
  onRefetch: () => void;
}

export default function ActionGroup({
  data,
  status,
  proposalCanceledById,
  proposalExecutedById,
  proposalQueuedById,
  isAllQueriesFetching,
  onRefetch,
}: ActionGroupProps) {
  const id = data?.proposalId;
  const { isConnected, address } = useAccount();
  const daoConfig = useDaoConfig();
  const [voting, setVoting] = useState(false);
  const { data: govParams } = useGovernanceParams();
  const { castVote, isPending: isPendingCastVote } = useCastVote();
  const [castVoteHash, setCastVoteHash] = useState<`0x${string}` | null>(null);
  const { queueProposal, isPending: isPendingQueue } = useQueueProposal();
  const [queueHash, setQueueHash] = useState<`0x${string}` | null>(null);
  const { executeProposal, isPending: isPendingExecute } = useExecuteProposal();
  const [executeHash, setExecuteHash] = useState<`0x${string}` | null>(null);
  const [cancelHash, setCancelHash] = useState<`0x${string}` | null>(null);
  const [cancelProposalOpen, setCancelProposalOpen] = useState(false);
  const { validateBeforeExecution } = useContractGuard();
  const { data: hasVoted } = useReadContract({
    address: daoConfig?.contracts?.governor as `0x${string}`,
    abi: GovernorAbi,
    functionName: "hasVoted",
    args: [id ? BigInt(id) : 0n, address as `0x${string}`],
    chainId: daoConfig?.chain?.id,
    query: {
      enabled:
        !!id &&
        !!daoConfig?.contracts?.governor &&
        !!address &&
        !!daoConfig?.chain?.id,
    },
  });

  const handleCopyUrl = useCallback(() => {
    navigator.clipboard.writeText(`${window.location.origin}/proposals/${id}`);
  }, [id]);

  const { cancelProposal, isPending: isCancelling } = useCancelProposal();

  const handleCancelProposal = useCallback(async () => {
    try {
      const hash = await cancelProposal({
        targets: data?.targets as `0x${string}`[],
        values: data?.values?.map((value) => BigInt(value)) as bigint[],
        calldatas: data?.calldatas as `0x${string}`[],
        description: data?.originalDescription as string,
      });
      if (hash) {
        setCancelHash(hash as `0x${string}`);
      }
    } catch (error) {
      console.error(error);
      toast.error(
        (
          error as {
            shortMessage: string;
          }
        )?.shortMessage ?? "Failed to cancel proposal"
      );
    } finally {
      setCancelProposalOpen(false);
    }
  }, [
    cancelProposal,
    data?.calldatas,
    data?.originalDescription,
    data?.targets,
    data?.values,
  ]);

  const handleCancelProposalSuccess = useCallback(() => {
    setCancelHash(null);
    onRefetch();
  }, [onRefetch]);

  const handleCastVote = useCallback(
    async ({
      proposalId,
      support,
      reason,
    }: {
      proposalId: string;
      support: number;
      reason: string;
    }) => {
      try {
        const hash = await castVote({
          proposalId: BigInt(proposalId),
          support,
          reason,
        });
        if (hash) {
          setCastVoteHash(hash as `0x${string}`);
        }
      } catch (error) {
        console.error(error);
        toast.error(
          (error as { shortMessage: string })?.shortMessage ??
            "Failed to cast vote"
        );
      } finally {
        setVoting(false);
      }
    },
    [castVote]
  );

  const handleCastVoteSuccess = useCallback(() => {
    setCastVoteHash(null);
    onRefetch();
  }, [onRefetch]);

  const handleQueueProposal = useCallback(async () => {
    try {
      const hash = await queueProposal({
        targets: data?.targets as `0x${string}`[],
        values: data?.values?.map((value) => BigInt(value)) as bigint[],
        calldatas: data?.calldatas as `0x${string}`[],
        description: data?.originalDescription as string,
      });
      if (hash) {
        setQueueHash(hash as `0x${string}`);
      }
    } catch (error) {
      console.error(error);
      toast.error(
        (error as { shortMessage: string })?.shortMessage ??
          "Failed to queue proposal"
      );
    }
  }, [
    queueProposal,
    data?.calldatas,
    data?.originalDescription,
    data?.targets,
    data?.values,
  ]);

  const handleQueueProposalSuccess = useCallback(() => {
    setQueueHash(null);
    onRefetch();
  }, [onRefetch]);

  const handleExecuteProposal = useCallback(async () => {
    try {
      const hash = await executeProposal({
        targets: data?.targets as `0x${string}`[],
        values: data?.values?.map((value) => BigInt(value)) as bigint[],
        calldatas: data?.calldatas as `0x${string}`[],
        description: data?.originalDescription as string,
      });
      if (hash) {
        setExecuteHash(hash as `0x${string}`);
      }
    } catch (error) {
      console.error(error);
      toast.error(
        (error as { shortMessage: string })?.shortMessage ??
          "Failed to execute proposal"
      );
    }
  }, [
    executeProposal,
    data?.calldatas,
    data?.originalDescription,
    data?.targets,
    data?.values,
  ]);

  const handleExecuteProposalSuccess = useCallback(() => {
    setExecuteHash(null);
    onRefetch();
  }, [onRefetch]);

  const canExecute = useMemo(() => {
    if (status === ProposalState.Queued) {
      const queuedBlockTimestamp = proposalQueuedById?.blockTimestamp
        ? BigInt(proposalQueuedById?.blockTimestamp)
        : undefined;
      const timeLockDelay = govParams?.timeLockDelay
        ? BigInt(govParams?.timeLockDelay * 1000n)
        : undefined;

      if (!queuedBlockTimestamp || !timeLockDelay) return false;

      return (
        BigInt(new Date().getTime()) > queuedBlockTimestamp + timeLockDelay
      );
    }
    return false;
  }, [status, proposalQueuedById, govParams?.timeLockDelay]);

  const handleAction = useCallback(
    (action: "vote" | "queue" | "execute") => {
      const isValid = validateBeforeExecution();
      if (!isValid) return;
      switch (action) {
        case "vote":
          setVoting(true);
          break;
        case "queue":
          handleQueueProposal();
          break;
        case "execute":
          handleExecuteProposal();
          break;
      }
    },
    [handleQueueProposal, handleExecuteProposal, validateBeforeExecution]
  );
  const explorerUrl = useMemo(() => {
    let defaultUrl = `${daoConfig?.chain?.explorers?.[0]}/tx/${data?.transactionHash}`;

    if (status === ProposalState.Defeated) {
      defaultUrl = "";
    }
    if (status === ProposalState.Expired) {
      defaultUrl = "";
    }

    if (status === ProposalState.Queued) {
      defaultUrl = `${daoConfig?.chain?.explorers?.[0]}/tx/${proposalQueuedById?.transactionHash}`;
    }
    if (status === ProposalState.Executed) {
      defaultUrl = `${daoConfig?.chain?.explorers?.[0]}/tx/${proposalExecutedById?.transactionHash}`;
    }
    if (status === ProposalState.Canceled) {
      defaultUrl = `${daoConfig?.chain?.explorers?.[0]}/tx/${proposalCanceledById?.transactionHash}`;
    }
    return defaultUrl;
  }, [
    data?.transactionHash,
    status,
    daoConfig?.chain?.explorers,
    proposalQueuedById?.transactionHash,
    proposalExecutedById?.transactionHash,
    proposalCanceledById?.transactionHash,
  ]);

  const votedSupport = useMemo(() => {
    if (!address || !hasVoted) return undefined;
    const voter = data?.voters?.find(
      (voter) => voter.voter?.toLowerCase() === address?.toLowerCase()
    );
    return voter?.support;
  }, [address, hasVoted, data]);

  return (
    <div className="flex items-center justify-end gap-[10px]">
      {isAllQueriesFetching ? (
        <Skeleton className="h-[37px] w-[100px] rounded-[100px]" />
      ) : (
        <ActionGroupDisplay
          status={status}
          votedSupport={votedSupport}
          canExecute={canExecute}
          isLoading={
            isPendingCastVote ||
            !!castVoteHash ||
            isPendingQueue ||
            !!queueHash ||
            isPendingExecute ||
            !!executeHash
          }
          onClick={handleAction}
        />
      )}
      <Dropdown
        explorerUrl={explorerUrl}
        handleCopyUrl={handleCopyUrl}
        handleCancelProposal={handleCancelProposal}
        isLoading={isCancelling}
        showCancel={status === ProposalState.Pending && isConnected}
      />
      <Voting
        open={voting}
        onOpenChange={setVoting}
        isPending={isPendingCastVote}
        onCastVote={handleCastVote}
        proposalId={data?.proposalId as string}
      />
      <CancelProposal
        open={cancelProposalOpen}
        onOpenChange={setCancelProposalOpen}
        isLoading={isCancelling}
        onCancelProposal={handleCancelProposal}
      />
      {cancelHash && (
        <TransactionToast
          hash={cancelHash}
          onSuccess={handleCancelProposalSuccess}
          onError={() => setCancelHash(null)}
        />
      )}
      {castVoteHash && (
        <TransactionToast
          hash={castVoteHash}
          onSuccess={handleCastVoteSuccess}
          onError={() => setCastVoteHash(null)}
        />
      )}
      {queueHash && (
        <TransactionToast
          hash={queueHash}
          onSuccess={handleQueueProposalSuccess}
          onError={() => setQueueHash(null)}
        />
      )}
      {executeHash && (
        <TransactionToast
          hash={executeHash}
          onSuccess={handleExecuteProposalSuccess}
          onError={() => setExecuteHash(null)}
        />
      )}
    </div>
  );
}
