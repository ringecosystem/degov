import type { ProposalComment } from "@/services/graphql/types/proposal-comments";

export interface ThreadedProposalComment {
  comment: ProposalComment;
  depth: number;
  replyTarget?: ProposalComment;
}

function invalidParentChains(
  commentsById: Map<string, ProposalComment>
) {
  const invalidById = new Map<string, boolean>();

  for (const comment of commentsById.values()) {
    if (invalidById.has(comment.id)) continue;

    const path: ProposalComment[] = [];
    const pathIds = new Set<string>();
    let current: ProposalComment | undefined = comment;
    let invalid = false;

    while (current) {
      const resolved = invalidById.get(current.id);
      if (resolved !== undefined) {
        invalid = resolved;
        break;
      }
      if (pathIds.has(current.id)) {
        invalid = true;
        break;
      }
      path.push(current);
      pathIds.add(current.id);
      current = current.replyToId
        ? commentsById.get(current.replyToId)
        : undefined;
    }

    for (const item of path) invalidById.set(item.id, invalid);
  }

  return invalidById;
}

export function threadProposalComments(comments: ProposalComment[]) {
  const commentsById = new Map<string, ProposalComment>();
  for (const comment of comments) {
    if (!commentsById.has(comment.id)) commentsById.set(comment.id, comment);
  }
  const invalidById = invalidParentChains(commentsById);

  const childrenById = new Map<string, ProposalComment[]>();
  const roots: ProposalComment[] = [];

  for (const comment of commentsById.values()) {
    const parent = comment.replyToId
      ? commentsById.get(comment.replyToId)
      : undefined;
    if (!parent || invalidById.get(comment.id)) {
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
