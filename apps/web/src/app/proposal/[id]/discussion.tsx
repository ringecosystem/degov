"use client";

import DOMPurify from "dompurify";
import { MessageSquare, Pencil, Reply, RotateCcw, Trash2 } from "lucide-react";
import { marked } from "marked";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useAccount } from "wagmi";

import { AddressWithAvatar } from "@/components/address-with-avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEnsureAuth } from "@/hooks/useEnsureAuth";
import { useProposalComments } from "@/hooks/useProposalComments";
import type { ProposalComment } from "@/services/graphql/types/proposal-comments";
import { formatShortAddress } from "@/utils/address";
import { formatTimeAgo } from "@/utils/date";
import {
  extractErrorMessage,
  isAuthenticationRequired,
} from "@/utils/graphql-error-handler";

import { threadProposalComments } from "./comment-tree";

const MAX_COMMENT_LENGTH = 10_000;
const MAX_VISUAL_REPLY_DEPTH = 3;
const replyIndentClasses = [
  "",
  "ms-[18px] border-s border-border/40 ps-[14px] sm:ms-[30px] sm:ps-[20px]",
  "ms-[32px] border-s border-border/40 ps-[14px] sm:ms-[50px] sm:ps-[20px]",
  "ms-[46px] border-s border-border/40 ps-[14px] sm:ms-[70px] sm:ps-[20px]",
];

