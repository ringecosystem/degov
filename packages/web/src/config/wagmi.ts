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
import { fallback, http } from "viem";
import { cookieStorage, createStorage, type Storage } from "wagmi";
import { mainnet } from "wagmi/chains";

import { DEFAULT_MULTICALL_BATCH_SIZE } from "@/config/base";
import { createWagmiQueryConfig } from "@/utils/query-config";

import type { Chain } from "@rainbow-me/rainbowkit";

const { wallets } = getDefaultWallets();

export function createQueryClient() {
  return new QueryClient(createWagmiQueryConfig());
}

type WagmiConfig = ReturnType<typeof getDefaultConfig>;

const configCache = new Map<string, WagmiConfig>();

function chainFingerprint(chain: Chain) {
  // Stable, order-defined subset of chain metadata that affects wagmi config
  return JSON.stringify({
    id: chain.id,
    name: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: chain.rpcUrls,
    blockExplorers: chain.blockExplorers,
    contracts: chain.contracts,
    testnet: chain.testnet,
  });
}

function createChainTransport(chain: Chain) {
  const rpcUrls = [...new Set(chain.rpcUrls.default.http.filter(Boolean))];

  if (rpcUrls.length === 0) {
    throw new Error(
      `No RPC URLs configured for chain "${chain.name}" (id: ${chain.id}).`
    );
  }

  if (rpcUrls.length === 1) {
    return http(rpcUrls[0], {
      batch: true,
      retryCount: 0,
    });
  }

  return fallback(
    rpcUrls.map((rpcUrl) =>
      http(rpcUrl, {
        batch: true,
        retryCount: 0,
      })
    ),
    {
      retryCount: 0,
      rank: false,
    }
  );
}

function createConfiguredChains(chain: Chain) {
  return Array.from(
    new Map(
      [mainnet as Chain, chain].map((configuredChain) => [
        configuredChain.id,
        configuredChain,
      ])
    ).values()
  ) as [Chain, ...Chain[]];
}

export function createConfig({
  appName,
  projectId,
  chain,
}: {
  chain: Chain;
  appName: string;
  projectId: string;
}) {
  const cacheKey = `${projectId}-${chainFingerprint(chain)}`;
  const cachedConfig = configCache.get(cacheKey);
  if (cachedConfig) {
    return cachedConfig;
  }

  const chains = createConfiguredChains(chain);
  const storage: Storage = createStorage({
    storage: cookieStorage,
  });

  const transports = chains.reduce<
    Record<number, ReturnType<typeof createChainTransport>>
  >((configuredTransports, configuredChain) => {
    configuredTransports[configuredChain.id] =
      createChainTransport(configuredChain);
    return configuredTransports;
  }, {});

  const config = getDefaultConfig({
    appName,
    projectId,
    chains: chains as unknown as readonly [Chain, ...Chain[]],
    transports,
    batch: {
      multicall: {
        batchSize: DEFAULT_MULTICALL_BATCH_SIZE,
      },
    },
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
    storage,
  });

  configCache.set(cacheKey, config);
  return config;
}
