"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "react-toastify";
import { useImmer } from "use-immer";
import { toHex } from "viem";
import { useAccount } from "wagmi";

import { PlusIcon } from "@/components/icons";
import type { SuccessType } from "@/components/transaction-toast";
import { TransactionToast } from "@/components/transaction-toast";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { WithConnect } from "@/components/with-connect";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useEnsureAuth } from "@/hooks/useEnsureAuth";
import { useMyVotes } from "@/hooks/useMyVotes";
import { useProposal } from "@/hooks/useProposal";
import { useProposalDraftAutosave } from "@/hooks/useProposalDraftAutosave";
import {
  useProposalDraft,
  useProposalDrafts,
} from "@/hooks/useProposalDrafts";
import { useUnsavedChangesAlert } from "@/hooks/useUnsavedChangesAlert";
import { Link, useRouter } from "@/i18n/navigation";
import type { ProposalDraft } from "@/services/graphql/types/proposal-drafts";
import { formatTimeAgo } from "@/utils/date";
import {
  hasMeaningfulProposalDraftContent,
  parseProposalDraftDocument,
  serializeProposalDraftDocument,
} from "@/utils/proposal-draft-document";
import type { ProposalDraftDocument } from "@/utils/proposal-draft-document";
import { isProposalFeatureEnabled } from "@/utils/proposal-features";
import {
  degovGraphqlApi,
  isDegovApiConfiguredClient,
} from "@/utils/remote-api";

import { CustomPanel } from "./custom-panel";
import {
  generateCustomAction,
  generateProposalAction,
  generateTransferAction,
  generateXAccountAction,
  transformActionsToProposalParams,
} from "./helper";
import { PreviewPanel } from "./preview-panel";
import { ProposalPanel } from "./proposal-panel";
import { ReplacePanel } from "./replace-panel";
import {
  createProposalSchema,
  createCustomActionSchema,
  createTransferSchema,
  createXaccountSchema,
} from "./schema";
import { Sidebar } from "./sidebar";
import { TransferPanel } from "./transfer-panel";
import { XAccountPanel } from "./xaccount-panel";

import type {
  ProposalContent,
  TransferContent,
  CustomContent,
  XAccountContent,
} from "./schema";
import type { Action } from "./type";

const DEFAULT_ACTIONS: Action[] = [generateProposalAction()];

