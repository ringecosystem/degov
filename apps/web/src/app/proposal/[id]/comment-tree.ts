import type { ProposalComment } from "@/services/graphql/types/proposal-comments";

export interface ThreadedProposalComment {
  comment: ProposalComment;
  depth: number;
  replyTarget?: ProposalComment;
}

function hasInvalidParentChain(
  comment: ProposalComment,
  commentsById: Map<string, ProposalComment>
) {
  const visited = new Set([comment.id]);
  let parentId = comment.replyToId;

  while (parentId) {
    if (visited.has(parentId)) return true;
    visited.add(parentId);
    parentId = commentsById.get(parentId)?.replyToId;
  }

  return false;
}

export function threadProposalComments(comments: ProposalComment[]) {
  const commentsById = new Map<string, ProposalComment>();
  for (const comment of comments) {
    if (!commentsById.has(comment.id)) commentsById.set(comment.id, comment);
  }

  const childrenById = new Map<string, ProposalComment[]>();
  const roots: ProposalComment[] = [];

  for (const comment of commentsById.values()) {
    const parent = comment.replyToId
      ? commentsById.get(comment.replyToId)
      : undefined;
    if (!parent || hasInvalidParentChain(comment, commentsById)) {
      roots.push(comment);
      continue;
    }
    childrenById.set(parent.id, [
      ...(childrenById.get(parent.id) ?? []),
      comment,
    ]);
  }

  const threaded: ThreadedProposalComment[] = [];
  const visited = new Set<string>();
  const appendThread = (root: ProposalComment) => {
    const pending = [{ comment: root, depth: 0 }];
    while (pending.length > 0) {
      const current = pending.pop();
      if (!current || visited.has(current.comment.id)) continue;
      visited.add(current.comment.id);
      threaded.push({
        ...current,
        replyTarget: current.comment.replyToId
          ? commentsById.get(current.comment.replyToId)
          : undefined,
      });

      const children = childrenById.get(current.comment.id) ?? [];
      for (let index = children.length - 1; index >= 0; index -= 1) {
        pending.push({ comment: children[index], depth: current.depth + 1 });
      }
    }
  };

  for (const root of roots) appendThread(root);
  for (const comment of commentsById.values()) appendThread(comment);

  return threaded;
}
