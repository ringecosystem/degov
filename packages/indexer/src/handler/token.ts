import { DataHandlerContext } from "@subsquid/evm-processor";
import { Log } from "../processor";
import * as itokens from "../abi/itoken";
import {
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
    let checkExists = false;
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
      checkExists = true;
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
    }
    if (!delegate) {
      return;
    }

    await this.ctx.store.save(delegateRolling);
    await this.storeDelegate(delegate, { checkExists });
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
    await this.storeDelegate(fromDelegate, { checkExists: true });
    await this.storeDelegate(toDelegate, { checkExists: true });
  }

  private async storeDelegate(
    currentDelegate: Delegate,
    options?: { checkExists?: boolean }
  ) {
    // store delegate
    const currentDelegateId =
      `${currentDelegate.fromDelegate}_${currentDelegate.toDelegate}`.toLowerCase();
    currentDelegate.id = currentDelegateId;

    const storedDelegate: Delegate | undefined = await this.ctx.store.findOne(
      Delegate,
      {
        where: {
          id: currentDelegateId,
        },
      }
    );

    // store delegate
    if (!storedDelegate) {
      if (options?.checkExists ?? false) {
        return;
      }

      await this.ctx.store.insert(currentDelegate);
    } else {
      storedDelegate.power = storedDelegate.power + currentDelegate.power;
      storedDelegate.blockNumber = currentDelegate.blockNumber;
      storedDelegate.blockTimestamp = currentDelegate.blockTimestamp;
      storedDelegate.transactionHash = currentDelegate.transactionHash;
      await this.ctx.store.save(storedDelegate);
    }

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
}
