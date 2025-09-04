"use client";
import { useRouter } from "next/navigation";
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
import { useMyVotes } from "@/hooks/useMyVotes";
import { useProposal } from "@/hooks/useProposal";
import { useUnsavedChangesAlert } from "@/hooks/useUnsavedChangesAlert";

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
  proposalSchema,
  customActionSchema,
  transferSchema,
  xaccountSchema,
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
  return (
    <Button
      className="gap-[5px] rounded-[100px]"
      onClick={onClick}
      disabled={disabled}
      isLoading={isLoading}
    >
      <PlusIcon
        width={16}
        height={16}
        className="text-current"
      />
      <span>Publish</span>
    </Button>
  );
};

export default function NewProposal() {
  const panelRefs = useRef<Map<string, HTMLFormElement>>(new Map());
  const router = useRouter();
  const [actions, setActions] = useImmer<Action[]>(DEFAULT_ACTIONS);
  const [publishLoading, setPublishLoading] = useState(false);
  const [actionUuid, setActionUuid] = useState<string>(DEFAULT_ACTIONS[0].id);
  const [hash, setHash] = useState<string | null>(null);
  const [tab, setTab] = useState<"edit" | "add" | "preview">("edit");

  const initialActionsRef = useRef<string>(JSON.stringify(DEFAULT_ACTIONS));

  const actionsChanged = useMemo(() => {
    const currentActionsJson = JSON.stringify(actions);
    return currentActionsJson !== initialActionsRef.current;
  }, [actions]);

  const { resetChanges } = useUnsavedChangesAlert({
    hasChanges: actionsChanged,
    message:
      "Please confirm that you want to leave this page. If you leave this page, your changes will be lost.",
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
  }, [actions]);

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
        resetChanges();
      }
      return;
    } catch (error) {
      console.error(error);
      toast.error(
        (error as { shortMessage: string }).shortMessage ??
          "Failed to create proposal"
      );
    } finally {
      setPublishLoading(false);
    }
  }, [actions, createProposal, resetChanges]);

  const handlePublishSuccess: SuccessType = useCallback(() => {
    if (proposalId) {
      const hexProposalId = toHex(BigInt(proposalId));
      router.push(`/proposal/${hexProposalId}`);
    }
  }, [proposalId, router]);

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
          <h2 className="text-2xl font-semibold">New Proposal</h2>
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
              <TooltipContent>Please fix all errors</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              className="gap-[5px] rounded-[100px]"
              onClick={handlePublish}
              isLoading={publishLoading || isPending || isLoading}
            >
              <PlusIcon
                width={16}
                height={16}
                className="text-current"
              />
              <span>Publish</span>
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
