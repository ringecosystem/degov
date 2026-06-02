import { useQuery } from "@tanstack/react-query";
import { isObject } from "lodash-es";
import { useMemo } from "react";

export function useChainInfo() {
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["chain-info"],
    queryFn: () =>
      fetch(
        "https://raw.githubusercontent.com/Koniverse/SubWallet-ChainList/master/packages/chain-list/src/data/ChainInfo.json"
      ).then((res) => res.json()),
    staleTime: 1000 * 60 * 60 * 24, // cache for 1 day
    gcTime: 1000 * 60 * 60 * 24, // garbage collection time, equivalent to the old cacheTime
  });

  const flatChainInfo = useMemo(() => {
    if (isObject(data)) {
      const chainInfo = Object.values(data || {});
      const obj: Record<
        string,
        {
          name: string;
          blockExplorer: string;
          chainId: string;
          icon: string;
        }
      > = {};
      chainInfo
        ?.filter((v) => !!v?.evmInfo)
        .forEach((v) => {
          obj[v?.evmInfo?.evmChainId] = {
            name: v.name,
            blockExplorer: v.evmInfo.blockExplorer,
            chainId: v.evmInfo.evmChainId,
            icon: v.icon,
          };
        });
      return obj;
    }
    return {};
  }, [data]);

  return {
    chainInfo: flatChainInfo,
    isLoading,
    isFetching,
    error,
  };
}
