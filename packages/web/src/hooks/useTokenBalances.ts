import { isEmpty } from "lodash-es";
import { useMemo } from "react";
import { erc20Abi, erc721Abi, formatUnits } from "viem";
import { useReadContracts } from "wagmi";

import type { TokenDetails } from "@/types/config";
import { formatBigIntForDisplay } from "@/utils/number";

import { useDaoConfig } from "./useDaoConfig";
import { useGetTokenInfo } from "./useGetTokenInfo";

export interface TokenWithBalance extends TokenDetails {
  rawBalance?: bigint;
  balance?: string;
  formattedBalance?: string;
  chainId?: number;
}

export interface UseTokenBalancesReturn {
  assets: TokenWithBalance[];
  isLoading: boolean;
  isError: boolean;
}

export function useTokenBalances(
  assets: TokenDetails[]
): UseTokenBalancesReturn {
  const daoConfig = useDaoConfig();
  const timeLockAddress = daoConfig?.contracts?.timeLock;
  const { tokenInfo } = useGetTokenInfo(
    assets.map((v) => ({
      contract: v.contract,
      standard: v.standard,
    }))
  );
  const contractCalls = useMemo(() => {
    if (!timeLockAddress || isEmpty(assets)) return [];

    return assets
      .filter((asset) => asset.contract && asset.standard)
      .map((asset) => ({
        address: asset.contract as `0x${string}`,
        abi: asset.standard === "ERC20" ? erc20Abi : erc721Abi,
        functionName: "balanceOf",
        args: [timeLockAddress as `0x${string}`],
        chainId: daoConfig?.chain?.id,
      }));
  }, [assets, timeLockAddress, daoConfig?.chain?.id]);

  const {
    data: balanceResults,
    isLoading,
    isError,
  } = useReadContracts({
    contracts: contractCalls,
    query: {
      enabled:
        contractCalls.length > 0 &&
        Boolean(timeLockAddress) &&
        Boolean(daoConfig?.chain?.id),
    },
  });

  const assetsWithBalances = useMemo(() => {
    if (!balanceResults || balanceResults.length === 0) return assets;

    return assets.map((asset, index) => {
      if (!balanceResults[index]) return asset;

      const rawBalance = balanceResults[index].result as bigint;

      if (asset.standard === "ERC721") {
        return {
          ...asset,
          rawBalance,
          balance: rawBalance ? rawBalance.toString() : "0",
          formattedBalance: formatBigIntForDisplay(rawBalance ?? 0n, 0),
        };
      } else {
        const decimals =
          tokenInfo[asset.contract as `0x${string}`]?.decimals ?? 18;
        const formattedBalance = rawBalance
          ? formatUnits(rawBalance, decimals)
          : 0;

        return {
          ...asset,
          rawBalance,
          balance: formattedBalance,
          formattedBalance: formatBigIntForDisplay(
            rawBalance ?? 0n,
            decimals ?? 18
          ),
        };
      }
    });
  }, [assets, balanceResults, tokenInfo]);

  return {
    assets: assetsWithBalances,
    isLoading,
    isError,
  };
}
