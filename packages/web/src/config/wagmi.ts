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
import { fallback, http, type Transport } from "viem";
import { cookieStorage, createStorage, type Storage } from "wagmi";
import { mainnet } from "wagmi/chains";

import type { Chain as DaoChainConfig } from "@/types/config";
import { createWagmiQueryConfig } from "@/utils/query-config";

import type { Chain as RainbowKitChain } from "@rainbow-me/rainbowkit";

const { wallets } = getDefaultWallets();

export function createQueryClient() {
  return new QueryClient(createWagmiQueryConfig());
}

type WagmiConfig = ReturnType<typeof getDefaultConfig>;

const configCache = new Map<string, WagmiConfig>();

function getRpcUrls(rpcUrls: readonly string[] | undefined) {
  return Array.from(
    new Set((rpcUrls ?? []).map((rpcUrl) => rpcUrl.trim()).filter(Boolean))
  );
}

function getChainRpcUrls(chain: RainbowKitChain) {
  return getRpcUrls([
    ...(chain.rpcUrls?.default?.http ?? []),
    ...(chain.rpcUrls?.public?.http ?? []),
  ]);
}

function createChainTransport(chain: RainbowKitChain): Transport {
  const rpcUrls = getChainRpcUrls(chain);

  if (rpcUrls.length === 0) {
    const chainLabel = chain.name ? `${chain.id} (${chain.name})` : chain.id;

    throw new Error(
      `No RPC URLs configured for chain ${chainLabel}. Please configure at least one RPC URL.`
    );
  }

  if (rpcUrls.length === 1) {
    return http(rpcUrls[0]);
  }

  return fallback(
    rpcUrls.map((rpcUrl) => http(rpcUrl)),
    {
      rank: false,
    }
  );
}

function getConfiguredChains(chain: RainbowKitChain) {
  if (chain.id === mainnet.id) {
    return [chain] as const;
  }

  return [mainnet as RainbowKitChain, chain] as const;
}

function chainFingerprint(chain: RainbowKitChain) {
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

export function createDaoChain(
  chain: DaoChainConfig | null | undefined
): RainbowKitChain {
  const rpcUrls = getRpcUrls(chain?.rpcs);

  return {
    id: Number(chain?.id ?? 0),
    name: chain?.name ?? "",
    nativeCurrency: {
      name: chain?.nativeToken?.symbol ?? "",
      symbol: chain?.nativeToken?.symbol ?? "",
      decimals: chain?.nativeToken?.decimals ?? 18,
    },
    rpcUrls: {
      default: {
        http: rpcUrls,
      },
      public: {
        http: rpcUrls,
      },
    },
    blockExplorers: {
      default: {
        name: "Explorer",
        url: chain?.explorers?.[0] ?? "",
      },
    },
    contracts: chain?.contracts ?? undefined,
  };
}

export function createConfig({
  appName,
  projectId,
  chain,
}: {
  chain: RainbowKitChain;
  appName: string;
  projectId: string;
}) {
  const cacheKey = `${projectId}-${chainFingerprint(chain)}`;
  const cachedConfig = configCache.get(cacheKey);
  if (cachedConfig) {
    return cachedConfig;
  }

  const chains = getConfiguredChains(chain);
  const transports = Object.fromEntries(
    chains.map((configuredChain) => [
      configuredChain.id,
      createChainTransport(configuredChain),
    ])
  ) as Record<(typeof chains)[number]["id"], Transport>;
  const storage: Storage = createStorage({
    storage: cookieStorage,
  });

  const config = getDefaultConfig({
    appName,
    projectId,
    chains: chains as unknown as readonly [
      RainbowKitChain,
      ...RainbowKitChain[],
    ],
    transports,
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
