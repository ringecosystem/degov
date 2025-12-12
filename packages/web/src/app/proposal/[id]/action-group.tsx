"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  ProposalItem,
  ProposalQueuedByIdItem,
} from "@/services/graphql/types";
import { ProposalState } from "@/types/proposal";
import { CACHE_TIMES } from "@/utils/query-config";

import { ActionGroupDisplay } from "./action-group-display";
import { CancelProposal } from "./cancel-proposal";
import { Dropdown } from "./dropdown";
import { Voting } from "./voting";

interface ActionGroupProps {
  data?: ProposalItem & { originalDescription: string };
  status?: ProposalState;
  proposalQueuedById?: ProposalQueuedByIdItem;
  isAllQueriesFetching: boolean;
  onRefetch: () => void;
}

const ACTIVE_STATES: ProposalState[] = [
  ProposalState.Pending,
  ProposalState.Active,
  ProposalState.Succeeded,
  ProposalState.Queued,
];

export default function ActionGroup({
  data,
  status,
  proposalQueuedById,
  isAllQueriesFetching,
  onRefetch,
}: ActionGroupProps) {
  const { isConnected, address } = useAccount();
  const queryClient = useQueryClient();
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
  const [currentTime, setCurrentTime] = useState<bigint>(() =>
    BigInt(Date.now())
  );
  const { validateBeforeExecution } = useContractGuard();
  const shouldPollHasVoted = status ? ACTIVE_STATES.includes(status) : false;
  const { data: hasVotedOnChain } = useReadContract({
    address: daoConfig?.contracts?.governor as `0x${string}`,
    abi: GovernorAbi,
    functionName: "hasVoted",
    args: [
      data?.proposalId ? BigInt(data.proposalId) : 0n,
      address as `0x${string}`,
    ],
    chainId: daoConfig?.chain?.id,
    query: {
      enabled:
        Boolean(data?.proposalId) &&
        Boolean(daoConfig?.contracts?.governor) &&
        Boolean(address) &&
        Boolean(daoConfig?.chain?.id),
      staleTime: 0,
      refetchOnMount: "always",
      refetchInterval: shouldPollHasVoted ? CACHE_TIMES.TEN_SECONDS : false,
    },
  });

  const hasVotedFromIndexer = useMemo(() => {
    if (!address) return false;
    if (!data?.voters?.length) return false;
    const lowerCasedAddress = address.toLowerCase();
    return data.voters.some(
      (voter) => voter.voter?.toLowerCase() === lowerCasedAddress
    );
  }, [address, data?.voters]);

  const hasVoted = useMemo(() => {
    if (typeof hasVotedOnChain === "boolean") {
      return hasVotedOnChain;
    }
    return hasVotedFromIndexer;
  }, [hasVotedFromIndexer, hasVotedOnChain]);

  const { cancelProposal, isPending: isCancelling } = useCancelProposal();

  const invalidateAggregates = useCallback(() => {
    const endpoint = daoConfig?.indexer?.endpoint;
    const daoCode = daoConfig?.code;

    // Proposal state transitions affect counts/aggregates across the app.
    if (endpoint) {
      void queryClient.invalidateQueries({
        queryKey: ["dataMetrics", endpoint],
        refetchType: "all",
      });
      void queryClient.invalidateQueries({
        queryKey: ["proposals", endpoint],
        refetchType: "all",
      });
    }
    if (daoCode) {
      void queryClient.invalidateQueries({
        queryKey: ["summaryProposalStates", daoCode],
        refetchType: "all",
      });
    }
  }, [daoConfig?.code, daoConfig?.indexer?.endpoint, queryClient]);

  const handleShowCancelDialog = useCallback(() => {
    setCancelProposalOpen(true);
  }, []);

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
    invalidateAggregates();
    onRefetch();
  }, [invalidateAggregates, onRefetch]);

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
    invalidateAggregates();
    onRefetch();
    const endpoint = daoConfig?.indexer?.endpoint;
    if (endpoint && address) {
      void queryClient.invalidateQueries({
        queryKey: ["proposalVoteRate", address, endpoint],
        refetchType: "all",
      });
    }
  }, [address, daoConfig?.indexer?.endpoint, invalidateAggregates, onRefetch, queryClient]);

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
    invalidateAggregates();
    onRefetch();
  }, [invalidateAggregates, onRefetch]);

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
    invalidateAggregates();
    onRefetch();
  }, [invalidateAggregates, onRefetch]);

  const hasTimelock = useMemo(() => {
    return (
      govParams?.timeLockDelayInSeconds !== undefined &&
      govParams?.timeLockDelayInSeconds !== null
    );
  }, [govParams?.timeLockDelayInSeconds]);

  useEffect(() => {
    if (status !== ProposalState.Queued || !hasTimelock) {
      return;
    }
    // refresh current time every second to ensure that the proposal can be executed without refreshing the page
    setCurrentTime(BigInt(Date.now()));
    const timer = setInterval(() => {
      setCurrentTime(BigInt(Date.now()));
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [status, hasTimelock]);

  const canExecute = useMemo(() => {
    if (!hasTimelock && status === ProposalState.Succeeded) {
      return true;
    }

    if (status === ProposalState.Queued) {
      const queuedBlockTimestamp = proposalQueuedById?.blockTimestamp
        ? BigInt(proposalQueuedById?.blockTimestamp)
        : undefined;
      const timeLockDelayInSeconds = govParams?.timeLockDelayInSeconds;

      const timeLockDelay =
        timeLockDelayInSeconds !== undefined && timeLockDelayInSeconds !== null
          ? BigInt(BigInt(timeLockDelayInSeconds) * 1000n)
          : undefined;

      if (!queuedBlockTimestamp) return false;
      if (timeLockDelay === undefined) return true;

      const timeLockDelayBigInt = timeLockDelay ?? 0n;
      return currentTime > queuedBlockTimestamp + timeLockDelayBigInt;
    }
    return false;
  }, [
    status,
    proposalQueuedById,
    govParams?.timeLockDelayInSeconds,
    hasTimelock,
    currentTime,
  ]);

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
          hasTimelock={hasTimelock}
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
        handleCancelProposal={handleShowCancelDialog}
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
