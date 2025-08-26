import DOMPurify from "dompurify";
import { marked } from "marked";
import { useMemo, useState, useRef, useEffect } from "react";
import { useAsync } from "react-use";
import { useAccount } from "wagmi";

import { AddressWithAvatar } from "@/components/address-with-avatar";

import { ActionsPanel } from "./action-panel";

import type { ProposalContent } from "./schema";
import type { Action } from "./type";

interface PreviewPanelProps {
  visible: boolean;
  actions: Action[];
}

const MAX_COLLAPSED_HEIGHT = 644;

marked.use();

export const PreviewPanel = ({ visible, actions }: PreviewPanelProps) => {
  const { address } = useAccount();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showToggle, setShowToggle] = useState(false);
  const markdownRef = useRef<HTMLDivElement>(null);

  const proposalContent = useAsync(async () => {
    const title =
      actions[0]?.type === "proposal"
        ? (actions[0]?.content as ProposalContent).title || "Untitled"
        : "Untitled";
    const markdown =
      actions[0]?.type === "proposal"
        ? (actions[0]?.content as ProposalContent).markdown
        : "";
    const discussion =
      actions[0]?.type === "proposal"
        ? (actions[0]?.content as ProposalContent).discussion
        : undefined;
    return { title, markdown, discussion };
  }, [actions]);

  const sanitizedHtml = useMemo(() => {
    const html = marked.parse(proposalContent?.value?.markdown ?? "") as string;
    if (!html) return "";
    return DOMPurify.sanitize(html);
  }, [proposalContent?.value?.markdown]);

  useEffect(() => {
    const checkHeight = () => {
      if (markdownRef.current && sanitizedHtml) {
        markdownRef.current.style.maxHeight = "none";
        const height = markdownRef.current.scrollHeight;
        setShowToggle(height > MAX_COLLAPSED_HEIGHT);

        if (height > MAX_COLLAPSED_HEIGHT && !isExpanded) {
          markdownRef.current.style.maxHeight = `${MAX_COLLAPSED_HEIGHT}px`;
        }
      }
    };

    if (sanitizedHtml) {
      setTimeout(checkHeight, 0);
    }
  }, [sanitizedHtml, isExpanded]);

  const toggleExpanded = () => {
    setIsExpanded((prev) => {
      const newExpanded = !prev;
      if (markdownRef.current) {
        markdownRef.current.style.maxHeight = newExpanded
          ? "none"
          : `${MAX_COLLAPSED_HEIGHT}px`;
      }
      return newExpanded;
    });
  };

  if (!visible) {
    return null;
  }

  return (
    <div className="flex flex-col gap-[20px] animate-in fade-in duration-300">
      <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[10px] lg:p-[20px] shadow-card">
        <h2 className="text-[16px] lg:text-[26px] font-semibold flex items-center gap-[10px]">
          {proposalContent?.value?.title}
        </h2>

        <div className="flex items-center gap-[20px] lg:gap-[5px] text-[12px] lg:text-[16px]">
          <div className="flex items-center gap-[5px]">
            <span className="hidden lg:block">Proposed by</span>
            {address && (
              <AddressWithAvatar
                address={address}
                avatarSize={24}
                className="gap-[5px] font-semibold"
              />
            )}
          </div>
        </div>
      </div>

      {proposalContent?.value?.discussion && (
        <div className="flex flex-col gap-[20px] p-[10px] lg:p-[20px] rounded-[14px] bg-card shadow-card">
          <div className="flex flex-col gap-[12px]">
            <h3 className="text-[18px] font-semibold text-foreground border-b border-card-background pb-[20px]">
              Offchain discussion
            </h3>
            <a
              href={proposalContent.value.discussion}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[14px] lg:text-[18px] font-semibold hover:underline"
            >
              {proposalContent.value.discussion}
            </a>
          </div>
        </div>
      )}

      {!!sanitizedHtml && (
        <div className="flex flex-col gap-[20px] bg-card p-[10px] lg:p-[20px] rounded-[14px] shadow-card">
          <div className="flex flex-col gap-[12px]">
            <div
              ref={markdownRef}
              className="markdown-body"
              style={{
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  whiteSpace: "wrap",
                  wordWrap: "break-word",
                }}
                className="text-balance"
                dangerouslySetInnerHTML={{
                  __html: sanitizedHtml,
                }}
              />
            </div>
            {showToggle && (
              <div
                className="flex flex-col border-t border-card-background pt-[20px] text-center cursor-pointer hover:opacity-80 transition-opacity duration-300"
                onClick={toggleExpanded}
              >
                <span>{isExpanded ? "Show less" : "Show more"}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <ActionsPanel actions={actions} />
    </div>
  );
};
