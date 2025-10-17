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
  formattedRawBalance?: string;
  chainId?: number;
  decimals?: number;
}

export interface UseTokenBalancesReturn {
  assets: TokenWithBalance[];
  isLoading: boolean;
  isError: boolean;
}

type UseTokenBalancesOptions = {
  address?: string;
  chainId?: number | string;
  enabled?: boolean;
};

const toOptionalNumber = (value?: number | string) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

export function useTokenBalances(
  assets: TokenDetails[],
  options: UseTokenBalancesOptions = {}
): UseTokenBalancesReturn {
  const daoConfig = useDaoConfig();
  const resolvedAddress =
    options.address ??
    daoConfig?.contracts?.timeLock ??
    daoConfig?.contracts?.governor;
  const resolvedChainId =
    toOptionalNumber(options.chainId) ?? daoConfig?.chain?.id;
  const isEnabled = options.enabled ?? true;

  const { tokenInfo } = useGetTokenInfo(
    assets.map((v) => ({
      contract: v.contract,
      standard: v.standard,
    })),
    {
      chainId: resolvedChainId,
      enabled: isEnabled && resolvedChainId !== undefined,
    }
  );
  const contractCalls = useMemo(() => {
    if (
      !resolvedAddress ||
      !isEnabled ||
      resolvedChainId === undefined ||
      isEmpty(assets)
    )
      return [];

    return assets
      .filter((asset) => asset.contract && asset.standard)
      .map((asset) => ({
        address: asset.contract as `0x${string}`,
        abi: asset.standard === "ERC20" ? erc20Abi : erc721Abi,
        functionName: "balanceOf",
        args: [resolvedAddress as `0x${string}`],
        chainId: resolvedChainId,
      }));
  }, [assets, isEnabled, resolvedAddress, resolvedChainId]);

  const {
    data: balanceResults,
    isLoading,
    isError,
  } = useReadContracts({
    contracts: contractCalls,
    query: {
      enabled:
        isEnabled &&
        contractCalls.length > 0 &&
        Boolean(resolvedAddress) &&
        resolvedChainId !== undefined,
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
          formattedRawBalance: formatUnits(rawBalance ?? 0n, 0),
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
          formattedRawBalance: formatUnits(rawBalance ?? 0n, decimals ?? 18),
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
