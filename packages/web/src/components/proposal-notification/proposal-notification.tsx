"use client";

import { useState, useCallback, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { useAccount } from "wagmi";

import { NotificationIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/auth";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { notificationService } from "@/services/graphql";

interface ProposalNotificationProps {
  proposalId?: string;
  daoCode?: string;
}

export const ProposalNotification = ({
  proposalId,
  daoCode = "default", // Default DAO code, should be passed from parent component
}: ProposalNotificationProps) => {
  const daoConfig = useDaoConfig();
  const { address, isConnected } = useAccount();
  const { isAuthenticated } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [hasEmailRegistered, setHasEmailRegistered] = useState(false);
  
  // Subscribe to proposal mutation
  const subscribeMutation = useMutation({
    mutationFn: ({ daoCode, proposalId }: { daoCode: string; proposalId: string }) =>
      notificationService.subscribeProposal(daoConfig?.indexer?.endpoint as string, {
        daoCode,
        proposalId,
        features: [
          { type: 'PROPOSAL_VOTING_END', enabled: true },
          { type: 'PROPOSAL_STATUS_CHANGE', enabled: true }
        ]
      }),
    onSuccess: () => {
      setIsSubscribed(true);
      toast.success('Successfully subscribed to proposal notifications');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to subscribe to proposal');
    }
  });

  // Unsubscribe from proposal mutation
  const unsubscribeMutation = useMutation({
    mutationFn: ({ daoCode, proposalId }: { daoCode: string; proposalId: string }) =>
      notificationService.unsubscribeProposal(daoConfig?.indexer?.endpoint as string, { daoCode, proposalId }),
    onSuccess: () => {
      setIsSubscribed(false);
      toast.success('Successfully unsubscribed from proposal notifications');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to unsubscribe from proposal');
    }
  });

  const isLoading = subscribeMutation.isPending || unsubscribeMutation.isPending;

  // TODO: Get email binding status and subscription status from API
  useEffect(() => {
    // Here should call API to check if user has bound email and subscription status
    // Temporarily use isAuthenticated as email binding status
    setHasEmailRegistered(isAuthenticated);
  }, [isAuthenticated]);

  const handleSubscribe = useCallback(async () => {
    if (!proposalId || !isConnected || !address) return;

    if (!hasEmailRegistered) {
      // If no email registered, open the notification dropdown to register email first
      const event = new CustomEvent("openNotificationDropdown");
      window.dispatchEvent(event);
      return;
    }

    if (isSubscribed) {
      // Unsubscribe
      unsubscribeMutation.mutate({ daoCode, proposalId });
    } else {
      // Subscribe
      subscribeMutation.mutate({ daoCode, proposalId });
    }
  }, [isSubscribed, hasEmailRegistered, proposalId, daoCode, subscribeMutation.mutate, unsubscribeMutation.mutate, isConnected, address]);

  // Don't show if wallet is not connected
  if (!isConnected || !address) {
    return null;
  }

  return (
    <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[10px] lg:p-[20px] shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="text-[18px] text-foreground font-semibold">
          Notifications
        </h3>
        <NotificationIcon
          width={24}
          height={24}
          className="text-muted-foreground"
        />
      </div>
      <Separator className="bg-border/20" />

      <div className="flex flex-col gap-4">
        {hasEmailRegistered ? (
          <Button
            onClick={handleSubscribe}
            disabled={isLoading}
            className={`w-full rounded-[20px] py-3 font-medium transition-all duration-200 ${
              isSubscribed
                ? "bg-transparent border border-border text-foreground hover:bg-muted/20"
                : "bg-foreground text-card hover:bg-foreground/90"
            }`}
            variant={isSubscribed ? "outline" : "default"}
          >
            <NotificationIcon
              width={20}
              height={20}
              className={`mr-2 ${
                isSubscribed ? "text-foreground" : "text-current"
              }`}
            />
            {isLoading 
              ? (isSubscribed ? "Unsubscribing..." : "Subscribing...")
              : (isSubscribed ? "Unsubscribe" : "Subscribe")}
          </Button>
        ) : (
          <Button
            onClick={handleSubscribe}
            disabled={isLoading}
            className="w-full bg-foreground text-card hover:bg-foreground/90 rounded-[20px] py-3 font-medium"
          >
            <NotificationIcon
              width={20}
              height={20}
              className="mr-2 text-current"
            />
            {isLoading ? "Processing..." : "Subscribe"}
          </Button>
        )}
        
        <p className="text-xs text-muted-foreground text-center">
          {hasEmailRegistered
            ? "Get notified about important updates for this proposal"
            : "The connected wallet address must register their email to receive notifications"}
        </p>
      </div>
    </div>
  );
};
