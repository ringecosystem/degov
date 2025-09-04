import * as igovernorAbi from "../abi/igovernor";
import { Store } from "@subsquid/typeorm-store";
import { DataHandlerContext, Log as EvmLog } from "@subsquid/evm-processor";
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
import {
  MetricsId,
  EvmFieldSelection,
  IndexerContract,
  IndexerWork,
} from "../types";
import { ChainTool, ClockMode } from "../internal/chaintool";
import { TextPlus } from "../internal/textplus";
import { DegovIndexerHelpers } from "../internal/helpers";

export interface GovernorHandlerOptions {
  chainId: number;
  rpcs: string[];
  work: IndexerWork;
  indexContract: IndexerContract;
  chainTool: ChainTool;
  textPlus: TextPlus;
}

export class GovernorHandler {
  constructor(
    private readonly ctx: DataHandlerContext<Store, EvmFieldSelection>,
    private readonly options: GovernorHandlerOptions
  ) {}

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
    const proposalId = this.stdProposalId(event.proposalId);
    const entity = new ProposalCreated({
      id: eventLog.id,
      proposalId,
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
    this.ctx.log.info(`Proposal created event: ${proposalId}`);

    const { chainTool, textPlus, indexContract, work } = this.options;
    const governorTokenContract = work.contracts.find(
      (item) => item.name === "governorToken"
    );
    if (!governorTokenContract) {
      throw new Error(
        `governorToken contract not found in work daoCode: ${work.daoCode} -> governorContrace: ${indexContract.address}`
      );
    }
    const qmr = await chainTool.quorum({
      chainId: this.options.chainId,
      rpcs: this.options.rpcs,
      contractAddress: indexContract.address,
      standard: indexContract.standard?.toUpperCase() as
        | "ERC20"
        | "ERC721"
        | undefined,
      governorTokenAddress: governorTokenContract.address,
      governorTokenStandard: governorTokenContract.standard?.toUpperCase() as
        | "ERC20"
        | "ERC721"
        | undefined,
    });
    let voteStartTimestamp = Number(event.voteStart) * 1000;
    let voteEndTimestamp = Number(event.voteEnd) * 1000;
    const blockInterval = await chainTool.blockIntervalSeconds({
      chainId: this.options.chainId,
      rpcs: this.options.rpcs,
      enableFloatValue: true,
    });
    if (qmr.clockMode == ClockMode.BlockNumber) {
      const cpvt = calculateProposalVoteTimestamp({
        clockMode: ClockMode.BlockNumber,
        proposalVoteEnd: Number(event.voteEnd),
        proposalCreatedBlock: eventLog.block.height,
        proposalStartTimestamp: eventLog.block.timestamp,
        blockInterval,
      });
      voteStartTimestamp = cpvt.voteStart;
      voteEndTimestamp = cpvt.voteEnd;
    }
    const eifo = await textPlus.extractInfo(event.description);
    this.ctx.log.info(
      `Extracted info for proposal ${proposalId}: ${DegovIndexerHelpers.safeJsonStringify(
        eifo
      )}`
    );

    const proposal = new Proposal({
      id: eventLog.id,
      proposalId,
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
      // ---
      voteStartTimestamp: BigInt(voteStartTimestamp),
      voteEndTimestamp: BigInt(voteEndTimestamp),
      clockMode: qmr.clockMode,
      quorum: qmr.quorum,
      decimals: qmr.decimals,
      title: eifo.title,
      blockInterval: blockInterval.toString(),
    });
    await this.ctx.store.insert(proposal);

    await this.storeGlobalDataMetric({
      proposalsCount: 1,
    });
  }

  private async storeProposalQueued(eventLog: EvmLog<EvmFieldSelection>) {
    const event = igovernorAbi.events.ProposalQueued.decode(eventLog);
    const entity = new ProposalQueued({
      id: eventLog.id,
      proposalId: this.stdProposalId(event.proposalId),
      etaSeconds: event.etaSeconds,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(entity);
  }

  private async storeProposalExecuted(eventLog: EvmLog<EvmFieldSelection>) {
    const event = igovernorAbi.events.ProposalExecuted.decode(eventLog);
    const entity = new ProposalExecuted({
      id: eventLog.id,
      proposalId: this.stdProposalId(event.proposalId),
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(entity);
  }

  private async storeProposalCanceled(eventLog: EvmLog<EvmFieldSelection>) {
    const event = igovernorAbi.events.ProposalCanceled.decode(eventLog);
    const entity = new ProposalCanceled({
      id: eventLog.id,
      proposalId: this.stdProposalId(event.proposalId),
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(entity);
  }

  private async storeVoteCast(eventLog: EvmLog<EvmFieldSelection>) {
    const event = igovernorAbi.events.VoteCast.decode(eventLog);
    const entity = new VoteCast({
      id: eventLog.id,
      voter: event.voter,
      proposalId: this.stdProposalId(event.proposalId),
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
      refProposalId: this.stdProposalId(event.proposalId),
      support: event.support,
      weight: event.weight,
      reason: event.reason,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.storeVoteCastGroup(vcg);
  }

  private async storeVoteCastWithParams(eventLog: EvmLog<EvmFieldSelection>) {
    const event = igovernorAbi.events.VoteCastWithParams.decode(eventLog);
    const entity = new VoteCastWithParams({
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
    });
    await this.ctx.store.insert(entity);

    const vcg = new VoteCastGroup({
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
        votesWeightAgainstSum = BigInt(vcg.weight);
        break;
      case 1:
        votesWeightForSum = BigInt(vcg.weight);
        break;
      case 2:
        votesWeightAbstainSum = BigInt(vcg.weight);
        break;
    }

    if (proposal) {
      const voters = [...(proposal.voters || []), vcg];
      proposal.voters = voters;
      proposal.metricsVotesCount = Number(proposal.metricsVotesCount ?? 0) + 1;
      proposal.metricsVotesWithParamsCount =
        (proposal.metricsVotesWithParamsCount ?? 0) +
        +(vcg.type === "vote-cast-with-params");
      proposal.metricsVotesWithoutParamsCount =
        (proposal.metricsVotesWithoutParamsCount ?? 0) +
        +(vcg.type === "vote-cast-without-params");

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
    dm.proposalsCount =
      (dm.proposalsCount ?? 0) + (options.proposalsCount ?? 0);
    dm.votesCount = (dm.votesCount ?? 0) + (options.votesCount ?? 0);
    dm.votesWithParamsCount =
      (dm.votesWithParamsCount ?? 0) + (options.votesWithParamsCount ?? 0);
    dm.votesWithoutParamsCount =
      (dm.votesWithoutParamsCount ?? 0) +
      (options.votesWithoutParamsCount ?? 0);
    dm.votesWeightForSum =
      (dm.votesWeightForSum ?? 0n) + (options.votesWeightForSum ?? 0n);
    dm.votesWeightAgainstSum =
      (dm.votesWeightAgainstSum ?? 0n) + (options.votesWeightAgainstSum ?? 0n);
    dm.votesWeightAbstainSum =
      (dm.votesWeightAbstainSum ?? 0n) + (options.votesWeightAbstainSum ?? 0n);

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

interface ProposalVoteTimestamp {
  voteStart: number;
  voteEnd: number;
}

function calculateProposalVoteTimestamp(options: {
  clockMode: ClockMode;
  proposalVoteEnd: number; // seconds (if clockMode is Timestamp)
  proposalCreatedBlock: number; // block number
  proposalStartTimestamp: number; // milliseconds
  blockInterval: number;
}): ProposalVoteTimestamp {
  let proposalEndTimestamp;
  switch (options.clockMode) {
    case ClockMode.BlockNumber:
      const blocksSinceCreation =
        options.proposalVoteEnd - options.proposalCreatedBlock;
      const additionalSeconds = blocksSinceCreation * options.blockInterval;
      const voteEndSeconds =
        options.proposalStartTimestamp + additionalSeconds * 1000;
      proposalEndTimestamp = new Date(Math.round(voteEndSeconds));
      break;
    case ClockMode.Timestamp:
      proposalEndTimestamp = new Date(+options.proposalVoteEnd * 1000);
      break;
  }

  return {
    voteStart: options.proposalStartTimestamp,
    voteEnd: +proposalEndTimestamp,
  };
}
