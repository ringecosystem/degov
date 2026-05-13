import { DataHandlerContext, Log as EvmLog } from "@subsquid/evm-processor";
import { Store } from "@subsquid/typeorm-store";
import * as itokenerc20 from "../abi/itokenerc20";
import * as itokenerc721 from "../abi/itokenerc721";
import {
  Contributor,
  DataMetric,
  Delegate,
  DelegateChanged,
  DelegateMapping,
  DelegateRolling,
  DelegateVotesChanged,
  TokenBalanceCheckpoint,
  TokenTransfer,
  VotePowerCheckpoint,
} from "../model";
import {
  MetricsId,
  EvmFieldSelection,
  IndexerContract,
  IndexerWork,
} from "../types";
import { DegovIndexerHelpers } from "../internal/helpers";
import { ChainTool, ClockMode } from "../internal/chaintool";

const zeroAddress = "0x0000000000000000000000000000000000000000";
type PowerSource = "event" | "onchain";
type OnchainRefreshCause = "transfer" | "delegate-change" | "delegate-votes-changed" | "reconcile";

function isHistoricalVoteUnavailable(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();
  return (
    message.includes("contract function not found") ||
    message.includes("returned no data") ||
    message.includes("function selector was not recognized") ||
    message.includes("function does not exist") ||
    message.includes("selector not found") ||
    message.includes("not yet determined") ||
    message.includes("not yet mined") ||
    message.includes("future lookup") ||
    message.includes("erc5805futurelookup") ||
    ((message.includes("getpastvotes") ||
      message.includes("getpriorvotes")) &&
      (message.includes("reverted") || message.includes("execution reverted")))
  );
}

export interface TokenhandlerOptions {
  chainId: number;
  rpcs: string[];
  work: IndexerWork;
  indexContract: IndexerContract;
  chainTool: ChainTool;
}

interface OnchainRefreshTarget {
  account: string;
  refreshBalance: boolean;
  refreshPower: boolean;
  cause: OnchainRefreshCause;
}

interface TokenScopeFields {
  chainId?: number | null;
  daoCode?: string | null;
  governorAddress?: string | null;
  tokenAddress?: string | null;
  contractAddress?: string | null;
  logIndex?: number | null;
  transactionIndex?: number | null;
}

export function votePowerTimepointForLog(options: {
  clockMode: ClockMode;
  blockHeight: number;
  blockTimestampMs: number;
}): bigint {
  return options.clockMode === ClockMode.Timestamp
    ? BigInt(Math.floor(options.blockTimestampMs / 1000))
    : BigInt(options.blockHeight);
}

export function classifyVotePowerCheckpointCause(options: {
  hasDelegateChange: boolean;
  hasTransfer: boolean;
}): string {
  if (options.hasDelegateChange && options.hasTransfer) {
    return "delegate-change+transfer";
  }
  if (options.hasDelegateChange) {
    return "delegate-change";
  }
  if (options.hasTransfer) {
    return "transfer";
  }
  return "delegate-votes-changed";
}

export function parseIndexerPowerSource(
  value = process.env.DEGOV_INDEXER_POWER_SOURCE,
): PowerSource {
  const normalized = (value ?? "event").trim().toLowerCase();
  if (normalized === "event" || normalized === "onchain") {
    return normalized;
  }
  throw new Error(
    `DEGOV_INDEXER_POWER_SOURCE must be one of: event, onchain. Received: ${value}`,
  );
}

export class TokenHandler {
  private readonly powerSource: PowerSource;
  private voteClockModePromise?: Promise<ClockMode>;
  private globalDataMetric?: DataMetric;
  private globalDataMetricDirty = false;
  private readonly delegateRollingByTx = new Map<
    string,
    DelegateRolling[] | null
  >();
  private readonly delegateVotesChangedByTx = new Map<
    string,
    DelegateVotesChanged[] | null
  >();
  private readonly tokenTransferByTx = new Map<string, TokenTransfer[] | null>();
  private readonly delegateMappingByFrom = new Map<
    string,
    DelegateMapping | null
  >();
  private readonly contributorById = new Map<string, Contributor | null>();
  private readonly delegateById = new Map<string, Delegate | null>();
  private readonly dirtyDelegateRollings = new Map<string, DelegateRolling>();
  private readonly dirtyDelegateMappings = new Map<string, DelegateMapping>();
  private readonly dirtyContributors = new Map<string, Contributor>();
  private readonly dirtyDelegates = new Map<string, Delegate>();
  private readonly onchainRefreshKeysByTx = new Map<string, Set<string>>();

  constructor(
    private readonly ctx: DataHandlerContext<Store, EvmFieldSelection>,
    private readonly options: TokenhandlerOptions,
  ) {
    this.powerSource = parseIndexerPowerSource();
  }

  private governorAddress(): string {
    const governorAddress = DegovIndexerHelpers.findContractAddress(
      this.options.work,
      "governor",
    );
    if (!governorAddress) {
      throw new Error(
        `governor contract not found in work daoCode: ${this.options.work.daoCode}`,
      );
    }
    return governorAddress;
  }

  private tokenAddress(): string {
    return DegovIndexerHelpers.normalizeAddress(
      this.options.indexContract.address,
    )!;
  }

  private async voteClockMode(): Promise<ClockMode> {
    if (!this.voteClockModePromise) {
      this.voteClockModePromise = this.options.chainTool.clockMode({
        chainId: this.options.chainId,
        contractAddress: this.governorAddress() as `0x${string}`,
        rpcs: this.options.rpcs,
      });
    }

    return this.voteClockModePromise;
  }

  private scopeFields(): TokenScopeFields {
    return {
      chainId: this.options.chainId,
      daoCode: this.options.work.daoCode,
      governorAddress: this.governorAddress(),
      tokenAddress: this.tokenAddress(),
    };
  }

  private eventFields(eventLog: EvmLog<EvmFieldSelection>): TokenScopeFields {
    return {
      ...this.scopeFields(),
      contractAddress: DegovIndexerHelpers.normalizeAddress(eventLog.address),
      logIndex: eventLog.logIndex,
      transactionIndex: eventLog.transactionIndex,
    };
  }

  private applyScopeFields<T extends object>(
    target: T,
    scope: TokenScopeFields,
  ): T {
    const {
      chainId,
      daoCode,
      governorAddress,
      tokenAddress,
      contractAddress,
      logIndex,
      transactionIndex,
    } = scope;
    Object.assign(target, {
      chainId,
      daoCode,
      governorAddress,
      tokenAddress,
      contractAddress,
      logIndex,
      transactionIndex,
    });
    return target;
  }

  private contractStandard() {
    const contractStandard = (
      this.options.indexContract.standard ?? "erc20"
    ).toLowerCase();
    return contractStandard;
  }

  private itokenAbi() {
    const contractStandard = this.contractStandard();
    const isErc721 = contractStandard === "erc721";
    return isErc721 ? itokenerc721 : itokenerc20;
  }

  private isZeroAddress(address?: string | null) {
    return (address ?? "").toLowerCase() === zeroAddress;
  }

  private normalizeAddress(address: string): string {
    return DegovIndexerHelpers.normalizeAddress(address) ?? address.toLowerCase();
  }

  private onchainReadOptions(eventLog: EvmLog<EvmFieldSelection>) {
    return {
      chainId: this.options.chainId,
      contractAddress: this.tokenAddress() as `0x${string}`,
      rpcs: this.options.rpcs,
      blockNumber: BigInt(eventLog.block.height),
    };
  }

  private checkpointId(
    eventLog: EvmLog<EvmFieldSelection>,
    kind: "balance" | "power",
    account: string,
    cause: string,
  ): string {
    return `${eventLog.id}-${kind}-${account.toLowerCase()}-${cause}`;
  }

  private onchainRefreshScope(eventLog: EvmLog<EvmFieldSelection>): string {
    return `${eventLog.block.height}:${eventLog.transactionHash}`;
  }

  private rememberOnchainRefresh(
    eventLog: EvmLog<EvmFieldSelection>,
    account: string,
    kind: "balance" | "power",
  ): boolean {
    const scope = this.onchainRefreshScope(eventLog);
    const keys = this.onchainRefreshKeysByTx.get(scope) ?? new Set<string>();
    const key = `${account.toLowerCase()}:${kind}`;
    if (keys.has(key)) {
      return false;
    }
    keys.add(key);
    this.onchainRefreshKeysByTx.set(scope, keys);
    return true;
  }

  private async ensureContributor(
    account: string,
    eventLog: EvmLog<EvmFieldSelection>,
  ): Promise<{ contributor: Contributor; isNew: boolean }> {
    const id = this.normalizeAddress(account);
    const storedContributor = await this.getContributorById(id);
    if (storedContributor) {
      return {
        contributor: storedContributor,
        isNew: false,
      };
    }

    const contributor = new Contributor({
      id,
      ...this.eventFields(eventLog),
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
      power: 0n,
      delegatesCountAll: 0,
      delegatesCountEffective: 0,
    });
    await this.ctx.store.insert(contributor);
    this.rememberContributor(contributor);
    await this.increaseMetricsContributorCount(contributor);
    return {
      contributor,
      isNew: true,
    };
  }

