"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";

import { Button } from "@/components/ui/button";
import { WithConnect } from "@/components/with-connect";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useEnsureAuth } from "@/hooks/useEnsureAuth";
import {
  useProposalDraftMutations,
  useProposalDrafts,
} from "@/hooks/useProposalDrafts";
import { Link } from "@/i18n/navigation";
import { formatTimeAgo } from "@/utils/date";
import { isProposalFeatureEnabled } from "@/utils/proposal-features";
import {
  degovGraphqlApi,
  isDegovApiConfiguredClient,
} from "@/utils/remote-api";

export default function ProposalDraftsPage() {
  const t = useTranslations("proposalEditor.drafts");
  const daoConfig = useDaoConfig();
  const { address, isConnected } = useAccount();
  const { ensureAuth, isAuthenticating } = useEnsureAuth();
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const attemptedAddressRef = useRef<string | null>(null);
  const enabled = isProposalFeatureEnabled(
    daoConfig,
    "proposal-drafts",
    isDegovApiConfiguredClient() ? degovGraphqlApi() : undefined
  );

  const authenticate = useCallback(async () => {
    setAuthError(false);
    const result = await ensureAuth();
    setAuthReady(result.success);
    setAuthError(!result.success);
  }, [ensureAuth]);

  useEffect(() => {
    if (!enabled || !isConnected || !address) return;
    const normalized = address.toLowerCase();
    if (attemptedAddressRef.current === normalized) return;
    attemptedAddressRef.current = normalized;
    setAuthReady(false);
    void authenticate();
  }, [address, authenticate, enabled, isConnected]);

  const draftsQuery = useProposalDrafts(
    daoConfig?.code ?? "",
    enabled && authReady
  );
  const { remove } = useProposalDraftMutations(daoConfig?.code ?? "");
  const drafts = useMemo(
    () => draftsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [draftsQuery.data]
  );

  if (!enabled) {
    return (
      <div className="mx-auto max-w-[720px] p-[30px]">
        <h1 className="text-[24px] font-semibold">{t("unavailable")}</h1>
        <p className="mt-[8px] text-muted-foreground">
          {t("unavailableDescription")}
        </p>
        <Button className="mt-[20px]" variant="outline" asChild>
          <Link href="/proposals">{t("backToProposals")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <WithConnect>
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-[20px] p-[30px]">
        <header className="flex flex-wrap items-center justify-between gap-[12px]">
          <div>
            <h1 className="text-[24px] font-semibold">{t("title")}</h1>
            <p className="mt-[4px] text-[14px] text-muted-foreground">
              {t("description")}
            </p>
          </div>
          <Button asChild>
            <Link href="/proposals/new">{t("newProposal")}</Link>
          </Button>
        </header>

        {deleteError && (
          <p role="alert" className="text-[13px] text-destructive">
            {t("deleteFailed")}
          </p>
        )}

        {isAuthenticating || (!authReady && !authError) ? (
          <div className="rounded-[14px] bg-card p-[24px] text-center text-muted-foreground shadow-card">
            {t("loading")}
          </div>
        ) : authError ? (
          <div className="rounded-[14px] bg-card p-[24px] shadow-card">
            <p className="font-semibold">{t("authFailed")}</p>
            <Button className="mt-[14px]" onClick={authenticate}>
              {t("retry")}
            </Button>
          </div>
        ) : draftsQuery.isError ? (
          <div className="rounded-[14px] bg-card p-[24px] shadow-card">
            <p className="font-semibold">{t("loadFailed")}</p>
            <Button className="mt-[14px]" onClick={() => draftsQuery.refetch()}>
              {t("retry")}
            </Button>
          </div>
        ) : draftsQuery.isLoading ? (
          <div className="rounded-[14px] bg-card p-[24px] text-center text-muted-foreground shadow-card">
            {t("loading")}
          </div>
        ) : drafts.length === 0 ? (
          <div className="rounded-[14px] bg-card p-[36px] text-center shadow-card">
            <p className="font-semibold">{t("empty")}</p>
            <p className="mt-[6px] text-[14px] text-muted-foreground">
              {t("emptyDescription")}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/30 rounded-[14px] bg-card px-[20px] shadow-card">
            {drafts.map((draft) => (
              <article
                key={draft.id}
                className="flex flex-col gap-[12px] py-[18px] sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{draft.title}</h2>
                  <p className="mt-[4px] text-[12px] text-muted-foreground">
                    {t("updated", {
                      time: formatTimeAgo(
                        String(new Date(draft.utime).getTime())
                      ),
                    })}
                  </p>
                </div>
                <div className="flex shrink-0 gap-[8px]">
                  <Button size="sm" asChild>
                    <Link href={`/proposals/new?draft=${draft.id}`}>
                      {t("continue")}
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (!window.confirm(t("deleteConfirm"))) return;
                      setDeleteError(false);
                      void remove
                        .mutateAsync({
                          daoCode: daoConfig?.code ?? "",
                          draftId: draft.id,
                        })
                        .catch(() => setDeleteError(true));
                    }}
                  >
                    {t("delete")}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}

        {draftsQuery.hasNextPage && (
          <Button
            variant="ghost"
            isLoading={draftsQuery.isFetchingNextPage}
            onClick={() => draftsQuery.fetchNextPage()}
          >
            {t("loadMore")}
          </Button>
        )}
      </div>
    </WithConnect>
  );
}
