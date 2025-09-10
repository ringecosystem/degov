"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "react-toastify";

import { NotificationIcon, SettingsIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useDeGovAppsNavigation } from "@/hooks/useDeGovAppsNavigation";
import {
  useSubscribeProposal,
  useUnsubscribeProposal,
  useSubscribedProposals,
  useNotificationChannels,
} from "@/hooks/useNotification";
import { FeatureName } from "@/services/graphql/types/notifications";
import { extractErrorMessage } from "@/utils/graphql-error-handler";

interface ProposalNotificationProps {
  proposalId?: string;
}

export const ProposalNotification = ({
  proposalId,
}: ProposalNotificationProps) => {
  const daoConfig = useDaoConfig();
  const appUrl = useDeGovAppsNavigation();

  // State to control processing
  const [isProcessing, setIsProcessing] = useState(false);

  // Channel data is always loaded for email binding check
  const { data: channelData, isLoading: channelsLoading } =
    useNotificationChannels(true);
  // Subscribed proposals only loaded when email is bound
  const { data: subscribedProposals, isLoading: subscriptionsLoading } =
    useSubscribedProposals(channelData?.isEmailBound ?? false);

  // Mutations
  const subscribeProposalMutation = useSubscribeProposal();
  const unsubscribeProposalMutation = useUnsubscribeProposal();

  // Check if current proposal is subscribed
  const isSubscribed = useMemo(() => {
    if (!subscribedProposals || !proposalId || !daoConfig?.code) return false;
    return subscribedProposals.some(
      (sub) =>
        sub.proposal.proposalId === proposalId &&
        sub.dao.code === daoConfig.code
    );
  }, [subscribedProposals, proposalId, daoConfig?.code]);

  // Simplified subscription handler
  const handleSubscribe = useCallback(async () => {
    if (!proposalId || !daoConfig?.code || isProcessing) return;

    // Check email binding first
    if (!channelData?.isEmailBound) {
      toast.error(
        "Please bind your email address first to receive notifications"
      );
      return;
    }

    setIsProcessing(true);
    try {
      if (isSubscribed) {
        await unsubscribeProposalMutation.mutateAsync({
          daoCode: daoConfig.code,
          proposalId: proposalId,
        });
        toast.success("Successfully unsubscribed from proposal notifications");
      } else {
        await subscribeProposalMutation.mutateAsync({
          daoCode: daoConfig.code,
          proposalId: proposalId,
          features: [
            { name: FeatureName.VOTE_END, strategy: "true" },
            { name: FeatureName.PROPOSAL_STATE_CHANGED, strategy: "true" },
          ],
        });
        toast.success("Successfully subscribed to proposal notifications");
      }
    } catch (error: unknown) {
      const errorMessage = extractErrorMessage(error);
      toast.error(
        errorMessage ||
          `Failed to ${
            isSubscribed ? "unsubscribe from" : "subscribe to"
          } proposal`
      );
    } finally {
      setIsProcessing(false);
    }
  }, [
    proposalId,
    daoConfig?.code,
    isProcessing,
    channelData?.isEmailBound,
    isSubscribed,
    unsubscribeProposalMutation,
    subscribeProposalMutation,
  ]);

  const isLoading =
    isProcessing ||
    channelsLoading ||
    subscriptionsLoading ||
    subscribeProposalMutation.isPending ||
    unsubscribeProposalMutation.isPending;

  return (
    <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[10px] lg:p-[20px] shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="text-[18px] text-foreground font-semibold">
          Notifications
        </h3>
        {appUrl && (
          <a href={appUrl} target="_blank" rel="noopener noreferrer">
            <SettingsIcon
              width={16}
              height={16}
              className="text-muted-foreground"
            />
          </a>
        )}
      </div>
      <Separator className="bg-border/20" />

      <div className="flex flex-col gap-4">
        <Button
          onClick={handleSubscribe}
          className={`w-full rounded-[100px] py-[10px] px-[10px] bg-transparent flex items-center gap-[5px]`}
          variant="outline"
          isLoading={isLoading}
        >
          <NotificationIcon width={20} height={20} />
          {isSubscribed ? "Unsubscribe" : "Subscribe"}
        </Button>
      </div>
    </div>
  );
};
