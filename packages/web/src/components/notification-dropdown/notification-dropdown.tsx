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
          className="size-[40px] rounded-[10px] border border-border p-0 hover:bg-card/80 flex items-center justify-center"
          variant="ghost"
        >
          <NotificationIcon className="text-foreground" />
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
