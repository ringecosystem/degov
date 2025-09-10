"use client";

import { useState, useCallback, useEffect } from "react";
import { toast } from "react-toastify";

import { NotificationIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import {
  useNotificationFeatures,
  useSubscribeDao,
  useNotificationChannels,
} from "@/hooks/useNotification";
import { FeatureName } from "@/services/graphql/types/notifications";
import { extractErrorMessage } from "@/utils/graphql-error-handler";

import { EmailBindForm } from "./email-bind-form";
import { SettingsPanel } from "./settings-panel";
import { NotificationSkeleton } from "./skeleton";

// Constants
const FEATURE_KEYS = [FeatureName.PROPOSAL_NEW, FeatureName.VOTE_END] as const;

// Helper functions
const createFeature = (name: FeatureName, strategy: "true" | "false") => ({
  name,
  strategy,
});

interface NotificationSettings {
  email?: string;
  [FeatureName.PROPOSAL_NEW]: boolean;
  [FeatureName.VOTE_END]: boolean;
}

interface CountdownState {
  active: boolean;
  duration: number;
  key: number;
}

export const NotificationDropdown = () => {
  const config = useDaoConfig();
  const [isOpen, setIsOpen] = useState(false);

  const {
    data: channelData,
    isLoading: channelsLoading,
    refetch,
  } = useNotificationChannels(isOpen);

  const isEmailBound = channelData?.isEmailBound ?? false;
  const emailAddress = channelData?.emailAddress;

  console.log("isEmailBound", isEmailBound);

  const {
    newProposals,
    votingEndReminder,
    isLoading: featuresLoading,
  } = useNotificationFeatures(isEmailBound);

  const subscribeDao = useSubscribeDao();

  const [settings, setSettings] = useState<NotificationSettings>({
    [FeatureName.PROPOSAL_NEW]: false,
    [FeatureName.VOTE_END]: false,
  });

  const [countdown, setCountdown] = useState<CountdownState>({
    active: false,
    duration: 60,
    key: 0,
  });

  // Update settings when notification features change
  useEffect(() => {
    setSettings((prev) => ({
      ...prev,
      [FeatureName.PROPOSAL_NEW]: newProposals,
      [FeatureName.VOTE_END]: votingEndReminder,
    }));
  }, [newProposals, votingEndReminder]);

  // Handle dropdown open change
  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  // Refetch channels after email verification
  const handleVerified = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // Helper function to handle subscription errors
  const handleSubscriptionError = useCallback(
    (
      error: unknown,
      setting: FeatureName,
      currentValue: boolean,
      operation: string
    ) => {
      // Revert local state on error
      setSettings((prev) => ({ ...prev, [setting]: currentValue }));
      const errorMessage = extractErrorMessage(error);
      toast.error(errorMessage || `Failed to ${operation} ${setting}`);
    },
    []
  );

  // Helper function to subscribe to features
  const subscribeToFeatures = useCallback(
    (
      features: { name: FeatureName; strategy: "true" | "false" }[],
      setting: FeatureName,
      currentValue: boolean,
      operation: string
    ) => {
      subscribeDao.mutate(
        { daoCode: config?.code, features },
        {
          onError: (error) =>
            handleSubscriptionError(error, setting, currentValue, operation),
        }
      );
    },
    [config?.code, subscribeDao, handleSubscriptionError]
  );

  const handleSettingToggle = useCallback(
    (
      setting: FeatureName.PROPOSAL_NEW | FeatureName.VOTE_END,
      enabled: boolean
    ) => {
      const currentValue = settings[setting];

      // Update local state
      setSettings((prev) => ({ ...prev, [setting]: enabled }));

      if (enabled) {
        // Subscribe: include this setting + all other active settings
        const activeFeatures = FEATURE_KEYS.filter(
          (key) =>
            key === setting || settings[key as keyof NotificationSettings]
        ).map((key) => createFeature(key, "true"));

        subscribeToFeatures(
          activeFeatures,
          setting,
          currentValue,
          "subscribe to"
        );
      } else {
        // Unsubscribe: check if other features are still active
        const otherActiveFeatures = FEATURE_KEYS.filter(
          (key) =>
            key !== setting && settings[key as keyof NotificationSettings]
        );

        if (otherActiveFeatures.length === 0) {
          // No other features active, disable all
          const allFeaturesDisabled = FEATURE_KEYS.map((key) =>
            createFeature(key, "false")
          );
          subscribeToFeatures(
            allFeaturesDisabled,
            setting,
            currentValue,
            "update subscription for"
          );
        } else {
          // Keep other active features
          const remainingFeatures = otherActiveFeatures.map((key) =>
            createFeature(key, "true")
          );
          subscribeToFeatures(
            remainingFeatures,
            setting,
            currentValue,
            "update subscription for"
          );
        }
      }
    },
    [settings, subscribeToFeatures]
  );

  const handleStartCountdown = useCallback((duration: number) => {
    setCountdown({
      active: true,
      duration,
      key: Math.random(),
    });
  }, []);

  const handleEndCountdown = useCallback(() => {
    setCountdown((prev) => ({
      ...prev,
      active: false,
    }));
  }, []);

  const handleCountdownTick = useCallback((remaining: number) => {
    // Use setTimeout to avoid setState during render
    setTimeout(() => {
      setCountdown((prev) => ({
        ...prev,
        duration: remaining,
      }));
    }, 0);
  }, []);

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          className="lg:border lg:border-border rounded-full w-[42px] bg-card lg:bg-background h-[42px] lg:rounded-[10px] border-input p-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
          variant="outline"
        >
          <NotificationIcon className="h-[20px] w-[20px]" />
        </Button>
      </DropdownMenuTrigger>

      {!isOpen ? null : channelsLoading || featuresLoading ? (
        <NotificationSkeleton />
      ) : isEmailBound ? (
        <SettingsPanel
          email={emailAddress || undefined}
          newProposals={settings[FeatureName.PROPOSAL_NEW]}
          votingEndReminder={settings[FeatureName.VOTE_END]}
          onToggle={handleSettingToggle}
        />
      ) : (
        <EmailBindForm
          onVerified={handleVerified}
          countdownActive={countdown.active}
          countdownDuration={countdown.duration}
          countdownKey={countdown.key}
          onStartCountdown={handleStartCountdown}
          onEndCountdown={handleEndCountdown}
          onCountdownTick={handleCountdownTick}
          isLoading={channelsLoading}
        />
      )}
    </DropdownMenu>
  );
};
