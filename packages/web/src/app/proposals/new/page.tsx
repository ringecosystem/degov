"use client";
import Image from "next/image";
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

import { NewPublishWarning } from "@/components/new-publish-warning";
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

import { NewProposalAction } from "./action";
import { CustomPanel } from "./custom-panel";
import {
  generateCustomAction,
  generateProposalAction,
  generateTransferAction,
  transformActionsToProposalParams,
} from "./helper";
import { PreviewPanel } from "./preview-panel";
import { ProposalPanel } from "./proposal-panel";
import { ReplacePanel } from "./replace-panel";
import { proposalSchema, customActionSchema, transferSchema } from "./schema";
import { TransferPanel } from "./transfer-panel";

import type { ProposalContent, TransferContent, CustomContent } from "./schema";
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
      <Image
        src="/assets/image/proposal/plus.svg"
        alt="plus"
        width={16}
        height={16}
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
  const [publishWarningOpen, setPublishWarningOpen] = useState(false);
  const [hash, setHash] = useState<string | null>(null);
  const [tab, setTab] = useState<"edit" | "add" | "preview">("edit");

  const { createProposal, isPending, proposalId } = useProposal();

  const {
    formattedVotes,
    formattedProposalThreshold,
    hasEnoughVotes,
    isLoading,
  } = useMyVotes();

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
    (type: "transfer" | "custom") => {
      if (type === "transfer") {
        const transferAction = generateTransferAction();
        setActions([...actions, transferAction]);
        setActionUuid(transferAction.id);
      } else if (type === "custom") {
        const customAction = generateCustomAction();
        setActions([...actions, customAction]);
        setActionUuid(customAction.id);
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

  const validationState = useMemo(() => {
    const state = new Map<string, boolean>();
    actions.forEach((action) => {
      if (action.type === "proposal") {
        const result = proposalSchema.safeParse({
          title: action.content?.title,
          markdown: action.content?.markdown,
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
      }
    });

    return state;
  }, [actions]);

  const handlePublish = useCallback(async () => {
    try {
      if (!hasEnoughVotes) {
        setPublishWarningOpen(true);
        return;
      }

      const result = await transformActionsToProposalParams(actions);

      console.log("result", result);

      const hash = await createProposal(result.description, result.actions);
      if (hash) {
        setHash(hash);
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
  }, [actions, createProposal, hasEnoughVotes]);

  const handlePublishSuccess: SuccessType = useCallback(() => {
    if (proposalId) {
      router.push(`/proposals/${proposalId}`);
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
              <Image
                src="/assets/image/proposal/plus.svg"
                alt="plus"
                width={16}
                height={16}
              />
              <span>Publish</span>
            </Button>
          )}
        </header>

        <div className="flex gap-[30px]">
          <aside className="flex w-[300px] flex-shrink-0 flex-col gap-[10px] rounded-[14px]">
            {actions.map((action) => (
              <NewProposalAction
                key={action.id}
                type={action.type}
                onSwitch={() => handleSwitchAction(action.id)}
                active={action.id === actionUuid && tab === "edit"}
                error={!validationState.get(action.id)}
              />
            ))}
            <NewProposalAction
              type="preview"
              onSwitch={() => setTab("preview")}
              active={tab === "preview"}
            />

            <Button
              className="gap-[5px] rounded-[100px]"
              onClick={handleAddAction}
            >
              <Image
                src="/assets/image/proposal/plus.svg"
                alt="plus"
                width={16}
                height={16}
              />
              <span>Add Action</span>
            </Button>
          </aside>
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
      <NewPublishWarning
        open={publishWarningOpen}
        onOpenChange={setPublishWarningOpen}
        proposalThreshold={formattedProposalThreshold}
        votes={formattedVotes}
      />
      {hash && (
        <TransactionToast
          hash={hash as `0x${string}`}
          onSuccess={handlePublishSuccess}
        />
      )}
    </WithConnect>
  );
}
