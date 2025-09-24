import { useCallback, useMemo } from "react";

import { useQuorum } from "./useGovernanceParams";

/**
 * Provides helpers to express a voting power amount as a percentage of the current quorum.
 */
export function useVotingPowerAgainstQuorum() {
  const { quorum, isLoading, isFetching } = useQuorum();

  const normalizedQuorum = useMemo(() => quorum ?? 0n, [quorum]);

  const calculatePercentage = useCallback(
    (power?: bigint | null) => {
      if (power === null || power === undefined || normalizedQuorum === 0n) {
        return 0;
      }

      return Number((power * 10000n) / normalizedQuorum) / 100;
    },
    [normalizedQuorum]
  );

  const formatPercentage = useCallback(
    (power?: bigint | null, fractionDigits = 2) =>
      `${calculatePercentage(power).toFixed(fractionDigits)}%`,
    [calculatePercentage]
  );

  return {
    quorum: normalizedQuorum,
    isLoading: isLoading || isFetching,
    calculatePercentage,
    formatPercentage,
  };
}
