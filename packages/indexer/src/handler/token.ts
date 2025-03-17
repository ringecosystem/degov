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

    let delegate;
    let cleanFromDelegated = false;
    let isDelegatedToSelf = false;
    if (options.delegate === delegateRolling.fromDelegate) {
      delegateRolling.fromNewVotes = options.newVotes;
      delegateRolling.fromPreviousVotes = options.previousVotes;

      delegate = new Delegate({
        fromDelegate: delegateRolling.fromDelegate,
        toDelegate: delegateRolling.fromDelegate,
        blockNumber: options.blockNumber,
        blockTimestamp: options.blockTimestamp,
        transactionHash: options.transactionHash,
        power: options.newVotes - options.previousVotes,
      });
      cleanFromDelegated = true;
    }
    if (options.delegate === delegateRolling.toDelegate) {
      delegateRolling.toNewVotes = options.newVotes;
      delegateRolling.toPreviousVotes = options.previousVotes;

      delegate = new Delegate({
        fromDelegate: delegateRolling.fromDelegate,
        toDelegate: delegateRolling.toDelegate,
        blockNumber: options.blockNumber,
        blockTimestamp: options.blockTimestamp,
        transactionHash: options.transactionHash,
        power: options.newVotes - options.previousVotes,
      });
      isDelegatedToSelf = true;
    }
    if (!delegate) {
      return;
    }

    await this.ctx.store.save(delegateRolling);
    await this.storeDelegate(delegate, {
      cleanFromDelegated,
      isDelegatedToSelf,
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
      power: isErc721 ? -1n : -event.value,
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
    options?: { cleanFromDelegated?: boolean; isDelegatedToSelf?: boolean }
  ) {
    // store delegate
    const zeroAddress = "0x0000000000000000000000000000000000000000";
    currentDelegate.fromDelegate = currentDelegate.fromDelegate.toLowerCase();
    currentDelegate.toDelegate = currentDelegate.toDelegate.toLowerCase();

    let isFirstDelegateToSelf = false;
    if (currentDelegate.fromDelegate === zeroAddress) {
      currentDelegate.fromDelegate = currentDelegate.toDelegate;
      isFirstDelegateToSelf = true;
    }
    // transfer from zero address
    if (currentDelegate.fromDelegate === zeroAddress) {
      return;
    }

    const isFromeDelegateSameWithToDeletate =
      currentDelegate.fromDelegate === currentDelegate.toDelegate;
    currentDelegate.id = `${currentDelegate.fromDelegate}_${currentDelegate.toDelegate}`;

    const storedDelegateFromWithTo: Delegate | undefined =
      await this.ctx.store.findOne(Delegate, {
        where: {
          id: currentDelegate.id,
        },
      });

    let storedDelegateToWithTo: Delegate | undefined;
    if (isFromeDelegateSameWithToDeletate) {
      storedDelegateToWithTo = storedDelegateFromWithTo;
    } else {
      const toWithToDelegateId = `${currentDelegate.toDelegate}_${currentDelegate.toDelegate}`;
      storedDelegateToWithTo = await this.ctx.store.findOne(Delegate, {
        where: {
          id: toWithToDelegateId,
        },
      });
    }

    let enableStoreContributor = false;
    // clean from delegate
    if (options?.cleanFromDelegated ?? false) {
      const cleanFromDelegatedId = `${currentDelegate.fromDelegate}_${currentDelegate.fromDelegate}`;
      const storedDelegateFromWithFrom: Delegate | undefined =
        await this.ctx.store.findOne(Delegate, {
          where: {
            id: cleanFromDelegatedId,
          },
        });
      if (storedDelegateFromWithFrom) {
        storedDelegateFromWithFrom.power = 0n;
        storedDelegateFromWithFrom.blockNumber = currentDelegate.blockNumber;
        storedDelegateFromWithFrom.blockTimestamp =
          currentDelegate.blockTimestamp;
        storedDelegateFromWithFrom.transactionHash =
          currentDelegate.transactionHash;
        await this.ctx.store.save(storedDelegateFromWithFrom);
        enableStoreContributor = true;
      }
    } else {
      // store delegate
      if (!storedDelegateFromWithTo) {
        if (!storedDelegateToWithTo && !isFirstDelegateToSelf) {
          return;
        }

        await this.ctx.store.insert(currentDelegate);
        enableStoreContributor = true;
      } else {
        // store "to" delegate power
        if (options?.isDelegatedToSelf ?? false) {
          // withdraw the delegate
          if (storedDelegateToWithTo && storedDelegateToWithTo.power === 0n) {
            storedDelegateFromWithTo.fromDelegate =
              storedDelegateToWithTo.toDelegate;
          }
        }
        storedDelegateFromWithTo.power =
          storedDelegateFromWithTo.power + currentDelegate.power;
        storedDelegateFromWithTo.blockNumber = currentDelegate.blockNumber;
        storedDelegateFromWithTo.blockTimestamp =
          currentDelegate.blockTimestamp;
        storedDelegateFromWithTo.transactionHash =
          currentDelegate.transactionHash;
        await this.ctx.store.save(storedDelegateFromWithTo);
        enableStoreContributor = true;
      }
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
    const storedContributor: Contributor | undefined =
      await this.ctx.store.findOne(Contributor, {
        where: {
          id: contributor.id,
        },
      });

    // update stored contributor
    if (storedContributor) {
      storedContributor.blockNumber = contributor.blockNumber;
      storedContributor.blockTimestamp = contributor.blockTimestamp;
      storedContributor.transactionHash = contributor.transactionHash;

      storedContributor.power = storedContributor.power + contributor.power;

      await this.ctx.store.save(storedContributor);
      return;
    }

    // save new contributor
    await this.ctx.store.insert(contributor);

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
