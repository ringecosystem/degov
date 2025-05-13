import { useAsync } from "react-use";
import { useAccount } from "wagmi";

import { AddressWithAvatar } from "@/components/address-with-avatar";
import { cn } from "@/lib/utils";

import { ActionsPanel } from "./action-panel";

import type { ProposalContent } from "./schema";
import type { Action } from "./type";

interface PreviewPanelProps {
  visible: boolean;
  actions: Action[];
}

export const PreviewPanel = ({ visible, actions }: PreviewPanelProps) => {
  const { address } = useAccount();

  const proposalContent = useAsync(async () => {
    const title =
      actions[0]?.type === "proposal"
        ? (actions[0]?.content as ProposalContent).title || "Untitled"
        : "Untitled";
    const html =
      actions[0]?.type === "proposal"
        ? (actions[0]?.content as ProposalContent).markdown
        : "";
    return { title, html: html };
  }, [actions]);

  return (
    <div
      className={cn(
        "flex flex-col gap-[10px]",
        visible ? "animate-in fade-in duration-300" : "hidden"
      )}
    >
      <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px]">
        <header className="flex flex-col">
          <h2 className="text-[26px] font-semibold">
            {proposalContent?.value?.title}
          </h2>

          <div className="flex items-center gap-[5px]">
            <span>Proposed by </span>
            {address && (
              <AddressWithAvatar
                address={address}
                avatarSize={24}
                className="gap-[5px]"
              />
            )}
          </div>
        </header>
        <div
          className="markdown-body"
          dangerouslySetInnerHTML={{
            __html: proposalContent?.value?.html || "",
          }}
        />
      </div>
      <ActionsPanel actions={actions} />
    </div>
  );
};