function MarkdownComment({ body }: { body: string }) {
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(body) as string),
    [body]
  );

  return (
    <div
      className="markdown-body text-[14px] leading-relaxed break-words"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

interface CommentRowProps {
  comment: ProposalComment;
  depth?: number;
  replyTarget?: ProposalComment;
  currentAddress?: string;
  isPending: boolean;
  editingId: string | null;
  editBody: string;
  replyingTo: string | null;
  replyBody: string;
  onEditStart: (comment: ProposalComment) => void;
  onEditBodyChange: (value: string) => void;
  onEditCancel: () => void;
  onEditSave: (comment: ProposalComment) => void;
  onReplyStart: (commentId: string) => void;
  onReplyBodyChange: (value: string) => void;
  onReplyCancel: () => void;
  onReplySave: (comment: ProposalComment) => void;
  onDelete: (comment: ProposalComment) => void;
}

function CommentRow({
  comment,
  depth = 0,
  replyTarget,
  currentAddress,
  isPending,
  editingId,
  editBody,
  replyingTo,
  replyBody,
  onEditStart,
  onEditBodyChange,
  onEditCancel,
  onEditSave,
  onReplyStart,
  onReplyBodyChange,
  onReplyCancel,
  onReplySave,
  onDelete,
}: CommentRowProps) {
  const t = useTranslations("proposalDetail.discussion");
  const isAuthor =
    currentAddress?.toLowerCase() === comment.authorAddress.toLowerCase();
  const isDeleted = comment.state === "DELETED";
  const isEditing = editingId === comment.id;
  const isReplying = replyingTo === comment.id;

  return (
    <article
      className={replyIndentClasses[Math.min(depth, MAX_VISUAL_REPLY_DEPTH)]}
    >
      <div className="flex items-start gap-[12px] py-[18px]">
        <div className="min-w-0 flex-1">
          {depth > 1 && replyTarget && (
            <p
              className="mb-[7px] text-[12px] text-muted-foreground break-words"
              title={replyTarget.authorAddress}
            >
              {t("replyingTo", {
                address: formatShortAddress(replyTarget.authorAddress),
              })}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[4px]">
            <AddressWithAvatar
              address={comment.authorAddress}
              avatarSize={26}
              className="gap-[8px]"
              textClassName="text-[13px] font-medium"
            />
            <span className="text-[12px] text-muted-foreground">
              {formatTimeAgo(String(new Date(comment.ctime).getTime()))}
              {comment.utime ? ` · ${t("edited")}` : ""}
            </span>
          </div>

          <div className="mt-[10px]">
            {isDeleted ? (
              <p className="text-[14px] italic text-muted-foreground">
                {t("deleted")}
              </p>
            ) : isEditing ? (
              <div className="space-y-[10px]">
                <Textarea
                  value={editBody}
                  maxLength={MAX_COMMENT_LENGTH}
                  disabled={isPending}
                  onChange={(event) => onEditBodyChange(event.target.value)}
                />
                <div className="flex gap-[8px]">
                  <Button
                    size="sm"
                    disabled={!editBody.trim()}
                    isLoading={isPending}
                    onClick={() => onEditSave(comment)}
                  >
                    {t("save")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={onEditCancel}>
                    {t("cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <MarkdownComment body={comment.body ?? ""} />
            )}
          </div>

          {!isDeleted && !isEditing && (
            <div className="mt-[10px] flex items-center gap-[4px]">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-muted-foreground"
                onClick={() => onReplyStart(comment.id)}
              >
                <Reply />
                {t("reply")}
              </Button>
              {isAuthor && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-muted-foreground"
                    onClick={() => onEditStart(comment)}
                  >
                    <Pencil />
                    {t("edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-muted-foreground hover:text-destructive"
                    disabled={isPending}
                    onClick={() => onDelete(comment)}
                  >
                    <Trash2 />
                    {t("delete")}
                  </Button>
                </>
              )}
            </div>
          )}

          {isReplying && (
            <div className="mt-[12px] space-y-[10px]">
              <Textarea
                autoFocus
                value={replyBody}
                maxLength={MAX_COMMENT_LENGTH}
                placeholder={t("replyPlaceholder")}
                disabled={isPending}
                onChange={(event) => onReplyBodyChange(event.target.value)}
              />
              <div className="flex gap-[8px]">
                <Button
                  size="sm"
                  disabled={!replyBody.trim()}
                  isLoading={isPending}
                  onClick={() => onReplySave(comment)}
                >
                  {t("reply")}
                </Button>
                <Button size="sm" variant="ghost" onClick={onReplyCancel}>
                  {t("cancel")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function Discussion({
  daoCode,
  proposalId,
}: {
  daoCode: string;
  proposalId: string;
}) {
  const t = useTranslations("proposalDetail.discussion");
  const { address } = useAccount();
  const { ensureAuth, isAuthenticating } = useEnsureAuth();
  const { query, create, update, remove } = useProposalComments(
    daoCode,
    proposalId
  );
  const [body, setBody] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [mutationError, setMutationError] = useState<string | null>(null);

  const comments = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data]
  );
  const threadedComments = useMemo(
    () => threadProposalComments(comments),
    [comments]
  );

  const isPending =
    isAuthenticating || create.isPending || update.isPending || remove.isPending;

  const runAuthenticated = async (
    action: (walletAddress: string) => Promise<unknown>
  ) => {
    setMutationError(null);
    const auth = await ensureAuth();
    if (!auth.success || !address) {
      setMutationError(auth.error ?? t("authCancelled"));
      return false;
    }
    try {
      await action(address);
      return true;
    } catch (error) {
      if (isAuthenticationRequired(error)) {
        const retryAuth = await ensureAuth();
        if (retryAuth.success) {
          try {
            await action(address);
            return true;
          } catch (retryError) {
            error = retryError;
          }
        }
      }
      setMutationError(extractErrorMessage(error) ?? t("mutationFailed"));
      return false;
    }
  };

  const createComment = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    if (
      await runAuthenticated((walletAddress) =>
        create.mutateAsync({
          input: { daoCode, proposalId, body: trimmed },
          address: walletAddress,
        })
      )
    ) {
      setBody("");
    }
  };

  const sharedRowProps = {
    currentAddress: address,
    isPending,
    editingId,
    editBody,
    replyingTo,
    replyBody,
    onEditStart: (comment: ProposalComment) => {
      setEditingId(comment.id);
      setEditBody(comment.body ?? "");
      setReplyingTo(null);
    },
    onEditBodyChange: setEditBody,
    onEditCancel: () => setEditingId(null),
    onEditSave: async (comment: ProposalComment) => {
      const trimmed = editBody.trim();
      if (!trimmed) return;
      if (
        await runAuthenticated((walletAddress) =>
          update.mutateAsync({
            input: { daoCode, commentId: comment.id, body: trimmed },
            address: walletAddress,
          })
        )
      ) {
        setEditingId(null);
      }
    },
    onReplyStart: (commentId: string) => {
      setReplyingTo(commentId);
      setReplyBody("");
      setEditingId(null);
    },
    onReplyBodyChange: setReplyBody,
    onReplyCancel: () => setReplyingTo(null),
    onReplySave: async (comment: ProposalComment) => {
      const trimmed = replyBody.trim();
      if (!trimmed) return;
      if (
        await runAuthenticated((walletAddress) =>
          create.mutateAsync({
            input: {
              daoCode,
              proposalId,
              body: trimmed,
              replyToId: comment.id,
            },
            address: walletAddress,
          })
        )
      ) {
        setReplyingTo(null);
        setReplyBody("");
      }
    },
    onDelete: async (comment: ProposalComment) => {
      if (!window.confirm(t("deleteConfirm"))) return;
      await runAuthenticated((walletAddress) =>
        remove.mutateAsync({
          input: { daoCode, commentId: comment.id },
          address: walletAddress,
        })
      );
    },
  };

  if (query.isLoading) {
    return (
      <div className="space-y-[18px] py-[8px]" aria-label={t("loading")}>
        {[0, 1, 2].map((item) => (
          <div key={item} className="animate-pulse space-y-[10px]">
            <div className="h-5 w-36 rounded bg-muted" />
            <div className="h-4 w-full rounded bg-muted/60" />
          </div>
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center gap-[14px] text-center">
        <MessageSquare className="size-7 text-muted-foreground" />
        <div>
          <p className="font-semibold">{t("unavailable")}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t("unavailableDescription")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => query.refetch()}>
          <RotateCcw />
          {t("retry")}
        </Button>
      </div>
    );
  }

  return (
    <section className="max-w-[780px]">
      <div className="border-b border-border/30 pb-[20px]">
        <Textarea
          value={body}
          maxLength={MAX_COMMENT_LENGTH}
          placeholder={t("placeholder")}
          disabled={isPending}
          className="min-h-[96px] resize-y"
          onChange={(event) => setBody(event.target.value)}
        />
        <div className="mt-[10px] flex items-center justify-between gap-[12px]">
          <span className="text-[12px] text-muted-foreground">
            {t("markdownSupported")}
          </span>
          <Button
            size="sm"
            disabled={!body.trim()}
            isLoading={isPending}
            onClick={createComment}
          >
            {t("comment")}
          </Button>
        </div>
        {mutationError && (
          <p role="alert" className="mt-[10px] text-[13px] text-destructive">
            {mutationError}
          </p>
        )}
      </div>

      {threadedComments.length === 0 ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
          <MessageSquare className="size-7 text-muted-foreground" />
          <p className="mt-[12px] font-semibold">{t("empty")}</p>
          <p className="mt-1 max-w-[340px] text-[13px] text-muted-foreground">
            {t("emptyDescription")}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/30">
          {threadedComments.map(({ comment, depth, replyTarget }) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              depth={depth}
              replyTarget={replyTarget}
              {...sharedRowProps}
            />
          ))}
        </div>
      )}

      {query.hasNextPage && (
        <div className="flex justify-center border-t border-border/30 pt-[18px]">
          <Button
            variant="ghost"
            isLoading={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            {t("loadMore")}
          </Button>
        </div>
      )}
    </section>
  );
}
