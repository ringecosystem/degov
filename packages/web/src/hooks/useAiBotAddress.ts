import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { proposalService } from "@/services/graphql";
import { QUERY_CONFIGS } from "@/utils/query-config";

export const useAiBotAddress = (address?: `0x${string}`) => {
  const { data: botAddress } = useQuery({
    queryKey: ["bot-address"],
    queryFn: () => proposalService.getBotAddress(),
    enabled: !!address,
    ...QUERY_CONFIGS.STATIC,
  });

  const isAiBot = useMemo(() => {
    return botAddress?.toLowerCase() === address?.toLowerCase();
  }, [botAddress, address]);

  return {
    isAiBot,
    botAddress: botAddress?.toLowerCase() ?? undefined,
  };
};
