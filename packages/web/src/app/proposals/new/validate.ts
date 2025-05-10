import { z } from "zod";

import {
  calldataItemSchema,
  customActionSchema,
  proposalSchema,
  transferSchema,
} from "./schema";
import { xaccountSchema } from "./schema";

import type { CustomContent, ProposalContent, TransferContent } from "./schema";
import type { XAccountContent } from "./schema";

export const validateProposal = (data: ProposalContent) => {
  const result = proposalSchema.safeParse(data);

  return {
    success: result.success,
    data: result.success ? result.data : null,
    errors: result.success ? null : result.error.flatten(),
  };
};

export const isValidProposal = (
  data: ProposalContent
): data is z.infer<typeof proposalSchema> => {
  return proposalSchema.safeParse(data).success;
};

export const validateTransfer = (data: TransferContent) => {
  const result = transferSchema.safeParse(data);

  return {
    success: result.success,
    data: result.success ? result.data : null,
    errors: result.success ? null : result.error.flatten(),
  };
};

export const isValidTransfer = (
  data: TransferContent
): data is z.infer<typeof transferSchema> => {
  return transferSchema.safeParse(data).success;
};

export const validateCustom = (content: CustomContent) => {
  const baseSchema = customActionSchema.extend({
    calldata: content.contractMethod
      ? z.array(calldataItemSchema).min(1, "Calldata is required")
      : z.array(calldataItemSchema).optional(),
    value: z.string().optional(),
  });
  return baseSchema.safeParse(content);
};

export const isValidCustom = (
  data: CustomContent
): data is z.infer<typeof customActionSchema> => {
  return customActionSchema.safeParse(data).success;
};

export const validateXAccount = (data: XAccountContent) => {
  const result = xaccountSchema.safeParse(data);

  return {
    success: result.success,
    data: result.success ? result.data : null,
    errors: result.success ? null : result.error.flatten(),
  };
};

export const isValidXAccount = (
  data: XAccountContent
): data is z.infer<typeof xaccountSchema> => {
  return xaccountSchema.safeParse(data).success;
};
