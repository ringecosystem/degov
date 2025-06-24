import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { getBotAddress } from "@/services/ai-agent";

import { useDaoConfig } from "./useDaoConfig";

export const useAiBotAddress = (address?: `0x${string}`) => {
  const daoConfig = useDaoConfig();
  const { data: botAddress } = useQuery({
    queryKey: ["bot-address", daoConfig?.aiAgent?.endpoint],
    queryFn: () => getBotAddress(daoConfig?.aiAgent?.endpoint ?? ""),
    enabled: !!daoConfig?.aiAgent?.endpoint && !!address,
  });

  const isAiBot = useMemo(() => {
    return botAddress?.data?.address?.toLowerCase() === address?.toLowerCase();
  }, [botAddress, address]);

  return isAiBot;
};
