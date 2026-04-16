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
      .map(([key, value]) => `${key}=${this.formatLogValue(key, value)}`);

    return details.length > 0 ? `${step} | ${details.join(" ")}` : step;
  }

  static redactUrl(value: string): string {
    try {
      const url = new URL(value);
      return url.origin;
    } catch {
      return this.redactInvalidUrl(value);
    }
  }

  static formatError(error: unknown): string {
    if (error instanceof Error) {
      return this.redactUrlsInText(error.message);
    }
    if (typeof error === "string") {
      return this.redactUrlsInText(error);
    }
    return this.redactUrlsInText(this.safeJsonStringify(error));
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

  private static formatLogValue(key: string, value: IndexerLogFieldValue): string {
    const logValue = this.redactLogValue(key, value);

    if (typeof logValue === "bigint") {
      return logValue.toString();
    }
    if (typeof logValue === "string") {
      return /\s/.test(logValue) ? JSON.stringify(logValue) : logValue;
    }
    if (typeof logValue === "number" || typeof logValue === "boolean") {
      return String(logValue);
    }
    return this.safeJsonStringify(logValue);
  }

  private static redactLogValue(
    key: string,
    value: IndexerLogFieldValue
  ): IndexerLogFieldValue {
    if (typeof value === "string") {
      return this.isUrlLogField(key) ? this.redactUrl(value) : value;
    }

    if (typeof value === "bigint") {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.redactLogValue(key, item as IndexerLogFieldValue));
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([nestedKey, nestedValue]) => [
          nestedKey,
          this.redactLogValue(nestedKey, nestedValue as IndexerLogFieldValue),
        ])
      );
    }

    return value;
  }

  private static isUrlLogField(key: string): boolean {
    return /(rpc|url|endpoint|configpath)/i.test(key);
  }

  private static redactUrlsInText(value: string): string {
    return value.replace(/https?:\/\/[^\s"'<>]+|wss?:\/\/[^\s"'<>]+/gi, (url) =>
      this.redactUrl(url)
    );
  }

  private static redactInvalidUrl(value: string): string {
    const withoutQueryOrFragment = value.split(/[?#]/, 1)[0];
    return withoutQueryOrFragment.replace(
      /^([a-z][a-z\d+\-.]*:\/\/)[^/@\s]+@/i,
      "$1"
    );
  }
}
