import DOMPurify from "dompurify";
import { marked } from "marked";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";

import { AddressWithAvatar } from "@/components/address-with-avatar";
import { OffchainDiscussionIcon } from "@/components/icons";

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
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const proposalContent = useMemo(() => {
    if (actions[0]?.type === "proposal") {
      const content = actions[0]?.content as ProposalContent;
      return {
        title: content.title?.trim() || "Untitled",
        markdown: content.markdown ?? "",
        discussion: content.discussion,
      };
    }

    return {
      title: "Untitled",
      markdown: "",
      discussion: undefined,
    };
  }, [actions]);

  const sanitizedHtml = useMemo(() => {
    const html = marked.parse(proposalContent.markdown ?? "") as string;
    if (!html) return "";
    return DOMPurify.sanitize(html);
  }, [proposalContent.markdown]);

  // Use layout effect to measure DOM synchronously after render
  // This avoids the cascading setState issue by measuring in the layout phase
  useLayoutEffect(() => {
    if (!sanitizedHtml || !markdownRef.current) {
      if (showToggle) {
        // Schedule the state update to avoid synchronous setState
        updateTimeoutRef.current = setTimeout(() => {
          setShowToggle(false);
        }, 0);
      }
      return () => {
        if (updateTimeoutRef.current) {
          clearTimeout(updateTimeoutRef.current);
        }
      };
    }

    const updateHeight = () => {
      if (!markdownRef.current) return;
      const height = markdownRef.current.scrollHeight;
      const needsToggle = height > MAX_COLLAPSED_HEIGHT;
      if (needsToggle !== showToggle) {
        setShowToggle(needsToggle);
      }
    };

    updateHeight();

    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [sanitizedHtml, showToggle]);

  const toggleExpanded = () => {
    setIsExpanded((prev) => !prev);
  };

  if (!visible) {
    return null;
  }

  return (
    <div className="flex flex-col gap-[20px] animate-in fade-in duration-300">
      <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[10px] lg:p-[20px] shadow-card">
        <h2 className="text-[16px] lg:text-[26px] font-semibold flex items-center gap-[10px]">
          {proposalContent.title}
        </h2>

        <div className="flex items-center gap-[10px] text-[12px] lg:text-[16px]">
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
          {proposalContent.discussion && (
            <>
              <div className="w-px h-[10px] bg-muted-foreground" />
              <a
                href={proposalContent.discussion}
                target="_blank"
                rel="noopener noreferrer"
                className="w-5 h-5 bg-light rounded-full flex justify-center items-center hover:opacity-80 transition-opacity"
                title="Discussion"
              >
                <OffchainDiscussionIcon
                  width={12}
                  height={12}
                  className="text-dark"
                />
              </a>
            </>
          )}
        </div>
      </div>

      {!!sanitizedHtml && (
        <div className="flex flex-col gap-[20px] bg-card p-[10px] lg:p-[20px] rounded-[14px] shadow-card">
          <div className="flex flex-col gap-[12px]">
            <div
              ref={markdownRef}
              className="markdown-body"
              style={{
                maxHeight:
                  showToggle && !isExpanded
                    ? `${MAX_COLLAPSED_HEIGHT}px`
                    : "none",
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
