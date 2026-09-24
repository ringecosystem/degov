"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { useAccount } from "wagmi";

import { PlusIcon } from "@/components/icons";
import { NewPublishWarning } from "@/components/new-publish-warning";
import { ProposalDraftPicker } from "@/components/proposal-draft-picker";
import { Button } from "@/components/ui/button";
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
  const [draftPickerOpen, setDraftPickerOpen] = useState(false);
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
      setDraftPickerOpen(false);
      setPublishWarningOpen(true);
      return;
    }

    setDraftPickerOpen(false);
    router.push("/proposals/new");
  }, [hasEnoughVotes, isConnected, router]);

  const openEntry = useCallback(() => {
    if (draftsEnabled && isConnected) {
      setDraftPickerOpen(true);
      return;
    }

    startFromScratch();
  }, [draftsEnabled, isConnected, startFromScratch]);

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

      {draftsEnabled && isConnected && (
        <ProposalDraftPicker
          open={draftPickerOpen}
          onOpenChange={setDraftPickerOpen}
          closeWhenEmpty
          onStartNew={startFromScratch}
          startNewDisabled={powerCheckUnavailable}
          startNewLoading={powerCheckLoading || isFetching}
          startNewError={
            powerCheckUnavailable ? t("votingPowerUnavailable") : undefined
          }
          onRetryStartNew={() => void refetch()}
          onSelect={(draftId) => {
            setDraftPickerOpen(false);
            router.push(`/proposals/new?draft=${draftId}`);
          }}
        />
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
