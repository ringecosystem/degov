"use client";
import {
  darkTheme,
  RainbowKitProvider,
  RainbowKitAuthenticationProvider,
} from "@rainbow-me/rainbowkit";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import * as React from "react";
import { WagmiProvider, deserialize, serialize } from "wagmi";

import { createConfig, queryClient } from "@/config/wagmi";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import "@rainbow-me/rainbowkit/styles.css";
import { authenticationAdapter } from "@/lib/rainbowkit-auth";

import type { Chain } from "@rainbow-me/rainbowkit";

const dark = darkTheme({
  borderRadius: "medium",
  accentColor: "hsl(var(--nextui-primary-500))",
});

export function DAppProvider({ children }: React.PropsWithChildren<unknown>) {
  const dappConfig = useDaoConfig();

  if (!dappConfig) {
    return null;
  }

  const currentChain: Chain = {
    id: Number(dappConfig.network?.chainId),
    name: dappConfig.network?.name ?? "",
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
    appName: dappConfig?.name,
    projectId: dappConfig?.walletConnectProjectId,
    chain: currentChain,
  });

  return (
    <WagmiProvider config={config}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister }}
      >
        <RainbowKitAuthenticationProvider
          adapter={authenticationAdapter}
          status="unauthenticated"
        >
          <RainbowKitProvider
            theme={dark}
            locale="en-US"
            appInfo={{ appName: dappConfig?.name }}
            initialChain={currentChain}
          >
            {children}
          </RainbowKitProvider>
        </RainbowKitAuthenticationProvider>
      </PersistQueryClientProvider>
    </WagmiProvider>
  );
}
