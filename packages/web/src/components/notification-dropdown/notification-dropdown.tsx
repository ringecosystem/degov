"use client";

import { useState, useCallback, useMemo } from "react";

import { NotificationIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SettingsPanel } from "./settings-panel";
import { EmailBindForm } from "./email-bind-form";
import { useEmailBindingStatus } from "@/hooks/useNotification";

interface NotificationSettings {
  email?: string;
  newProposals: boolean;
  votingEndReminder: boolean;
}

export const NotificationDropdown = () => {
  const { emailAddress, isLoading, channels } = useEmailBindingStatus();

  const [settings, setSettings] = useState<NotificationSettings>({
    newProposals: false,
    votingEndReminder: false,
  });
  const [locallyVerifiedEmail, setLocallyVerifiedEmail] = useState<
    string | null
  >(null);

  // Update settings when email binding status changes
  const handleVerified = useCallback((verifiedEmail: string) => {
    setSettings((prev) => ({ ...prev, email: verifiedEmail }));
    setLocallyVerifiedEmail(verifiedEmail);
  }, []);

  const effectiveEmail = useMemo(
    () => emailAddress || locallyVerifiedEmail || settings.email,
    [emailAddress, locallyVerifiedEmail, settings.email]
  );

  const handleSettingToggle = useCallback(
    (
      setting: keyof Pick<
        NotificationSettings,
        "newProposals" | "votingEndReminder"
      >
    ) => {
      setSettings((prev) => ({
        ...prev,
        [setting]: !prev[setting],
      }));
    },
    []
  );

  // Consider any EMAIL channel (verified or not) as "has email configured"
  const anyEmailChannel = useMemo(
    () => channels?.find((c) => c.channelType === "EMAIL"),
    [channels]
  );

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

      {isLoading ? null : emailAddress ? (
        <SettingsPanel
          email={
            locallyVerifiedEmail ||
            effectiveEmail ||
            anyEmailChannel?.channelValue
          }
          newProposals={settings.newProposals}
          votingEndReminder={settings.votingEndReminder}
          onToggle={handleSettingToggle}
        />
      ) : (
        <EmailBindForm onVerified={handleVerified} />
      )}
    </DropdownMenu>
  );
};
