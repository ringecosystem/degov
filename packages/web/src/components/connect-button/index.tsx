"use client";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

import { useDaoConfig } from "@/hooks/useDaoConfig";

import { Button } from "../ui/button";

import { Connected } from "./connected";

export const ConnectButton = ({ onMenuToggle }: { onMenuToggle?: () => void }) => {
  const { openConnectModal } = useConnectModal();
  const dappConfig = useDaoConfig();
  const { chainId, address, isConnected, isConnecting, isReconnecting } =
    useAccount();

  if (isConnecting || isReconnecting) {
    return null;
  }

  if (!isConnected && openConnectModal) {
    return (
      <Button onClick={() => {
        openConnectModal();
        onMenuToggle?.();
      }} className="rounded-[100px] flex-1 max-w-[200px]">
        Connect Wallet
      </Button>
    );
  }

  if (Number(chainId) !== Number(dappConfig?.chain?.id)) {
    return (
      <Button variant="destructive" className="cursor-auto rounded-[100px]">
        Error Chain
      </Button>
    );
  }

  if (address) {
    return <Connected address={address} onMenuToggle={onMenuToggle} />;
  }

  return null;
};
