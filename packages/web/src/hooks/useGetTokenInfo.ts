import { useMemo } from "react";
import { erc20Abi, erc721Abi } from "viem";
import { useReadContracts } from "wagmi";

import type { Abi } from "viem";

type TokenDetails = {
  contract: string;
  standard: string;
};

export const useGetTokenInfo = (tokenList: TokenDetails[]) => {
  const baseContract = useMemo(() => {
    return tokenList.map((v) => {
      return {
        address: v.contract as `0x${string}`,
        abi: v.standard === "ERC20" ? erc20Abi : erc721Abi,
        standard: v.standard,
      };
    });
  }, [tokenList]);

  const contractCalls = useMemo(() => {
    const calls: {
      address: `0x${string}`;
      abi: Abi;
      functionName: string;
    }[] = [];

    baseContract.forEach((contract) => {
      calls.push({
        address: contract.address,
        abi: contract.abi,
        functionName: "symbol",
      });
    });

    baseContract.forEach((contract) => {
      if (contract.standard === "ERC20") {
        calls.push({
          address: contract.address,
          abi: contract.abi,
          functionName: "decimals",
        });
      }
    });

    return calls;
  }, [baseContract]);

  const symbolResults = useReadContracts({
    contracts: contractCalls,
    query: {
      enabled: contractCalls.length > 0,
    },
  });

  const tokenInfo = useMemo(() => {
    if (!baseContract || baseContract.length === 0) {
      return {};
    }

    const result: { [key: string]: { symbol: string; decimals: number } } = {};
    const tokenCount = baseContract.length;

    for (let i = 0; i < tokenCount; i++) {
      const contractAddress = baseContract[i].address;
      const standard = baseContract[i].standard;
      const symbolData = symbolResults.data?.[i]?.result;

      try {
        let decimalsValue = 0;

        if (standard === "ERC20") {
          const decimalsData =
            symbolResults.data?.[
              tokenCount +
                baseContract.findIndex(
                  (c) => c.standard === "ERC20" && c.address === contractAddress
                )
            ];

          if (decimalsData !== undefined) {
            decimalsValue =
              typeof decimalsData === "bigint"
                ? Number(decimalsData)
                : typeof decimalsData === "number"
                ? decimalsData
                : 18;
          }
        }

        if (symbolData !== undefined) {
          result[contractAddress] = {
            symbol: String(symbolData),
            decimals: decimalsValue,
          };
        }
      } catch (error) {
        console.error(
          `Error processing token data for ${contractAddress}:`,
          error
        );
      }
    }

    return result;
  }, [baseContract, symbolResults.data]);

  return {
    tokenInfo,
    isFetching: symbolResults.isFetching,
    isError: symbolResults.isError,
    error: symbolResults.error,
    getTokenInfo: (address: string) =>
      tokenInfo[address as `0x${string}`] || null,
  };
};
