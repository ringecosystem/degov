import { Contributor } from "../../model";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export interface DelegateCountAdjustment {
  address: string;
  delta: number;
}

export interface ContributorCountDeltaContext {
  delegate: string;
  delta: number;
  blockNumber: bigint;
  blockTimestamp: bigint;
  transactionHash: string;
  existingContributor?: Contributor | null;
}

export interface ContributorCountDeltaResult {
  contributor: Contributor;
  isNew: boolean;
}

/**
 * 计算委托变更带来的计数增量，剔除零地址与自委托无意义的场景。
 */
export function buildDelegateCountAdjustments(
  fromDelegate?: string,
  toDelegate?: string
): DelegateCountAdjustment[] {
  const normalizedFrom = normalize(fromDelegate);
  const normalizedTo = normalize(toDelegate);

  if (normalizedFrom && normalizedTo && normalizedFrom === normalizedTo) {
    return [];
  }

  const adjustments: DelegateCountAdjustment[] = [];

  if (normalizedFrom && normalizedFrom !== ZERO_ADDRESS) {
    adjustments.push({ address: normalizedFrom, delta: -1 });
  }

  if (normalizedTo && normalizedTo !== ZERO_ADDRESS) {
    adjustments.push({ address: normalizedTo, delta: 1 });
  }

  return adjustments;
}

/**
 * 依据增量计算贡献者新的 delegateCount，并返回是否为新建记录。
 */
export function prepareContributorCountUpdate(
  context: ContributorCountDeltaContext
): ContributorCountDeltaResult {
  const normalized = normalize(context.delegate);
  if (!normalized) {
    throw new Error("delegate address is required");
  }

  const contributor = context.existingContributor
    ? context.existingContributor
    : new Contributor({
        id: normalized,
        blockNumber: context.blockNumber,
        blockTimestamp: context.blockTimestamp,
        transactionHash: context.transactionHash,
        power: 0n,
        delegateCount: 0,
      });

  contributor.id = normalized;
  contributor.blockNumber = context.blockNumber;
  contributor.blockTimestamp = context.blockTimestamp;
  contributor.transactionHash = context.transactionHash;
  contributor.delegateCount = Math.max(
    0,
    (contributor.delegateCount ?? 0) + context.delta
  );

  return {
    contributor,
    isNew: !context.existingContributor,
  };
}

function normalize(address?: string): string | undefined {
  return address ? address.toLowerCase() : undefined;
}
