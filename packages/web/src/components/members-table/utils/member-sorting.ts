import type { ContributorItem } from "@/services/graphql/types";

import type { MemberSortState } from "../types";

type MemberComparator = (a: ContributorItem, b: ContributorItem) => number;

const compareNullableNumber = (
  valueA: number | null | undefined,
  valueB: number | null | undefined
) => {
  const aIsNull = valueA === null || valueA === undefined;
  const bIsNull = valueB === null || valueB === undefined;

  if (aIsNull && bIsNull) return 0;
  if (aIsNull) return 1;
  if (bIsNull) return -1;
  if (valueA === valueB) return 0;
  return valueA > valueB ? 1 : -1;
};

const compareNullableBigInt = (
  valueA: bigint | null | undefined,
  valueB: bigint | null | undefined
) => {
  const aIsNull = valueA === null || valueA === undefined;
  const bIsNull = valueB === null || valueB === undefined;

  if (aIsNull && bIsNull) return 0;
  if (aIsNull) return 1;
  if (bIsNull) return -1;
  if (valueA === valueB) return 0;
  return valueA > valueB ? 1 : -1;
};

const parseTimestamp = (value?: string | null) => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const parsePower = (value?: string | null) => {
  if (!value) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
};

const parseDelegators = (value?: number | null) => {
  if (value === null || value === undefined) return null;
  return value;
};

export function createMemberComparator(
  sortState: MemberSortState
): MemberComparator {
  const directionMultiplier = sortState.direction === "asc" ? 1 : -1;

  switch (sortState.field) {
    case "power":
      return (a, b) => {
        const valueA = parsePower(a.power ?? null);
        const valueB = parsePower(b.power ?? null);
        return compareNullableBigInt(valueA, valueB) * directionMultiplier;
      };
    case "delegators":
      return (a, b) => {
        const valueA = parseDelegators(a.delegatesCountAll ?? null);
        const valueB = parseDelegators(b.delegatesCountAll ?? null);
        return compareNullableNumber(valueA, valueB) * directionMultiplier;
      };
    case "lastVoted":
      return (a, b) => {
        const valueA = parseTimestamp(a.blockTimestamp ?? null);
        const valueB = parseTimestamp(b.blockTimestamp ?? null);
        return compareNullableNumber(valueA, valueB) * directionMultiplier;
      };
    default:
      return () => 0;
  }
}

export function mergeWithBotMember(
  members: ContributorItem[],
  botMember: ContributorItem,
  sortState: MemberSortState
): ContributorItem[] {
  const comparator = createMemberComparator(sortState);
  const filteredMembers = members.filter(
    (member) => member.id !== botMember.id
  );

  if (!filteredMembers.length) {
    return [botMember];
  }

  const insertIndex = filteredMembers.findIndex(
    (member) => comparator(botMember, member) < 0
  );

  if (insertIndex === -1) {
    return [...filteredMembers, botMember];
  }

  return [
    ...filteredMembers.slice(0, insertIndex),
    botMember,
    ...filteredMembers.slice(insertIndex),
  ];
}
