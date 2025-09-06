"use client";

import { useState, useCallback } from "react";

import { NotificationIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SettingsPanel } from "./settings-panel";
import { EmailBindForm } from "./email-bind-form";

interface NotificationSettings {
  email?: string;
  newProposals: boolean;
  votingEndReminder: boolean;
}

export const NotificationDropdown = () => {
  const [isEmailBound, setIsEmailBound] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings>({
    newProposals: true,
    votingEndReminder: false,
  });

  const handleVerified = useCallback((verifiedEmail: string) => {
    setIsEmailBound(true);
    setSettings((prev) => ({ ...prev, email: verifiedEmail }));
  }, []);

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

      {isEmailBound ? (
        <SettingsPanel
          email={settings.email}
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
