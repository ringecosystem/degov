import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  ProposalActionCheckIcon,
  ErrorIcon,
  CancelIcon,
  ClockIcon,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VoteType } from "@/config/vote";
import { ProposalState } from "@/types/proposal";

import type { JSX } from "react";

const VOTE_ICON_MAP: Partial<
  Record<
    VoteType,
    (props: { width?: number; height?: number; className?: string }) => JSX.Element
  >
> = {
  [VoteType.For]: ProposalActionCheckIcon,
  [VoteType.Against]: ErrorIcon,
  [VoteType.Abstain]: CancelIcon,
};

const VOTE_LABEL_KEY_MAP: Partial<
  Record<VoteType, "for" | "against" | "abstain">
> = {
  [VoteType.For]: "for",
  [VoteType.Against]: "against",
  [VoteType.Abstain]: "abstain",
};
interface ActionGroupDisplayProps {
  status?: ProposalState;
  isLoading: boolean;
  votedSupport?: VoteType;
  canExecute: boolean;
  canSimulate: boolean;
  hasTimelock: boolean;
  isSimulating: boolean;
  onClick: (action: "vote" | "queue" | "execute" | "simulate") => void;
}

function ExecuteAction({
  canExecute,
  canSimulate,
  isLoading,
  isSimulating,
  onClick,
}: Pick<
  ActionGroupDisplayProps,
  "canExecute" | "canSimulate" | "isLoading" | "isSimulating" | "onClick"
>) {
  const t = useTranslations("proposalDetail.actionGroup");

  return (
    <div className="flex items-center">
      <Button
        className={
          canSimulate
            ? "h-[37px] rounded-l-[100px] rounded-r-none focus-visible:ring-0"
            : "h-[37px] rounded-[100px] focus-visible:ring-0"
        }
        isLoading={isLoading}
        disabled={!canExecute}
        onClick={() => onClick("execute")}
      >
        {t("execute")}
      </Button>
      {canSimulate && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              aria-label={t("moreExecutionOptions")}
              title={t("simulate")}
              className="h-[37px] w-[38px] rounded-l-none rounded-r-[100px] border-l border-primary-foreground/30 px-0 focus-visible:ring-2"
              disabled={isLoading}
            >
              <ChevronDown aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-[220px] rounded-[14px] border-border/20 bg-card p-[6px]"
          >
            <DropdownMenuItem
              className="cursor-pointer rounded-[10px] p-[10px]"
              disabled={isSimulating}
              onSelect={() => onClick("simulate")}
            >
              {isSimulating ? t("simulating") : t("simulate")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
export const ActionGroupDisplay = ({
  status,
  isLoading,
  onClick,
  votedSupport,
  canExecute,
  canSimulate,
  hasTimelock,
  isSimulating,
}: ActionGroupDisplayProps) => {
  const t = useTranslations("proposalDetail.actionGroup");
  const voteLabels = useTranslations("proposals.voteLabels");

  if (status === ProposalState.Pending) {
    return (
      <div className="flex items-center gap-[10px]">
        <ClockIcon width={20} height={20} className="text-current" />
        <p>{t("votingStartsSoon")}</p>
      </div>
    );
  }
  if (status === ProposalState.Active) {
    const VoteIcon =
      votedSupport !== undefined ? VOTE_ICON_MAP[votedSupport] : null;
    const voteLabelKey =
      votedSupport !== undefined ? VOTE_LABEL_KEY_MAP[votedSupport] : null;

    if (VoteIcon && voteLabelKey) {
      return (
        <p className="flex items-center gap-[10px] text-[14px] font-normal">
          <VoteIcon width={20} height={20} className="text-current" />
          {t("youVoted", {
            voteLabel: voteLabels(voteLabelKey),
          })}
        </p>
      );
    }
    return (
      <Button
        className="h-[37px] rounded-[100px] focus-visible:ring-0"
        onClick={() => onClick("vote")}
        isLoading={isLoading}
      >
        {t("voteOnchain")}
      </Button>
    );
  }
  if (status === ProposalState.Succeeded) {
    // If no timelock, show Execute button directly
    if (!hasTimelock) {
      return (
        <ExecuteAction
          canExecute={canExecute}
          canSimulate={canSimulate}
          isLoading={isLoading}
          isSimulating={isSimulating}
          onClick={onClick}
        />
      );
    }

    // If timelock is enabled, show Queue button
    return (
      <Button
        className="h-[37px] rounded-[100px] focus-visible:ring-0"
        isLoading={isLoading}
        onClick={() => onClick("queue")}
      >
        {t("queue")}
      </Button>
    );
  }
  if (status === ProposalState.Queued) {
    return (
      <ExecuteAction
        canExecute={canExecute}
        canSimulate={canSimulate}
        isLoading={isLoading}
        isSimulating={isSimulating}
        onClick={onClick}
      />
    );
  }
  if (status === ProposalState.Executed) {
    return (
      <div className="flex items-center gap-[10px]">
        <ProposalActionCheckIcon
          width={20}
          height={20}
          className="text-current"
        />
        <p>{t("proposalExecuted")}</p>
      </div>
    );
  }
  if (status === ProposalState.Canceled) {
    return (
      <div className="flex items-center gap-[10px]">
        <CancelIcon width={20} height={20} className="text-current" />
        <p>{t("proposalCanceled")}</p>
      </div>
    );
  }
  if (status === ProposalState.Expired) {
    return (
      <div className="flex items-center gap-[10px]">
        <CancelIcon width={20} height={20} className="text-current" />
        <p>{t("proposalExpired")}</p>
      </div>
    );
  }
  if (status === ProposalState.Defeated) {
    return (
      <div className="flex items-center gap-[10px]">
        <CancelIcon width={20} height={20} className="text-current" />
        <p>{t("proposalDefeated")}</p>
      </div>
    );
  }

  return null;
};