  private updateContributorScope(
    contributor: Contributor,
    eventLog: EvmLog<EvmFieldSelection>,
  ) {
    contributor.blockNumber = BigInt(eventLog.block.height);
    contributor.blockTimestamp = BigInt(eventLog.block.timestamp);
    contributor.transactionHash = eventLog.transactionHash;
    this.applyScopeFields(contributor, this.eventFields(eventLog));
  }

  private async readOnchainPower(
    account: string,
    eventLog: EvmLog<EvmFieldSelection>,
  ): Promise<{
    power: bigint;
    source: string;
    clockMode: ClockMode;
    timepoint: bigint;
  }> {
    const normalizedAccount = this.normalizeAddress(account) as `0x${string}`;
    const clockMode = await this.voteClockMode();
    const timepoint = votePowerTimepointForLog({
      clockMode,
      blockHeight: eventLog.block.height,
      blockTimestampMs: eventLog.block.timestamp,
    });
    const readOptions = {
      ...this.onchainReadOptions(eventLog),
      account: normalizedAccount,
    };

    try {
      const result = await this.options.chainTool.historicalVotes({
        ...readOptions,
        timepoint,
      });
      return {
        power: result.votes,
        source: result.method,
        clockMode,
        timepoint,
      };
    } catch (error) {
      if (!isHistoricalVoteUnavailable(error)) {
        throw error;
      }
      const result =
        await this.options.chainTool.currentVotesWithSource(readOptions);
      return {
        power: result.votes,
        source: result.method,
        clockMode,
        timepoint,
      };
    }
  }

  private async refreshOnchainBalance(
    target: OnchainRefreshTarget,
    eventLog: EvmLog<EvmFieldSelection>,
  ) {
    if (!target.refreshBalance || this.isZeroAddress(target.account)) {
      return;
    }

    const account = this.normalizeAddress(target.account);
    const storedContributor = await this.getContributorById(account);
    const previousBalance = storedContributor?.balance ?? 0n;
    const newBalance = await this.options.chainTool.tokenBalance({
      ...this.onchainReadOptions(eventLog),
      account: account as `0x${string}`,
    });
    const delta = newBalance - previousBalance;
    const { contributor } = storedContributor
      ? { contributor: storedContributor }
      : await this.ensureContributor(account, eventLog);

    this.updateContributorScope(contributor, eventLog);
    contributor.balance = newBalance;
    this.rememberContributor(contributor);
    this.markContributorDirty(contributor);

    await this.ctx.store.insert(
      new TokenBalanceCheckpoint({
        id: this.checkpointId(eventLog, "balance", account, target.cause),
        ...this.eventFields(eventLog),
        account,
        previousBalance,
        newBalance,
        delta,
        source: "balanceOf",
        cause: target.cause,
        blockNumber: BigInt(eventLog.block.height),
        blockTimestamp: BigInt(eventLog.block.timestamp),
        transactionHash: eventLog.transactionHash,
      }),
    );
  }

  private async refreshOnchainPower(
    target: OnchainRefreshTarget,
    eventLog: EvmLog<EvmFieldSelection>,
  ) {
    if (!target.refreshPower || this.isZeroAddress(target.account)) {
      return;
    }

    const account = this.normalizeAddress(target.account);
    const storedContributor = await this.getContributorById(account);
    const previousPower = storedContributor?.power ?? 0n;
    const { power, source, clockMode, timepoint } = await this.readOnchainPower(
      account,
      eventLog,
    );
    const delta = power - previousPower;
    const { contributor } = storedContributor
      ? { contributor: storedContributor }
      : await this.ensureContributor(account, eventLog);

    this.updateContributorScope(contributor, eventLog);
    contributor.power = power;
    this.rememberContributor(contributor);
    this.markContributorDirty(contributor);

    const dm = await this.getGlobalDataMetric(this.eventFields(eventLog));
    this.applyScopeFields(dm, this.eventFields(eventLog));
    dm.powerSum = (dm.powerSum ?? 0n) + delta;
    this.globalDataMetricDirty = true;

    await this.ctx.store.insert(
      new VotePowerCheckpoint({
        id: this.checkpointId(eventLog, "power", account, target.cause),
        ...this.eventFields(eventLog),
        account,
        clockMode,
        timepoint,
        previousPower,
        newPower: power,
        delta,
        source,
        cause: target.cause,
        blockNumber: BigInt(eventLog.block.height),
        blockTimestamp: BigInt(eventLog.block.timestamp),
        transactionHash: eventLog.transactionHash,
      }),
    );
  }

  private async delegateOfAt(
    account: string,
    eventLog: EvmLog<EvmFieldSelection>,
  ): Promise<string | undefined> {
    if (this.isZeroAddress(account)) {
      return undefined;
    }

    const delegate = this.normalizeAddress(
      await this.options.chainTool.delegateOf({
        ...this.onchainReadOptions(eventLog),
        account: this.normalizeAddress(account) as `0x${string}`,
      }),
    );
    return this.isZeroAddress(delegate) ? undefined : delegate;
  }

  private async refreshOnchainDelegateMapping(
    delegator: string,
    eventLog: EvmLog<EvmFieldSelection>,
    canonical?: {
      delegatee?: string;
      power?: bigint;
    },
  ) {
    const normalizedDelegator = this.normalizeAddress(delegator);
    if (this.isZeroAddress(normalizedDelegator)) {
      return;
    }

    const delegatee =
      canonical && "delegatee" in canonical
        ? canonical.delegatee
        : await this.delegateOfAt(normalizedDelegator, eventLog);
    const previousMapping =
      await this.getDelegateMappingByFrom(normalizedDelegator);
    const previousDelegate = previousMapping?.to;
    const previousPower = previousMapping?.power ?? 0n;

    if (!delegatee) {
      if (previousMapping) {
        await this.upsertDelegateSnapshot({
          ...this.eventFields(eventLog),
          fromDelegate: normalizedDelegator,
          toDelegate: previousDelegate!,
          blockNumber: BigInt(eventLog.block.height),
          blockTimestamp: BigInt(eventLog.block.timestamp),
          transactionHash: eventLog.transactionHash,
          isCurrent: false,
        });
      }
      await this.ctx.store.remove(DelegateMapping, normalizedDelegator);
      this.forgetDelegateMapping(normalizedDelegator);
      await this.applyDelegateCountDeltas(
        {
          delegate: previousDelegate,
          allDelta: previousMapping ? -1 : 0,
          effectiveDelta: previousPower > 0n ? -1 : 0,
        },
        eventLog,
      );
      return;
    }

    const power =
      canonical?.power ??
      await this.options.chainTool.tokenBalance({
        ...this.onchainReadOptions(eventLog),
        account: normalizedDelegator as `0x${string}`,
      });

    if (previousMapping && previousDelegate?.toLowerCase() !== delegatee) {
      await this.upsertDelegateSnapshot({
        ...this.eventFields(eventLog),
        fromDelegate: normalizedDelegator,
        toDelegate: previousDelegate!,
        blockNumber: BigInt(eventLog.block.height),
        blockTimestamp: BigInt(eventLog.block.timestamp),
        transactionHash: eventLog.transactionHash,
        isCurrent: false,
      });
    }

    const mapping =
      previousMapping ??
      new DelegateMapping({
        id: normalizedDelegator,
        from: normalizedDelegator,
        to: delegatee,
        power,
        blockNumber: BigInt(eventLog.block.height),
        blockTimestamp: BigInt(eventLog.block.timestamp),
        transactionHash: eventLog.transactionHash,
      });
    this.applyScopeFields(mapping, this.eventFields(eventLog));
    mapping.from = normalizedDelegator;
    mapping.to = delegatee;
    mapping.power = power;
    mapping.blockNumber = BigInt(eventLog.block.height);
    mapping.blockTimestamp = BigInt(eventLog.block.timestamp);
    mapping.transactionHash = eventLog.transactionHash;

    if (previousMapping) {
      this.rememberDelegateMapping(mapping);
      this.markDelegateMappingDirty(mapping);
    } else {
      await this.ctx.store.insert(mapping);
      this.rememberDelegateMapping(mapping);
    }

    const delegateId = `${normalizedDelegator}_${delegatee}`;
    const delegate =
      (await this.getDelegateById(delegateId)) ??
      new Delegate({
        id: delegateId,
        fromDelegate: normalizedDelegator,
        toDelegate: delegatee,
        power,
        isCurrent: true,
        blockNumber: BigInt(eventLog.block.height),
        blockTimestamp: BigInt(eventLog.block.timestamp),
        transactionHash: eventLog.transactionHash,
      });
    this.applyScopeFields(delegate, this.eventFields(eventLog));
    delegate.fromDelegate = normalizedDelegator;
    delegate.toDelegate = delegatee;
    delegate.power = power;
    delegate.isCurrent = true;
    delegate.blockNumber = BigInt(eventLog.block.height);
    delegate.blockTimestamp = BigInt(eventLog.block.timestamp);
    delegate.transactionHash = eventLog.transactionHash;
    if (await this.getDelegateById(delegateId)) {
      this.rememberDelegate(delegate);
      this.markDelegateDirty(delegate);
    } else {
      await this.ctx.store.insert(delegate);
      this.rememberDelegate(delegate);
    }

    if (!previousMapping) {
      await this.applyDelegateCountDeltas(
        {
          delegate: delegatee,
          allDelta: 1,
          effectiveDelta: power > 0n ? 1 : 0,
        },
        eventLog,
      );
      return;
    }

    if (previousDelegate?.toLowerCase() === delegatee) {
      const previousEffective = previousPower > 0n;
      const currentEffective = power > 0n;
      await this.applyDelegateCountDeltas(
        {
          delegate: delegatee,
          allDelta: 0,
          effectiveDelta:
            previousEffective === currentEffective
              ? 0
              : currentEffective
                ? 1
                : -1,
        },
        eventLog,
      );
      return;
    }

    await this.applyDelegateCountDeltas(
      {
        delegate: previousDelegate,
        allDelta: -1,
        effectiveDelta: previousPower > 0n ? -1 : 0,
      },
      eventLog,
    );
    await this.applyDelegateCountDeltas(
      {
        delegate: delegatee,
        allDelta: 1,
        effectiveDelta: power > 0n ? 1 : 0,
      },
      eventLog,
    );
  }

