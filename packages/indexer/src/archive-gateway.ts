import { DataSource } from "typeorm";

const defaultFallbackRpcBlocks = 10_000;
const defaultArchiveProbeBlocks = 10_000;

type ArchiveGatewayFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "text">>;

export interface ArchiveGatewayDecision {
  useGateway: boolean;
  probeUrl: string;
  reason?: string;
  status?: number;
  body?: string;
}

export async function shouldUseArchiveGateway(options: {
  gateway: string;
  nextBlock: number;
  fetchFn?: ArchiveGatewayFetch;
}): Promise<ArchiveGatewayDecision> {
  const gateway = options.gateway.replace(/\/+$/, "");
  const probeUrl = `${gateway}/${options.nextBlock}/worker`;
  const fetchFn = options.fetchFn ?? fetch;

  try {
    const response = await fetchFn(probeUrl, { method: "GET" });
    if (response.ok) {
      return { useGateway: true, probeUrl, status: response.status };
    }

    return {
      useGateway: false,
      probeUrl,
      reason: "archive worker unavailable",
      status: response.status,
      body: await response.text(),
    };
  } catch (error) {
    return {
      useGateway: false,
      probeUrl,
      reason: "archive worker unavailable",
      body: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function findArchiveGatewayEndBlock(options: {
  gateway: string;
  nextBlock: number;
  configuredEndBlock?: number;
  maxBlocks?: number;
  fetchFn?: ArchiveGatewayFetch;
}): Promise<number> {
  const maxBlocks = Math.max(1, options.maxBlocks ?? defaultArchiveProbeBlocks);
  const maxEndBlock =
    options.configuredEndBlock === undefined
      ? options.nextBlock + maxBlocks - 1
      : Math.min(options.configuredEndBlock, options.nextBlock + maxBlocks - 1);

  const endDecision = await shouldUseArchiveGateway({
    gateway: options.gateway,
    nextBlock: maxEndBlock,
    fetchFn: options.fetchFn,
  });
  if (endDecision.useGateway) {
    return maxEndBlock;
  }

  let low = options.nextBlock;
  let high = maxEndBlock;
  while (low + 1 < high) {
    const mid = Math.floor((low + high) / 2);
    const decision = await shouldUseArchiveGateway({
      gateway: options.gateway,
      nextBlock: mid,
      fetchFn: options.fetchFn,
    });

    if (decision.useGateway) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return low;
}

export async function readProcessorNextBlock(
  fallbackStartBlock: number,
): Promise<number> {
  const dataSource = new DataSource(createDataSourceOptions());

  try {
    await dataSource.initialize();
    const rows = (await dataSource.query(
      'SELECT height FROM squid_processor.status WHERE id = 0 LIMIT 1',
    )) as Array<{ height?: string | number }>;
    const height = Number(rows[0]?.height);
    if (Number.isFinite(height)) {
      return Math.max(height + 1, fallbackStartBlock);
    }
  } catch {
    return fallbackStartBlock;
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }

  return fallbackStartBlock;
}

export function fallbackRpcEndBlock(options: {
  nextBlock: number;
  configuredEndBlock?: number;
  maxBlocks?: number;
}): number {
  const maxBlocks = Math.max(1, options.maxBlocks ?? defaultFallbackRpcBlocks);
  const fallbackEndBlock = options.nextBlock + maxBlocks - 1;

  return options.configuredEndBlock === undefined
    ? fallbackEndBlock
    : Math.min(options.configuredEndBlock, fallbackEndBlock);
}

function createDataSourceOptions() {
  const databaseUrl = process.env.DATABASE_URL;
  const ssl = process.env.DB_SSL === "true";

  if (databaseUrl) {
    return { type: "postgres" as const, url: databaseUrl, ssl };
  }

  return {
    type: "postgres" as const,
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USER ?? "postgres",
    password: process.env.DB_PASS ?? "postgres",
    database: process.env.DB_NAME ?? "squid",
    ssl,
  };
}
