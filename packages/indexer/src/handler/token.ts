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

export interface TokenhandlerOptions {
  chainId: number;
  rpcs: string[];
  work: IndexerWork;
  indexContract: IndexerContract;
  chainTool: ChainTool;
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

export class TokenHandler {
  private voteClockModePromise?: Promise<ClockMode>;
  private globalDataMetric?: DataMetric;
  private globalDataMetricDirty = false;
  private readonly delegateRollingByTx = new Map<string, DelegateRolling | null>();
  private readonly tokenTransferByTx = new Map<string, TokenTransfer | null>();
  private readonly delegateMappingByFrom = new Map<string, DelegateMapping | null>();
  private readonly contributorById = new Map<string, Contributor | null>();
  private readonly delegateById = new Map<string, Delegate | null>();
  private readonly dirtyDelegateRollings = new Map<string, DelegateRolling>();
  private readonly dirtyDelegateMappings = new Map<string, DelegateMapping>();
  private readonly dirtyContributors = new Map<string, Contributor>();
  private readonly dirtyDelegates = new Map<string, Delegate>();

  constructor(
    private readonly ctx: DataHandlerContext<Store, EvmFieldSelection>,
    private readonly options: TokenhandlerOptions,
  ) {}

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

  private async getDelegateRollingByTransactionHash(
    transactionHash: string,
  ): Promise<DelegateRolling | undefined> {
    if (this.delegateRollingByTx.has(transactionHash)) {
      return this.delegateRollingByTx.get(transactionHash) ?? undefined;
    }

    const value =
      (await this.ctx.store.findOne(DelegateRolling, {
        where: {
          transactionHash,
        },
      })) ?? null;

    this.delegateRollingByTx.set(transactionHash, value);
    return value ?? undefined;
  }

  private rememberDelegateRolling(entity: DelegateRolling) {
    this.delegateRollingByTx.set(entity.transactionHash, entity);
  }

  private markDelegateRollingDirty(entity: DelegateRolling) {
    this.dirtyDelegateRollings.set(entity.id, entity);
  }

  private async getTokenTransferByTransactionHash(
    transactionHash: string,
  ): Promise<TokenTransfer | undefined> {
    if (this.tokenTransferByTx.has(transactionHash)) {
      return this.tokenTransferByTx.get(transactionHash) ?? undefined;
    }

    const value =
      (await this.ctx.store.findOne(TokenTransfer, {
        where: {
          transactionHash,
        },
      })) ?? null;

    this.tokenTransferByTx.set(transactionHash, value);
    return value ?? undefined;
  }

  private rememberTokenTransfer(entity: TokenTransfer) {
    this.tokenTransferByTx.set(entity.transactionHash, entity);
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
    this.delegateMappingByFrom.set(from.toLowerCase(), null);
  }

