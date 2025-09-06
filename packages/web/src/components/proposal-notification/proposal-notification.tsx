"use client";

import { useState, useCallback, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { useAccount } from "wagmi";

import { NotificationIcon, SettingsIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/auth";
import { useNotification } from "@/hooks/useNotification";

interface ProposalNotificationProps {
  proposalId?: string;
  daoCode?: string;
}

export const ProposalNotification = ({
  proposalId,
  daoCode = "default", // Default DAO code, should be passed from parent component
}: ProposalNotificationProps) => {
  const { address, isConnected } = useAccount();
  const { isAuthenticated } = useAuth();
  const { subscribeProposal, unsubscribeProposal, isLoading } =
    useNotification();

  const [isSubscribed, setIsSubscribed] = useState(false);
  const [hasEmailRegistered, setHasEmailRegistered] = useState(false);

  // Subscribe to proposal mutation
  const subscribeMutation = useMutation({
    mutationFn: ({
      daoCode,
      proposalId,
    }: {
      daoCode: string;
      proposalId: string;
    }) =>
      subscribeProposal({
        daoCode,
        proposalId,
        features: [
          { type: "PROPOSAL_VOTING_END", enabled: true },
          { type: "PROPOSAL_STATUS_CHANGE", enabled: true },
        ],
      }),
    onSuccess: () => {
      setIsSubscribed(true);
      toast.success("Successfully subscribed to proposal notifications");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to subscribe to proposal");
    },
  });

  // Unsubscribe from proposal mutation
  const unsubscribeMutation = useMutation({
    mutationFn: ({
      daoCode,
      proposalId,
    }: {
      daoCode: string;
      proposalId: string;
    }) => unsubscribeProposal(daoCode, proposalId),
    onSuccess: () => {
      setIsSubscribed(false);
      toast.success("Successfully unsubscribed from proposal notifications");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to unsubscribe from proposal");
    },
  });

  const mutationLoading =
    subscribeMutation.isPending || unsubscribeMutation.isPending;

  // TODO: Get email binding status and subscription status from API
  useEffect(() => {
    // Here should call API to check if user has bound email and subscription status
    // Temporarily use isAuthenticated as email binding status
    setHasEmailRegistered(isAuthenticated);
  }, [isAuthenticated]);

  const handleSubscribe = useCallback(async () => {
    if (!proposalId || !isConnected || !address) return;

    if (isSubscribed) {
      // Unsubscribe
      unsubscribeMutation.mutate({ daoCode, proposalId });
    } else {
      // Subscribe
      subscribeMutation.mutate({ daoCode, proposalId });
    }
  }, [
    isSubscribed,
    proposalId,
    daoCode,
    subscribeMutation.mutate,
    unsubscribeMutation.mutate,
    isConnected,
    address,
  ]);

  // Don't show if wallet is not connected or email is not registered
  if (!isConnected || !address || !hasEmailRegistered) {
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
          disabled={mutationLoading || isLoading}
          className={`w-full rounded-[100px] py-[10px] px-[10px] bg-transparent flex items-center gap-[5px]`}
          variant="outline"
          isLoading={mutationLoading || isLoading}
        >
          <NotificationIcon width={20} height={20} />
          {isSubscribed ? "Unsubscribe" : "Subscribe"}
        </Button>
      </div>
    </div>
  );
};
