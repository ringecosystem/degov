import { isAddress } from "viem";
import { z } from "zod";

import { isValidAbi } from "@/utils/abi";
import { generateHash } from "@/utils/helpers";

/**
 * Proposal content schema
 */
export const proposalSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(80, "Title must be less than 80 characters"),
  markdown: z
    .string()
    .min(1, "Proposal description is required")
    .refine((val) => {
      if (!val) return false;
      const cleanContent = val
        .replace(/<[^>]*>/g, "")
        .replace(/\u200B/g, "")
        .replace(/\s/g, "");

      return cleanContent.length > 0;
    }, "Proposal description is required"),
  discussion: z
    .string()
    .optional()
    .refine((val) => {
      if (!val) return true; // Optional field, empty is valid
      // Basic URL validation
      try {
        new URL(val);
        return true;
      } catch {
        return false;
      }
    }, "Must be a valid URL"),
});

export type ProposalContent = z.infer<typeof proposalSchema>;

/**
 * Transfer content schema
 */
export const transferSchema = z.object({
  recipient: z
    .string()
    .refine((val) => isAddress(val), "Must be a valid Ethereum address"),
  amount: z
    .string()
    .min(1, "Amount is required")
    .refine(
      (val) => !isNaN(Number(val)) && Number(val) > 0,
      "Amount must be greater than 0"
    ),
});

export type TransferContent = z.infer<typeof transferSchema>;

/**
 * custom schema
 */
export const calldataItemSchema = z
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
      message: "Parameter value is required and must match the argument type",
      path: ["value"],
    }
  );
export type CalldataItem = z.infer<typeof calldataItemSchema>;

export const calldataSchema = z.object({
  calldataItems: z.array(calldataItemSchema),
});

export type Calldata = z.infer<typeof calldataSchema>;

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

export const customActionSchema = z.object({
  target: z
    .string()
    .min(1, "Target address is required")
    .refine((val) => isAddress(val), "Must be a valid eth address"),
  contractType: z.string(),
  contractMethod: z.string(),
  calldata: z.array(calldataItemSchema).optional(),
  value: z
    .string()
    .optional()
    .refine(
      (val) => !val || (!isNaN(Number(val)) && Number(val) >= 0),
      "Value must be a non-negative number"
    ),
  customAbiContent: z.array(z.any()).refine((val) => {
    if (!val) return false;
    if (Array.isArray(val) && val.length === 0) return false;
    try {
      return isValidAbi(val);
    } catch {
      return false;
    }
  }, "Must be a valid ABI JSON file"),
});

export type CustomContent = z.infer<typeof customActionSchema>;

export const transactionSchema = z.object({
  from: z
    .string()
    .refine((val) => isAddress(val), "Must be a valid Ethereum address"),
  to: z
    .string()
    .refine((val) => isAddress(val), "Must be a valid Ethereum address"),
  value: z.string(),
  calldata: z.string(),
});

export type TransactionContent = z.infer<typeof transactionSchema>;

export const crossChainCallParamsSchema = z.object({
  toChainId: z.string(),
  toDapp: z
    .string()
    .refine((val) => isAddress(val), "Must be a valid Ethereum address"),
  message: z.string(),
  params: z.string(),
});

export const crossChainCallSchema = z.object({
  port: z
    .string()
    .refine((val) => isAddress(val), "Must be a valid Ethereum address"),
  value: z.string(),
  function: z.string(),
  params: crossChainCallParamsSchema,
});

export type CrossChainCallContent = z.infer<typeof crossChainCallSchema>;

export const xaccountSchema = z
  .object({
    sourceChainId: z.number(),
    targetChainId: z.number(),
    crossChainCallHash: z.string(),
    transaction: transactionSchema,
    crossChainCall: crossChainCallSchema,
  })
  .refine(
    (data) => {
      const calculatedHash = generateHash(data.crossChainCall);
      return calculatedHash === data.crossChainCallHash;
    },
    {
      message: "Cross-chain call hash verification failed",
      path: ["crossChainCallHash"],
    }
  );

export type XAccountContent = z.infer<typeof xaccountSchema>;
