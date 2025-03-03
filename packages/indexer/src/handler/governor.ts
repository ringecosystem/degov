import { Log } from "../processor";
import * as igovernorAbi from "../abi/igovernor";
import { DataHandlerContext } from "@subsquid/evm-processor";
import {
  Proposal,
  ProposalCanceled,
  ProposalCreated,
  ProposalExecuted,
  ProposalQueued,
  VoteCast,
  VoteCastGroup,
  VoteCastWithParams,
} from "../model";

export class GovernorHandler {
  constructor(private readonly ctx: DataHandlerContext<any, any>) {}

  async handle(eventLog: Log) {
    const isProposalCreated =
      eventLog.topics.findIndex(
        (item) => item === igovernorAbi.events.ProposalCreated.topic
      ) != -1;
    if (isProposalCreated) {
      await this.storeProposalCreated(eventLog);
    }

    const isProposalQueued =
      eventLog.topics.findIndex(
        (item) => item === igovernorAbi.events.ProposalQueued.topic
      ) != -1;
    if (isProposalQueued) {
      await this.storeProposalQueued(eventLog);
    }

    const isProposalExcuted =
      eventLog.topics.findIndex(
        (item) => item === igovernorAbi.events.ProposalExecuted.topic
      ) != -1;
    if (isProposalExcuted) {
      await this.storeProposalExecuted(eventLog);
    }

    const isProposalCanceled =
      eventLog.topics.findIndex(
        (item) => item === igovernorAbi.events.ProposalCanceled.topic
      ) != -1;
    if (isProposalCanceled) {
      await this.storeProposalCanceled(eventLog);
    }

    const isVoteCast =
      eventLog.topics.findIndex(
        (item) => item === igovernorAbi.events.VoteCast.topic
      ) != -1;
    if (isVoteCast) {
      await this.storeVoteCast(eventLog);
    }

    const isVoteCastWithParams =
      eventLog.topics.findIndex(
        (item) => item === igovernorAbi.events.VoteCastWithParams.topic
      ) != -1;
    if (isVoteCastWithParams) {
      await this.storeVoteCastWithParams(eventLog);
    }
  }

  private async storeProposalCreated(eventLog: Log) {
    const event = igovernorAbi.events.ProposalCreated.decode(eventLog);
    const entity = new ProposalCreated({
      id: eventLog.id,
      proposalId: event.proposalId,
      proposer: event.proposer,
      targets: event.targets,
      values: event.values.map((item) => item.toString()),
      signatures: event.signatures,
      calldatas: event.calldatas,
      voteStart: event.voteStart,
      voteEnd: event.voteEnd,
      description: event.description,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(entity);

    const proposal = new Proposal({
      id: eventLog.id,
      proposalId: event.proposalId,
      proposer: event.proposer,
      targets: event.targets,
      values: event.values.map((item) => item.toString()),
      signatures: event.signatures,
      calldatas: event.calldatas,
      voteStart: event.voteStart,
      voteEnd: event.voteEnd,
      description: event.description,
      participants: [event.proposer],
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(proposal);
  }

  private async storeProposalQueued(eventLog: Log) {
    const event = igovernorAbi.events.ProposalQueued.decode(eventLog);
    const entity = new ProposalQueued({
      id: eventLog.id,
      proposalId: event.proposalId,
      etaSeconds: event.etaSeconds,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(entity);
  }

  private async storeProposalExecuted(eventLog: Log) {
    const event = igovernorAbi.events.ProposalExecuted.decode(eventLog);
    const entity = new ProposalExecuted({
      id: eventLog.id,
      proposalId: event.proposalId,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(entity);
  }

  private async storeProposalCanceled(eventLog: Log) {
    const event = igovernorAbi.events.ProposalCanceled.decode(eventLog);
    const entity = new ProposalCanceled({
      id: eventLog.id,
      proposalId: event.proposalId,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(entity);
  }

  private async storeVoteCast(eventLog: Log) {
    const event = igovernorAbi.events.VoteCast.decode(eventLog);
    const entity = new VoteCast({
      id: eventLog.id,
      voter: event.voter,
      proposalId: event.proposalId,
      support: event.support,
      weight: event.weight,
      reason: event.reason,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(entity);

    const vcg = new VoteCastGroup({
      id: eventLog.id,
      type: "vote-cast-without-params",
      voter: event.voter,
      proposalId: event.proposalId,
      support: event.support,
      weight: event.weight,
      reason: event.reason,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(vcg);

    const proposal: Proposal | undefined = await this.ctx.store.findOne(
      Proposal,
      {
        where: {
          proposalId: event.proposalId,
        },
      }
    );
    if (proposal) {
      proposal.participants.push(event.voter);
      await this.ctx.store.save(proposal);
    }
  }

  private async storeVoteCastWithParams(eventLog: Log) {
    const event = igovernorAbi.events.VoteCastWithParams.decode(eventLog);
    const entity = new VoteCastWithParams({
      id: eventLog.id,
      voter: event.voter,
      proposalId: event.proposalId,
      support: event.support,
      weight: event.weight,
      reason: event.reason,
      params: event.params,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(entity);

    const vcg = new VoteCastGroup({
      id: eventLog.id,
      type: "vote-cast-with-params",
      voter: event.voter,
      proposalId: event.proposalId,
      support: event.support,
      weight: event.weight,
      reason: event.reason,
      params: event.params,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(vcg);

    const proposal: Proposal | undefined = await this.ctx.store.findOne(
      Proposal,
      {
        where: {
          proposalId: event.proposalId,
        },
      }
    );
    if (proposal) {
      proposal.participants.push(event.voter);
      await this.ctx.store.save(proposal);
    }
  }
}