  private async applyDelegateCountDeltas(
    options: {
      delegate?: string | null;
      allDelta: number;
      effectiveDelta: number;
    },
    eventLog: EvmLog<EvmFieldSelection>,
  ) {
    const delegate = options.delegate ? this.normalizeAddress(options.delegate) : undefined;
    if (!delegate || this.isZeroAddress(delegate)) {
      return;
    }

    const { contributor } = await this.ensureContributor(delegate, eventLog);
    this.updateContributorScope(contributor, eventLog);
    contributor.delegatesCountAll = Math.max(
      0,
      (contributor.delegatesCountAll ?? 0) + options.allDelta,
    );
    contributor.delegatesCountEffective = Math.max(
      0,
      (contributor.delegatesCountEffective ?? 0) + options.effectiveDelta,
    );
    this.rememberContributor(contributor);
    this.markContributorDirty(contributor);
  }

  private async refreshOnchainTargets(
    targets: OnchainRefreshTarget[],
    eventLog: EvmLog<EvmFieldSelection>,
  ): Promise<Set<string>> {
    const seen = new Set<string>();
    const refreshedBalanceAccounts = new Set<string>();
    for (const target of targets) {
      const account = this.normalizeAddress(target.account);
      if (this.isZeroAddress(account)) {
        continue;
      }
      if (target.refreshBalance) {
        const key = `${account}:balance`;
        if (!seen.has(key) && this.rememberOnchainRefresh(eventLog, account, "balance")) {
          seen.add(key);
          await this.refreshOnchainBalance({ ...target, account }, eventLog);
          refreshedBalanceAccounts.add(account);
        }
      }
      if (target.refreshPower) {
        const key = `${account}:power`;
        if (!seen.has(key) && this.rememberOnchainRefresh(eventLog, account, "power")) {
          seen.add(key);
          await this.refreshOnchainPower({ ...target, account }, eventLog);
        }
      }
    }
    return refreshedBalanceAccounts;
  }

  private async getDelegateRollingsByTransactionHash(
    transactionHash: string,
  ): Promise<DelegateRolling[]> {
    if (this.delegateRollingByTx.has(transactionHash)) {
      return this.delegateRollingByTx.get(transactionHash) ?? [];
    }

    const storeWithFind = this.ctx.store as typeof this.ctx.store & {
      find?: (
        entity: typeof DelegateRolling,
        options: {
          where: {
            transactionHash: string;
          };
        },
      ) => Promise<DelegateRolling[]>;
    };
    let value: DelegateRolling[] = [];
    if (storeWithFind.find) {
      value =
        (await storeWithFind.find(DelegateRolling, {
          where: {
            transactionHash,
          },
        })) ?? [];
    } else {
      const singleValue = await this.ctx.store.findOne(DelegateRolling, {
        where: {
          transactionHash,
        },
      });
      value = singleValue ? [singleValue] : [];
    }

    this.delegateRollingByTx.set(transactionHash, value);
    return value;
  }

  private rememberDelegateRolling(entity: DelegateRolling) {
    const current = this.delegateRollingByTx.get(entity.transactionHash) ?? [];
    const next = current.filter((item) => item.id !== entity.id);
    next.push(entity);
    this.delegateRollingByTx.set(entity.transactionHash, next);
  }

  private async getDelegateVotesChangedByTransactionHash(
    transactionHash: string,
  ): Promise<DelegateVotesChanged[]> {
    if (this.delegateVotesChangedByTx.has(transactionHash)) {
      return this.delegateVotesChangedByTx.get(transactionHash) ?? [];
    }

    const storeWithFind = this.ctx.store as typeof this.ctx.store & {
      find?: (
        entity: typeof DelegateVotesChanged,
        options: {
          where: {
            transactionHash: string;
          };
        },
      ) => Promise<DelegateVotesChanged[]>;
    };
    let value: DelegateVotesChanged[] = [];
    if (storeWithFind.find) {
      value =
        (await storeWithFind.find(DelegateVotesChanged, {
          where: {
            transactionHash,
          },
        })) ?? [];
    } else {
      const singleValue = await this.ctx.store.findOne(DelegateVotesChanged, {
        where: {
          transactionHash,
        },
      });
      value = singleValue ? [singleValue] : [];
    }

    this.delegateVotesChangedByTx.set(transactionHash, value);
    return value;
  }

  private rememberDelegateVotesChanged(entity: DelegateVotesChanged) {
    const current =
      this.delegateVotesChangedByTx.get(entity.transactionHash) ?? [];
    const next = current.filter((item) => item.id !== entity.id);
    next.push(entity);
    this.delegateVotesChangedByTx.set(entity.transactionHash, next);
  }

  private markDelegateRollingDirty(entity: DelegateRolling) {
    this.dirtyDelegateRollings.set(entity.id, entity);
  }

  private async getTokenTransfersByTransactionHash(
    transactionHash: string,
  ): Promise<TokenTransfer[]> {
    if (this.tokenTransferByTx.has(transactionHash)) {
      return this.tokenTransferByTx.get(transactionHash) ?? [];
    }

    const storeWithFind = this.ctx.store as typeof this.ctx.store & {
      find?: (
        entity: typeof TokenTransfer,
        options: {
          where: {
            transactionHash: string;
          };
        },
      ) => Promise<TokenTransfer[]>;
    };
    let value: TokenTransfer[] = [];
    if (storeWithFind.find) {
      value =
        (await storeWithFind.find(TokenTransfer, {
          where: {
            transactionHash,
          },
        })) ?? [];
    } else {
      const singleValue = await this.ctx.store.findOne(TokenTransfer, {
        where: {
          transactionHash,
        },
      });
      value = singleValue ? [singleValue] : [];
    }

    this.tokenTransferByTx.set(transactionHash, value);
    return value;
  }

  private rememberTokenTransfer(entity: TokenTransfer) {
    const current = this.tokenTransferByTx.get(entity.transactionHash) ?? [];
    const next = current.filter((item) => item.id !== entity.id);
    next.push(entity);
    this.tokenTransferByTx.set(entity.transactionHash, next);
  }

  private isNoopDelegateRolling(entity: Pick<
    DelegateRolling,
    "fromDelegate" | "toDelegate"
  >) {
    return (
      entity.fromDelegate.toLowerCase() === entity.toDelegate.toLowerCase()
    );
  }

  private hasTransferTouchingDelegator(
    transfers: TokenTransfer[],
    delegator: string,
  ) {
    const normalizedDelegator = delegator.toLowerCase();
    return transfers.some(
      (item) =>
        item.from.toLowerCase() === normalizedDelegator ||
        item.to.toLowerCase() === normalizedDelegator,
    );
  }

  private transferDeltaForDelegator(
    transfers: TokenTransfer[],
    delegator: string,
  ) {
    const normalizedDelegator = delegator.toLowerCase();
    const isErc721 = this.contractStandard() === "erc721";
    return transfers.reduce((sum, item) => {
      const value = isErc721 ? 1n : item.value;
      if (item.to.toLowerCase() === normalizedDelegator) {
        return sum + value;
      }
      if (item.from.toLowerCase() === normalizedDelegator) {
        return sum - value;
      }
      return sum;
    }, 0n);
  }

