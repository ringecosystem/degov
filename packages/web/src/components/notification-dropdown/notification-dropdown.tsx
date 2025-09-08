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
  useEmailBindingStatus,
  useNotificationFeatures,
  useSubscribeDao,
  useUnsubscribeDao,
} from "@/hooks/useNotification";
import { FeatureName } from "@/services/graphql/types/notifications";

import { EmailBindForm } from "./email-bind-form";
import { SettingsPanel } from "./settings-panel";

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

  const { isEmailBound, emailAddress, isLoading, refresh } =
    useEmailBindingStatus();
  const {
    newProposals,
    votingEndReminder,
    isLoading: featuresLoading,
  } = useNotificationFeatures();
  const subscribeDao = useSubscribeDao();
  const unsubscribeDao = useUnsubscribeDao();

  // Default DAO code - this should ideally come from context or props

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

  // Update settings when email binding status changes
  const handleVerified = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const handleSettingToggle = useCallback(
    (
      setting: FeatureName.PROPOSAL_NEW | FeatureName.VOTE_END,
      enabled: boolean
    ) => {
      const currentValue = settings[setting];
      const newValue = enabled;

      setSettings((prev) => ({
        ...prev,
        [setting]: newValue,
      }));

      const featureName = setting;

      if (newValue) {
        // Subscribe to the specific feature + keep all other active features
        const allFeatureKeys = [FeatureName.PROPOSAL_NEW, FeatureName.VOTE_END];
        const activeFeatures = allFeatureKeys
          .filter(
            (key) =>
              key === setting || settings[key as keyof NotificationSettings]
          )
          .map((key) => ({
            name: key,
            strategy: "true",
          }));

        subscribeDao.mutate(
          {
            daoCode: config?.code,
            features: activeFeatures,
          },
          {
            onError: (error: any) => {
              // Revert local state on error
              setSettings((prev) => ({
                ...prev,
                [setting]: currentValue,
              }));
              toast.error(
                error?.response?.errors?.[0]?.message ||
                  `Failed to subscribe to ${setting}`
              );
            },
          }
        );
      } else {
        // For unsubscribing, we need to check if there are other active features
        // If this is the only active feature, unsubscribe from DAO entirely
        const otherFeatureKeys = [
          FeatureName.PROPOSAL_NEW,
          FeatureName.VOTE_END,
        ].filter((key) => key !== setting);

        const hasOtherActiveFeatures = otherFeatureKeys.some(
          (key) => settings[key as keyof NotificationSettings]
        );

        if (!hasOtherActiveFeatures) {
          // Unsubscribe from entire DAO if no other features are active
          unsubscribeDao.mutate(config?.code, {
            onError: (error: any) => {
              // Revert local state on error
              setSettings((prev) => ({
                ...prev,
                [setting]: currentValue,
              }));
              toast.error(
                error?.response?.errors?.[0]?.message ||
                  `Failed to unsubscribe from ${setting}`
              );
            },
          });
        } else {
          // Subscribe with only the remaining active features
          const activeFeatures = otherFeatureKeys
            .filter((key) => settings[key as keyof NotificationSettings])
            .map((key) => ({
              name: key,
              strategy: "true",
            }));

          subscribeDao.mutate(
            {
              daoCode: config?.code,
              features: activeFeatures,
            },
            {
              onError: (error: any) => {
                // Revert local state on error
                setSettings((prev) => ({
                  ...prev,
                  [setting]: currentValue,
                }));

                toast.error(
                  error?.response?.errors?.[0]?.message ||
                    `Failed to update subscription for ${setting}`
                );
              },
            }
          );
        }
      }
    },
    [settings, config?.code, subscribeDao, unsubscribeDao]
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="lg:border lg:border-border rounded-full w-[42px] bg-card lg:bg-background h-[42px] lg:rounded-[10px] border-input  p-0 flex items-center justify-center"
          variant="outline"
        >
          <NotificationIcon className="h-[20px] w-[20px]" />
        </Button>
      </DropdownMenuTrigger>

      {isLoading || featuresLoading ? null : isEmailBound ? (
        <SettingsPanel
          email={emailAddress}
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
          isLoading={isLoading}
        />
      )}
    </DropdownMenu>
  );
};
