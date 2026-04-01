import { ContractName, IndexerWork } from "../types";

export interface ProposalScopeWhereOptions {
  chainId: number;
  governorAddress: string;
  proposalId: string;
}

export type IndexerLogFieldValue =
  | string
  | number
  | boolean
  | bigint
  | null
  | undefined
  | Record<string, unknown>
  | unknown[];

export class DegovIndexerHelpers {
  private static readonly defaultProgressHeartbeatMs = 10_000;

  static safeJsonStringify(
    value: any,
    replacer: (key: string, value: any) => any = (_, v) => v
  ): string {
    return JSON.stringify(value, (_, v) => {
      if (typeof v === "bigint") {
        return v.toString();
      }
      return v;
    });
  }

  static normalizeAddress(value?: string | null): string | undefined {
    return value?.toLowerCase();
  }

  static verboseLoggingEnabled(): boolean {
    const value = process.env.DEGOV_INDEXER_VERBOSE_LOGS
      ?.trim()
      .toLowerCase();

    return value === "1" || value === "true" || value === "yes" || value === "on";
  }

  static progressHeartbeatIntervalMs(): number {
    const rawValue = process.env.DEGOV_INDEXER_PROGRESS_HEARTBEAT_MS?.trim();

    if (!rawValue) {
      return this.defaultProgressHeartbeatMs;
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return this.defaultProgressHeartbeatMs;
    }

    return Math.floor(parsed);
  }

  static formatDurationMs(durationMs: number): string {
    if (durationMs < 1000) {
      return `${durationMs}ms`;
    }

    const totalSeconds = Math.floor(durationMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h${minutes}m${seconds}s`;
    }

    if (minutes > 0) {
      return `${minutes}m${seconds}s`;
    }

    return `${seconds}s`;
  }

  static formatLogLine(
    step: string,
    fields: Record<string, IndexerLogFieldValue> = {}
  ): string {
    const details = Object.entries(fields)
      .filter(([, value]) => value !== undefined && value !== null && value !== "")
      .map(([key, value]) => `${key}=${this.formatLogValue(value)}`);

    return details.length > 0 ? `${step} | ${details.join(" ")}` : step;
  }

  static formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    return this.safeJsonStringify(error);
  }

  static logVerbose(step: string, fields: Record<string, IndexerLogFieldValue> = {}) {
    if (!this.verboseLoggingEnabled()) {
      return;
    }

    console.log(this.formatLogLine(step, fields));
  }

  static logVerboseInfo(
    logger: { info: (message: string) => void },
    step: string,
    fields: Record<string, IndexerLogFieldValue> = {}
  ) {
    if (!this.verboseLoggingEnabled()) {
      return;
    }

    logger.info(this.formatLogLine(step, fields));
  }

  static findContractAddress(
    work: IndexerWork,
    contractName: ContractName
  ): string | undefined {
    return this.normalizeAddress(
      work.contracts.find((item) => item.name === contractName)?.address
    );
  }

  static proposalScopeWhere(options: ProposalScopeWhereOptions) {
    return {
      chainId: options.chainId,
      governorAddress: this.normalizeAddress(options.governorAddress),
      proposalId: options.proposalId,
    };
  }

  private static formatLogValue(value: IndexerLogFieldValue): string {
    if (typeof value === "bigint") {
      return value.toString();
    }
    if (typeof value === "string") {
      return /\s/.test(value) ? JSON.stringify(value) : value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return this.safeJsonStringify(value);
  }
}