  private hasEarlierVoteDeltaForDelegate(
    delegateVotesChanges: DelegateVotesChanged[],
    delegate: string,
    beforeLogIndex?: number | null,
  ) {
    const normalizedDelegate = delegate.toLowerCase();
    return delegateVotesChanges.some((item) => {
      const itemDelegate =
        DegovIndexerHelpers.normalizeAddress(item.delegate) ??
        item.delegate.toLowerCase();
      return (
        itemDelegate === normalizedDelegate &&
        (beforeLogIndex === undefined || beforeLogIndex === null
          ? true
          : (item.logIndex ?? Number.MAX_SAFE_INTEGER) < beforeLogIndex)
      );
    });
  }

  private hasEarlierRollingForDelegator(
    delegateRollings: DelegateRolling[],
    currentRolling: Pick<DelegateRolling, "delegator" | "logIndex" | "id">,
  ) {
    const normalizedDelegator = currentRolling.delegator.toLowerCase();
    return delegateRollings.some((item) => {
      if (item.id === currentRolling.id || this.isNoopDelegateRolling(item)) {
        return false;
      }
      const delegator =
        DegovIndexerHelpers.normalizeAddress(item.delegator) ??
        item.delegator.toLowerCase();
      return (
        delegator === normalizedDelegator &&
        (item.logIndex ?? Number.MIN_SAFE_INTEGER) <
          (currentRolling.logIndex ?? Number.MIN_SAFE_INTEGER)
      );
    });
  }

  private hasIncomingTransferBeforeRolling(
    transfers: TokenTransfer[],
    delegator: string,
    rollingLogIndex?: number | null,
  ) {
    const normalizedDelegator = delegator.toLowerCase();
    return transfers.some((item) => {
      if (item.to.toLowerCase() !== normalizedDelegator) {
        return false;
      }
      if (rollingLogIndex === undefined || rollingLogIndex === null) {
        return true;
      }
      return (item.logIndex ?? Number.MAX_SAFE_INTEGER) < rollingLogIndex;
    });
  }

  private isInitialSelfDelegationRolling(
    delegateRolling: Pick<
      DelegateRolling,
      "delegator" | "fromDelegate" | "toDelegate"
    >,
  ) {
    const delegator =
      DegovIndexerHelpers.normalizeAddress(delegateRolling.delegator) ??
      delegateRolling.delegator.toLowerCase();
    const fromDelegate =
      DegovIndexerHelpers.normalizeAddress(delegateRolling.fromDelegate) ??
      delegateRolling.fromDelegate.toLowerCase();
    const toDelegate =
      DegovIndexerHelpers.normalizeAddress(delegateRolling.toDelegate) ??
      delegateRolling.toDelegate.toLowerCase();
    return (
      this.isZeroAddress(fromDelegate) &&
      delegator === toDelegate &&
      delegator !== zeroAddress
    );
  }

  private isTransferFromCoveredByDelegateChange(
    delegateRolling: Pick<
      DelegateRolling,
      "delegator" | "fromDelegate" | "toDelegate"
    >,
    account: string,
  ) {
    if (this.isNoopDelegateRolling(delegateRolling)) {
      return false;
    }

    return (
      delegateRolling.delegator.toLowerCase() === account.toLowerCase() &&
      !this.isZeroAddress(delegateRolling.fromDelegate)
    );
  }

  private isTransferToCoveredByDelegateChange(
    delegateRolling: Pick<
      DelegateRolling,
      "delegator" | "fromDelegate" | "toDelegate"
    >,
    account: string,
  ) {
    if (this.isNoopDelegateRolling(delegateRolling)) {
      return false;
    }

    if (!this.isInitialSelfDelegationRolling(delegateRolling)) {
      return false;
    }

    return (
      delegateRolling.delegator.toLowerCase() === account.toLowerCase() &&
      !this.isZeroAddress(delegateRolling.toDelegate)
    );
  }

  private findBestDelegateRollingMatch(
    delegateRollings: DelegateRolling[],
    delegate: string,
    delta: bigint,
    logIndex?: number | null,
  ) {
    const normalizedDelegate = delegate.toLowerCase();
    const sorted = [...delegateRollings]
      .filter((item) => !this.isNoopDelegateRolling(item))
      .filter((item) =>
        logIndex === undefined || logIndex === null
          ? true
          : (item.logIndex ?? Number.MIN_SAFE_INTEGER) < logIndex,
      )
      .sort((left, right) => (right.logIndex ?? 0) - (left.logIndex ?? 0));

    const fromCandidate = sorted.find((item) => {
      const fromDelegate =
        DegovIndexerHelpers.normalizeAddress(item.fromDelegate) ??
        item.fromDelegate.toLowerCase();
      return fromDelegate === normalizedDelegate && item.fromNewVotes === undefined;
    });

    const toCandidate = sorted.find((item) => {
      const toDelegate =
        DegovIndexerHelpers.normalizeAddress(item.toDelegate) ??
        item.toDelegate.toLowerCase();
      return toDelegate === normalizedDelegate && item.toNewVotes === undefined;
    });

    if (delta > 0n) {
      if (toCandidate) {
        return {
          rolling: toCandidate,
          side: "to" as const,
        };
      }
      if (fromCandidate) {
        return {
          rolling: fromCandidate,
          side: "from" as const,
        };
      }
    }

    if (delta < 0n) {
      if (fromCandidate) {
        return {
          rolling: fromCandidate,
          side: "from" as const,
        };
      }
      if (toCandidate) {
        return {
          rolling: toCandidate,
          side: "to" as const,
        };
      }
    }

    if (fromCandidate) {
      return {
        rolling: fromCandidate,
        side: "from" as const,
      };
    }
    if (toCandidate) {
      return {
        rolling: toCandidate,
        side: "to" as const,
      };
    }

    return undefined;
  }

  private async getDelegateMappingByFrom(
    from: string,
  ): Promise<DelegateMapping | undefined> {
    const normalizedFrom = from.toLowerCase();
    if (this.delegateMappingByFrom.has(normalizedFrom)) {
      return this.delegateMappingByFrom.get(normalizedFrom) ?? undefined;
    }

    const value =
      (await this.ctx.store.findOne(DelegateMapping, {
        where: {
          from: normalizedFrom,
        },
      })) ?? null;

    this.delegateMappingByFrom.set(normalizedFrom, value);
    return value ?? undefined;
  }

  private rememberDelegateMapping(entity: DelegateMapping) {
    this.delegateMappingByFrom.set(entity.from.toLowerCase(), entity);
  }

  private markDelegateMappingDirty(entity: DelegateMapping) {
    this.dirtyDelegateMappings.set(entity.id.toLowerCase(), entity);
  }

  private forgetDelegateMapping(from: string) {
    const normalizedFrom = from.toLowerCase();
    this.delegateMappingByFrom.set(normalizedFrom, null);
    this.dirtyDelegateMappings.delete(normalizedFrom);
  }

  private async getContributorById(
    id: string,
  ): Promise<Contributor | undefined> {
    const normalizedId = id.toLowerCase();
    if (this.contributorById.has(normalizedId)) {
      return this.contributorById.get(normalizedId) ?? undefined;
    }

    const value =
      (await this.ctx.store.findOne(Contributor, {
        where: {
          id: normalizedId,
        },
      })) ?? null;

    this.contributorById.set(normalizedId, value);
    return value ?? undefined;
  }

  private rememberContributor(entity: Contributor) {
    this.contributorById.set(entity.id.toLowerCase(), entity);
  }

  private markContributorDirty(entity: Contributor) {
    this.dirtyContributors.set(entity.id.toLowerCase(), entity);
  }

  private async getDelegateById(id: string): Promise<Delegate | undefined> {
    const normalizedId = id.toLowerCase();
    if (this.delegateById.has(normalizedId)) {
      return this.delegateById.get(normalizedId) ?? undefined;
    }

    const value =
      (await this.ctx.store.findOne(Delegate, {
        where: {
          id: normalizedId,
        },
      })) ?? null;

    this.delegateById.set(normalizedId, value);
    return value ?? undefined;
  }

  private rememberDelegate(entity: Delegate) {
    this.delegateById.set(entity.id.toLowerCase(), entity);
  }

  private markDelegateDirty(entity: Delegate) {
    this.dirtyDelegates.set(entity.id.toLowerCase(), entity);
  }

  private forgetDelegate(id: string) {
    const normalizedId = id.toLowerCase();
    this.delegateById.set(normalizedId, null);
    this.dirtyDelegates.delete(normalizedId);
  }

  private async getGlobalDataMetric(
    source: TokenScopeFields,
  ): Promise<DataMetric> {
    if (!this.globalDataMetric) {
      const storedDataMetric: DataMetric | undefined =
        await this.ctx.store.findOne(DataMetric, {
          where: {
            id: MetricsId.global,
          },
        });

      this.globalDataMetric =
        storedDataMetric ??
        new DataMetric({
          id: MetricsId.global,
        });

      if (!storedDataMetric) {
        await this.ctx.store.insert(this.globalDataMetric);
      }
    }

    this.applyScopeFields(this.globalDataMetric, source);
    return this.globalDataMetric;
  }

