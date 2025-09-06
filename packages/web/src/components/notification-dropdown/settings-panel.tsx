"use client";

import { NotificationIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenuContent,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";

interface SettingsPanelProps {
  email?: string;
  newProposals: boolean;
  votingEndReminder: boolean;
  onToggle: (setting: "newProposals" | "votingEndReminder") => void;
}

export const SettingsPanel = ({
  email,
  newProposals,
  votingEndReminder,
  onToggle,
}: SettingsPanelProps) => {
  return (
    <DropdownMenuContent
      className="rounded-[26px] border-border/20 bg-card p-[20px] shadow-2xl w-[400px]"
      align="end"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="size-8 bg-foreground rounded-full flex items-center justify-center">
          <NotificationIcon width={16} height={16} className="text-card" />
        </div>
        <span className="text-foreground text-lg font-bold">{email}</span>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-foreground font-medium text-sm">New proposals</h3>
            <p className="text-muted-foreground text-xs">
              Notified of all new proposals of this DAO.
            </p>
          </div>
          <Switch
            checked={newProposals}
            onCheckedChange={() => onToggle("newProposals")}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-foreground font-medium text-sm">
              Voting end reminder
            </h3>
            <p className="text-muted-foreground text-xs">
              Receive notifications before the proposal voting ends.
            </p>
          </div>
          <Switch
            checked={votingEndReminder}
            onCheckedChange={() => onToggle("votingEndReminder")}
          />
        </div>

        <DropdownMenuSeparator className="my-4 bg-border/20" />

        <Button className="w-full bg-foreground hover:bg-foreground/90 text-card rounded-[20px] py-2 text-sm">
          Notification setting
        </Button>
      </div>
    </DropdownMenuContent>
  );
};

