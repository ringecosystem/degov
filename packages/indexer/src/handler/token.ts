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
  constructor(
    private readonly ctx: DataHandlerContext<Store, EvmFieldSelection>,
    private readonly options: TokenhandlerOptions
  ) {}

  private governorAddress(): string {
    const governorAddress = DegovIndexerHelpers.findContractAddress(
      this.options.work,
      "governor"
    );
    if (!governorAddress) {
      throw new Error(
        `governor contract not found in work daoCode: ${this.options.work.daoCode}`
      );
    }
    return governorAddress;
  }

  private tokenAddress(): string {
    return DegovIndexerHelpers.normalizeAddress(this.options.indexContract.address)!;
  }

  private async voteClockMode(): Promise<ClockMode> {
    return this.options.chainTool.clockMode({
      chainId: this.options.chainId,
      contractAddress: this.governorAddress() as `0x${string}`,
      rpcs: this.options.rpcs,
    });
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
    scope: TokenScopeFields
  ): T {
    Object.assign(target, scope);
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

  async handle(eventLog: EvmLog<EvmFieldSelection>) {
    const itokenAbi = this.itokenAbi();
    const isDelegateChanged =
      eventLog.topics.findIndex(
        (item) => item === itokenAbi.events.DelegateChanged.topic
      ) != -1;
    if (isDelegateChanged) {
      await this.storeDelegateChanged(eventLog);
    }

    const isDelegateVotesChanged =
      eventLog.topics.findIndex(
        (item) => item === itokenAbi.events.DelegateVotesChanged.topic
      ) != -1;
    if (isDelegateVotesChanged) {
      await this.storeDelegateVotesChanged(eventLog);
    }

    const isTokenTransfer =
      eventLog.topics.findIndex(
        (item) => item === itokenAbi.events.Transfer.topic
      ) != -1;
    if (isTokenTransfer) {
      await this.storeTokenTransfer(eventLog);
    }
  }

  private async storeDelegateChanged(eventLog: EvmLog<EvmFieldSelection>) {
    const itokenAbi = this.itokenAbi();
    const event = itokenAbi.events.DelegateChanged.decode(eventLog);
    this.ctx.log.info(
      `Received delegate chanaged event: ${DegovIndexerHelpers.safeJsonStringify(
        event
      )}, at ${eventLog.block.height}, tx: ${eventLog.transactionHash}`
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
      await this.ctx.store.findOne(DelegateMapping, {
        where: {
          from: entity.delegator,
        },
      });

    // If there was a previous delegation, decrease the old delegate's count
    if (previousDelegateMapping) {
      let oldDelegateContributor: Contributor | undefined =
        await this.ctx.store.findOne(Contributor, {
          where: {
            id: previousDelegateMapping.to,
          },
        });

      if (
        oldDelegateContributor &&
        oldDelegateContributor.delegatesCountAll > 0
      ) {
        oldDelegateContributor.delegatesCountAll -= 1;
        this.applyScopeFields(oldDelegateContributor, this.eventFields(eventLog));
        await this.ctx.store.save(oldDelegateContributor);
      }
    }

    // Increase the new delegate's count
    let newDelegateContributor: Contributor | undefined =
      await this.ctx.store.findOne(Contributor, {
        where: {
          id: entity.toDelegate,
        },
      });

    if (newDelegateContributor) {
      newDelegateContributor.delegatesCountAll += 1;
      this.applyScopeFields(newDelegateContributor, this.eventFields(eventLog));
      await this.ctx.store.save(newDelegateContributor);
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
      await this.increaseMetricsContributorCount(contributor);
    }

    // store delegate mapping
    await this.ctx.store.remove(DelegateMapping, entity.delegator);
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
    this.ctx.log.info(
      `Received delegate votes changed event: ${DegovIndexerHelpers.safeJsonStringify(
        event
      )}, at ${eventLog.block.height}, tx: ${eventLog.transactionHash}`
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
    eventLog: EvmLog<EvmFieldSelection>
  ) {
    const [clockMode, delegateRolling, tokenTransfer] = await Promise.all([
      this.voteClockMode(),
      this.ctx.store.findOne(DelegateRolling, {
        where: {
          transactionHash: delegateVotesChanged.transactionHash,
        },
      }),
      this.ctx.store.findOne(TokenTransfer, {
        where: {
          transactionHash: delegateVotesChanged.transactionHash,
        },
      }),
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
      delegator: DegovIndexerHelpers.normalizeAddress(delegateRolling?.delegator),
      fromDelegate: DegovIndexerHelpers.normalizeAddress(
        delegateRolling?.fromDelegate
      ),
      toDelegate: DegovIndexerHelpers.normalizeAddress(delegateRolling?.toDelegate),
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });

    await this.ctx.store.insert(checkpoint);
  }

  private async updateDelegateRolling(options: DelegateVotesChanged) {
    const delegateRolling: DelegateRolling | undefined =
      await this.ctx.store.findOne(DelegateRolling, {
        where: {
          transactionHash: options.transactionHash,
        },
      });
    if (!delegateRolling) {
      this.ctx.log.info(
        `skipped delegate votes changed, because it's from transfer (checked no delegatechanged event), delegate: ${options.delegate}, tx: ${options.transactionHash}`
      );
      return;
    }
    const dvcDelegate = options.delegate.toLowerCase();
    if (
      dvcDelegate !== delegateRolling.fromDelegate &&
      dvcDelegate !== delegateRolling.toDelegate
    ) {
      this.ctx.log.info(
        `skipped delegate votes changed, because it's from transfer (checked no there is no matching delegated changed event), delegate: ${options.delegate}, tx: ${options.transactionHash}`
      );
      return;
    }
    this.ctx.log.info(
      `Queried delegate rolling (update rolling): ${DegovIndexerHelpers.safeJsonStringify(
        delegateRolling
      )} options: ${DegovIndexerHelpers.safeJsonStringify(options)} => tx: ${
        options.transactionHash
      }`
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

    this.applyScopeFields(delegateRolling, {
      chainId: options.chainId,
      daoCode: options.daoCode,
      governorAddress: options.governorAddress,
      tokenAddress: options.tokenAddress,
      contractAddress: options.contractAddress,
      logIndex: options.logIndex,
      transactionIndex: options.transactionIndex,
    });
    await this.ctx.store.save(delegateRolling);
    await this.storeDelegate(delegate);
  }

  private async storeTokenTransfer(eventLog: EvmLog<EvmFieldSelection>) {
    const contractStandard = this.contractStandard();
    const isErc721 = contractStandard === "erc721";
    const itokenAbi = this.itokenAbi();

    const event = itokenAbi.events.Transfer.decode(eventLog);
    this.ctx.log.info(
      `Received token transfer event: ${DegovIndexerHelpers.safeJsonStringify(
        event
      )}, at ${eventLog.block.height}, tx: ${eventLog.transactionHash}`
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

    // store delegate
    const storedFromDelegate: DelegateMapping | undefined =
      await this.ctx.store.findOne(DelegateMapping, {
        where: {
          from: entity.from,
        },
      });

    const storedToDelegate: DelegateMapping | undefined =
      await this.ctx.store.findOne(DelegateMapping, {
        where: {
          from: entity.to,
        },
      });

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
        `Delegate from or to is not set. ${DegovIndexerHelpers.safeJsonStringify(
          currentDelegate
        )}`
      );
    }
    currentDelegate.fromDelegate = currentDelegate.fromDelegate.toLowerCase();
    currentDelegate.toDelegate = currentDelegate.toDelegate.toLowerCase();
    currentDelegate.id = `${currentDelegate.fromDelegate}_${currentDelegate.toDelegate}`;

    let storedDelegateFromWithTo: Delegate | undefined =
      await this.ctx.store.findOne(Delegate, {
        where: {
          id: currentDelegate.id,
        },
      });

    let newDelegatePowerOfFromTo;
    let delegatesCountEffective = 0;
    if (!storedDelegateFromWithTo) {
      await this.ctx.store.insert(currentDelegate);
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
        // Only decrement count if transitioning from non-zero to zero
        if (oldPower !== 0n) {
          delegatesCountEffective -= 1;
        }
      } else {
        await this.ctx.store.save(storedDelegateFromWithTo);
      }
      newDelegatePowerOfFromTo = storedDelegateFromWithTo.power;
    }

    const storedFromDelegate: DelegateMapping | undefined =
      await this.ctx.store.findOne(DelegateMapping, {
        where: {
          from: currentDelegate.fromDelegate,
        },
      });
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
      await this.ctx.store.save(storedFromDelegate);
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
    const storedDataMetric: DataMetric | undefined =
      await this.ctx.store.findOne(DataMetric, {
        where: {
          id: MetricsId.global,
        },
      });
    const dm = storedDataMetric
      ? storedDataMetric
      : new DataMetric({
          id: MetricsId.global,
        });
    if (!storedDataMetric) {
      await this.ctx.store.insert(dm);
    }
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
    await this.ctx.store.save(dm);
  }

  private async storeContributor(contributor: Contributor) {
    let storedContributor: Contributor | undefined =
      await this.ctx.store.findOne(Contributor, {
        where: {
          id: contributor.id,
        },
      });

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

      await this.ctx.store.save(storedContributor);
    } else {
      storeMemberMetrics = true;
      // save new contributor
      await this.ctx.store.insert(contributor);
      storedContributor = contributor;
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
        this.ctx.log.error(`'failed to sync user power: ${error}`);
      }
    }

    if (!storeMemberMetrics) {
      return;
    }
    await this.increaseMetricsContributorCount(contributor);
  }

  private async increaseMetricsContributorCount(source: TokenScopeFields) {
    // increase metrics for memberCount
    const storedDataMetric: DataMetric | undefined =
      await this.ctx.store.findOne(DataMetric, {
        where: {
          id: MetricsId.global,
        },
      });
    const dm = storedDataMetric
      ? storedDataMetric
      : new DataMetric({
          id: MetricsId.global,
        });
    this.applyScopeFields(dm, source);
    dm.memberCount = (dm.memberCount ?? 0) + 1;
    await this.ctx.store.save(dm);
  }
}