  async flush() {
    if (this.dirtyDelegateRollings.size > 0) {
      await this.ctx.store.save([...this.dirtyDelegateRollings.values()]);
      this.dirtyDelegateRollings.clear();
    }

    if (this.dirtyDelegateMappings.size > 0) {
      await this.ctx.store.save([...this.dirtyDelegateMappings.values()]);
      this.dirtyDelegateMappings.clear();
    }

    if (this.dirtyDelegates.size > 0) {
      await this.ctx.store.save([...this.dirtyDelegates.values()]);
      this.dirtyDelegates.clear();
    }

    if (this.dirtyContributors.size > 0) {
      await this.ctx.store.save([...this.dirtyContributors.values()]);
      this.dirtyContributors.clear();
    }

    if (this.globalDataMetric && this.globalDataMetricDirty) {
      await this.ctx.store.save(this.globalDataMetric);
      this.globalDataMetricDirty = false;
    }

    this.onchainRefreshKeysByTx.clear();
  }

  private async upsertDelegateSnapshot(
    options: {
      fromDelegate: string;
      toDelegate: string;
      blockNumber: bigint;
      blockTimestamp: bigint;
      transactionHash: string;
      isCurrent: boolean;
    } & TokenScopeFields,
  ) {
    const fromDelegate =
      DegovIndexerHelpers.normalizeAddress(options.fromDelegate) ??
      options.fromDelegate;
    const toDelegate =
      DegovIndexerHelpers.normalizeAddress(options.toDelegate) ??
      options.toDelegate;
    if (!fromDelegate || !toDelegate || this.isZeroAddress(toDelegate)) {
      return;
    }

    const id = `${fromDelegate}_${toDelegate}`;
    const storedDelegate = await this.getDelegateById(id);

    if (storedDelegate) {
      storedDelegate.blockNumber = options.blockNumber;
      storedDelegate.blockTimestamp = options.blockTimestamp;
      storedDelegate.transactionHash = options.transactionHash;
      storedDelegate.isCurrent = options.isCurrent;
      this.applyScopeFields(storedDelegate, options);
      this.rememberDelegate(storedDelegate);
      this.markDelegateDirty(storedDelegate);
      return;
    }

    const delegate = new Delegate({
      id,
      chainId: options.chainId,
      daoCode: options.daoCode,
      governorAddress: options.governorAddress,
      tokenAddress: options.tokenAddress,
      contractAddress: options.contractAddress,
      logIndex: options.logIndex,
      transactionIndex: options.transactionIndex,
      fromDelegate,
      toDelegate,
      blockNumber: options.blockNumber,
      blockTimestamp: options.blockTimestamp,
      transactionHash: options.transactionHash,
      isCurrent: options.isCurrent,
      power: 0n,
    });
    await this.ctx.store.insert(delegate);
    this.rememberDelegate(delegate);
  }

  async handle(eventLog: EvmLog<EvmFieldSelection>) {
    const itokenAbi = this.itokenAbi();
    const isDelegateChanged =
      eventLog.topics.findIndex(
        (item) => item === itokenAbi.events.DelegateChanged.topic,
      ) != -1;
    if (isDelegateChanged) {
      await this.storeDelegateChanged(eventLog);
    }

    const isDelegateVotesChanged =
      eventLog.topics.findIndex(
        (item) => item === itokenAbi.events.DelegateVotesChanged.topic,
      ) != -1;
    if (isDelegateVotesChanged) {
      await this.storeDelegateVotesChanged(eventLog);
    }

    const isTokenTransfer =
      eventLog.topics.findIndex(
        (item) => item === itokenAbi.events.Transfer.topic,
      ) != -1;
    if (isTokenTransfer) {
      await this.storeTokenTransfer(eventLog);
    }
  }

