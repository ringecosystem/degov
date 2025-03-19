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

const persister = createSyncStoragePersister({
  serialize,
  storage: typeof window !== "undefined" ? window.localStorage : undefined,
  deserialize,
});
export function DAppProvider({ children }: React.PropsWithChildren<unknown>) {
  const dappConfig = useDaoConfig();
  const currentChain: Chain = React.useMemo(() => {
    return {
      id: Number(dappConfig?.chain?.id),
      name: dappConfig?.chain?.name ?? "",
      nativeCurrency: {
        name: dappConfig?.chain?.nativeToken?.symbol ?? "",
        symbol: dappConfig?.chain?.nativeToken?.symbol ?? "",
        decimals: dappConfig?.chain?.nativeToken?.decimals ?? 18,
      },
      rpcUrls: {
        default: {
          http: dappConfig?.chain?.rpcs ?? [],
        },
      },
      blockExplorers: {
        default: {
          name: "Explorer",
          url: dappConfig?.chain?.explorers?.[0] ?? "",
        },
      },
      contracts: dappConfig?.chain?.contracts ?? {
        multicall3: {
          address: "0xcA11bde05977b3631167028862bE2a173976CA11",
        },
      },
    };
  }, [dappConfig]);

  const config = React.useMemo(() => {
    return createConfig({
      appName: dappConfig?.name ?? "",
      projectId: dappConfig?.wallet?.walletConnectProjectId ?? "",
      chain: currentChain,
    });
  }, [dappConfig, currentChain]);

  if (!dappConfig) {
    return null;
  }

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
            id={
              dappConfig?.chain?.id ? String(dappConfig?.chain?.id) : undefined
            }
          >
            {children}
          </RainbowKitProvider>
        </RainbowKitAuthenticationProvider>
      </PersistQueryClientProvider>
    </WagmiProvider>
  );
}
