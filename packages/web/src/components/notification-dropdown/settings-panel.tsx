"use client";

import { EmailBindIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import Link from "next/link";

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
      className="rounded-[26px] border-grey-1 bg-dark p-[20px] shadow-card flex flex-col gap-[20px] w-[calc(100vw-40px)] max-w-[300px] lg:w-[300px]"
      align="end"
    >
      <div className="flex flex-col gap-[20px]">
        <div className="flex items-center gap-[5px]">
          <EmailBindIcon width={24} height={24} className="text-foreground" />
          <span className="text-foreground text-[14px] font-semibold">
            {email}
          </span>
        </div>

        <div className="h-[1px] w-full bg-grey-2/50"></div>

        <div className="flex flex-col gap-[5px]">
          <div className="flex items-center gap-[10px]">
            <h3 className="text-foreground font-semibold text-[14px] flex-1">
              New proposals
            </h3>
            <Switch
              checked={newProposals}
              onCheckedChange={() => onToggle("newProposals")}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            Notified of all new proposals of this DAO.
          </p>
        </div>

        <div className="flex flex-col gap-[5px]">
          <div className="flex items-center gap-[10px]">
            <h3 className="text-foreground font-semibold text-[14px] flex-1">
              Voting end reminder
            </h3>
            <Switch
              checked={votingEndReminder}
              onCheckedChange={() => onToggle("votingEndReminder")}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            Receive notifications before the proposal voting ends.
          </p>
        </div>
        <div className="w-full flex justify-end">
          <Button className="bg-foreground hover:bg-foreground/90 text-[14px] font-semibold text-dark rounded-[100px] py-[5px] px-[10px] h-auto">
            <Link href="/notification-settings"> Notification setting </Link>
          </Button>
        </div>
      </div>
    </DropdownMenuContent>
  );
};
