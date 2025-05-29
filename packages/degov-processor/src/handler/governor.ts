import { Log as EvmLog } from "@subsquid/evm-processor";
import * as igovernorAbi from "../abi/igovernor";
import {
  DataMetricOptions,
  DgvProposal,
  DgvProposalCanceled,
  DgvProposalCreated,
  DgvProposalExecuted,
  DgvProposalQueued,
  DgvVoteCast,
  DgvVoteCastGroup,
  DgvVoteCastWithParams,
  EvmFieldSelection,
} from "../types";

export class GovernorHandler {
  async handle(eventLog: EvmLog<EvmFieldSelection>) {
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

  private stdProposalId(proposalId: bigint): string {
    return `0x${proposalId.toString(16)}`;
  }

  private async storeProposalCreated(eventLog: EvmLog<EvmFieldSelection>) {
    const event = igovernorAbi.events.ProposalCreated.decode(eventLog);
    const proposalCreated: DgvProposalCreated = {
      id: eventLog.id,
      proposalId: this.stdProposalId(event.proposalId),
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
    };
    // await this.ctx.store.insert(entity);

    const proposal: DgvProposal = {
      id: eventLog.id,
      proposalId: this.stdProposalId(event.proposalId),
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
      voters: [],
    };
    // await this.ctx.store.insert(proposal);

    await this.storeGlobalDataMetric({
      proposalsCount: 1,
    });
  }

  private async storeProposalQueued(eventLog: EvmLog<EvmFieldSelection>) {
    const event = igovernorAbi.events.ProposalQueued.decode(eventLog);
    const entity: DgvProposalQueued = {
      id: eventLog.id,
      proposalId: this.stdProposalId(event.proposalId),
      etaSeconds: event.etaSeconds,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    };
    // await this.ctx.store.insert(entity);
  }

  private async storeProposalExecuted(eventLog: EvmLog<EvmFieldSelection>) {
    const event = igovernorAbi.events.ProposalExecuted.decode(eventLog);
    const entity: DgvProposalExecuted = {
      id: eventLog.id,
      proposalId: this.stdProposalId(event.proposalId),
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    };
    // await this.ctx.store.insert(entity);
  }

  private async storeProposalCanceled(eventLog: EvmLog<EvmFieldSelection>) {
    const event = igovernorAbi.events.ProposalCanceled.decode(eventLog);
    const entity: DgvProposalCanceled = {
      id: eventLog.id,
      proposalId: this.stdProposalId(event.proposalId),
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    };
    // await this.ctx.store.insert(entity);
  }

  private async storeVoteCast(eventLog: EvmLog<EvmFieldSelection>) {
    const event = igovernorAbi.events.VoteCast.decode(eventLog);
    const entity: DgvVoteCast = {
      id: eventLog.id,
      voter: event.voter,
      proposalId: this.stdProposalId(event.proposalId),
      support: event.support,
      weight: event.weight,
      reason: event.reason,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    };
    // await this.ctx.store.insert(entity);

    const vcg: DgvVoteCastGroup = {
      id: eventLog.id,
      type: "vote-cast-without-params",
      voter: event.voter,
      refProposalId: this.stdProposalId(event.proposalId),
      support: event.support,
      weight: event.weight,
      reason: event.reason,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    };
    // await this.storeVoteCastGroup(vcg);
  }

  private async storeVoteCastWithParams(eventLog: EvmLog<EvmFieldSelection>) {
    const event = igovernorAbi.events.VoteCastWithParams.decode(eventLog);
    const entity: DgvVoteCastWithParams = {
      id: eventLog.id,
      voter: event.voter,
      proposalId: this.stdProposalId(event.proposalId),
      support: event.support,
      weight: event.weight,
      reason: event.reason,
      params: event.params,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    };
    // await this.ctx.store.insert(entity);

    const vcg: DgvVoteCastGroup = {
      id: eventLog.id,
      type: "vote-cast-with-params",
      voter: event.voter,
      refProposalId: this.stdProposalId(event.proposalId),
      support: event.support,
      weight: event.weight,
      reason: event.reason,
      params: event.params,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    };
    // await this.storeVoteCastGroup(vcg);
  }


  private async storeGlobalDataMetric(options: DataMetricOptions) {}
}
