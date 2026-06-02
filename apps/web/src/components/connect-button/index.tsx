"use client";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useTranslations } from "next-intl";
import { useAccount } from "wagmi";

import { useDaoConfig } from "@/hooks/useDaoConfig";

import { Button } from "../ui/button";

import { Connected } from "./connected";

export const ConnectButton = ({
  onMenuToggle,
}: {
  onMenuToggle?: () => void;
}) => {
  const { openConnectModal } = useConnectModal();
  const dappConfig = useDaoConfig();
  const t = useTranslations("common.connect");
  const { chainId, address, isConnected, isConnecting, isReconnecting } =
    useAccount();

  if (isConnecting || isReconnecting) {
    return null;
  }

  if (!isConnected && openConnectModal) {
    return (
      <Button
        onClick={() => {
          openConnectModal();
          onMenuToggle?.();
        }}
        className="rounded-[100px] flex-1 max-w-[200px]"
      >
        {t("connectWallet")}
      </Button>
    );
  }

  if (Number(chainId) !== Number(dappConfig?.chain?.id)) {
    return (
      <Button variant="destructive" className="cursor-auto rounded-[100px]">
        {t("errorChain")}
      </Button>
    );
  }

  if (address) {
    return (
      <div className="flex items-center gap-[10px]">
        <Connected address={address} onMenuToggle={onMenuToggle} />
      </div>
    );
  }

  return null;
};
