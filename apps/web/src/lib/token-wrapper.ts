import { isAddress, parseUnits, zeroAddress } from "viem";

import type { Config } from "../types/config";
import type { Address, Hash } from "viem";

export type WrapperAction = "approve" | "wrap" | "unwrap" | "delegate";

export function getTokenWrapper(config: Config) {
  const token = config.contracts?.governorToken;
  const wrapper = token?.wrapper;
  if (
    token?.standard !== "ERC20" ||
    wrapper?.type !== "erc20-wrapper" ||
    !Number.isSafeInteger(config.chain?.id) || config.chain.id <= 0 ||
    !isAddress(token.address) || !isAddress(wrapper.underlyingToken) ||
    !isAddress(config.contracts.governor) ||
    [token.address, wrapper.underlyingToken, config.contracts.governor]
      .some((address) => address.toLowerCase() === zeroAddress) ||
    token.address.toLowerCase() === wrapper.underlyingToken.toLowerCase()
  ) return null;

  return {
    address: token.address as Address,
    underlying: wrapper.underlyingToken as Address,
    governor: config.contracts.governor as Address,
    chainId: config.chain.id,
  };
}

// Reject excess precision instead of allowing parseUnits to round an amount.
export function parseWrapperAmount(input: string, decimals: number): bigint | null {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) return null;
  if (!/^\d+(?:\.\d+)?$/.test(input)) return null;
  if ((input.split(".")[1]?.length ?? 0) > decimals) return null;
  const amount = parseUnits(input, decimals);
  return amount > 0n && amount < 2n ** 256n ? amount : null;
}

export function wrapperAction(mode: "wrap" | "unwrap", amount: bigint, allowance: bigint): WrapperAction {
  return mode === "unwrap" ? "unwrap" : allowance < amount ? "approve" : "wrap";
}

export function readWrapperValues(data: readonly unknown[] | undefined, wrapper: ReturnType<typeof getTokenWrapper>) {
  if (!wrapper || !data || data.length !== 11 ||
    typeof data[0] !== "string" || data[0].toLowerCase() !== wrapper.underlying.toLowerCase() ||
    typeof data[1] !== "string" || data[1].toLowerCase() !== wrapper.address.toLowerCase() ||
    typeof data[2] !== "string" || typeof data[3] !== "string" ||
    typeof data[4] !== "number" || !Number.isInteger(data[4]) || data[4] < 0 || data[4] > 255 || data[4] !== data[5] ||
    typeof data[6] !== "bigint" || typeof data[7] !== "bigint" ||
    typeof data[8] !== "bigint" || typeof data[9] !== "string" || !isAddress(data[9]) ||
    typeof data[10] !== "bigint") return undefined;
  return {
    underlyingSymbol: data[2], symbol: data[3], decimals: data[4],
    underlyingBalance: data[6], balance: data[7], allowance: data[8],
    delegate: data[9], votes: data[10],
  };
}

// Keep signing, confirmation and readback separate. A submitted hash is not success.
export async function confirmWrapperTransaction({
  assertContext,
  simulate,
  write,
  wait,
  onSubmitted,
}: {
  assertContext: () => void;
  simulate: () => Promise<void>;
  write: () => Promise<Hash>;
  wait: (hash: Hash, onReplaced: (replacement: {
    reason: "repriced" | "cancelled" | "replaced";
    transactionReceipt: { transactionHash: Hash };
  }) => void) => Promise<{ status: "success" | "reverted" }>;
  onSubmitted: (hash: Hash) => void;
}) {
  assertContext();
  await simulate();
  assertContext();
  const hash = await write();
  onSubmitted(hash);
  let currentHash = hash;
  let replaced = false;
  const receipt = await wait(hash, (replacement) => {
    currentHash = replacement.transactionReceipt.transactionHash;
    onSubmitted(currentHash);
    if (replacement.reason !== "repriced") replaced = true;
  });
  if (replaced) throw new Error("Transaction cancelled or replaced. Check your wallet and try again.");
  if (receipt.status !== "success") throw new Error("Transaction reverted");
  return currentHash;
}
