import { DataHandlerContext } from "@subsquid/evm-processor";
import { Log } from "../processor";
import * as ivotes from "../abi/ivotes";
import { Delegate, DelegateChanged, DelegateVotesChanged } from "../model";

export class TokenHandler {
  constructor(private readonly ctx: DataHandlerContext<any, any>) {}

  async handle(eventLog: Log) {
    const isDelegateChanged =
      eventLog.topics.findIndex(
        (item) => item === ivotes.events.DelegateChanged.topic
      ) != -1;
    if (isDelegateChanged) {
      await this.storeDelegateChanged(eventLog);
    }

    const isDelegateVotesChanged =
      eventLog.topics.findIndex(
        (item) => item === ivotes.events.DelegateVotesChanged.topic
      ) != -1;
    if (isDelegateVotesChanged) {
      await this.storeDelegateVotesChanged(eventLog);
    }
  }

  private async storeDelegateChanged(eventLog: Log) {
    const event = ivotes.events.DelegateChanged.decode(eventLog);
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

    const delegate = new Delegate({
      id: eventLog.id,
      delegator: event.delegator,
      fromDelegate: event.fromDelegate,
      toDelegate: event.toDelegate,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(delegate);
  }

  private async storeDelegateVotesChanged(eventLog: Log) {
    const event = ivotes.events.DelegateVotesChanged.decode(eventLog);
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

    const delegate: Delegate | undefined = await this.ctx.store.findOne(
      Delegate,
      {
        where: {
          transactionHash: eventLog.transactionHash,
        },
      }
    );
    if (delegate) {
      if (event.delegate === delegate.fromDelegate) {
        delegate.fromNewVotes = event.newVotes;
        delegate.fromPreviousVotes = event.previousVotes;
      }
      if (event.delegate === delegate.toDelegate) {
        delegate.toNewVotes = event.newVotes;
        delegate.toPreviousVotes = event.previousVotes;
      }
      await this.ctx.store.save(delegate);
    }
  }
}
