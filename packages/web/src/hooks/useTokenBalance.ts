import { erc20Abi } from "viem";
import { useBalance, useReadContract, useAccount } from "wagmi";

import type { TokenInfo } from "@/components/token-select";

import { useDaoConfig } from "./useDaoConfig";

export function useTokenBalance(token: TokenInfo | null) {
  const { address: userAddress } = useAccount();
  const daoConfig = useDaoConfig();
  const { data: nativeBalance, isLoading: isNativeLoading } = useBalance({
    address: userAddress,
    chainId: daoConfig?.network?.chainId,
    query: {
      enabled:
        !!token?.isNative && !!userAddress && !!daoConfig?.network?.chainId,
    },
  });

  const { data: tokenBalance, isLoading: isTokenLoading } = useReadContract({
    abi: erc20Abi,
    address: token?.address,
    functionName: "balanceOf",
    args: [userAddress!],
    chainId: daoConfig?.network?.chainId,
    query: {
      enabled:
        !token?.isNative &&
        !!token?.address &&
        !!userAddress &&
        !!daoConfig?.network?.chainId,
    },
  });

  return {
    balance: token?.isNative ? nativeBalance?.value : tokenBalance,
    isLoading: isNativeLoading || isTokenLoading,
  };
}