const PublishButton = ({
  disabled,
  isLoading,
  onClick,
}: {
  disabled: boolean;
  isLoading: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) => {
  const t = useTranslations("proposalEditor.page");
  return (
    <Button
      className="gap-[5px] rounded-[100px]"
      onClick={onClick}
      disabled={disabled}
      isLoading={isLoading}
    >
      <PlusIcon width={16} height={16} className="text-current" />
      <span>{t("publish")}</span>
    </Button>
  );
};

function ProposalEditor({
  initialDraft,
  initialDocument,
  syncEnabled,
}: {
  initialDraft?: ProposalDraft;
  initialDocument?: ProposalDraftDocument;
  syncEnabled: boolean;
}) {
  const t = useTranslations("proposalEditor.page");
  const schemaT = useTranslations("proposalEditor");
  const panelRefs = useRef<Map<string, HTMLFormElement>>(new Map());
  const router = useRouter();
  const queryClient = useQueryClient();
  const daoConfig = useDaoConfig();
  const initialActions = initialDocument?.actions ?? DEFAULT_ACTIONS;
  const initialActionId =
    initialDocument?.activeActionId ?? initialActions[0]?.id ?? null;
  const [actions, setActions] = useImmer<Action[]>(initialActions);
  const [publishLoading, setPublishLoading] = useState(false);
  const [actionUuid, setActionUuid] = useState<string | null>(initialActionId);
  const [hash, setHash] = useState<string | null>(null);
  const [tab, setTab] = useState<"edit" | "add" | "preview">(
    initialDocument?.tab ?? "edit"
  );

  const initialPayload = useMemo(
    () =>
      serializeProposalDraftDocument({
        actions: initialActions,
        activeActionId: initialActionId,
        tab: initialDocument?.tab ?? "edit",
      }),
    [initialActionId, initialActions, initialDocument?.tab]
  );
  const [savedBaseline, setSavedBaseline] = useState(initialPayload);
  const proposalSchema = useMemo(
    () => createProposalSchema(schemaT),
    [schemaT]
  );
  const transferSchema = useMemo(
    () => createTransferSchema(schemaT),
    [schemaT]
  );
  const customActionSchema = useMemo(
    () => createCustomActionSchema(schemaT),
    [schemaT]
  );
  const xaccountSchema = useMemo(
    () => createXaccountSchema(schemaT),
    [schemaT]
  );

  const hasMeaningfulDraftContent = useMemo(
    () => hasMeaningfulProposalDraftContent(actions),
    [actions]
  );

  const draftDocument = useMemo<ProposalDraftDocument>(
    () => ({ actions, activeActionId: actionUuid, tab }),
    [actionUuid, actions, tab]
  );
  const currentPayload = useMemo(() => {
    try {
      return serializeProposalDraftDocument(draftDocument);
    } catch {
      return JSON.stringify(draftDocument);
    }
  }, [draftDocument]);

  const handleDraftSaved = useCallback((payload: string) => {
    setSavedBaseline(payload);
  }, []);

  const draftAutosave = useProposalDraftAutosave({
    daoCode: daoConfig?.code ?? "",
    document: draftDocument,
    enabled: syncEnabled && Boolean(daoConfig?.code),
    meaningful: Boolean(initialDraft) || hasMeaningfulDraftContent,
    initialDraft,
    onSaved: handleDraftSaved,
  });

  const { resetChanges } = useUnsavedChangesAlert({
    hasChanges: currentPayload !== savedBaseline,
    message: t("unsavedChanges"),
  });

  const { createProposal, isPending, proposalId } = useProposal();

  const { isLoading } = useMyVotes();

  const handleProposalContentChange = useCallback(
    (content: ProposalContent) => {
      setActions((draft) => {
        const action = draft.find((action) => action.id === actionUuid);
        if (action?.type === "proposal") {
          action.content = content;
        }
      });
    },
    [setActions, actionUuid]
  );

  const handleAddAction = useCallback(() => {
    setTab("add");
  }, []);

  const handleSwitchAction = useCallback(
    (id: string) => {
      setTab("edit");
      setActionUuid(id);
    },
    [setActionUuid]
  );

  const handleRemoveAction = useCallback(
    (index: number) => {
      setActions(actions.filter((_, i) => i !== index));
      setActionUuid(actions[index - 1].id);
    },
    [actions, setActions]
  );

  const handleReplaceAction = useCallback(
    (type: "transfer" | "custom" | "xaccount") => {
      if (type === "transfer") {
        const transferAction = generateTransferAction();
        setActions([...actions, transferAction]);
        setActionUuid(transferAction.id);
      } else if (type === "custom") {
        const customAction = generateCustomAction();
        setActions([...actions, customAction]);
        setActionUuid(customAction.id);
      } else if (type === "xaccount") {
        const xaccountAction = generateXAccountAction();
        setActions([...actions, xaccountAction]);
        setActionUuid(xaccountAction.id);
      }
      setTab("edit");
    },
    [actions, setActions]
  );

  const handleTransferContentChange = useCallback(
    (content: TransferContent) => {
      setActions((draft) => {
        const action = draft.find((action) => action.id === actionUuid);
        if (action?.type === "transfer") {
          action.content = content;
        }
      });
    },
    [setActions, actionUuid]
  );

  const handleCustomContentChange = useCallback(
    (content: CustomContent) => {
      setActions((draft) => {
        const action = draft.find((action) => action.id === actionUuid);
        if (action?.type === "custom") {
          action.content = content;
        }
      });
    },
    [setActions, actionUuid]
  );

  const handleXAccountContentChange = useCallback(
    (content: XAccountContent) => {
      setActions((draft) => {
        const action = draft.find((action) => action.id === actionUuid);
        if (action?.type === "xaccount") {
          action.content = content;
        }
      });
    },
    [setActions, actionUuid]
  );

  const validationState = useMemo(() => {
    const state = new Map<string, boolean>();
    actions.forEach((action) => {
      if (action.type === "proposal") {
        const result = proposalSchema.safeParse({
          title: action.content?.title,
          markdown: action.content?.markdown,
          discussion: action.content?.discussion,
        });
        state.set(action.id, result.success);
      } else if (action.type === "transfer") {
        const result = transferSchema.safeParse({
          recipient: action.content?.recipient,
          amount: action.content?.amount,
        });
        state.set(action.id, result.success);
      } else if (action.type === "custom") {
        const result = customActionSchema.safeParse({
          target: action.content?.target,
          contractType: action.content?.contractType,
          contractMethod: action.content?.contractMethod,
          calldata: action.content?.calldata,
          customAbiContent: action.content?.customAbiContent,
          value: action.content?.value,
        });

        state.set(action.id, result.success);
      } else if (action.type === "xaccount") {
        const result = xaccountSchema.safeParse(action.content);
        state.set(action.id, result.success);
      }
    });

    return state;
  }, [actions, customActionSchema, proposalSchema, transferSchema, xaccountSchema]);

  const handlePublish = useCallback(async () => {
    try {
      const result = await transformActionsToProposalParams(actions);

      const hash = await createProposal(
        result.description,
        result.actions,
        result.discussion
      );
      if (hash) {
        setHash(hash);
      }
      return;
    } catch (error) {
      console.error(error);
      toast.error(
        (error as { shortMessage: string }).shortMessage ??
          t("publishFailed")
      );
    } finally {
      setPublishLoading(false);
    }
  }, [actions, createProposal, t]);

  const handlePublishSuccess: SuccessType = useCallback(async () => {
    const endpoint = daoConfig?.indexer?.endpoint;
    const daoCode = daoConfig?.code;

    // Ensure any cached/persisted aggregates & lists refresh after a new proposal.
    // We refetch inactive queries too because refetchOnMount is globally disabled.
    if (endpoint) {
      void queryClient.invalidateQueries({
        queryKey: ["dataMetrics", endpoint],
        refetchType: "none",
      });
      void queryClient.invalidateQueries({
        queryKey: ["proposals", endpoint],
        refetchType: "none",
      });
    }
    if (daoCode) {
      void queryClient.invalidateQueries({
        queryKey: ["summaryProposalStates", daoCode],
        refetchType: "none",
      });
    }

    if (syncEnabled) {
      try {
        await draftAutosave.stopAndDelete();
      } catch {
        toast.warning(t("draftCleanupFailed"));
      }
    }
    resetChanges();

    if (proposalId) {
      const hexProposalId = toHex(BigInt(proposalId));
      router.push(`/proposal/${hexProposalId}`);
    }
  }, [
    daoConfig?.code,
    daoConfig?.indexer?.endpoint,
    draftAutosave,
    proposalId,
    queryClient,
    resetChanges,
    router,
    syncEnabled,
    t,
  ]);

  useEffect(() => {
    return () => {
      setActions(DEFAULT_ACTIONS);
      setActionUuid(DEFAULT_ACTIONS[0].id);
      setTab("edit");
    };
  }, [setActions]);

  return (
    <WithConnect>
      <div className="flex flex-col gap-[20px] p-[30px]">
        <header className="flex items-center justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-[10px]">
              <h2 className="text-2xl font-semibold">{t("title")}</h2>
              {syncEnabled && (
                <span className="text-[12px] text-muted-foreground">
                  {t(`draftStatus.${draftAutosave.status}`)}
                </span>
              )}
            </div>
            {syncEnabled && draftAutosave.status === "error" && (
              <div className="mt-[6px] flex items-center gap-[8px] text-[12px] text-destructive">
                <span>{t("draftSaveFailed")}</span>
                <button
                  type="button"
                  className="underline"
                  onClick={draftAutosave.retry}
                >
                  {t("retryDraftSave")}
                </button>
              </div>
            )}
            {syncEnabled && draftAutosave.status === "conflict" && (
              <div className="mt-[6px] flex flex-wrap items-center gap-[8px] text-[12px] text-destructive">
                <span>{t("draftConflict")}</span>
                <button
                  type="button"
                  className="underline"
                  onClick={() => window.location.reload()}
                >
                  {t("reloadServerDraft")}
                </button>
                <button
                  type="button"
                  className="underline"
                  onClick={draftAutosave.saveAsNew}
                >
                  {t("saveAsNewDraft")}
                </button>
              </div>
            )}
          </div>
          {actions.length === 0 ||
          [...validationState.values()].some((v) => !v) ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <PublishButton
                    disabled
                    isLoading={publishLoading || isPending}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>{t("fixErrors")}</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              className="gap-[5px] rounded-[100px]"
              onClick={handlePublish}
              isLoading={publishLoading || isPending || isLoading}
            >
              <PlusIcon width={16} height={16} className="text-current" />
              <span>{t("publish")}</span>
            </Button>
          )}
        </header>

        <div className="flex gap-[30px] flex-col lg:flex-row">
          <Sidebar
            actions={actions}
            actionUuid={actionUuid}
            tab={tab}
            validationState={validationState}
            onSwitchAction={handleSwitchAction}
            onAddAction={handleAddAction}
            onSetTab={setTab}
          />
          <main className="flex-1">
            {actions.map((action) => {
              return (
                <Fragment key={action.id}>
                  {action?.type === "proposal" && (
                    <ProposalPanel
                      visible={tab === "edit" && action.id === actionUuid}
                      content={action?.content as ProposalContent}
                      onChange={handleProposalContentChange}
                      ref={(el: HTMLFormElement | null) => {
                        if (el) {
                          panelRefs.current.set(action.id, el);
                        }
                      }}
                    />
                  )}

                  {action?.type === "transfer" && (
                    <TransferPanel
                      visible={tab === "edit" && action.id === actionUuid}
                      index={actions.findIndex(
                        (action) => action.id === actionUuid
                      )}
                      content={action?.content as TransferContent}
                      onChange={handleTransferContentChange}
                      onRemove={handleRemoveAction}
                    />
                  )}

                  {action?.type === "custom" && (
                    <CustomPanel
                      visible={tab === "edit" && action.id === actionUuid}
                      index={actions.findIndex(
                        (action) => action.id === actionUuid
                      )}
                      content={action?.content as CustomContent}
                      onChange={handleCustomContentChange}
                      onRemove={handleRemoveAction}
                    />
                  )}

                  {action?.type === "xaccount" && (
                    <XAccountPanel
                      visible={tab === "edit" && action.id === actionUuid}
                      index={actions.findIndex(
                        (action) => action.id === actionUuid
                      )}
                      content={action?.content as XAccountContent}
                      onChange={handleXAccountContentChange}
                      onRemove={handleRemoveAction}
                    />
                  )}
                </Fragment>
              );
            })}
            <ReplacePanel
              visible={tab === "add"}
              index={actions.length}
              onReplace={handleReplaceAction}
              onRemove={handleRemoveAction}
            />
            <PreviewPanel visible={tab === "preview"} actions={actions} />
          </main>
        </div>
      </div>
      {hash && (
        <TransactionToast
          hash={hash as `0x${string}`}
          onSuccess={handlePublishSuccess}
        />
      )}
    </WithConnect>
  );
}

