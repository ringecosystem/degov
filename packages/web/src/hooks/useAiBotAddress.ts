import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { getBotAddress } from "@/services/ai-agent";

export const useAiBotAddress = (address: `0x${string}`) => {
  const { data: botAddress } = useQuery({
    queryKey: ["bot-address"],
    queryFn: () => getBotAddress(),
  });

  const isAiBot = useMemo(() => {
    return botAddress?.data?.address.toLowerCase() === address.toLowerCase();
  }, [botAddress, address]);

  return isAiBot;
};
