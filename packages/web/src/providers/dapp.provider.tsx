"use client";
import { darkTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import * as React from "react";
import { WagmiProvider, deserialize, serialize } from "wagmi";

import { createConfig, queryClient } from "@/config/wagmi";
import { useConfig } from "@/hooks/useConfig";

import "@rainbow-me/rainbowkit/styles.css";
import type { Chain } from "@rainbow-me/rainbowkit";

const dark = darkTheme({
  borderRadius: "medium",
  accentColor: "hsl(var(--nextui-primary-500))",
});

export function DAppProvider({ children }: React.PropsWithChildren<unknown>) {
  const dappConfig = useConfig();

  if (!dappConfig) {
    return null;
  }

  const currentChain: Chain = {
    id: Number(dappConfig.network?.chainId),
    name: dappConfig.network?.chain,
    nativeCurrency: {
      name: dappConfig.network?.nativeToken?.symbol,
      symbol: dappConfig.network?.nativeToken?.symbol,
      decimals: dappConfig.network?.nativeToken?.decimals,
    },
    rpcUrls: {
      default: {
        http: dappConfig.network?.rpc,
      },
    },
    blockExplorers: {
      default: {
        name: "Explorer",
        url: dappConfig.network?.explorer?.[0],
      },
    },
    contracts: {
      multicall3: {
        address: "0xcA11bde05977b3631167028862bE2a173976CA11",
      },
    },
  };

  const persister = createSyncStoragePersister({
    serialize,
    storage: window.localStorage,
    deserialize,
  });

  const config = createConfig({
    appName: dappConfig?.daoName,
    projectId: dappConfig?.walletConnectProjectId,
    chain: currentChain,
  });

  return (
    <WagmiProvider config={config}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister }}
      >
        <RainbowKitProvider
          theme={dark}
          locale="en-US"
          appInfo={{ appName: dappConfig?.daoName }}
          initialChain={currentChain}
        >
          {children}
        </RainbowKitProvider>
      </PersistQueryClientProvider>
    </WagmiProvider>
  );
}
