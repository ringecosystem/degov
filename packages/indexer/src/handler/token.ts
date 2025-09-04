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
} from "../model";
import {
  MetricsId,
  EvmFieldSelection,
  IndexerContract,
  IndexerWork,
} from "../types";
import { DegovIndexerHelpers } from "../internal/helpers";

const zeroAddress = "0x0000000000000000000000000000000000000000";

export interface TokenhandlerOptions {
  chainId: number;
  work: IndexerWork;
  indexContract: IndexerContract;
}

export class TokenHandler {
  constructor(
    private readonly ctx: DataHandlerContext<Store, EvmFieldSelection>,
    private readonly options: TokenhandlerOptions
  ) {}

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
      delegator: event.delegator,
      fromDelegate: event.fromDelegate,
      toDelegate: event.toDelegate,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(entity);

    // store delegate mapping
    await this.ctx.store.remove(DelegateMapping, entity.delegator);
    const currentDelegateMapping = new DelegateMapping({
      id: entity.delegator,
      from: entity.delegator,
      to: entity.toDelegate,
      blockNumber: entity.blockNumber,
      blockTimestamp: entity.blockTimestamp,
      transactionHash: entity.transactionHash,
    });
    await this.ctx.store.insert(currentDelegateMapping);

    // store delegate rolling
    const delegateRolling = new DelegateRolling({
      id: eventLog.id,
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
      delegate: event.delegate,
      previousVotes:
        "previousVotes" in event ? event.previousVotes : event.previousBalance,
      newVotes: "newVotes" in event ? event.newVotes : event.newBalance,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(entity);
    // store rolling
    await this.updateDelegateRolling(entity);
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
      fromDelegate,
      toDelegate,
      blockNumber: delegateRolling.blockNumber,
      blockTimestamp: delegateRolling.blockTimestamp,
      transactionHash: delegateRolling.transactionHash,
      power: options.newVotes - options.previousVotes,
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

    if (!storedDelegateFromWithTo) {
      await this.ctx.store.insert(currentDelegate);
    } else {
      // update delegate
      storedDelegateFromWithTo.power += currentDelegate.power;
      storedDelegateFromWithTo.blockNumber = currentDelegate.blockNumber;
      storedDelegateFromWithTo.blockTimestamp = currentDelegate.blockTimestamp;
      storedDelegateFromWithTo.transactionHash =
        currentDelegate.transactionHash;
      // Remove delegate record if power is zero
      if (storedDelegateFromWithTo.power === 0n) {
        await this.ctx.store.remove(Delegate, storedDelegateFromWithTo.id);
      } else {
        await this.ctx.store.save(storedDelegateFromWithTo);
      }
    }

    // store contributor
    const contributor = new Contributor({
      id: currentDelegate.toDelegate,
      blockNumber: currentDelegate.blockNumber,
      blockTimestamp: currentDelegate.blockTimestamp,
      transactionHash: currentDelegate.transactionHash,
      power: currentDelegate.power,
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

      storedContributor.power = storedContributor.power + contributor.power;

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
    dm.memberCount = (dm.memberCount ?? 0) + 1;
    await this.ctx.store.save(dm);
  }
}
