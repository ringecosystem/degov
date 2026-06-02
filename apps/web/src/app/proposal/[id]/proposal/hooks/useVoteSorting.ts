import { useCallback, useMemo, useState } from "react";

import type { ProposalVoterItem } from "@/services/graphql/types";

export type VoteSortField = "date" | "power";
export type VoteSortDirection = "asc" | "desc";

export interface VoteSortState {
  field: VoteSortField;
  direction: VoteSortDirection;
}

const DEFAULT_SORT_STATE: VoteSortState = {
  field: "date",
  direction: "desc",
};

const parseTimestamp = (timestamp: string) => {
  const parsed = Number(timestamp);
  if (Number.isNaN(parsed)) return 0;
  return parsed > 10_000_000_000 ? parsed : parsed * 1000;
};

const parseWeight = (weight?: string) => {
  try {
    return weight ? BigInt(weight) : 0n;
  } catch {
    return 0n;
  }
};

export const useVoteSorting = (comments: ProposalVoterItem[]) => {
  const [sortState, setSortState] =
    useState<VoteSortState>(DEFAULT_SORT_STATE);

  const sortedComments = useMemo(() => {
    if (!comments.length) return [];

    return comments.slice().sort((a, b) => {
      let compareValue = 0;

      if (sortState.field === "date") {
        compareValue =
          parseTimestamp(a.blockTimestamp) - parseTimestamp(b.blockTimestamp);
      } else {
        const weightA = parseWeight(a.weight);
        const weightB = parseWeight(b.weight);
        if (weightA > weightB) {
          compareValue = 1;
        } else if (weightA < weightB) {
          compareValue = -1;
        } else {
          compareValue = 0;
        }
      }

      return sortState.direction === "desc" ? compareValue * -1 : compareValue;
    });
  }, [comments, sortState]);

  const applySortState = useCallback(
    (field: VoteSortField, direction?: VoteSortDirection) => {
      if (!direction) {
        setSortState(DEFAULT_SORT_STATE);
        return;
      }

      setSortState({ field, direction });
    },
    []
  );

  const handleDateSortChange = useCallback(
    (direction?: VoteSortDirection) => applySortState("date", direction),
    [applySortState]
  );

  const handlePowerSortChange = useCallback(
    (direction?: VoteSortDirection) => applySortState("power", direction),
    [applySortState]
  );

  return {
    sortState,
    sortedComments,
    handleDateSortChange,
    handlePowerSortChange,
    resetSort: () => setSortState(DEFAULT_SORT_STATE),
  };
};
