import { z } from "zod";

import type { Action } from "@/app/proposals/new/type";

export const PROPOSAL_DRAFT_PAYLOAD_VERSION = 1;

const boundedString = (max: number) => z.string().max(max);
const actionID = boundedString(100).min(1);
const addressLike = boundedString(256);

const proposalAction = z.object({
  id: actionID,
  type: z.literal("proposal"),
  content: z.object({
    title: boundedString(1_000).optional(),
    markdown: boundedString(900_000).optional(),
    discussion: boundedString(4_096).optional(),
  }),
});

const transferAction = z.object({
  id: actionID,
  type: z.literal("transfer"),
  content: z.object({
    recipient: addressLike,
    amount: boundedString(256),
  }),
});

const calldataItem = z.object({
  name: boundedString(256),
  type: boundedString(256),
  value: z.union([
    boundedString(20_000),
    z.array(boundedString(20_000)).max(1_000),
  ]),
  isArray: z.boolean(),
});

const customAction = z.object({
  id: actionID,
  type: z.literal("custom"),
  content: z.object({
    target: addressLike,
    contractType: boundedString(256),
    contractMethod: boundedString(512),
    calldata: z.array(calldataItem).max(1_000).optional(),
    value: boundedString(256).optional(),
    customAbiContent: z.array(z.unknown()).max(2_000),
  }),
});

const xAccountAction = z.object({
  id: actionID,
  type: z.literal("xaccount"),
  content: z.object({
    sourceChainId: z.number().finite().optional(),
    targetChainId: z.number().finite().optional(),
    crossChainCallHash: boundedString(256).optional(),
    transaction: z
      .object({
        from: addressLike.optional(),
        to: addressLike.optional(),
        value: boundedString(256).optional(),
        calldata: boundedString(900_000).optional(),
      })
      .optional(),
    crossChainCall: z
      .object({
        port: addressLike.optional(),
        value: boundedString(256).optional(),
        function: boundedString(512).optional(),
        params: z
          .object({
            toChainId: boundedString(256).optional(),
            toDapp: addressLike.optional(),
            message: boundedString(900_000).optional(),
            params: boundedString(900_000).optional(),
          })
          .optional(),
      })
      .optional(),
  }),
});

const draftAction = z.discriminatedUnion("type", [
  proposalAction,
  transferAction,
  customAction,
  xAccountAction,
]);

export const proposalDraftDocumentSchema = z
  .object({
    actions: z.array(draftAction).min(1).max(100),
    activeActionId: actionID.nullable(),
    tab: z.enum(["edit", "add", "preview"]),
  })
  .superRefine((document, context) => {
    const ids = new Set(document.actions.map((action) => action.id));
    if (ids.size !== document.actions.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Draft action IDs must be unique",
        path: ["actions"],
      });
    }
    if (document.actions[0]?.type !== "proposal") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Draft must start with a proposal action",
        path: ["actions", 0],
      });
    }
    if (
      document.activeActionId !== null &&
      !ids.has(document.activeActionId)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Active action does not exist",
        path: ["activeActionId"],
      });
    }
  });

export interface ProposalDraftDocument {
  actions: Action[];
  activeActionId: string | null;
  tab: "edit" | "add" | "preview";
}

export function parseProposalDraftDocument(
  payload: string,
  version: number
): ProposalDraftDocument {
  if (version !== PROPOSAL_DRAFT_PAYLOAD_VERSION) {
    throw new Error("unsupported_draft_version");
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(payload);
  } catch {
    throw new Error("invalid_draft_payload");
  }
  const result = proposalDraftDocumentSchema.safeParse(decoded);
  if (!result.success) {
    throw new Error("invalid_draft_payload");
  }
  return result.data as ProposalDraftDocument;
}

export function serializeProposalDraftDocument(
  document: ProposalDraftDocument
): string {
  return JSON.stringify(proposalDraftDocumentSchema.parse(document));
}

export function proposalDraftTitle(actions: Action[]): string {
  const proposal = actions.find((action) => action.type === "proposal");
  return proposal?.content?.title?.trim() || "Untitled draft";
}

export function hasMeaningfulProposalDraftContent(actions: Action[]): boolean {
  if (actions.length > 1) return true;
  const proposal = actions[0];
  if (!proposal || proposal.type !== "proposal") return false;
  const title = proposal.content?.title?.trim() ?? "";
  const discussion = proposal.content?.discussion?.trim() ?? "";
  const markdown = (proposal.content?.markdown ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/\u200B/g, "")
    .trim();
  return Boolean(title || discussion || markdown);
}
