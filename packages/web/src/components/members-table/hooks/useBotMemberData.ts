import { useQuery } from "@tanstack/react-query";

import { useDaoConfig } from "@/hooks/useDaoConfig";
import { getBotAddress } from "@/services/ai-agent";
import { contributorService } from "@/services/graphql";
import type { ContributorItem } from "@/services/graphql/types";

export function useBotMemberData() {
  const daoConfig = useDaoConfig();

  const {
    data: botAddressData,
    isPending: isBotAddressLoading,
    error: botAddressError,
  } = useQuery({
    queryKey: ["bot-address", daoConfig?.aiAgent?.endpoint],
    queryFn: () => getBotAddress(daoConfig?.aiAgent?.endpoint ?? ""),
    enabled: !!daoConfig?.aiAgent?.endpoint, // only run if endpoint is ready
    staleTime: 60 * 60 * 1000, // cache 1h – rarely changes
  });

  const {
    data: contributor,
    isPending: isContributorLoading,
    error: contributorError,
  } = useQuery<ContributorItem | null>({
    queryKey: [
      "bot-contributor",
      botAddressData?.data?.address,
      daoConfig?.indexer?.endpoint,
    ],
    queryFn: async () => {
      const address = botAddressData?.data?.address?.toLowerCase();
      if (!address) return null;

      const [result] = await contributorService.getAllContributors(
        daoConfig?.indexer?.endpoint ?? "",
        {
          limit: 1,
          offset: 0,
          where: {
            id_in: [address],
          },
        }
      );

      return result ?? null;
    },
    enabled: !!botAddressData?.data?.address && !!daoConfig?.indexer?.endpoint,
    staleTime: 60 * 1000,
    retry: 2,
  });

  return {
    data: contributor,
    isLoading: isBotAddressLoading || isContributorLoading,
    error: botAddressError || contributorError,
  };
}
