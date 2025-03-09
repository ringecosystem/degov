import { useCallback } from "react";

import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useGovernanceToken } from "@/hooks/useGovernanceToken";
import { formatBigIntForDisplay } from "@/utils/number";

export function useFormatGovernanceTokenAmount() {
  const daoConfig = useDaoConfig();
  const { data: governanceToken } = useGovernanceToken();

  const formatTokenAmount = useCallback(
    (amount: bigint) => {
      if (daoConfig?.contracts?.governorToken?.standard === "ERC721") {
        return {
          formatted: formatBigIntForDisplay(amount, 0),
          raw: amount,
        };
      } else if (daoConfig?.contracts?.governorToken?.standard === "ERC20") {
        return {
          formatted: formatBigIntForDisplay(
            amount,
            governanceToken?.decimals ?? 18
          ),
          raw: amount,
        };
      }
      return {
        formatted: "0",
        raw: 0n,
      };
    },
    [governanceToken, daoConfig?.contracts?.governorToken?.standard]
  );

  return formatTokenAmount;
}
