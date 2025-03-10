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
import { useConfig } from "@/hooks/useConfig";
import "@rainbow-me/rainbowkit/styles.css";
import { authenticationAdapter } from "@/lib/rainbowkit-auth";

import type { Chain } from "@rainbow-me/rainbowkit";

const dark = darkTheme({
  borderRadius: "medium",
  accentColor: "hsl(var(--nextui-primary-500))",
});

export function DAppProvider({ children }: React.PropsWithChildren<unknown>) {
  const dappConfig = useConfig();
  // const [isLoading, setIsLoading] = React.useState(true);
  // const [isAuthenticated, setIsAuthenticated] = React.useState(false);

  // React.useEffect(() => {
  //   const token = localStorage.getItem("token");
  //   if (token) {

  //     setIsAuthenticated(true);
  //   }
  // }, []);

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
        <RainbowKitAuthenticationProvider
          adapter={authenticationAdapter}
          status="authenticated"
        >
          <RainbowKitProvider
            theme={dark}
            locale="en-US"
            appInfo={{ appName: dappConfig?.daoName }}
            initialChain={currentChain}
          >
            {children}
          </RainbowKitProvider>
        </RainbowKitAuthenticationProvider>
      </PersistQueryClientProvider>
    </WagmiProvider>
  );
}
