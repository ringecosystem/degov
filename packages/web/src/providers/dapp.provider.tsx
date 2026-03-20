"use client";

import {
  RainbowKitProvider,
  RainbowKitAuthenticationProvider,
} from "@rainbow-me/rainbowkit";
import { QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { WagmiProvider } from "wagmi";

import { LoadingState } from "@/components/ui/loading-spinner";
import { createConfig, createDaoChain, createQueryClient } from "@/config/wagmi";
import { useAuthStatus } from "@/hooks/useAuthStatus";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useMounted } from "@/hooks/useMounted";
import { useRainbowKitTheme } from "@/hooks/useRainbowKitTheme";
import { authenticationAdapter } from "@/lib/rainbowkit-auth";

import type { Chain } from "@rainbow-me/rainbowkit";

function RainbowKitProviders({ children }: React.PropsWithChildren<unknown>) {
  const rainbowKitTheme = useRainbowKitTheme();
  const authStatus = useAuthStatus();
  const dappConfig = useDaoConfig();

  const currentChain: Chain = React.useMemo(
    () => createDaoChain(dappConfig?.chain),
    [dappConfig?.chain]
  );

  return (
    <RainbowKitAuthenticationProvider
      adapter={authenticationAdapter}
      status={authStatus}
    >
      <RainbowKitProvider
        theme={rainbowKitTheme}
        locale="en-US"
        appInfo={{ appName: dappConfig?.name }}
        initialChain={currentChain}
        id={dappConfig?.chain?.id ? String(dappConfig?.chain?.id) : undefined}
      >
        {children}
      </RainbowKitProvider>
    </RainbowKitAuthenticationProvider>
  );
}

export function DAppProvider({ children }: React.PropsWithChildren<unknown>) {
  const dappConfig = useDaoConfig();
  const mounted = useMounted();
  const [queryClient] = React.useState(() => createQueryClient());

  const [wagmiConfig, setWagmiConfig] = React.useState<ReturnType<
    typeof createConfig
  > | null>(null);

  const currentChain: Chain = React.useMemo(
    () => createDaoChain(dappConfig?.chain),
    [dappConfig?.chain]
  );

  React.useEffect(() => {
    if (!mounted || !dappConfig) return;
    setWagmiConfig(
      createConfig({
        appName: dappConfig?.name ?? "",
        projectId: dappConfig?.wallet?.walletConnectProjectId ?? "",
        chain: currentChain,
      })
    );
  }, [mounted, dappConfig, currentChain]);

  if (!dappConfig || !wagmiConfig) {
    return (
      <div className="flex w-full h-screen items-center justify-center">
        <LoadingState
          title="Loading dApp"
          description="Loading dApp configuration, please wait..."
          className="-mt-[100px]"
        />
      </div>
    );
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProviders>{children}</RainbowKitProviders>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
