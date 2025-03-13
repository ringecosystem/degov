import { Log } from "../processor";
import * as igovernorAbi from "../abi/igovernor";
import { DataHandlerContext } from "@subsquid/evm-processor";
import {
  DataMetric,
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
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(proposal);

    await this.storeGlobalDataMetric({
      proposalsCount: 1,
    });
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
      refProposalId: event.proposalId,
      support: event.support,
      weight: event.weight,
      reason: event.reason,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.storeVoteCastGroup(vcg);
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
      refProposalId: event.proposalId,
      support: event.support,
      weight: event.weight,
      reason: event.reason,
      params: event.params,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.storeVoteCastGroup(vcg);
  }

  private async storeVoteCastGroup(vcg: VoteCastGroup) {
    const proposal: Proposal | undefined = await this.ctx.store.findOne(
      Proposal,
      {
        where: {
          proposalId: vcg.refProposalId,
        },
      }
    );

    let votesWeightForSum: bigint = 0n;
    let votesWeightAgainstSum: bigint = 0n;
    let votesWeightAbstainSum: bigint = 0n;
    switch (vcg.support) {
      case 0:
        votesWeightForSum = BigInt(vcg.weight);
        break;
      case 1:
        votesWeightAgainstSum = BigInt(vcg.weight);
        break;
      case 2:
        votesWeightAbstainSum = BigInt(vcg.weight);
        break;
    }

    if (proposal) {
      const voters = [...(proposal.voters || []), vcg];
      proposal.voters = voters;
      proposal.metricsVotesCount = Number(proposal.metricsVotesCount ?? 0) + 1;

      proposal.metricsVotesWeightForSum =
        BigInt(proposal.metricsVotesWeightForSum ?? 0) + votesWeightForSum;
      proposal.metricsVotesWeightAgainstSum =
        BigInt(proposal.metricsVotesWeightAgainstSum ?? 0) +
        votesWeightAgainstSum;
      proposal.metricsVotesWeightAbstainSum =
        BigInt(proposal.metricsVotesWeightAbstainSum ?? 0) +
        votesWeightAbstainSum;
      await this.ctx.store.save(proposal);

      vcg.proposal = proposal;
    }

    // store votes group
    await this.ctx.store.insert(vcg);
    // store metric
    await this.storeGlobalDataMetric({
      votesCount: 1,
      votesWithParamsCount: +(vcg.type === "vote-cast-with-params"),
      votesWithoutParamsCount: +(vcg.type === "vote-cast-without-params"),
      votesWeightForSum,
      votesWeightAgainstSum,
      votesWeightAbstainSum,
    });
  }

  private async storeGlobalDataMetric(options: DataMetricOptions) {
    const metricId = "global";

    const storedDataMetric: DataMetric | undefined =
      await this.ctx.store.findOne(DataMetric, {
        where: {
          id: metricId,
        },
      });
    const dm = storedDataMetric
      ? storedDataMetric
      : new DataMetric({
          id: metricId,
        });
    if (!storedDataMetric) {
      await this.ctx.store.insert(dm);
    }
    dm.proposalsCount =
      (dm.proposalsCount ?? 0) + (options.proposalsCount ?? 0);
    dm.votesCount = (dm.votesCount ?? 0) + (options.votesCount ?? 0);
    dm.votesWithParamsCount =
      (dm.votesWithParamsCount ?? 0) + (options.votesWithParamsCount ?? 0);
    dm.votesWithoutParamsCount =
      (dm.votesWithoutParamsCount ?? 0) +
      (options.votesWithoutParamsCount ?? 0);
    dm.votesWeightForSum =
      BigInt(dm.votesWeightForSum ?? 0) +
      BigInt(options.votesWeightForSum ?? 0);
    dm.votesWeightAgainstSum =
      BigInt(dm.votesWeightAgainstSum ?? 0) +
      BigInt(options.votesWeightAgainstSum ?? 0);
    dm.votesWeightAbstainSum =
      BigInt(dm.votesWeightAbstainSum ?? 0) +
      BigInt(options.votesWeightAbstainSum ?? 0);

    await this.ctx.store.save(dm);
  }
}

interface DataMetricOptions {
  proposalsCount?: number;
  votesCount?: number;
  votesWithParamsCount?: number;
  votesWithoutParamsCount?: number;
  votesWeightForSum?: bigint;
  votesWeightAgainstSum?: bigint;
  votesWeightAbstainSum?: bigint;
}