  private async storeDelegateChanged(eventLog: EvmLog<EvmFieldSelection>) {
    const itokenAbi = this.itokenAbi();
    const event = itokenAbi.events.DelegateChanged.decode(eventLog);
    const delegator =
      DegovIndexerHelpers.normalizeAddress(event.delegator) ?? event.delegator;
    const fromDelegate =
      DegovIndexerHelpers.normalizeAddress(event.fromDelegate) ??
      event.fromDelegate;
    const toDelegate =
      DegovIndexerHelpers.normalizeAddress(event.toDelegate) ??
      event.toDelegate;
    DegovIndexerHelpers.logVerboseInfo(
      this.ctx.log,
      "token.delegate-change recorded",
      {
        delegator,
        from: fromDelegate,
        to: toDelegate,
        block: eventLog.block.height,
        tx: eventLog.transactionHash,
      },
    );
    const entity = new DelegateChanged({
      id: eventLog.id,
      ...this.eventFields(eventLog),
      delegator,
      fromDelegate,
      toDelegate,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(entity);

    if (this.powerSource === "onchain") {
      const delegateRolling = new DelegateRolling({
        id: eventLog.id,
        ...this.eventFields(eventLog),
        delegator,
        fromDelegate,
        toDelegate,
        blockNumber: BigInt(eventLog.block.height),
        blockTimestamp: BigInt(eventLog.block.timestamp),
        transactionHash: eventLog.transactionHash,
      });
      await this.ctx.store.insert(delegateRolling);
      this.rememberDelegateRolling(delegateRolling);

      await this.refreshOnchainTargets(
        [
          {
            account: delegator,
            refreshBalance: true,
            refreshPower: false,
            cause: "delegate-change",
          },
          {
            account: fromDelegate,
            refreshBalance: false,
            refreshPower: true,
            cause: "delegate-change",
          },
          {
            account: toDelegate,
            refreshBalance: false,
            refreshPower: true,
            cause: "delegate-change",
          },
        ],
        eventLog,
      );
      await this.refreshOnchainDelegateMapping(delegator, eventLog);
      return;
    }

    // update delegators count all
    // First, check if delegator had previous delegation
    let previousDelegateMapping: DelegateMapping | undefined =
      await this.getDelegateMappingByFrom(entity.delegator);
    const isNoopDelegateChange =
      previousDelegateMapping?.to === entity.toDelegate &&
      entity.fromDelegate === entity.toDelegate;

    if (isNoopDelegateChange) {
      return;
    }

    // If there was a previous delegation, decrease the old delegate's count
    if (previousDelegateMapping) {
      await this.upsertDelegateSnapshot({
        ...this.eventFields(eventLog),
        fromDelegate: entity.delegator,
        toDelegate: previousDelegateMapping.to,
        blockNumber: entity.blockNumber,
        blockTimestamp: entity.blockTimestamp,
        transactionHash: entity.transactionHash,
        isCurrent: false,
      });

      let oldDelegateContributor: Contributor | undefined =
        await this.getContributorById(previousDelegateMapping.to);

      if (
        oldDelegateContributor &&
        oldDelegateContributor.delegatesCountAll > 0
      ) {
        oldDelegateContributor.delegatesCountAll -= 1;
        this.applyScopeFields(
          oldDelegateContributor,
          this.eventFields(eventLog),
        );
        this.rememberContributor(oldDelegateContributor);
        this.markContributorDirty(oldDelegateContributor);
      }
    }

    await this.ctx.store.remove(DelegateMapping, entity.delegator);
    this.forgetDelegateMapping(entity.delegator);
    if (!this.isZeroAddress(entity.toDelegate)) {
      // Increase the new delegate's count
      let newDelegateContributor: Contributor | undefined =
        await this.getContributorById(entity.toDelegate);

      if (newDelegateContributor) {
        newDelegateContributor.delegatesCountAll += 1;
        this.applyScopeFields(
          newDelegateContributor,
          this.eventFields(eventLog),
        );
        this.rememberContributor(newDelegateContributor);
        this.markContributorDirty(newDelegateContributor);
      } else {
        const contributor = new Contributor({
          id: entity.toDelegate,
          ...this.eventFields(eventLog),
          blockNumber: entity.blockNumber,
          blockTimestamp: entity.blockTimestamp,
          transactionHash: entity.transactionHash,
          power: 0n,
          delegatesCountAll: 1,
          delegatesCountEffective: 0,
        });
        await this.ctx.store.insert(contributor);
        this.rememberContributor(contributor);
        await this.increaseMetricsContributorCount(contributor);
      }

      // Only persist active delegation targets; zero address means undelegated.
      const currentDelegateMapping = new DelegateMapping({
        id: entity.delegator,
        ...this.eventFields(eventLog),
        from: entity.delegator,
        to: entity.toDelegate,
        power: 0n,
        blockNumber: entity.blockNumber,
        blockTimestamp: entity.blockTimestamp,
        transactionHash: entity.transactionHash,
      });
      await this.ctx.store.insert(currentDelegateMapping);
      this.rememberDelegateMapping(currentDelegateMapping);
      if (
        !(
          entity.fromDelegate === zeroAddress &&
          entity.delegator === entity.toDelegate
        )
      ) {
        await this.upsertDelegateSnapshot({
          ...this.eventFields(eventLog),
          fromDelegate: entity.delegator,
          toDelegate: entity.toDelegate,
          blockNumber: entity.blockNumber,
          blockTimestamp: entity.blockTimestamp,
          transactionHash: entity.transactionHash,
          isCurrent: true,
        });
      }
    }

    // store delegate rolling
    const delegateRolling = new DelegateRolling({
      id: eventLog.id,
      ...this.eventFields(eventLog),
      delegator,
      fromDelegate,
      toDelegate,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(delegateRolling);
    this.rememberDelegateRolling(delegateRolling);

    // Self-delegation still materializes an effective edge immediately.
    if (
      entity.fromDelegate === zeroAddress &&
      entity.delegator === entity.toDelegate
    ) {
      const selfDelegate = new Delegate({
        ...this.eventFields(eventLog),
        fromDelegate: entity.delegator,
        toDelegate: entity.toDelegate,
        blockNumber: entity.blockNumber,
        blockTimestamp: entity.blockTimestamp,
        transactionHash: entity.transactionHash,
        power: 0n,
      });
      await this.storeDelegate(selfDelegate);
    }
  }

  private async storeDelegateVotesChanged(eventLog: EvmLog<EvmFieldSelection>) {
    const itokenAbi = this.itokenAbi();
    const event = itokenAbi.events.DelegateVotesChanged.decode(eventLog);
    const delegate =
      DegovIndexerHelpers.normalizeAddress(event.delegate) ?? event.delegate;
    DegovIndexerHelpers.logVerboseInfo(
      this.ctx.log,
      "token.delegate-votes recorded",
      {
        delegate,
        previousVotes:
          "previousVotes" in event
            ? event.previousVotes
            : event.previousBalance,
        newVotes: "newVotes" in event ? event.newVotes : event.newBalance,
        block: eventLog.block.height,
        tx: eventLog.transactionHash,
      },
    );
    const entity = new DelegateVotesChanged({
      id: eventLog.id,
      ...this.eventFields(eventLog),
      delegate,
      previousVotes:
        "previousVotes" in event ? event.previousVotes : event.previousBalance,
      newVotes: "newVotes" in event ? event.newVotes : event.newBalance,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(entity);
    this.rememberDelegateVotesChanged(entity);
    if (this.powerSource === "onchain") {
      await this.refreshOnchainTargets(
        [
          {
            account: delegate,
            refreshBalance: false,
            refreshPower: true,
            cause: "delegate-votes-changed",
          },
        ],
        eventLog,
      );
      return;
    }
    await this.storeVotePowerCheckpoint(entity, eventLog);
    // store rolling
    await this.updateDelegateRolling(entity);
  }

  private async storeVotePowerCheckpoint(
    delegateVotesChanged: DelegateVotesChanged,
    eventLog: EvmLog<EvmFieldSelection>,
  ) {
    const [clockMode, delegateRollings, tokenTransfer] = await Promise.all([
      this.voteClockMode(),
      this.getDelegateRollingsByTransactionHash(
        delegateVotesChanged.transactionHash,
      ),
      this.getTokenTransfersByTransactionHash(
        delegateVotesChanged.transactionHash,
      ),
    ]);
    const delta =
      BigInt(delegateVotesChanged.newVotes) -
      BigInt(delegateVotesChanged.previousVotes);
    const delegateRolling = this.findBestDelegateRollingMatch(
      delegateRollings,
      delegateVotesChanged.delegate,
      delta,
      eventLog.logIndex,
    )?.rolling;

    const checkpoint = new VotePowerCheckpoint({
      id: eventLog.id,
      ...this.eventFields(eventLog),
      account:
        DegovIndexerHelpers.normalizeAddress(delegateVotesChanged.delegate) ??
        delegateVotesChanged.delegate,
      clockMode,
      timepoint: votePowerTimepointForLog({
        clockMode,
        blockHeight: eventLog.block.height,
        blockTimestampMs: eventLog.block.timestamp,
      }),
      previousPower: BigInt(delegateVotesChanged.previousVotes),
      newPower: BigInt(delegateVotesChanged.newVotes),
      delta,
      source: "event",
      cause: classifyVotePowerCheckpointCause({
        hasDelegateChange: delegateRollings.length > 0,
        hasTransfer: tokenTransfer.length > 0,
      }),
      delegator: DegovIndexerHelpers.normalizeAddress(
        delegateRolling?.delegator,
      ),
      fromDelegate: DegovIndexerHelpers.normalizeAddress(
        delegateRolling?.fromDelegate,
      ),
      toDelegate: DegovIndexerHelpers.normalizeAddress(
        delegateRolling?.toDelegate,
      ),
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });

    await this.ctx.store.insert(checkpoint);
  }

  private async updateDelegateRolling(options: DelegateVotesChanged) {
    const rawVoteDelta = options.newVotes - options.previousVotes;
    const delegateRollings = await this.getDelegateRollingsByTransactionHash(
      options.transactionHash,
    );
    const match = this.findBestDelegateRollingMatch(
      delegateRollings,
      options.delegate,
      rawVoteDelta,
      options.logIndex,
    );
    if (!match) {
      DegovIndexerHelpers.logVerboseInfo(
        this.ctx.log,
        "token.delegate relation skipped",
        {
          reason: "transfer-without-delegate-change",
          delegate: options.delegate,
          tx: options.transactionHash,
        },
      );
      return;
    }
    const delegateRolling = match.rolling;
    const dvcDelegate =
      DegovIndexerHelpers.normalizeAddress(options.delegate) ??
      options.delegate.toLowerCase();
    const rollingDelegator =
      DegovIndexerHelpers.normalizeAddress(delegateRolling.delegator) ??
      delegateRolling.delegator.toLowerCase();
    const rollingFromDelegate =
      DegovIndexerHelpers.normalizeAddress(delegateRolling.fromDelegate) ??
      delegateRolling.fromDelegate.toLowerCase();
    const rollingToDelegate =
      DegovIndexerHelpers.normalizeAddress(delegateRolling.toDelegate) ??
      delegateRolling.toDelegate.toLowerCase();

    delegateRolling.delegator = rollingDelegator;
    delegateRolling.fromDelegate = rollingFromDelegate;
    delegateRolling.toDelegate = rollingToDelegate;

    const tokenTransfers = await this.getTokenTransfersByTransactionHash(
      options.transactionHash,
    );
    const delegateVotesChanges =
      await this.getDelegateVotesChangedByTransactionHash(
        options.transactionHash,
      );
    const hasEarlierRollingForSameDelegator = this.hasEarlierRollingForDelegator(
      delegateRollings,
      delegateRolling,
    );

    /*
    // delegate change b to c
     {
       method: "DelegateChanged",
       delegator: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
       fromDelegate: "0x3e8436e87abb49efe1a958ee73fbb7a12b419aab",
       toDelegate: "0x92e9Fb99E99d79Bc47333E451e7c6490dbf24b22",
     }
    */
    let fromDelegate, toDelegate;
    let replaceStoredPowerWith: bigint | undefined;
    if (match.side === "from") {
      const isDelegateChangeToAnother =
        rollingDelegator !== rollingFromDelegate &&
        rollingDelegator !== rollingToDelegate;

      delegateRolling.fromNewVotes = options.newVotes;
      delegateRolling.fromPreviousVotes = options.previousVotes;
      // retuning power to self
      if (
        (rollingDelegator === rollingToDelegate &&
          rollingFromDelegate !== zeroAddress) ||
        isDelegateChangeToAnother
      ) {
        fromDelegate = rollingDelegator;
        toDelegate = rollingFromDelegate;
        replaceStoredPowerWith = 0n;
      } else {
        // delegate to other
        fromDelegate = rollingFromDelegate;
        toDelegate = rollingDelegator;
      }
    }
    if (match.side === "to") {
      delegateRolling.toNewVotes = options.newVotes;
      delegateRolling.toPreviousVotes = options.previousVotes;

      const transferTouchesDelegator = this.hasTransferTouchingDelegator(
        tokenTransfers,
        rollingDelegator,
      );
      const hasEarlierFromSideVoteDelta = this.hasEarlierVoteDeltaForDelegate(
        delegateVotesChanges,
        rollingFromDelegate,
        options.logIndex,
      );
      const currentDelegateMapping =
        await this.getDelegateMappingByFrom(rollingDelegator);
      const isInitialSelfDelegation = this.isInitialSelfDelegationRolling(
        delegateRolling,
      );
      const needsInitialDelegationMaterialization =
        this.isZeroAddress(rollingFromDelegate) &&
        (currentDelegateMapping?.power ?? 0n) === 0n &&
        this.hasIncomingTransferBeforeRolling(
          tokenTransfers,
          rollingDelegator,
          delegateRolling.logIndex,
        ) &&
        !hasEarlierRollingForSameDelegator;
      if (
        transferTouchesDelegator &&
        !isInitialSelfDelegation &&
        !needsInitialDelegationMaterialization &&
        !hasEarlierFromSideVoteDelta &&
        !hasEarlierRollingForSameDelegator
      ) {
        DegovIndexerHelpers.logVerboseInfo(
          this.ctx.log,
          "token.delegate relation skipped",
          {
            reason: "delegate-change-transfer-only-delta",
            delegator: rollingDelegator,
            delegate: options.delegate,
            tx: options.transactionHash,
          },
        );
        this.applyScopeFields(delegateRolling, {
          chainId: options.chainId,
          daoCode: options.daoCode,
          governorAddress: options.governorAddress,
          tokenAddress: options.tokenAddress,
          contractAddress: options.contractAddress,
          logIndex: options.logIndex,
          transactionIndex: options.transactionIndex,
        });
        this.rememberDelegateRolling(delegateRolling);
        this.markDelegateRollingDirty(delegateRolling);
        return;
      }

      fromDelegate = rollingDelegator;
      toDelegate =
        rollingDelegator === rollingToDelegate
          ? rollingDelegator
          : rollingToDelegate;
      if (transferTouchesDelegator) {
        replaceStoredPowerWith = undefined;
      }
    }

    let relationDelta = rawVoteDelta;
    if (match.side === "to") {
      const transferTouchesDelegator = this.hasTransferTouchingDelegator(
        tokenTransfers,
        rollingDelegator,
      );
      const currentDelegateMapping =
        await this.getDelegateMappingByFrom(rollingDelegator);
      const isInitialSelfDelegation = this.isInitialSelfDelegationRolling(
        delegateRolling,
      );
      const needsInitialDelegationMaterialization =
        this.isZeroAddress(rollingFromDelegate) &&
        (currentDelegateMapping?.power ?? 0n) === 0n &&
        this.hasIncomingTransferBeforeRolling(
          tokenTransfers,
          rollingDelegator,
          delegateRolling.logIndex,
        ) &&
        !hasEarlierRollingForSameDelegator;
      if (
        transferTouchesDelegator &&
        !isInitialSelfDelegation &&
        !needsInitialDelegationMaterialization &&
        !this.hasEarlierVoteDeltaForDelegate(
          delegateVotesChanges,
          rollingFromDelegate,
          options.logIndex,
        ) &&
        !hasEarlierRollingForSameDelegator
      ) {
        relationDelta -= this.transferDeltaForDelegator(
          tokenTransfers,
          rollingDelegator,
        );
      }
    }

    const delegate = new Delegate({
      chainId: delegateRolling.chainId,
      daoCode: delegateRolling.daoCode,
      governorAddress: delegateRolling.governorAddress,
      tokenAddress: delegateRolling.tokenAddress,
      contractAddress: options.contractAddress,
      logIndex: options.logIndex,
      transactionIndex: options.transactionIndex,
      fromDelegate,
      toDelegate,
      blockNumber: delegateRolling.blockNumber,
      blockTimestamp: delegateRolling.blockTimestamp,
      transactionHash: delegateRolling.transactionHash,
      power: relationDelta,
    });

    DegovIndexerHelpers.logVerboseInfo(
      this.ctx.log,
      "token.delegate relation updated",
      {
        delegator: delegateRolling.delegator,
        from: fromDelegate,
        to: toDelegate,
        delegate: options.delegate,
        delta: relationDelta,
        tx: options.transactionHash,
      },
    );

    this.applyScopeFields(delegateRolling, {
      chainId: options.chainId,
      daoCode: options.daoCode,
      governorAddress: options.governorAddress,
      tokenAddress: options.tokenAddress,
      contractAddress: options.contractAddress,
      logIndex: options.logIndex,
      transactionIndex: options.transactionIndex,
    });
    this.rememberDelegateRolling(delegateRolling);
    this.markDelegateRollingDirty(delegateRolling);
    await this.storeDelegate(delegate, { replaceStoredPowerWith });
  }

  private async storeTokenTransfer(eventLog: EvmLog<EvmFieldSelection>) {
    const contractStandard = this.contractStandard();
    const isErc721 = contractStandard === "erc721";
    const itokenAbi = this.itokenAbi();

    const event = itokenAbi.events.Transfer.decode(eventLog);
    const from = DegovIndexerHelpers.normalizeAddress(event.from) ?? event.from;
    const to = DegovIndexerHelpers.normalizeAddress(event.to) ?? event.to;
    DegovIndexerHelpers.logVerboseInfo(
      this.ctx.log,
      "token.transfer recorded",
      {
        from,
        to,
        value: "value" in event ? event.value : event.tokenId,
        standard: contractStandard,
        block: eventLog.block.height,
        tx: eventLog.transactionHash,
      },
    );
    const entity = new TokenTransfer({
      id: eventLog.id,
      ...this.eventFields(eventLog),
      from,
      to,
      value: "value" in event ? event.value : event.tokenId,
      standard: contractStandard,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(entity);
    this.rememberTokenTransfer(entity);

    if (this.powerSource === "onchain") {
      const targets: OnchainRefreshTarget[] = [];
      const delegateByDelegator = new Map<string, string | undefined>();
      if (!this.isZeroAddress(entity.from)) {
        targets.push({
          account: entity.from,
          refreshBalance: true,
          refreshPower: false,
          cause: "transfer",
        });
        const fromDelegate = await this.delegateOfAt(entity.from, eventLog);
        delegateByDelegator.set(this.normalizeAddress(entity.from), fromDelegate);
        if (fromDelegate) {
          targets.push({
            account: fromDelegate,
            refreshBalance: false,
            refreshPower: true,
            cause: "transfer",
          });
        }
      }
      if (!this.isZeroAddress(entity.to)) {
        targets.push({
          account: entity.to,
          refreshBalance: true,
          refreshPower: false,
          cause: "transfer",
        });
        const toDelegate = await this.delegateOfAt(entity.to, eventLog);
        delegateByDelegator.set(this.normalizeAddress(entity.to), toDelegate);
        if (toDelegate) {
          targets.push({
            account: toDelegate,
            refreshBalance: false,
            refreshPower: true,
            cause: "transfer",
          });
        }
      }
      const refreshedBalanceAccounts = await this.refreshOnchainTargets(
        targets,
        eventLog,
      );
      for (const account of [entity.from, entity.to]) {
        const normalizedAccount = this.normalizeAddress(account);
        if (
          !this.isZeroAddress(normalizedAccount) &&
          refreshedBalanceAccounts.has(normalizedAccount)
        ) {
          const contributor = await this.getContributorById(normalizedAccount);
          await this.refreshOnchainDelegateMapping(normalizedAccount, eventLog, {
            delegatee: delegateByDelegator.get(normalizedAccount),
            power: contributor?.balance ?? 0n,
          });
        }
      }
      return;
    }

    const delegateRollings = await this.getDelegateRollingsByTransactionHash(
      entity.transactionHash,
    );
    const transferFromCoveredByDelegateChange = delegateRollings.some(
      (item) => this.isTransferFromCoveredByDelegateChange(item, entity.from),
    );
    const transferToCoveredByDelegateChange = delegateRollings.some(
      (item) => this.isTransferToCoveredByDelegateChange(item, entity.to),
    );
    if (
      transferFromCoveredByDelegateChange &&
      transferToCoveredByDelegateChange
    ) {
      DegovIndexerHelpers.logVerboseInfo(
        this.ctx.log,
        "token.delegate relation skipped",
        {
          reason: "transfer-covered-by-delegate-change",
          tx: entity.transactionHash,
          delegators: delegateRollings.map((item) => item.delegator),
        },
      );
      return;
    }

    // store delegate
    const storedFromDelegate: DelegateMapping | undefined =
      await this.getDelegateMappingByFrom(entity.from);

    const storedToDelegate: DelegateMapping | undefined =
      await this.getDelegateMappingByFrom(entity.to);

    if (storedFromDelegate && !transferFromCoveredByDelegateChange) {
      const fromDelegate = new Delegate({
        ...this.eventFields(eventLog),
        fromDelegate: storedFromDelegate.from,
        toDelegate: storedFromDelegate.to,
        blockNumber: entity.blockNumber,
        blockTimestamp: entity.blockTimestamp,
        transactionHash: entity.transactionHash,
        power: -(isErc721 ? 1n : "value" in event ? event.value : 0n),
      });
      await this.storeDelegate(fromDelegate);
    }
    if (storedToDelegate && !transferToCoveredByDelegateChange) {
      const toDelegate = new Delegate({
        ...this.eventFields(eventLog),
        fromDelegate: storedToDelegate.from,
        toDelegate: storedToDelegate.to,
        blockNumber: entity.blockNumber,
        blockTimestamp: entity.blockTimestamp,
        transactionHash: entity.transactionHash,
        power: isErc721 ? 1n : "value" in event ? event.value : 0n,
      });
      await this.storeDelegate(toDelegate);
    }
  }

  private async storeDelegate(
    currentDelegate: Delegate,
    options?: {
      replaceStoredPowerWith?: bigint;
    },
  ) {
    if (!currentDelegate.fromDelegate || !currentDelegate.toDelegate) {
      this.ctx.log.warn(
        DegovIndexerHelpers.formatLogLine("token.delegate invalid", {
          reason: "missing-delegate-address",
          from: currentDelegate.fromDelegate,
          to: currentDelegate.toDelegate,
          tx: currentDelegate.transactionHash,
        }),
      );
    }
    currentDelegate.fromDelegate = currentDelegate.fromDelegate.toLowerCase();
    currentDelegate.toDelegate = currentDelegate.toDelegate.toLowerCase();
    if (this.isZeroAddress(currentDelegate.toDelegate)) {
      return;
    }
    currentDelegate.id = `${currentDelegate.fromDelegate}_${currentDelegate.toDelegate}`;

    let storedDelegateFromWithTo: Delegate | undefined =
      await this.getDelegateById(currentDelegate.id);

    const storedFromDelegate: DelegateMapping | undefined =
      await this.getDelegateMappingByFrom(currentDelegate.fromDelegate);
    const isCurrent =
      storedFromDelegate?.to?.toLowerCase() === currentDelegate.toDelegate;
    const previousCurrentMappingPower = storedFromDelegate?.power ?? null;
    const previousRelationPower = storedDelegateFromWithTo?.power ?? 0n;

    let delegatesCountEffective = 0;
    if (!storedDelegateFromWithTo) {
      currentDelegate.isCurrent = isCurrent;
      const persistedPower =
        options?.replaceStoredPowerWith ?? currentDelegate.power;
      currentDelegate.power = persistedPower;
      await this.ctx.store.insert(currentDelegate);
      this.rememberDelegate(currentDelegate);
      if (persistedPower !== 0n) {
        delegatesCountEffective += 1;
      }
    } else {
      // update delegate
      const oldPower = storedDelegateFromWithTo.power;
      const reactivatedCurrentRelation =
        isCurrent &&
        previousCurrentMappingPower === 0n &&
        currentDelegate.power > 0n;

      if (options?.replaceStoredPowerWith !== undefined) {
        storedDelegateFromWithTo.power = options.replaceStoredPowerWith;
      } else if (reactivatedCurrentRelation) {
        storedDelegateFromWithTo.power = currentDelegate.power;
      } else {
        storedDelegateFromWithTo.power += currentDelegate.power;
      }
      storedDelegateFromWithTo.blockNumber = currentDelegate.blockNumber;
      storedDelegateFromWithTo.blockTimestamp = currentDelegate.blockTimestamp;
      storedDelegateFromWithTo.transactionHash =
        currentDelegate.transactionHash;
      storedDelegateFromWithTo.isCurrent = isCurrent;
      this.applyScopeFields(storedDelegateFromWithTo, {
        chainId: currentDelegate.chainId,
        daoCode: currentDelegate.daoCode,
        governorAddress: currentDelegate.governorAddress,
        tokenAddress: currentDelegate.tokenAddress,
        contractAddress: currentDelegate.contractAddress,
        logIndex: currentDelegate.logIndex,
        transactionIndex: currentDelegate.transactionIndex,
      });
      if (
        (oldPower === 0n || reactivatedCurrentRelation) &&
        storedDelegateFromWithTo.power !== 0n
      ) {
        delegatesCountEffective += 1;
      }
      // Keep zero-power rows so current and historical relations remain queryable.
      if (storedDelegateFromWithTo.power === 0n && oldPower !== 0n) {
        delegatesCountEffective -= 1;
      }
      this.rememberDelegate(storedDelegateFromWithTo);
      this.markDelegateDirty(storedDelegateFromWithTo);
    }
    let synchronizedCurrentRelation = false;
    if (
      storedFromDelegate &&
      isCurrent &&
      storedFromDelegate.to?.toLowerCase() === currentDelegate.toDelegate
    ) {
      storedFromDelegate.power = storedFromDelegate.power + currentDelegate.power;
      this.applyScopeFields(storedFromDelegate, {
        chainId: currentDelegate.chainId,
        daoCode: currentDelegate.daoCode,
        governorAddress: currentDelegate.governorAddress,
        tokenAddress: currentDelegate.tokenAddress,
        contractAddress: currentDelegate.contractAddress,
        logIndex: currentDelegate.logIndex,
        transactionIndex: currentDelegate.transactionIndex,
      });
      this.rememberDelegateMapping(storedFromDelegate);
      this.markDelegateMappingDirty(storedFromDelegate);

      // The current Delegate row is a materialized view of DelegateMapping.
      // Keep them in sync instead of allowing incremental drift.
      synchronizedCurrentRelation = true;
      if (storedDelegateFromWithTo) {
        storedDelegateFromWithTo.power = storedFromDelegate.power;
        this.rememberDelegate(storedDelegateFromWithTo);
        this.markDelegateDirty(storedDelegateFromWithTo);
      } else {
        currentDelegate.power = storedFromDelegate.power;
        this.rememberDelegate(currentDelegate);
        this.markDelegateDirty(currentDelegate);
      }
    }

    const finalRelationPower =
      storedDelegateFromWithTo?.power ?? currentDelegate.power;
    const contributorPowerDelta =
      synchronizedCurrentRelation && currentDelegate.power === 0n
        ? finalRelationPower - previousRelationPower
        : currentDelegate.power;

    // store contributor
    const contributor = new Contributor({
      id: currentDelegate.toDelegate,
      chainId: currentDelegate.chainId,
      daoCode: currentDelegate.daoCode,
      governorAddress: currentDelegate.governorAddress,
      tokenAddress: currentDelegate.tokenAddress,
      contractAddress: currentDelegate.contractAddress,
      logIndex: currentDelegate.logIndex,
      transactionIndex: currentDelegate.transactionIndex,
      blockNumber: currentDelegate.blockNumber,
      blockTimestamp: currentDelegate.blockTimestamp,
      transactionHash: currentDelegate.transactionHash,
      power: contributorPowerDelta,
      delegatesCountAll: 0,
      delegatesCountEffective,
    });
    await this.storeContributor(contributor);

    // store metrics
    const dm = await this.getGlobalDataMetric({
      chainId: currentDelegate.chainId,
      daoCode: currentDelegate.daoCode,
      governorAddress: currentDelegate.governorAddress,
      tokenAddress: currentDelegate.tokenAddress,
      contractAddress: currentDelegate.contractAddress,
      logIndex: currentDelegate.logIndex,
      transactionIndex: currentDelegate.transactionIndex,
    });
    this.applyScopeFields(dm, {
      chainId: currentDelegate.chainId,
      daoCode: currentDelegate.daoCode,
      governorAddress: currentDelegate.governorAddress,
      tokenAddress: currentDelegate.tokenAddress,
      contractAddress: currentDelegate.contractAddress,
      logIndex: currentDelegate.logIndex,
      transactionIndex: currentDelegate.transactionIndex,
    });
    dm.powerSum = (dm.powerSum ?? 0n) + contributorPowerDelta;
    this.globalDataMetricDirty = true;
  }

  private async storeContributor(contributor: Contributor) {
    let storedContributor: Contributor | undefined =
      await this.getContributorById(contributor.id);

    let storeMemberMetrics = false;
    // update stored contributor
    if (storedContributor) {
      storedContributor.blockNumber = contributor.blockNumber;
      storedContributor.blockTimestamp = contributor.blockTimestamp;
      storedContributor.transactionHash = contributor.transactionHash;
      this.applyScopeFields(storedContributor, {
        chainId: contributor.chainId,
        daoCode: contributor.daoCode,
        governorAddress: contributor.governorAddress,
        tokenAddress: contributor.tokenAddress,
        contractAddress: contributor.contractAddress,
        logIndex: contributor.logIndex,
        transactionIndex: contributor.transactionIndex,
      });

      storedContributor.power = storedContributor.power + contributor.power;
      storedContributor.delegatesCountEffective =
        storedContributor.delegatesCountEffective +
        contributor.delegatesCountEffective;

      this.rememberContributor(storedContributor);
      this.markContributorDirty(storedContributor);
    } else {
      storeMemberMetrics = true;
      // save new contributor
      await this.ctx.store.insert(contributor);
      storedContributor = contributor;
      this.rememberContributor(storedContributor);
    }

    if (!storeMemberMetrics) {
      return;
    }
    await this.increaseMetricsContributorCount(contributor);
  }

  private async increaseMetricsContributorCount(source: TokenScopeFields) {
    // increase metrics for memberCount
    const dm = await this.getGlobalDataMetric(source);
    this.applyScopeFields(dm, source);
    dm.memberCount = (dm.memberCount ?? 0) + 1;
    this.globalDataMetricDirty = true;
  }
}
