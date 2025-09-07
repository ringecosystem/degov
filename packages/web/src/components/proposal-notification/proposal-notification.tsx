"use client";

import { useCallback, useMemo } from "react";
import { toast } from "react-toastify";
import { useAccount } from "wagmi";

import { NotificationIcon, SettingsIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import {
  useSubscribeProposal,
  useUnsubscribeProposal,
  useSubscribedProposals,
  useEmailBindingStatus,
} from "@/hooks/useNotification";
import { FeatureName } from "@/services/graphql/types/notifications";

interface ProposalNotificationProps {
  proposalId?: string;
}

export const ProposalNotification = ({
  proposalId,
}: ProposalNotificationProps) => {
  const daoConfig = useDaoConfig();
  const { address, isConnected } = useAccount();
  const { isEmailBound } = useEmailBindingStatus();
  const subscribeProposalMutation = useSubscribeProposal();
  const unsubscribeProposalMutation = useUnsubscribeProposal();
  const { data: subscribedProposals, refetch: refetchSubscribedProposals } =
    useSubscribedProposals();

  // Check if current proposal is subscribed
  const isSubscribed = useMemo(() => {
    if (!subscribedProposals || !proposalId || !daoConfig?.code) return false;
    return subscribedProposals.some(
      (sub) =>
        sub.proposal.proposalId === proposalId &&
        sub.dao.code === daoConfig.code
    );
  }, [subscribedProposals, proposalId, daoConfig?.code]);

  // Use success/error handlers for the mutations
  const handleSubscribeSuccess = useCallback(() => {
    refetchSubscribedProposals();
    toast.success("Successfully subscribed to proposal notifications");
  }, [refetchSubscribedProposals]);

  const handleSubscribeError = useCallback((error: unknown) => {
    const errorMessage =
      error && typeof error === "object" && "response" in error
        ? (error as { response?: { errors?: { message?: string }[] } }).response
            ?.errors?.[0]?.message
        : undefined;
    toast.error(errorMessage || "Failed to subscribe to proposal");
  }, []);

  const handleUnsubscribeSuccess = useCallback(() => {
    refetchSubscribedProposals();
    toast.success("Successfully unsubscribed from proposal notifications");
  }, [refetchSubscribedProposals]);

  const handleUnsubscribeError = useCallback((error: unknown) => {
    const errorMessage =
      error && typeof error === "object" && "response" in error
        ? (error as { response?: { errors?: { message?: string }[] } }).response
            ?.errors?.[0]?.message
        : undefined;
    toast.error(errorMessage || "Failed to unsubscribe from proposal");
  }, []);

  const mutationLoading =
    subscribeProposalMutation.isPending ||
    unsubscribeProposalMutation.isPending;

  const handleSubscribe = useCallback(async () => {
    if (!proposalId || !isConnected || !address || !daoConfig?.code) return;

    if (isSubscribed) {
      // Unsubscribe
      unsubscribeProposalMutation.mutate(
        { daoCode: daoConfig?.code as string, proposalId },
        {
          onSuccess: handleUnsubscribeSuccess,
          onError: handleUnsubscribeError,
        }
      );
    } else {
      // Subscribe
      subscribeProposalMutation.mutate(
        {
          daoCode: daoConfig?.code as string,
          proposalId,
          features: [
            { name: FeatureName.VOTE_END, strategy: "true" },
            { name: FeatureName.PROPOSAL_STATE_CHANGED, strategy: "true" },
          ],
        },
        {
          onSuccess: handleSubscribeSuccess,
          onError: handleSubscribeError,
        }
      );
    }
  }, [
    isSubscribed,
    proposalId,
    daoConfig?.code,
    subscribeProposalMutation,
    unsubscribeProposalMutation,
    isConnected,
    address,
    handleSubscribeSuccess,
    handleSubscribeError,
    handleUnsubscribeSuccess,
    handleUnsubscribeError,
  ]);

  // Don't show if wallet is not connected or email is not bound
  if (!isConnected || !address || isEmailBound) {
    return null;
  }

  return (
    <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[10px] lg:p-[20px] shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="text-[18px] text-foreground font-semibold">
          Notifications
        </h3>
        <SettingsIcon
          width={16}
          height={16}
          className="text-muted-foreground"
        />
      </div>
      <Separator className="bg-border/20" />

      <div className="flex flex-col gap-4">
        <Button
          onClick={handleSubscribe}
          disabled={mutationLoading}
          className={`w-full rounded-[100px] py-[10px] px-[10px] bg-transparent flex items-center gap-[5px]`}
          variant="outline"
          isLoading={mutationLoading}
        >
          <NotificationIcon width={20} height={20} />
          {isSubscribed ? "Unsubscribe" : "Subscribe"}
        </Button>
      </div>
    </div>
  );
};