  private async getContributorById(id: string): Promise<Contributor | undefined> {
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
    this.delegateById.set(id.toLowerCase(), null);
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
    DegovIndexerHelpers.logVerboseInfo(
      this.ctx.log,
      "token.delegate-change recorded",
      {
        delegator: event.delegator,
        from: event.fromDelegate,
        to: event.toDelegate,
        block: eventLog.block.height,
        tx: eventLog.transactionHash,
      },
    );
    const entity = new DelegateChanged({
      id: eventLog.id,
      ...this.eventFields(eventLog),
      delegator: event.delegator,
      fromDelegate: event.fromDelegate,
      toDelegate: event.toDelegate,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(entity);

    // update delegators count all
    // First, check if delegator had previous delegation
    let previousDelegateMapping: DelegateMapping | undefined =
      await this.getDelegateMappingByFrom(entity.delegator);

    // If there was a previous delegation, decrease the old delegate's count
    if (previousDelegateMapping) {
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
    }

    // store delegate rolling
    const delegateRolling = new DelegateRolling({
      id: eventLog.id,
      ...this.eventFields(eventLog),
      delegator: event.delegator,
      fromDelegate: event.fromDelegate,
      toDelegate: event.toDelegate,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(delegateRolling);
    this.rememberDelegateRolling(delegateRolling);

    // store self delegate
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
    DegovIndexerHelpers.logVerboseInfo(
      this.ctx.log,
      "token.delegate-votes recorded",
      {
        delegate: event.delegate,
        previousVotes:
          "previousVotes" in event ? event.previousVotes : event.previousBalance,
        newVotes: "newVotes" in event ? event.newVotes : event.newBalance,
        block: eventLog.block.height,
        tx: eventLog.transactionHash,
      },
    );
    const entity = new DelegateVotesChanged({
      id: eventLog.id,
      ...this.eventFields(eventLog),
      delegate: event.delegate,
      previousVotes:
        "previousVotes" in event ? event.previousVotes : event.previousBalance,
      newVotes: "newVotes" in event ? event.newVotes : event.newBalance,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(entity);
    await this.storeVotePowerCheckpoint(entity, eventLog);
    // store rolling
    await this.updateDelegateRolling(entity);
  }

  private async storeVotePowerCheckpoint(
    delegateVotesChanged: DelegateVotesChanged,
    eventLog: EvmLog<EvmFieldSelection>,
  ) {
    const [clockMode, delegateRolling, tokenTransfer] = await Promise.all([
      this.voteClockMode(),
      this.getDelegateRollingByTransactionHash(delegateVotesChanged.transactionHash),
      this.getTokenTransferByTransactionHash(delegateVotesChanged.transactionHash),
    ]);

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
      delta:
        BigInt(delegateVotesChanged.newVotes) -
        BigInt(delegateVotesChanged.previousVotes),
      cause: classifyVotePowerCheckpointCause({
        hasDelegateChange: Boolean(delegateRolling),
        hasTransfer: Boolean(tokenTransfer),
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
    const delegateRolling: DelegateRolling | undefined =
      await this.getDelegateRollingByTransactionHash(options.transactionHash);
    if (!delegateRolling) {
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
    const dvcDelegate = options.delegate.toLowerCase();
    if (
      dvcDelegate !== delegateRolling.fromDelegate &&
      dvcDelegate !== delegateRolling.toDelegate
    ) {
      DegovIndexerHelpers.logVerboseInfo(
        this.ctx.log,
        "token.delegate relation skipped",
        {
          reason: "delegate-mismatch-for-transaction",
          delegate: options.delegate,
          expectedFrom: delegateRolling.fromDelegate,
          expectedTo: delegateRolling.toDelegate,
          tx: options.transactionHash,
        },
      );
      return;
    }

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
    if (options.delegate === delegateRolling.fromDelegate) {
      const isDelegateChangeToAnother =
        delegateRolling.delegator !== delegateRolling.fromDelegate &&
        delegateRolling.delegator !== delegateRolling.toDelegate;

      delegateRolling.fromNewVotes = options.newVotes;
      delegateRolling.fromPreviousVotes = options.previousVotes;
      // retuning power to self
      if (
        (delegateRolling.delegator === delegateRolling.toDelegate &&
          delegateRolling.fromDelegate !== zeroAddress) ||
        isDelegateChangeToAnother
      ) {
        fromDelegate = delegateRolling.delegator;
        toDelegate = delegateRolling.fromDelegate;
      } else {
        // delegate to other
        fromDelegate = delegateRolling.fromDelegate;
        toDelegate = delegateRolling.delegator;
      }
    }
    if (options.delegate === delegateRolling.toDelegate) {
      delegateRolling.toNewVotes = options.newVotes;
      delegateRolling.toPreviousVotes = options.previousVotes;

      fromDelegate = delegateRolling.delegator;
      toDelegate =
        delegateRolling.delegator === delegateRolling.toDelegate
          ? delegateRolling.delegator
          : delegateRolling.toDelegate;
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
      power: options.newVotes - options.previousVotes,
    });

    DegovIndexerHelpers.logVerboseInfo(
      this.ctx.log,
      "token.delegate relation updated",
      {
        delegator: delegateRolling.delegator,
        from: fromDelegate,
        to: toDelegate,
        delegate: options.delegate,
        delta: options.newVotes - options.previousVotes,
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
    await this.storeDelegate(delegate);
  }

  private async storeTokenTransfer(eventLog: EvmLog<EvmFieldSelection>) {
    const contractStandard = this.contractStandard();
    const isErc721 = contractStandard === "erc721";
    const itokenAbi = this.itokenAbi();

    const event = itokenAbi.events.Transfer.decode(eventLog);
    DegovIndexerHelpers.logVerboseInfo(
      this.ctx.log,
      "token.transfer recorded",
      {
        from: event.from,
        to: event.to,
        value: "value" in event ? event.value : event.tokenId,
        standard: contractStandard,
        block: eventLog.block.height,
        tx: eventLog.transactionHash,
      },
    );
    const entity = new TokenTransfer({
      id: eventLog.id,
      ...this.eventFields(eventLog),
      from: event.from,
      to: event.to,
      value: "value" in event ? event.value : event.tokenId,
      standard: contractStandard,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(entity);
    this.rememberTokenTransfer(entity);

    // store delegate
    const storedFromDelegate: DelegateMapping | undefined =
      await this.getDelegateMappingByFrom(entity.from);

    const storedToDelegate: DelegateMapping | undefined =
      await this.getDelegateMappingByFrom(entity.to);

    if (storedFromDelegate) {
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
    if (storedToDelegate) {
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

  private async storeDelegate(currentDelegate: Delegate, options?: {}) {
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

    let newDelegatePowerOfFromTo;
    let delegatesCountEffective = 0;
    if (!storedDelegateFromWithTo) {
      await this.ctx.store.insert(currentDelegate);
      this.rememberDelegate(currentDelegate);
      delegatesCountEffective += 1;
      newDelegatePowerOfFromTo = currentDelegate.power;
    } else {
      // update delegate
      const oldPower = storedDelegateFromWithTo.power;
      storedDelegateFromWithTo.power += currentDelegate.power;
      storedDelegateFromWithTo.blockNumber = currentDelegate.blockNumber;
      storedDelegateFromWithTo.blockTimestamp = currentDelegate.blockTimestamp;
      storedDelegateFromWithTo.transactionHash =
        currentDelegate.transactionHash;
      this.applyScopeFields(storedDelegateFromWithTo, {
        chainId: currentDelegate.chainId,
        daoCode: currentDelegate.daoCode,
        governorAddress: currentDelegate.governorAddress,
        tokenAddress: currentDelegate.tokenAddress,
        contractAddress: currentDelegate.contractAddress,
        logIndex: currentDelegate.logIndex,
        transactionIndex: currentDelegate.transactionIndex,
      });
      // Remove delegate record if power is zero
      if (storedDelegateFromWithTo.power === 0n) {
        await this.ctx.store.remove(Delegate, storedDelegateFromWithTo.id);
        this.forgetDelegate(storedDelegateFromWithTo.id);
        // Only decrement count if transitioning from non-zero to zero
        if (oldPower !== 0n) {
          delegatesCountEffective -= 1;
        }
      } else {
        this.rememberDelegate(storedDelegateFromWithTo);
        this.markDelegateDirty(storedDelegateFromWithTo);
      }
      newDelegatePowerOfFromTo = storedDelegateFromWithTo.power;
    }

    const storedFromDelegate: DelegateMapping | undefined =
      await this.getDelegateMappingByFrom(currentDelegate.fromDelegate);
    if (storedFromDelegate) {
      storedFromDelegate.power = newDelegatePowerOfFromTo;
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
    }

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
      power: currentDelegate.power,
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
    dm.powerSum = (dm.powerSum ?? 0n) + currentDelegate.power;
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

    // sync user power
    const syncEndpoint = process.env.DEGOV_SYNC_ENDPOINT;
    const syncAuthToken = process.env.DEGOV_SYNC_AUTH_TOKEN;
    if (syncEndpoint && syncAuthToken) {
      try {
        const controller = new AbortController();
        const signal = controller.signal;
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        await fetch(syncEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-degov-sync-token": syncAuthToken,
            "x-degov-daocode": this.options.work.daoCode,
          },
          body: JSON.stringify([
            {
              method: "sync.user.power",
              body: {
                address: storedContributor.id,
                power: storedContributor.power.toString(),
              },
            },
          ]),
          signal,
        });
        clearTimeout(timeoutId);
      } catch (error) {
        this.ctx.log.error(
          DegovIndexerHelpers.formatLogLine("token.contributor sync failed", {
            address: storedContributor.id,
            power: storedContributor.power,
            error: DegovIndexerHelpers.formatError(error),
          }),
        );
      }
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
