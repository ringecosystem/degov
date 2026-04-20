import { createPublicClient, getAddress, http, isAddress } from "viem";
import { mainnet } from "viem/chains";

import type { Config } from "@/types/config";

export type EnsRecord = {
  address?: string | null;
  name?: string | null;
};

type CacheEntry = {
  record: EnsRecord;
  timer: ReturnType<typeof setTimeout>;
};

const DEFAULT_ENS_CACHE_TTL_MS = 3 * 60 * 60 * 1000;
const DEFAULT_ENS_CACHE_MAX_ENTRIES = 1000;
const ensCache = new Map<string, CacheEntry>();

function ensCacheTTL() {
  const rawDuration = process.env.DEGOV_ENS_CACHE_TTL?.trim();
  if (rawDuration) {
    const match = rawDuration.match(/^(\d+)(ms|s|m|h)?$/);
    if (match) {
      const value = Number(match[1]);
      const unit = match[2] ?? "ms";
      const multiplier =
        unit === "h" ? 60 * 60 * 1000 :
        unit === "m" ? 60 * 1000 :
        unit === "s" ? 1000 :
        1;
      if (value > 0) {
        return value * multiplier;
      }
    }
  }

  const seconds = Number(process.env.DEGOV_ENS_CACHE_TTL_SECONDS);
  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1000;
  }

  return DEFAULT_ENS_CACHE_TTL_MS;
}

function ensCacheMaxEntries() {
  const value = Number(process.env.DEGOV_ENS_CACHE_MAX_ENTRIES);
  return Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : DEFAULT_ENS_CACHE_MAX_ENTRIES;
}

function splitRPCs(value?: string) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function ensRPCURLs(config: Config) {
  const configuredRPCs = splitRPCs(
    process.env.DEGOV_ENS_RPC_URLS || process.env.DEGOV_ENS_RPC_URL
  );
  const daoRPCs =
    config.chain?.id === mainnet.id ? config.chain?.rpcs ?? [] : [];
  return Array.from(new Set([...configuredRPCs, ...daoRPCs])).filter(Boolean);
}

function safeRPCLabel(rpcURL: string) {
  try {
    return new URL(rpcURL).origin;
  } catch {
    return "invalid_rpc_url";
  }
}

function getCached(key: string) {
  const entry = ensCache.get(key);
  return entry?.record;
}

function setCached(key: string, record: EnsRecord) {
  const existing = ensCache.get(key);
  if (existing) {
    clearTimeout(existing.timer);
  }

  while (!existing && ensCache.size >= ensCacheMaxEntries()) {
    const oldestKey = ensCache.keys().next().value as string | undefined;
    if (!oldestKey) break;

    const oldest = ensCache.get(oldestKey);
    if (oldest) {
      clearTimeout(oldest.timer);
    }
    ensCache.delete(oldestKey);
  }

  const timer = setTimeout(() => {
    const current = ensCache.get(key);
    if (current?.timer === timer) {
      ensCache.delete(key);
    }
  }, ensCacheTTL());
  timer.unref?.();
  ensCache.set(key, { record, timer });
}

async function resolveWithRPC<T>(
  config: Config,
  resolver: (rpcURL: string) => Promise<T | null>
) {
  let lastError: unknown;
  for (const rpcURL of ensRPCURLs(config)) {
    try {
      return await resolver(rpcURL);
    } catch (error) {
      lastError = error;
      console.warn("ens_rpc_resolution_failed", {
        rpc: safeRPCLabel(rpcURL),
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }

  if (lastError) {
    throw lastError;
  }
  return null;
}

export async function resolveEnsRecord(
  config: Config,
  input: { address?: string | null; name?: string | null }
): Promise<EnsRecord> {
  const address = input.address?.trim().toLowerCase();
  const name = input.name?.trim().toLowerCase();

  if ((!address && !name) || (address && name)) {
    throw new Error("ENS query requires exactly one of address or name");
  }

  if (address && !isAddress(address)) {
    throw new Error("Invalid ENS address");
  }

  const cacheKey = address ? `name:${address}` : `address:${name}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return cached;
  }

  let record: EnsRecord;
  if (address) {
    const checksumAddress = getAddress(address);
    const ensName = await resolveWithRPC(config, async (rpcURL) => {
      const client = createPublicClient({
        chain: mainnet,
        transport: http(rpcURL),
      });
      return client.getEnsName({ address: checksumAddress });
    });
    record = {
      address,
      name: ensName,
    };
  } else {
    const ensAddress = await resolveWithRPC(config, async (rpcURL) => {
      const client = createPublicClient({
        chain: mainnet,
        transport: http(rpcURL),
      });
      return client.getEnsAddress({ name: name! });
    });
    record = {
      address: ensAddress?.toLowerCase() ?? null,
      name,
    };
  }

  setCached(cacheKey, record);
  return record;
}