function DraftGate({ children }: { children: React.ReactNode }) {
  return (
    <WithConnect>
      <div className="mx-auto flex min-h-[420px] w-full max-w-[720px] items-center px-[20px] py-[40px]">
        {children}
      </div>
    </WithConnect>
  );
}

export default function NewProposal() {
  const t = useTranslations("proposalEditor.page");
  const daoConfig = useDaoConfig();
  const searchParams = useSearchParams();
  const draftId = searchParams?.get("draft") ?? undefined;
  const { address, isConnected } = useAccount();
  const { ensureAuth, isAuthenticating } = useEnsureAuth();
  const [authReady, setAuthReady] = useState(false);
  const [authFailed, setAuthFailed] = useState(false);
  const [continueUnsynced, setContinueUnsynced] = useState(false);
  const [startFresh, setStartFresh] = useState(false);
  const attemptedAddressRef = useRef<string | null>(null);

  const draftsEnabled = isProposalFeatureEnabled(
    daoConfig,
    "proposal-drafts",
    isDegovApiConfiguredClient() ? degovGraphqlApi() : undefined
  );

  const authenticateDrafts = useCallback(async () => {
    setAuthFailed(false);
    const result = await ensureAuth();
    setAuthReady(result.success);
    setAuthFailed(!result.success);
  }, [ensureAuth]);

  useEffect(() => {
    if (!draftsEnabled || !isConnected || !address || continueUnsynced) return;
    const normalized = address.toLowerCase();
    if (attemptedAddressRef.current === normalized) return;
    attemptedAddressRef.current = normalized;
    setAuthReady(false);
    void authenticateDrafts();
  }, [
    address,
    authenticateDrafts,
    continueUnsynced,
    draftsEnabled,
    isConnected,
  ]);

  const draftsQuery = useProposalDrafts(
    daoConfig?.code ?? "",
    draftsEnabled && authReady && !draftId
  );
  const draftQuery = useProposalDraft(
    daoConfig?.code ?? "",
    draftId,
    draftsEnabled && authReady && Boolean(draftId)
  );
  const recentDrafts = useMemo(
    () => draftsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [draftsQuery.data]
  );
  const parsedDraft = useMemo(() => {
    const draft = draftQuery.data;
    if (!draft?.payload) return undefined;
    try {
      return parseProposalDraftDocument(draft.payload, draft.payloadVersion);
    } catch {
      return undefined;
    }
  }, [draftQuery.data]);

  if (!draftsEnabled || continueUnsynced) {
    return <ProposalEditor syncEnabled={false} />;
  }

  if (!isConnected || !address) {
    return (
      <DraftGate>
        <div />
      </DraftGate>
    );
  }

  if (isAuthenticating || (!authReady && !authFailed)) {
    return (
      <DraftGate>
        <div className="w-full text-center text-muted-foreground">
          {t("loadingDrafts")}
        </div>
      </DraftGate>
    );
  }

  if (authFailed) {
    return (
      <DraftGate>
        <div className="w-full rounded-[14px] bg-card p-[24px] shadow-card">
          <h2 className="text-[20px] font-semibold">
            {t("draftSyncUnavailable")}
          </h2>
          <p className="mt-[8px] text-[14px] text-muted-foreground">
            {t("draftSyncUnavailableDescription")}
          </p>
          <div className="mt-[20px] flex flex-wrap gap-[10px]">
            <Button onClick={authenticateDrafts}>{t("retryDraftSync")}</Button>
            <Button
              variant="outline"
              onClick={() => setContinueUnsynced(true)}
            >
              {t("continueWithoutSync")}
            </Button>
          </div>
        </div>
      </DraftGate>
    );
  }

  if (draftId) {
    if (draftQuery.isLoading) {
      return (
        <DraftGate>
          <div className="w-full text-center text-muted-foreground">
            {t("loadingDraft")}
          </div>
        </DraftGate>
      );
    }
    if (draftQuery.isError || !draftQuery.data || !parsedDraft) {
      return (
        <DraftGate>
          <div className="w-full rounded-[14px] bg-card p-[24px] shadow-card">
            <h2 className="text-[20px] font-semibold">
              {t("draftLoadFailed")}
            </h2>
            <p className="mt-[8px] text-[14px] text-muted-foreground">
              {t("draftLoadFailedDescription")}
            </p>
            <div className="mt-[20px] flex gap-[10px]">
              <Button onClick={() => draftQuery.refetch()}>{t("retry")}</Button>
              <Button variant="outline" asChild>
                <Link href="/proposals/drafts">{t("viewDrafts")}</Link>
              </Button>
            </div>
          </div>
        </DraftGate>
      );
    }
    return (
      <ProposalEditor
        initialDraft={draftQuery.data}
        initialDocument={parsedDraft}
        syncEnabled
      />
    );
  }

  if (draftsQuery.isLoading) {
    return (
      <DraftGate>
        <div className="w-full text-center text-muted-foreground">
          {t("loadingDrafts")}
        </div>
      </DraftGate>
    );
  }

  if (draftsQuery.isError) {
    return (
      <DraftGate>
        <div className="w-full rounded-[14px] bg-card p-[24px] shadow-card">
          <h2 className="text-[20px] font-semibold">
            {t("draftSyncUnavailable")}
          </h2>
          <p className="mt-[8px] text-[14px] text-muted-foreground">
            {t("draftSyncUnavailableDescription")}
          </p>
          <div className="mt-[20px] flex gap-[10px]">
            <Button onClick={() => draftsQuery.refetch()}>{t("retry")}</Button>
            <Button
              variant="outline"
              onClick={() => setContinueUnsynced(true)}
            >
              {t("continueWithoutSync")}
            </Button>
          </div>
        </div>
      </DraftGate>
    );
  }

  if (recentDrafts.length > 0 && !startFresh) {
    return (
      <DraftGate>
        <div className="w-full rounded-[14px] bg-card p-[24px] shadow-card">
          <h2 className="text-[20px] font-semibold">{t("continueDraft")}</h2>
          <p className="mt-[8px] text-[14px] text-muted-foreground">
            {t("continueDraftDescription")}
          </p>
          <div className="mt-[20px] divide-y divide-border/30">
            {recentDrafts.slice(0, 3).map((draft) => (
              <Link
                key={draft.id}
                href={`/proposals/new?draft=${draft.id}`}
                className="flex items-center justify-between gap-[20px] py-[14px] hover:opacity-70"
              >
                <span className="min-w-0 truncate font-medium">
                  {draft.title}
                </span>
                <span className="shrink-0 text-[12px] text-muted-foreground">
                  {formatTimeAgo(String(new Date(draft.utime).getTime()))}
                </span>
              </Link>
            ))}
          </div>
          <div className="mt-[20px] flex flex-wrap gap-[10px]">
            <Button onClick={() => setStartFresh(true)}>
              {t("startNewProposal")}
            </Button>
            <Button variant="outline" asChild>
              <Link href="/proposals/drafts">{t("viewAllDrafts")}</Link>
            </Button>
          </div>
        </div>
      </DraftGate>
    );
  }

  return <ProposalEditor syncEnabled />;
}
