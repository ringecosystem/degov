import { erc20Abi } from 'viem';
import { useBalance, useReadContract, useAccount } from 'wagmi';

import type { TokenInfo } from '@/components/token-select';

export function useTokenBalance(token: TokenInfo | null) {
  const { address: userAddress } = useAccount();

  const { data: nativeBalance, isLoading: isNativeLoading } = useBalance({
    address: userAddress,
    query: {
      enabled: !!token?.isNative && !!userAddress
    }
  });

  const { data: tokenBalance, isLoading: isTokenLoading } = useReadContract({
    abi: erc20Abi,
    address: token?.address,
    functionName: 'balanceOf',
    args: [userAddress!],
    query: {
      enabled: !token?.isNative && !!token?.address && !!userAddress
    }
  });

  return {
    balance: token?.isNative ? nativeBalance?.value : tokenBalance,
    isLoading: isNativeLoading || isTokenLoading
  };
}
