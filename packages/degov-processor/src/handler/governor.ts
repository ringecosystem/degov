import { Log as EvmLog } from "@subsquid/evm-processor";
import * as igovernorAbi from "../abi/igovernor";
import {
  DataMetricOptions,
  DProposal,
  DProposalCreated,
  EvmFieldSelection,
} from "../types";

export class GovernorHandler {
  async handle(eventLog: EvmLog<EvmFieldSelection>) {
    const isProposalCreated =
      eventLog.topics.findIndex(
        (item) => item === igovernorAbi.events.ProposalCreated.topic
      ) != -1;
    if (isProposalCreated) {
      // await this.storeProposalCreated(eventLog);
    }

    const isProposalQueued =
      eventLog.topics.findIndex(
        (item) => item === igovernorAbi.events.ProposalQueued.topic
      ) != -1;
    if (isProposalQueued) {
      // await this.storeProposalQueued(eventLog);
    }

    const isProposalExcuted =
      eventLog.topics.findIndex(
        (item) => item === igovernorAbi.events.ProposalExecuted.topic
      ) != -1;
    if (isProposalExcuted) {
      // await this.storeProposalExecuted(eventLog);
    }

    const isProposalCanceled =
      eventLog.topics.findIndex(
        (item) => item === igovernorAbi.events.ProposalCanceled.topic
      ) != -1;
    if (isProposalCanceled) {
      // await this.storeProposalCanceled(eventLog);
    }

    const isVoteCast =
      eventLog.topics.findIndex(
        (item) => item === igovernorAbi.events.VoteCast.topic
      ) != -1;
    if (isVoteCast) {
      // await this.storeVoteCast(eventLog);
    }

    const isVoteCastWithParams =
      eventLog.topics.findIndex(
        (item) => item === igovernorAbi.events.VoteCastWithParams.topic
      ) != -1;
    if (isVoteCastWithParams) {
      // await this.storeVoteCastWithParams(eventLog);
    }
  }

  private stdProposalId(proposalId: bigint): string {
    return `0x${proposalId.toString(16)}`;
  }

  private async storeProposalCreated(eventLog: EvmLog<EvmFieldSelection>) {
    const event = igovernorAbi.events.ProposalCreated.decode(eventLog);
    const proposalCreated: DProposalCreated = {
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
    // store proposal create

    const proposal: DProposal = {
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
    // store proposal

    await this.storeGlobalDataMetric({
      proposalsCount: 1,
    });
  }
  private async storeProposalQueued(eventLog: EvmLog<EvmFieldSelection>) {}

  private async storeProposalExecuted(eventLog: EvmLog<EvmFieldSelection>) {}

  private async storeProposalCanceled(eventLog: EvmLog<EvmFieldSelection>) {}

  private async storeVoteCast(eventLog: EvmLog<EvmFieldSelection>) {}

  private async storeVoteCastWithParams(eventLog: EvmLog<EvmFieldSelection>) {}

  private async storeGlobalDataMetric(options: DataMetricOptions) {}
}
