"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { useAccount } from "wagmi";

import { CloseIcon, PlusIcon } from "@/components/icons";
import { NewPublishWarning } from "@/components/new-publish-warning";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useMyVotes } from "@/hooks/useMyVotes";
import { useRouter } from "@/i18n/navigation";
import { isProposalFeatureEnabled } from "@/utils/proposal-features";
import {
  degovGraphqlApi,
  isDegovApiConfiguredClient,
} from "@/utils/remote-api";

interface NewProposalEntryProps {
  className?: string;
  iconClassName?: string;
  labelClassName?: string;
  compactLabelClassName?: string;
}

export function NewProposalEntry({
  className,
  iconClassName = "size-[20px]",
  labelClassName,
  compactLabelClassName,
}: NewProposalEntryProps) {
  const t = useTranslations("proposalEditor.entry");
  const daoConfig = useDaoConfig();
  const router = useRouter();
  const { isConnected } = useAccount();
  const {
    hasEnoughVotes,
    proposalThreshold,
    votes,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useMyVotes();
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [publishWarningOpen, setPublishWarningOpen] = useState(false);

  const draftsEnabled = isProposalFeatureEnabled(
    daoConfig,
    "proposal-drafts",
    isDegovApiConfiguredClient() ? degovGraphqlApi() : undefined
  );
  const powerCheckUnavailable = isConnected && Boolean(error);
  const powerCheckLoading = isConnected && isLoading;

  const startFromScratch = useCallback(() => {
    if (isConnected && !hasEnoughVotes) {
      setChoiceOpen(false);
      setPublishWarningOpen(true);
      return;
    }

    setChoiceOpen(false);
    router.push("/proposals/new");
  }, [hasEnoughVotes, isConnected, router]);

  const openEntry = useCallback(() => {
    if (draftsEnabled) {
      setChoiceOpen(true);
      return;
    }

    startFromScratch();
  }, [draftsEnabled, startFromScratch]);

  return (
    <>
      <Button
        className={className}
        onClick={openEntry}
        isLoading={!draftsEnabled && powerCheckLoading}
      >
        <PlusIcon width={20} height={20} className={iconClassName} />
        <span className={labelClassName}>{t("newProposal")}</span>
        {compactLabelClassName && (
          <span className={compactLabelClassName}>{t("new")}</span>
        )}
      </Button>

      {draftsEnabled && (
        <Dialog open={choiceOpen} onOpenChange={setChoiceOpen}>
          <DialogContent
            aria-describedby="new-proposal-entry-description"
            className="w-[400px] max-w-[calc(100vw-24px)] rounded-[26px] border-border/20 bg-card p-[20px] sm:rounded-[26px]"
          >
            <DialogHeader className="flex w-full flex-row items-center justify-between gap-[12px]">
              <DialogTitle className="text-[18px] font-extrabold">
                {t("title")}
              </DialogTitle>
              <DialogClose asChild>
                <button
                  type="button"
                  aria-label={t("close")}
                  className="rounded-full p-[2px] text-foreground transition-opacity hover:opacity-80 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <CloseIcon width={24} height={24} />
                </button>
              </DialogClose>
            </DialogHeader>
            <DialogDescription
              id="new-proposal-entry-description"
              className="text-[14px] text-muted-foreground"
            >
              {t("description")}
            </DialogDescription>
            <Separator className="my-0 bg-muted-foreground/40" />
            <div className="flex flex-col gap-[12px]">
              <Button
                className="w-full rounded-[100px] border-border bg-card"
                variant="outline"
                onClick={() => {
                  setChoiceOpen(false);
                  router.push("/proposals/drafts");
                }}
              >
                {t("createFromDraft")}
              </Button>
              <Button
                className="w-full rounded-[100px]"
                onClick={startFromScratch}
                disabled={powerCheckUnavailable}
                isLoading={powerCheckLoading}
              >
                {t("createFromScratch")}
              </Button>
              {powerCheckUnavailable && (
                <div
                  role="alert"
                  className="flex flex-wrap items-center justify-between gap-[8px] text-[12px] text-destructive"
                >
                  <span>{t("votingPowerUnavailable")}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void refetch()}
                    isLoading={isFetching}
                  >
                    {t("retry")}
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      <NewPublishWarning
        open={publishWarningOpen}
        onOpenChange={setPublishWarningOpen}
        proposalThreshold={proposalThreshold}
        votes={votes}
      />
    </>
  );
}
