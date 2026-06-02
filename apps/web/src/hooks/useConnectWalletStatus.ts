import { useMemo } from "react";
import { useAccount } from "wagmi";

import { useDaoConfig } from "@/hooks/useDaoConfig";

export function useConnectWalletStatus() {
  const daoConfig = useDaoConfig();
  const { address, isConnected, chainId } = useAccount();

  const isCorrectNetwork = useMemo(
    () => daoConfig?.chain?.id === chainId,
    [chainId, daoConfig?.chain?.id]
  );

  const activeAddress = useMemo(
    () => (isConnected && isCorrectNetwork ? address : undefined),
    [address, isConnected, isCorrectNetwork]
  );

  const errorMessage = useMemo(() => {
    if (!isConnected) return "Please connect your wallet";
    if (!isCorrectNetwork)
      return `Please switch to ${daoConfig?.chain?.name || "correct"} network`;
    return undefined;
  }, [isConnected, isCorrectNetwork, daoConfig?.chain?.name]);

  return {
    activeAddress,
    isConnected,
    isCorrectNetwork,
    errorMessage,
    chainId: daoConfig?.chain?.id,
  };
}
