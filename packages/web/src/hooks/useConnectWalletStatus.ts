import { useMemo } from "react";
import { useAccount } from "wagmi";

import { useConfig } from "@/hooks/useConfig";

export function useConnectWalletStatus() {
  const daoConfig = useConfig();
  const { address, isConnected, chainId } = useAccount();

  const isCorrectNetwork = useMemo(
    () => daoConfig?.network?.chainId === chainId,
    [chainId, daoConfig?.network?.chainId]
  );

  const activeAddress = useMemo(
    () => (isConnected && isCorrectNetwork ? address : undefined),
    [address, isConnected, isCorrectNetwork]
  );

  const errorMessage = useMemo(() => {
    if (!isConnected) return "Please connect your wallet";
    if (!isCorrectNetwork)
      return `Please switch to ${
        daoConfig?.network?.name || "correct"
      } network`;
    return undefined;
  }, [isConnected, isCorrectNetwork, daoConfig?.network?.name]);

  return {
    activeAddress,
    isConnected,
    isCorrectNetwork,
    errorMessage,
    chainId: daoConfig?.network?.chainId,
  };
}
