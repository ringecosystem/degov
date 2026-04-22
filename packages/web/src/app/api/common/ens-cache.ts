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

type EnsRecordGraphQLResponse = {
  data?: {
    ens?: EnsRecord | null;
  };
  errors?: { message?: string }[];
};

type EnsRecordsGraphQLResponse = {
  data?: {
    ensRecords?: EnsRecord[] | null;
  };
  errors?: { message?: string }[];
};

const DEFAULT_ENS_CACHE_TTL_MS = 3 * 60 * 60 * 1000;
const DEFAULT_ENS_CACHE_MAX_ENTRIES = 1000;
const ensCache = new Map<string, CacheEntry>();

const GET_ENS_RECORD_QUERY = `
  query GetEnsRecord($address: String, $name: String, $daoCode: String) {
    ens(input: { address: $address, name: $name, daoCode: $daoCode }) {
      address
      name
    }
  }
`;

const GET_ENS_RECORDS_QUERY = `
  query GetEnsRecords(
    $addresses: [String!]
    $names: [String!]
    $daoCode: String
  ) {
    ensRecords(input: { addresses: $addresses, names: $names, daoCode: $daoCode }) {
      address
      name
    }
  }
`;

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

function degovGraphqlEndpoint() {
  const api = process.env.NEXT_PUBLIC_DEGOV_API?.trim();
  if (!api) return undefined;

  return api.endsWith("/graphql") ? api : `${api}/graphql`;
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

async function requestDegovEns<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T | undefined> {
  const endpoint = degovGraphqlEndpoint();
  if (!endpoint) return undefined;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`DeGov API returned ${response.status}`);
    }

    const result = (await response.json()) as {
      data?: T;
      errors?: { message?: string }[];
    };
    if (result.errors?.length) {
      throw new Error(result.errors[0]?.message ?? "DeGov API ENS query failed");
    }

    return result.data;
  } catch (error) {
    console.warn("ens_degov_api_resolution_failed", {
      endpoint: safeRPCLabel(endpoint),
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return undefined;
  }
}

async function resolveEnsRecordWithDegovAPI(
  daoCode: string | undefined,
  input: { address?: string | null; name?: string | null }
): Promise<EnsRecord | undefined> {
  const data = await requestDegovEns<EnsRecordGraphQLResponse["data"]>(
    GET_ENS_RECORD_QUERY,
    {
      address: input.address,
      name: input.name,
      daoCode,
    }
  );

  return data?.ens ?? undefined;
}

async function resolveEnsRecordsWithDegovAPI(
  daoCode: string | undefined,
  input: { addresses?: string[] | null; names?: string[] | null }
): Promise<EnsRecord[] | undefined> {
  const data = await requestDegovEns<EnsRecordsGraphQLResponse["data"]>(
    GET_ENS_RECORDS_QUERY,
    {
      addresses: input.addresses ?? [],
      names: input.names ?? [],
      daoCode,
    }
  );

  return data?.ensRecords ?? undefined;
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

  const remoteRecord = await resolveEnsRecordWithDegovAPI(config.code, {
    address,
    name,
  });
  if (remoteRecord) {
    setCached(cacheKey, remoteRecord);
    return remoteRecord;
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

export async function resolveEnsRecords(
  config: Config,
  input: { addresses?: string[] | null; names?: string[] | null }
): Promise<EnsRecord[]> {
  const addresses = Array.from(
    new Set(
      (input.addresses ?? [])
        .map((address) => address.trim().toLowerCase())
        .filter(Boolean)
    )
  );
  const names = Array.from(
    new Set(
      (input.names ?? [])
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean)
    )
  );

  const remoteRecords = await resolveEnsRecordsWithDegovAPI(config.code, {
    addresses,
    names,
  });
  if (remoteRecords) {
    remoteRecords.forEach((record) => {
      if (record.address) {
        setCached(`name:${record.address.toLowerCase()}`, record);
      }
      if (record.name) {
        setCached(`address:${record.name.toLowerCase()}`, record);
      }
    });
    return remoteRecords;
  }

  const records = await Promise.all([
    ...addresses.map((address) => resolveEnsRecord(config, { address })),
    ...names.map((name) => resolveEnsRecord(config, { name })),
  ]);

  return records;
}
