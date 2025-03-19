import { DataHandlerContext } from "@subsquid/evm-processor";
import { Log } from "../processor";
import * as itokens from "../abi/itoken";
import {
  Contributor,
  DataMetric,
  Delegate,
  DelegateChanged,
  DelegateRolling,
  DelegateVotesChanged,
  TokenTransfer,
} from "../model";
import { DegovIndexLogContract, MetricsId } from "../types";

const zeroAddress = "0x0000000000000000000000000000000000000000";

export class TokenHandler {
  constructor(
    private readonly ctx: DataHandlerContext<any, any>,
    private readonly indexContract: DegovIndexLogContract
  ) {}

  async handle(eventLog: Log) {
    const isDelegateChanged =
      eventLog.topics.findIndex(
        (item) => item === itokens.events.DelegateChanged.topic
      ) != -1;
    if (isDelegateChanged) {
      await this.storeDelegateChanged(eventLog);
    }

    const isDelegateVotesChanged =
      eventLog.topics.findIndex(
        (item) => item === itokens.events.DelegateVotesChanged.topic
      ) != -1;
    if (isDelegateVotesChanged) {
      await this.storeDelegateVotesChanged(eventLog);
    }

    const isTokenTransfer =
      eventLog.topics.findIndex(
        (item) => item === itokens.events.Transfer.topic
      ) != -1;
    if (isTokenTransfer) {
      await this.storeTokenTransfer(eventLog);
    }
  }

  private async storeDelegateChanged(eventLog: Log) {
    const event = itokens.events.DelegateChanged.decode(eventLog);
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
  }

  private async storeDelegateVotesChanged(eventLog: Log) {
    const event = itokens.events.DelegateVotesChanged.decode(eventLog);
    const entity = new DelegateVotesChanged({
      id: eventLog.id,
      delegate: event.delegate,
      previousVotes: event.previousVotes,
      newVotes: event.newVotes,
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
    if (!delegateRolling) return;

    let fromDelegate, toDelegate;
    if (options.delegate === delegateRolling.fromDelegate) {
      delegateRolling.fromNewVotes = options.newVotes;
      delegateRolling.fromPreviousVotes = options.previousVotes;
      // retuning power to self
      if (
        delegateRolling.delegator === delegateRolling.toDelegate &&
        delegateRolling.fromDelegate !== zeroAddress
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
    const isFirstDelegateToSelf = delegateRolling.fromDelegate === zeroAddress;

    const delegate = new Delegate({
      fromDelegate,
      toDelegate,
      blockNumber: delegateRolling.blockNumber,
      blockTimestamp: delegateRolling.blockTimestamp,
      transactionHash: delegateRolling.transactionHash,
      power: options.newVotes - options.previousVotes,
    });

    await this.ctx.store.save(delegateRolling);
    await this.storeDelegate(delegate, {
      isFirstDelegateToSelf,
    });
  }

  private async storeTokenTransfer(eventLog: Log) {
    const contractStandard = (
      this.indexContract.standard ?? "erc20"
    ).toLowerCase();
    const isErc721 = contractStandard === "erc721";

    const event = itokens.events.Transfer.decode(eventLog);
    const entity = new TokenTransfer({
      id: eventLog.id,
      from: event.from,
      to: event.to,
      value: event.value,
      standard: contractStandard,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(entity);

    const fromDelegate = new Delegate({
      fromDelegate: event.from,
      toDelegate: event.from,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
      power: -(isErc721 ? 1n : event.value),
    });
    const toDelegate = new Delegate({
      fromDelegate: event.to,
      toDelegate: event.to,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
      power: isErc721 ? 1n : event.value,
    });
    await this.storeDelegate(fromDelegate);
    await this.storeDelegate(toDelegate);
  }

  private async storeDelegate(
    currentDelegate: Delegate,
    options?: { isFirstDelegateToSelf?: boolean }
  ) {
    const isFirstDelegateToSelf = options?.isFirstDelegateToSelf ?? false;

    currentDelegate.fromDelegate = currentDelegate.fromDelegate.toLowerCase();
    currentDelegate.toDelegate = currentDelegate.toDelegate.toLowerCase();
    currentDelegate.id = `${currentDelegate.fromDelegate}_${currentDelegate.toDelegate}`;

    let storedDelegateFromWithTo: Delegate | undefined =
      await this.ctx.store.findOne(Delegate, {
        where: {
          id: currentDelegate.id,
        },
      });

    // store delegate
    let enableStoreContributor = false;
    // no from-to delegate record, insert it.
    if (!storedDelegateFromWithTo) {
      // store first delegate
      if (isFirstDelegateToSelf) {
        await this.ctx.store.insert(currentDelegate);
        enableStoreContributor = true;
      } else {
        const delegateToWithToId = `${currentDelegate.toDelegate}_${currentDelegate.toDelegate}`;
        let storedDelegateToWithTo: Delegate | undefined =
          await this.ctx.store.findOne(Delegate, {
            where: {
              id: delegateToWithToId,
            },
          });
        // indicates that this user has a delegate record
        if (storedDelegateToWithTo) {
          await this.ctx.store.insert(currentDelegate);
          enableStoreContributor = true;
        }
      }
    } else {
      // update delegate
      storedDelegateFromWithTo.power += currentDelegate.power;
      // should keep delegate self record
      if (
        storedDelegateFromWithTo.power === 0n &&
        storedDelegateFromWithTo.fromDelegate !==
          storedDelegateFromWithTo.toDelegate
      ) {
        await this.ctx.store.remove(Delegate, storedDelegateFromWithTo.id);
      } else {
        await this.ctx.store.save(storedDelegateFromWithTo);
      }
      enableStoreContributor = true;
    }
    if (!enableStoreContributor) {
      return;
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
