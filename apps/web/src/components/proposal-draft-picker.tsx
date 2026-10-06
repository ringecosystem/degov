"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";

import { CloseIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useEnsureAuth } from "@/hooks/useEnsureAuth";
import { useProposalDrafts } from "@/hooks/useProposalDrafts";
import { formatTimeAgo } from "@/utils/date";

interface ProposalDraftPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (draftId: string) => void;
  onStartNew?: () => void;
  closeWhenEmpty?: boolean;
  startNewDisabled?: boolean;
  startNewLoading?: boolean;
  startNewError?: string;
  onRetryStartNew?: () => void;
}

export function ProposalDraftPicker({
  open,
  onOpenChange,
  onSelect,
  onStartNew,
  closeWhenEmpty = false,
  startNewDisabled = false,
  startNewLoading = false,
  startNewError,
  onRetryStartNew,
}: ProposalDraftPickerProps) {
  const t = useTranslations("proposalEditor.draftPicker");
  const daoConfig = useDaoConfig();
  const { address } = useAccount();
  const { ensureAuth, isAuthenticating } = useEnsureAuth();
  const [authReady, setAuthReady] = useState(false);
  const [authFailed, setAuthFailed] = useState(false);
  const attemptedAddressRef = useRef<string | null>(null);

  const authenticate = useCallback(async () => {
    setAuthFailed(false);
    const result = await ensureAuth();
    setAuthReady(result.success);
    setAuthFailed(!result.success);
  }, [ensureAuth]);

  useEffect(() => {
    if (!open || !address) return;
    const normalized = address.toLowerCase();
    if (attemptedAddressRef.current === normalized && authReady) return;
    attemptedAddressRef.current = normalized;
    setAuthReady(false);
    void authenticate();
  }, [address, authReady, authenticate, open]);

  const draftsQuery = useProposalDrafts(
    daoConfig?.code ?? "",
    open && authReady
  );
  const drafts = useMemo(
    () => draftsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [draftsQuery.data]
  );

  useEffect(() => {
    if (
      !open ||
      !closeWhenEmpty ||
      startNewDisabled ||
      startNewLoading ||
      !draftsQuery.isSuccess ||
      drafts.length
    ) {
      return;
    }
    onOpenChange(false);
    onStartNew?.();
  }, [
    closeWhenEmpty,
    drafts.length,
    draftsQuery.isSuccess,
    onOpenChange,
    onStartNew,
    open,
    startNewDisabled,
    startNewLoading,
  ]);

  const loading =
    isAuthenticating || (!authReady && !authFailed) || draftsQuery.isLoading;
  const visibleOpen =
    open &&
    (!closeWhenEmpty ||
      authFailed ||
      draftsQuery.isError ||
      startNewDisabled ||
      startNewLoading ||
      (!loading && drafts.length > 0));

  return (
    <Dialog open={visibleOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[520px] max-w-[calc(100vw-24px)] rounded-[26px] border-border/20 bg-card p-[20px] sm:rounded-[26px]">
        <DialogHeader className="flex w-full flex-row items-start justify-between gap-[16px]">
          <div className="space-y-[4px] text-left">
            <DialogTitle className="text-[18px] font-extrabold">
              {t("title")}
            </DialogTitle>
            <DialogDescription className="text-[14px] text-muted-foreground">
              {t("description")}
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <button
              type="button"
              aria-label={t("close")}
              className="shrink-0 rounded-full p-[2px] transition-opacity hover:opacity-80 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CloseIcon width={24} height={24} />
            </button>
          </DialogClose>
        </DialogHeader>

        <div className="max-h-[min(420px,60vh)] overflow-y-auto py-[4px]">
          {loading ? (
            <p className="py-[36px] text-center text-[14px] text-muted-foreground">
              {t("loading")}
            </p>
          ) : authFailed || draftsQuery.isError ? (
            <div className="py-[24px] text-center">
              <p className="text-[14px] font-semibold">{t("loadFailed")}</p>
              <Button className="mt-[12px]" size="sm" onClick={authenticate}>
                {t("retry")}
              </Button>
            </div>
          ) : drafts.length === 0 ? (
            <p className="py-[36px] text-center text-[14px] text-muted-foreground">
              {t("empty")}
            </p>
          ) : (
            <div className="divide-y divide-border/30">
              {drafts.map((draft) => (
                <button
                  key={draft.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-[16px] rounded-[10px] px-[12px] py-[14px] text-left transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onSelect(draft.id)}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold">
                      {draft.title}
                    </span>
                    <span className="mt-[3px] block text-[12px] text-muted-foreground">
                      {t("updated", {
                        time: formatTimeAgo(
                          String(new Date(draft.utime).getTime())
                        ),
                      })}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] font-semibold text-primary">
                    {t("open")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {onStartNew && !loading && !authFailed && (
          <div className="space-y-[8px]">
            <Button
              className="w-full rounded-[100px]"
              disabled={startNewDisabled}
              isLoading={startNewLoading}
              onClick={onStartNew}
            >
              {t("startNew")}
            </Button>
            {startNewError && (
              <div
                role="alert"
                className="flex items-center justify-between gap-[8px] text-[12px] text-destructive"
              >
                <span>{startNewError}</span>
                {onRetryStartNew && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onRetryStartNew}
                  >
                    {t("retry")}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
