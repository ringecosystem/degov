import { Log } from "../processor";
import * as igovernorAbi from "../abi/igovernor";
import { DataHandlerContext } from "@subsquid/evm-processor";
import { ProposalCreated } from "../model";

export class GovernorHandler {
  constructor(private readonly ctx: DataHandlerContext<any, any>) {}

  async handle(eventLog: Log) {
    const firstTopic = eventLog.topics[0];
    if (firstTopic === igovernorAbi.events.ProposalCreated.topic) {
      await this.storeProposalCreated(eventLog);
    }
  }

  private async storeProposalCreated(eventLog: Log) {
    const event = igovernorAbi.events.ProposalCreated.decode(eventLog);
    const proposalCreated = new ProposalCreated({
      id: event.proposalId.toString(),
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
    await this.ctx.store.insert(proposalCreated);
  }
}
