import { getDefaultWallets, getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  talismanWallet,
  okxWallet,
  imTokenWallet,
  trustWallet,
  safeWallet,
  subWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { QueryClient } from "@tanstack/react-query";
import { cookieStorage, createStorage } from "wagmi";
import { mainnet } from "wagmi/chains";

import type { Chain } from "@rainbow-me/rainbowkit";

const { wallets } = getDefaultWallets();

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // Keep data fresh longer to reduce refetch on route changes
      staleTime: 10_000,
      // Prevent unexpected garbage collection for a long time
      gcTime: 30 * 60 * 1000,
    },
  },
});

export function createConfig({
  appName,
  projectId,
  chain,
}: {
  chain: Chain;
  appName: string;
  projectId: string;
}) {
  return getDefaultConfig({
    appName,
    projectId,
    chains: [mainnet, chain],
    wallets: [
      ...wallets,
      {
        groupName: "More",
        wallets: [
          talismanWallet,
          subWallet,
          okxWallet,
          imTokenWallet,
          trustWallet,
          safeWallet,
        ],
      },
    ],
    ssr: true,
    storage: createStorage({
      storage: cookieStorage,
    }),
  });
}
