import { type Abi } from "viem";
import { createPublicClient, custom, getContract } from "viem";

// Add these types
type AbiParameter = {
  name: string;
  type: string;
  indexed?: boolean;
  components?: AbiParameter[];
  internalType?: string;
};

type AbiFunctionItem = {
  type: "function";
  name: string;
  inputs: AbiParameter[];
  outputs: AbiParameter[];
  stateMutability: "pure" | "view" | "nonpayable" | "payable";
};

type AbiEventItem = {
  type: "event";
  name: string;
  inputs: AbiParameter[];
  anonymous?: boolean;
};

export type AbiItem = AbiFunctionItem | AbiEventItem;

const dummyClient = createPublicClient({
  transport: custom({
    request: async () => {
      throw new Error(
        "This is a dummy client, does not execute actual requests"
      );
    },
  }),
});

// Validate ABI JSON
export const isValidAbi = (abiJson: Abi | readonly unknown[]) => {
  if (!abiJson || !Array.isArray(abiJson) || !abiJson.length) return false;

  try {
    // Try to create a contract instance with the ABI
    getContract({
      abi: abiJson, // Input ABI JSON
      address: "0x0000000000000000000000000000000000000000", // Virtual address
      client: dummyClient,
    });
    return true;
  } catch (error) {
    console.warn("error", error);
    return false;
  }
};
