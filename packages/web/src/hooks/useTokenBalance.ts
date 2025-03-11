import { erc20Abi } from "viem";
import { useBalance, useReadContract, useAccount } from "wagmi";

import type { TokenInfo } from "@/components/token-select";

import { useDaoConfig } from "./useDaoConfig";

export function useTokenBalance(token: TokenInfo | null) {
  const { address: userAddress } = useAccount();
  const daoConfig = useDaoConfig();
  const { data: nativeBalance, isLoading: isNativeLoading } = useBalance({
    address: userAddress,
    chainId: daoConfig?.chain?.id,
    query: {
      enabled: !!token?.isNative && !!userAddress && !!daoConfig?.chain?.id,
    },
  });

  const { data: tokenBalance, isLoading: isTokenLoading } = useReadContract({
    abi: erc20Abi,
    address: token?.address,
    functionName: "balanceOf",
    args: [userAddress!],
    chainId: daoConfig?.chain?.id,
    query: {
      enabled:
        !token?.isNative &&
        !!token?.address &&
        !!userAddress &&
        !!daoConfig?.chain?.id,
    },
  });

  return {
    balance: token?.isNative ? nativeBalance?.value : tokenBalance,
    isLoading: isNativeLoading || isTokenLoading,
  };
}
