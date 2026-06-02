import { isAddress } from "viem";
import { z } from "zod";

import { isValidAbi } from "@/utils/abi";
import { generateHash } from "@/utils/helpers";

type TranslationFn = (
  key: string,
  values?: Record<string, string | number | Date>
) => string;

/**
 * Proposal content schema
 */
export const createProposalSchema = (t: TranslationFn) =>
  z.object({
    title: z
      .string()
      .min(1, t("proposal.validation.titleRequired"))
      .max(80, t("proposal.validation.titleMax")),
    markdown: z
      .string()
      .min(1, t("proposal.validation.descriptionRequired"))
      .refine((val) => {
        if (!val) return false;
        const cleanContent = val
          .replace(/<[^>]*>/g, "")
          .replace(/\u200B/g, "")
          .replace(/\s/g, "");

        return cleanContent.length > 0;
      }, t("proposal.validation.descriptionRequired")),
    discussion: z
      .string()
      .optional()
      .refine((val) => {
        if (!val) return true;
        try {
          new URL(val);
          return true;
        } catch {
          return false;
        }
      }, t("proposal.validation.discussionUrl")),
  });

export type ProposalContent = z.infer<ReturnType<typeof createProposalSchema>>;

/**
 * Transfer content schema
 */
export const createTransferSchema = (t: TranslationFn) =>
  z.object({
    recipient: z
      .string()
      .refine((val) => isAddress(val), t("transfer.errors.recipientAddress")),
    amount: z
      .string()
      .min(1, t("transfer.errors.amountRequired"))
      .refine(
        (val) => !isNaN(Number(val)) && Number(val) > 0,
        t("transfer.errors.amountPositive")
      ),
  });

export type TransferContent = z.infer<ReturnType<typeof createTransferSchema>>;

/**
 * custom schema
 */
export const createCalldataItemSchema = (t: TranslationFn) =>
  z
    .object({
      name: z.string(),
      type: z.string(),
      value: z.union([z.string(), z.array(z.string())]),
      isArray: z.boolean(),
    })
    .refine(
      (data) => {
        return isValidCalldataValue(data.value, data.type);
      },
      {
        message: t("custom.validation.parameterValue"),
        path: ["value"],
      }
    );
export type CalldataItem = z.infer<ReturnType<typeof createCalldataItemSchema>>;

export const createCalldataSchema = (t: TranslationFn) =>
  z.object({
    calldataItems: z.array(createCalldataItemSchema(t)),
  });

export type Calldata = z.infer<ReturnType<typeof createCalldataSchema>>;

export const isValidCalldataValue = (
  value: string | string[],
  type: string
): boolean => {
  try {
    const baseType = type.replace("[]", "");
    const isArray = type.endsWith("[]");

    if (isArray) {
      if (!Array.isArray(value)) return false;
      if (value.length === 0) return false;
      return value.every((item) => isValidSingleValue(item, baseType));
    }

    if (typeof value !== "string") return false;
    return isValidSingleValue(value, type);
  } catch {
    return false;
  }
};

const isValidSingleValue = (value: string, type: string): boolean => {
  if (!value || value.trim() === "") return false;

  switch (true) {
    case type === "address":
      return isAddress(value);

    case type === "bool":
      return ["true", "false"].includes(value.toLowerCase());

    case type === "string":
      return true;

    case /^(u?int)(\d+)?$/.test(type): {
      const numMatch = type.match(/^(u?int)(\d+)?$/);
      const [, numType, bits = "256"] = numMatch || [];
      const size = parseInt(bits);

      try {
        const num = BigInt(value);
        if (numType === "uint") {
          return num >= 0n && num <= 2n ** BigInt(size) - 1n;
        } else {
          const max = 2n ** BigInt(size - 1) - 1n;
          const min = -(2n ** BigInt(size - 1));
          return num >= min && num <= max;
        }
      } catch {
        return false;
      }
    }

    case /^bytes(\d+)?$/.test(type): {
      const bytesMatch = type.match(/^bytes(\d+)?$/);
      const [, size] = bytesMatch || [];

      if (!value.startsWith("0x")) return false;
      if (size && value.length !== parseInt(size) * 2 + 2) return false;
      return /^0x[0-9a-fA-F]*$/.test(value);
    }

    default:
      return false;
  }
};

export const createCustomActionSchema = (t: TranslationFn) =>
  z.object({
    target: z
      .string()
      .min(1, t("custom.validation.targetRequired"))
      .refine((val) => isAddress(val), t("custom.validation.targetAddress")),
    contractType: z.string(),
    contractMethod: z.string(),
    calldata: z.array(createCalldataItemSchema(t)).optional(),
    value: z
      .string()
      .optional()
      .refine(
        (val) => !val || (!isNaN(Number(val)) && Number(val) >= 0),
        t("custom.validation.valueNonNegative")
      ),
    customAbiContent: z.array(z.any()).refine((val) => {
      if (!val) return false;
      if (Array.isArray(val) && val.length === 0) return false;
      try {
        return isValidAbi(val);
      } catch {
        return false;
      }
    }, t("custom.validation.validAbi")),
  });

export type CustomContent = z.infer<ReturnType<typeof createCustomActionSchema>>;

export const createTransactionSchema = (t: TranslationFn) =>
  z.object({
    from: z
      .string()
      .refine((val) => isAddress(val), t("xaccount.validation.address")),
    to: z
      .string()
      .refine((val) => isAddress(val), t("xaccount.validation.address")),
    value: z.string(),
    calldata: z.string(),
  });

export type TransactionContent = z.infer<ReturnType<typeof createTransactionSchema>>;

export const createCrossChainCallParamsSchema = (t: TranslationFn) =>
  z.object({
    toChainId: z.string(),
    toDapp: z
      .string()
      .refine((val) => isAddress(val), t("xaccount.validation.address")),
    message: z.string(),
    params: z.string(),
  });

export const createCrossChainCallSchema = (t: TranslationFn) =>
  z.object({
    port: z
      .string()
      .refine((val) => isAddress(val), t("xaccount.validation.address")),
    value: z.string(),
    function: z.string(),
    params: createCrossChainCallParamsSchema(t),
  });

export type CrossChainCallContent = z.infer<
  ReturnType<typeof createCrossChainCallSchema>
>;

export const createXaccountSchema = (t: TranslationFn) =>
  z
    .object({
      sourceChainId: z.number(),
      targetChainId: z.number(),
      crossChainCallHash: z.string(),
      transaction: createTransactionSchema(t),
      crossChainCall: createCrossChainCallSchema(t),
    })
    .refine(
      (data) => {
        const calculatedHash = generateHash(data.crossChainCall);
        return calculatedHash === data.crossChainCallHash;
      },
      {
        message: t("xaccount.validation.hashFailed"),
        path: ["crossChainCallHash"],
      }
    );

export type XAccountContent = z.infer<ReturnType<typeof createXaccountSchema>>;
