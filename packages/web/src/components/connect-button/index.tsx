"use client";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

import { useConfig } from "@/hooks/useConfig";
// import { useApi } from "@/hooks/useApi";

import { Button } from "../ui/button";

import { Connected } from "./connected";
import { SiweMessage } from "siwe";

// console.log(proposalsQuery);

export const ConnectButton = () => {
  const { openConnectModal } = useConnectModal();
  const dappConfig = useConfig();
  const { chainId, address, isConnected, isConnecting, isReconnecting } =
    useAccount();
  // const { refetch, ...proposalsQuery } = useApi();

  if (isConnecting || isReconnecting) {
    return null;
  }

  if (!isConnected && openConnectModal) {
    return (
      <Button onClick={openConnectModal} className="rounded-[100px]">
        Connect Wallet
      </Button>
    );
  }

  if (Number(chainId) !== Number(dappConfig?.network?.chainId)) {
    return (
      <Button variant="destructive" className="cursor-auto rounded-[100px]">
        Error Chain
      </Button>
    );
  }

  if (isConnected) {
    // const nonce = proposalsQuery.getNonce();
    // const siweMessage = new SiweMessage({
    //   domain: window.location.host,
    //   address,
    //   statement: "Please sign for identify (please change it)",
    //   uri: window.location.origin,
    //   version: "1",
    //   chainId: dappConfig?.network.chainId,
    //   nonce,
    // });
    // // sign message
    // const message = siweMessage.prepareMessage();
    // const signature = await signMessageAsync({ message });
    // const authorizationResponse = proposalsQuery.login({ message, signature });
    // const token = authorizationResponse.token;
    // all of others api, please set token for header Authorization: Bearer <TOKEN>
  }

  if (address) {
    return <Connected address={address} />;
  }

  return null;
};
