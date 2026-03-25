import * as igovernorAbi from "../abi/igovernor";
import { Store } from "@subsquid/typeorm-store";
import { DataHandlerContext, Log as EvmLog } from "@subsquid/evm-processor";
import { Abi, keccak256, stringToBytes } from "viem";
import {
  Contributor,
  DataMetric,
  GovernanceParameterCheckpoint,
  LateQuorumVoteExtensionSet,
  Proposal,
  ProposalAction,
  ProposalCanceled,
  ProposalCreated,
  ProposalDeadlineExtension,
  ProposalExecuted,
  ProposalExtended,
  ProposalQueued,
  ProposalStateEpoch,
  ProposalThresholdSet,
  QuorumNumeratorUpdated,
  TimelockCall,
  TimelockChange,
  TimelockOperation,
  VoteCast,
  VoteCastGroup,
  VoteCastWithParams,
  VotingDelaySet,
  VotingPeriodSet,
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
import {
  governorTimelockSalt,
  TIMELOCK_STATE_CANCELED,
  TIMELOCK_STATE_DONE,
  TIMELOCK_STATE_READY,
  TIMELOCK_STATE_WAITING,
  TIMELOCK_TYPE_CONTROL,
  timelockCallEntityId,
  timelockOperationEntityId,
  timelockOperationIdForBatch,
  ZERO_BYTES32,
} from "../internal/timelock";

const ABI_FUNCTION_COUNTING_MODE: Abi = [
  {
    inputs: [],
    name: "COUNTING_MODE",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
];

const ABI_FUNCTION_PROPOSAL_DEADLINE: Abi = [
  {
    inputs: [{ internalType: "uint256", name: "proposalId", type: "uint256" }],
    name: "proposalDeadline",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];

const ABI_FUNCTION_PROPOSAL_ETA: Abi = [
  {
    inputs: [{ internalType: "uint256", name: "proposalId", type: "uint256" }],
    name: "proposalEta",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];

const ABI_FUNCTION_PROPOSAL_SNAPSHOT: Abi = [
  {
    inputs: [{ internalType: "uint256", name: "proposalId", type: "uint256" }],
    name: "proposalSnapshot",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];

const ABI_FUNCTION_TIMELOCK: Abi = [
  {
    inputs: [],
    name: "timelock",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
];

const ABI_FUNCTION_GRACE_PERIOD: Abi = [
  {
    inputs: [],
    name: "GRACE_PERIOD",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];

const GOVERNANCE_STATE_PENDING = "Pending";
const GOVERNANCE_STATE_ACTIVE = "Active";
const GOVERNANCE_STATE_QUEUED = "Queued";
const GOVERNANCE_STATE_EXECUTED = "Executed";
const GOVERNANCE_STATE_CANCELED = "Canceled";

export interface GovernorHandlerOptions {
  chainId: number;
  rpcs: string[];
  work: IndexerWork;
  indexContract: IndexerContract;
  chainTool: ChainTool;
  textPlus: TextPlus;
}

interface GovernanceScopeFields {
  chainId?: number | null;
  daoCode?: string | null;
  governorAddress?: string | null;
  contractAddress?: string | null;
  logIndex?: number | null;
  transactionIndex?: number | null;
}

interface CanonicalProposalMetadata {
  blockInterval?: string;
  clockMode: ClockMode;
  countingMode: string;
  decimals: bigint;
  descriptionHash: string;
  proposalDeadline: bigint;
  proposalEta?: bigint;
  proposalSnapshot: bigint;
  quorum: bigint;
  timelockAddress?: string;
  voteEndTimestamp: bigint;
  voteStartTimestamp: bigint;
}

export class GovernorHandler {
  constructor(
    private readonly ctx: DataHandlerContext<Store, EvmFieldSelection>,
    private readonly options: GovernorHandlerOptions,
  ) {}

  private governorAddress(): string {
    return DegovIndexerHelpers.normalizeAddress(
      this.options.indexContract.address,
    )!;
  }

  private scopeFields(): GovernanceScopeFields {
    return {
      chainId: this.options.chainId,
      daoCode: this.options.work.daoCode,
      governorAddress: this.governorAddress(),
    };
  }

  private eventFields(
    eventLog: EvmLog<EvmFieldSelection>,
  ): GovernanceScopeFields {
    return {
      ...this.scopeFields(),
      contractAddress: DegovIndexerHelpers.normalizeAddress(eventLog.address),
      logIndex: eventLog.logIndex,
      transactionIndex: eventLog.transactionIndex,
    };
  }

  private applyScopeFields<T extends object>(
    target: T,
    scope: GovernanceScopeFields,
  ): T {
    Object.assign(target, scope);
    return target;
  }

  private hasTopic(
    eventLog: EvmLog<EvmFieldSelection>,
    topic: string,
  ): boolean {
    return eventLog.topics.includes(topic);
  }

  private proposalActionId(proposal: Proposal, actionIndex: number): string {
    return `${proposal.id}:action:${actionIndex}`;
  }

  private proposalStateEpochId(proposal: Proposal, state: string): string {
    return `${proposal.id}:state:${state.toLowerCase()}`;
  }

  private proposalEventEpochId(
    proposal: Proposal,
    state: string,
    eventLog: EvmLog<EvmFieldSelection>,
  ): string {
    return `${proposal.id}:state:${state.toLowerCase()}:${eventLog.id}`;
  }

  private stdAddress(value?: string | null): string | undefined {
    return DegovIndexerHelpers.normalizeAddress(value);
  }

  private async findProposal(
    proposalId: string,
  ): Promise<Proposal | undefined> {
    return this.ctx.store.findOne(Proposal, {
      where: DegovIndexerHelpers.proposalScopeWhere({
        chainId: this.options.chainId,
        governorAddress: this.governorAddress(),
        proposalId,
      }),
    });
  }

  private proposalTimelockOperationId(proposal: Proposal): string | undefined {
    if (!proposal.timelockAddress || !proposal.descriptionHash) {
      return undefined;
    }

    const salt = governorTimelockSalt({
      governorAddress: this.governorAddress(),
      descriptionHash: proposal.descriptionHash,
    });

    return timelockOperationIdForBatch({
      targets: proposal.targets,
      values: proposal.values,
      calldatas: proposal.calldatas,
      predecessor: ZERO_BYTES32,
      salt,
    });
  }

  private async findTimelockOperation(proposal: Proposal) {
    const operationId = this.proposalTimelockOperationId(proposal);
    if (!operationId || !proposal.timelockAddress) {
      return undefined;
    }

    return this.ctx.store.findOne(TimelockOperation, {
      where: {
        chainId: this.options.chainId,
        timelockAddress: proposal.timelockAddress,
        operationId,
      },
    });
  }

  private async syncTimelockOperationForProposalQueue(
    proposal: Proposal,
    eventLog: EvmLog<EvmFieldSelection>,
    etaSeconds: bigint,
  ) {
    if (!proposal.timelockAddress || !proposal.descriptionHash) {
      return;
    }

    const operationId = this.proposalTimelockOperationId(proposal) ?? undefined;
    if (!operationId) {
      return;
    }

    const operation =
      (await this.findTimelockOperation(proposal)) ??
      new TimelockOperation({
        id: timelockOperationEntityId({
          chainId: this.options.chainId,
          timelockAddress: proposal.timelockAddress,
          operationId,
        }),
        operationId,
        timelockAddress: proposal.timelockAddress,
        timelockType: TIMELOCK_TYPE_CONTROL,
        state: TIMELOCK_STATE_WAITING,
      });

    const delaySeconds =
      etaSeconds > BigInt(Math.floor(eventLog.block.timestamp / 1000))
        ? etaSeconds - BigInt(Math.floor(eventLog.block.timestamp / 1000))
        : 0n;
    const queuedState =
      etaSeconds * 1000n <= BigInt(eventLog.block.timestamp)
        ? TIMELOCK_STATE_READY
        : TIMELOCK_STATE_WAITING;

    operation.chainId = this.options.chainId;
    operation.daoCode = this.options.work.daoCode;
    operation.governorAddress = proposal.governorAddress;
    operation.timelockAddress = proposal.timelockAddress;
    operation.contractAddress = proposal.timelockAddress;
    operation.proposal = proposal;
    operation.proposalId = proposal.proposalId;
    operation.logIndex = operation.logIndex ?? eventLog.logIndex;
    operation.transactionIndex =
      operation.transactionIndex ?? eventLog.transactionIndex;
    operation.predecessor = ZERO_BYTES32;
    operation.salt = governorTimelockSalt({
      governorAddress: this.governorAddress(),
      descriptionHash: proposal.descriptionHash,
    });
    if (
      operation.state !== TIMELOCK_STATE_DONE &&
      operation.state !== TIMELOCK_STATE_CANCELED
    ) {
      operation.state = queuedState;
    }
    operation.callCount = proposal.targets.length;
    operation.executedCallCount = operation.executedCallCount ?? 0;
    operation.delaySeconds = operation.delaySeconds ?? delaySeconds;
    operation.readyAt = operation.readyAt ?? etaSeconds * 1000n;
    operation.queuedBlockNumber =
      operation.queuedBlockNumber ?? BigInt(eventLog.block.height);
    operation.queuedBlockTimestamp =
      operation.queuedBlockTimestamp ?? BigInt(eventLog.block.timestamp);
    operation.queuedTransactionHash =
      operation.queuedTransactionHash ?? eventLog.transactionHash;

    await this.ctx.store.save(operation);

    for (const [actionIndex, target] of proposal.targets.entries()) {
      const callId = timelockCallEntityId(operation.id, actionIndex);
      const existingCall = await this.ctx.store.findOne(TimelockCall, {
        where: { id: callId },
      });
      const call =
        existingCall ??
        new TimelockCall({
          id: callId,
          operation,
          operationId,
          actionIndex,
          target,
          value: proposal.values[actionIndex] ?? "0",
          data: proposal.calldatas[actionIndex] ?? "0x",
          state: queuedState,
        });

      call.chainId = this.options.chainId;
      call.daoCode = this.options.work.daoCode;
      call.governorAddress = proposal.governorAddress;
      call.timelockAddress = proposal.timelockAddress;
      call.contractAddress = proposal.timelockAddress;
      call.logIndex = call.logIndex ?? eventLog.logIndex;
      call.transactionIndex =
        call.transactionIndex ?? eventLog.transactionIndex;
      call.operation = operation;
      call.operationId = operationId;
      call.proposal = proposal;
      call.proposalId = proposal.proposalId;
      call.proposalActionIndex = actionIndex;
      call.proposalActionId = this.proposalActionId(proposal, actionIndex);
      call.actionIndex = actionIndex;
      call.target = target;
      call.value = proposal.values[actionIndex] ?? "0";
      call.data = proposal.calldatas[actionIndex] ?? "0x";
      call.predecessor = ZERO_BYTES32;
      call.delaySeconds = call.delaySeconds ?? delaySeconds;
      if (call.state !== TIMELOCK_STATE_DONE) {
        call.state =
          call.state === TIMELOCK_STATE_CANCELED ? call.state : queuedState;
      }
      call.scheduledBlockNumber =
        call.scheduledBlockNumber ?? BigInt(eventLog.block.height);
      call.scheduledBlockTimestamp =
        call.scheduledBlockTimestamp ?? BigInt(eventLog.block.timestamp);
      call.scheduledTransactionHash =
        call.scheduledTransactionHash ?? eventLog.transactionHash;

      await this.ctx.store.save(call);
    }
  }

  async handle(eventLog: EvmLog<EvmFieldSelection>) {
    if (this.hasTopic(eventLog, igovernorAbi.events.ProposalCreated.topic)) {
      await this.storeProposalCreated(eventLog);
    }
    if (this.hasTopic(eventLog, igovernorAbi.events.ProposalQueued.topic)) {
      await this.storeProposalQueued(eventLog);
    }
    if (this.hasTopic(eventLog, igovernorAbi.events.ProposalExtended.topic)) {
      await this.storeProposalExtended(eventLog);
    }
    if (this.hasTopic(eventLog, igovernorAbi.events.ProposalExecuted.topic)) {
      await this.storeProposalExecuted(eventLog);
    }
    if (this.hasTopic(eventLog, igovernorAbi.events.ProposalCanceled.topic)) {
      await this.storeProposalCanceled(eventLog);
    }
    if (this.hasTopic(eventLog, igovernorAbi.events.VotingDelaySet.topic)) {
      await this.storeVotingDelaySet(eventLog);
    }
    if (this.hasTopic(eventLog, igovernorAbi.events.VotingPeriodSet.topic)) {
      await this.storeVotingPeriodSet(eventLog);
    }
    if (
      this.hasTopic(eventLog, igovernorAbi.events.ProposalThresholdSet.topic)
    ) {
      await this.storeProposalThresholdSet(eventLog);
    }
    if (
      this.hasTopic(eventLog, igovernorAbi.events.QuorumNumeratorUpdated.topic)
    ) {
      await this.storeQuorumNumeratorUpdated(eventLog);
    }
    if (
      this.hasTopic(
        eventLog,
        igovernorAbi.events.LateQuorumVoteExtensionSet.topic,
      )
    ) {
      await this.storeLateQuorumVoteExtensionSet(eventLog);
    }
    if (this.hasTopic(eventLog, igovernorAbi.events.TimelockChange.topic)) {
      await this.storeTimelockChange(eventLog);
    }
    if (this.hasTopic(eventLog, igovernorAbi.events.VoteCast.topic)) {
      await this.storeVoteCast(eventLog);
    }
    if (this.hasTopic(eventLog, igovernorAbi.events.VoteCastWithParams.topic)) {
      await this.storeVoteCastWithParams(eventLog);
    }
  }

  private stdProposalId(proposalId: bigint): string {
    return `0x${proposalId.toString(16)}`;
  }

  private async loadCanonicalProposalMetadata(
    eventLog: EvmLog<EvmFieldSelection>,
    event: igovernorAbi.ProposalCreatedEventArgs,
  ): Promise<CanonicalProposalMetadata> {
    const { chainTool, indexContract, work } = this.options;
    const governorTokenContract = work.contracts.find(
      (item) => item.name === "governorToken",
    );
    if (!governorTokenContract) {
      throw new Error(
        `governorToken contract not found in work daoCode: ${work.daoCode} -> governorContract: ${indexContract.address}`,
      );
    }

    const contractOptions = {
      chainId: this.options.chainId,
      rpcs: this.options.rpcs,
      contractAddress: indexContract.address,
    };
    const clockMode = await chainTool.clockMode(contractOptions);
    const proposalSnapshot = await chainTool.readContract<bigint>({
      ...contractOptions,
      abi: ABI_FUNCTION_PROPOSAL_SNAPSHOT,
      functionName: "proposalSnapshot",
      args: [event.proposalId],
    });
    const proposalDeadline = await chainTool.readContract<bigint>({
      ...contractOptions,
      abi: ABI_FUNCTION_PROPOSAL_DEADLINE,
      functionName: "proposalDeadline",
      args: [event.proposalId],
    });
    const proposalEta = await chainTool.readOptionalContract<bigint>({
      ...contractOptions,
      abi: ABI_FUNCTION_PROPOSAL_ETA,
      functionName: "proposalEta",
      args: [event.proposalId],
    });
    const countingMode = await chainTool.readContract<string>({
      ...contractOptions,
      abi: ABI_FUNCTION_COUNTING_MODE,
      functionName: "COUNTING_MODE",
    });
    const timelockAddress = this.stdAddress(
      await chainTool.readOptionalContract<string>({
        ...contractOptions,
        abi: ABI_FUNCTION_TIMELOCK,
        functionName: "timelock",
      }),
    );
    const qmr = await chainTool.quorum({
      ...contractOptions,
      governorTokenAddress: governorTokenContract.address,
      governorTokenStandard: governorTokenContract.standard?.toUpperCase() as
        | "ERC20"
        | "ERC721"
        | undefined,
      timepoint: proposalSnapshot,
    });

    const exactStartTimestamp = await chainTool.timepointToTimestampMs({
      ...contractOptions,
      timepoint: proposalSnapshot,
      clockMode,
    });
    const exactEndTimestamp = await chainTool.timepointToTimestampMs({
      ...contractOptions,
      timepoint: proposalDeadline,
      clockMode,
    });

    let blockInterval: number | undefined;
    if (
      clockMode === ClockMode.BlockNumber &&
      (exactStartTimestamp === undefined || exactEndTimestamp === undefined)
    ) {
      blockInterval = await chainTool.blockIntervalSeconds({
        chainId: this.options.chainId,
        rpcs: this.options.rpcs,
        enableFloatValue: true,
      });
    }

    const fallbackTimestamps = calculateProposalVoteTimestamp({
      clockMode,
      proposalVoteStart: Number(proposalSnapshot),
      proposalVoteEnd: Number(proposalDeadline),
      proposalCreatedBlock: eventLog.block.height,
      proposalStartTimestamp: eventLog.block.timestamp,
      blockInterval: blockInterval ?? 0,
    });

    return {
      blockInterval:
        clockMode === ClockMode.BlockNumber && blockInterval !== undefined
          ? blockInterval.toString()
          : undefined,
      clockMode: qmr.clockMode,
      countingMode,
      decimals: qmr.decimals,
      descriptionHash: keccak256(stringToBytes(event.description)),
      proposalDeadline,
      proposalEta,
      proposalSnapshot,
      quorum: qmr.quorum,
      timelockAddress,
      voteEndTimestamp: exactEndTimestamp ?? BigInt(fallbackTimestamps.voteEnd),
      voteStartTimestamp:
        exactStartTimestamp ?? BigInt(fallbackTimestamps.voteStart),
    };
  }

  private async storeProposalActions(
    proposal: Proposal,
    eventLog: EvmLog<EvmFieldSelection>,
  ) {
    const actions = proposal.targets.map(
      (target, actionIndex) =>
        new ProposalAction({
          id: this.proposalActionId(proposal, actionIndex),
          ...this.eventFields(eventLog),
          proposal,
          proposalId: proposal.proposalId,
          actionIndex,
          target,
          value: proposal.values[actionIndex] ?? "0",
          signature: proposal.signatures[actionIndex] ?? "",
          calldata: proposal.calldatas[actionIndex] ?? "0x",
          blockNumber: proposal.blockNumber,
          blockTimestamp: proposal.blockTimestamp,
          transactionHash: proposal.transactionHash,
        }),
    );

    if (actions.length > 0) {
      await this.ctx.store.insert(actions);
    }
  }

  private async storeInitialProposalStateEpochs(
    proposal: Proposal,
    eventLog: EvmLog<EvmFieldSelection>,
    metadata: CanonicalProposalMetadata,
  ) {
    const pendingEpoch = new ProposalStateEpoch({
      id: this.proposalStateEpochId(proposal, GOVERNANCE_STATE_PENDING),
      ...this.eventFields(eventLog),
      proposal,
      proposalId: proposal.proposalId,
      state: GOVERNANCE_STATE_PENDING,
      startTimepoint:
        metadata.clockMode === ClockMode.Timestamp
          ? BigInt(Math.floor(eventLog.block.timestamp / 1000))
          : BigInt(eventLog.block.height),
      endTimepoint: metadata.proposalSnapshot,
      startBlockNumber: proposal.blockNumber,
      startBlockTimestamp: proposal.blockTimestamp,
      endBlockNumber:
        metadata.clockMode === ClockMode.BlockNumber
          ? metadata.proposalSnapshot
          : undefined,
      endBlockTimestamp: metadata.voteStartTimestamp,
      transactionHash: proposal.transactionHash,
    });

    const activeEpoch = new ProposalStateEpoch({
      id: this.proposalStateEpochId(proposal, GOVERNANCE_STATE_ACTIVE),
      ...this.eventFields(eventLog),
      proposal,
      proposalId: proposal.proposalId,
      state: GOVERNANCE_STATE_ACTIVE,
      startTimepoint: metadata.proposalSnapshot,
      endTimepoint: metadata.proposalDeadline,
      startBlockNumber:
        metadata.clockMode === ClockMode.BlockNumber
          ? metadata.proposalSnapshot
          : undefined,
      startBlockTimestamp: metadata.voteStartTimestamp,
      endBlockNumber:
        metadata.clockMode === ClockMode.BlockNumber
          ? metadata.proposalDeadline
          : undefined,
      endBlockTimestamp: metadata.voteEndTimestamp,
      transactionHash: proposal.transactionHash,
    });

    await this.ctx.store.insert([pendingEpoch, activeEpoch]);
  }

  private async storeProposalStateEpoch(
    proposal: Proposal,
    state: string,
    eventLog: EvmLog<EvmFieldSelection>,
  ) {
    const existing = await this.ctx.store.findOne(ProposalStateEpoch, {
      where: {
        chainId: this.options.chainId,
        governorAddress: this.governorAddress(),
        proposalId: proposal.proposalId,
        state,
        transactionHash: eventLog.transactionHash,
      },
    });
    if (existing) {
      return;
    }

    const clockMode = await this.options.chainTool.clockMode({
      chainId: this.options.chainId,
      contractAddress: this.options.indexContract.address,
      rpcs: this.options.rpcs,
    });
    const epoch = new ProposalStateEpoch({
      id: this.proposalEventEpochId(proposal, state, eventLog),
      ...this.eventFields(eventLog),
      proposal,
      proposalId: proposal.proposalId,
      state,
      startTimepoint:
        clockMode === ClockMode.Timestamp
          ? BigInt(eventLog.block.timestamp / 1000)
          : BigInt(eventLog.block.height),
      startBlockNumber: BigInt(eventLog.block.height),
      startBlockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });

    await this.ctx.store.insert(epoch);
  }

  private async storeGovernanceParameterCheckpoint(options: {
    eventLog: EvmLog<EvmFieldSelection>;
    eventName: string;
    parameterName: string;
    valueType: string;
    oldValue?: string;
    newValue: string;
  }) {
    const checkpoint = new GovernanceParameterCheckpoint({
      id: options.eventLog.id,
      ...this.eventFields(options.eventLog),
      eventName: options.eventName,
      parameterName: options.parameterName,
      valueType: options.valueType,
      oldValue: options.oldValue,
      newValue: options.newValue,
      blockNumber: BigInt(options.eventLog.block.height),
      blockTimestamp: BigInt(options.eventLog.block.timestamp),
      transactionHash: options.eventLog.transactionHash,
    });

    await this.ctx.store.insert(checkpoint);
  }

  private async storeProposalCreated(eventLog: EvmLog<EvmFieldSelection>) {
    const event = igovernorAbi.events.ProposalCreated.decode(eventLog);
    const proposalId = this.stdProposalId(event.proposalId);
    const entity = new ProposalCreated({
      id: eventLog.id,
      ...this.eventFields(eventLog),
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
    this.ctx.log.info(
      DegovIndexerHelpers.formatLogLine("governor.proposal created", {
        proposalId,
        proposer: event.proposer,
        block: eventLog.block.height,
        tx: eventLog.transactionHash,
      }),
    );

    const canonicalMetadata = await this.loadCanonicalProposalMetadata(
      eventLog,
      event,
    );
    const eifo = await this.options.textPlus.extractInfo(event.description);
    this.ctx.log.info(
      DegovIndexerHelpers.formatLogLine(
        "governor.proposal metadata extracted",
        {
          proposalId,
          title: eifo.title,
          block: eventLog.block.height,
          tx: eventLog.transactionHash,
        },
      ),
    );

    const proposal = new Proposal({
      id: eventLog.id,
      ...this.eventFields(eventLog),
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
      voteStartTimestamp: canonicalMetadata.voteStartTimestamp,
      voteEndTimestamp: canonicalMetadata.voteEndTimestamp,
      blockInterval: canonicalMetadata.blockInterval,
      descriptionHash: canonicalMetadata.descriptionHash,
      proposalSnapshot: canonicalMetadata.proposalSnapshot,
      proposalDeadline: canonicalMetadata.proposalDeadline,
      proposalEta: canonicalMetadata.proposalEta,
      countingMode: canonicalMetadata.countingMode,
      timelockAddress: canonicalMetadata.timelockAddress,
      clockMode: canonicalMetadata.clockMode,
      quorum: canonicalMetadata.quorum,
      decimals: canonicalMetadata.decimals,
      title: eifo.title,
    });
    await this.ctx.store.insert(proposal);
    await this.storeProposalActions(proposal, eventLog);
    await this.storeInitialProposalStateEpochs(
      proposal,
      eventLog,
      canonicalMetadata,
    );

    await this.storeGlobalDataMetric(
      {
        proposalsCount: 1,
      },
      proposal,
    );
  }

  private async storeProposalQueued(eventLog: EvmLog<EvmFieldSelection>) {
    const event = igovernorAbi.events.ProposalQueued.decode(eventLog);
    const proposalId = this.stdProposalId(event.proposalId);
    const entity = new ProposalQueued({
      id: eventLog.id,
      ...this.eventFields(eventLog),
      proposalId,
      etaSeconds: event.etaSeconds,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(entity);

    const proposal = await this.findProposal(proposalId);
    if (proposal) {
      proposal.proposalEta = event.etaSeconds;
      proposal.queueReadyAt = event.etaSeconds * 1000n;
      if (proposal.timelockAddress) {
        const gracePeriod =
          await this.options.chainTool.readOptionalContract<bigint>({
            chainId: this.options.chainId,
            contractAddress: proposal.timelockAddress as `0x${string}`,
            rpcs: this.options.rpcs,
            abi: ABI_FUNCTION_GRACE_PERIOD,
            functionName: "GRACE_PERIOD",
          });
        proposal.timelockGracePeriod = gracePeriod;
        proposal.queueExpiresAt =
          gracePeriod !== undefined
            ? (event.etaSeconds + gracePeriod) * 1000n
            : undefined;
      }
      await this.ctx.store.save(proposal);
      await this.syncTimelockOperationForProposalQueue(
        proposal,
        eventLog,
        event.etaSeconds,
      );
      await this.storeProposalStateEpoch(
        proposal,
        GOVERNANCE_STATE_QUEUED,
        eventLog,
      );
    }
  }

  private async storeProposalExtended(eventLog: EvmLog<EvmFieldSelection>) {
    const event = igovernorAbi.events.ProposalExtended.decode(eventLog);
    const proposalId = this.stdProposalId(event.proposalId);
    const entity = new ProposalExtended({
      id: eventLog.id,
      ...this.eventFields(eventLog),
      proposalId,
      extendedDeadline: BigInt(event.extendedDeadline),
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(entity);

    const proposal = await this.findProposal(proposalId);
    if (!proposal) {
      return;
    }

    const previousDeadline = proposal.proposalDeadline;
    proposal.proposalDeadline = BigInt(event.extendedDeadline);

    const resolvedVoteEndTimestamp =
      (await this.options.chainTool.timepointToTimestampMs({
        chainId: this.options.chainId,
        contractAddress: this.options.indexContract.address,
        rpcs: this.options.rpcs,
        timepoint: BigInt(event.extendedDeadline),
        clockMode: proposal.clockMode as ClockMode,
      })) ?? proposal.voteEndTimestamp;
    proposal.voteEndTimestamp = resolvedVoteEndTimestamp;
    await this.ctx.store.save(proposal);

    const extension = new ProposalDeadlineExtension({
      id: `${proposal.id}:deadline-extension:${eventLog.id}`,
      ...this.eventFields(eventLog),
      proposal,
      proposalId,
      previousDeadline,
      newDeadline: BigInt(event.extendedDeadline),
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(extension);

    const activeEpoch = await this.ctx.store.findOne(ProposalStateEpoch, {
      where: {
        id: this.proposalStateEpochId(proposal, GOVERNANCE_STATE_ACTIVE),
      },
    });
    if (activeEpoch) {
      activeEpoch.endTimepoint = BigInt(event.extendedDeadline);
      activeEpoch.endBlockNumber =
        proposal.clockMode === ClockMode.BlockNumber
          ? BigInt(event.extendedDeadline)
          : undefined;
      activeEpoch.endBlockTimestamp = resolvedVoteEndTimestamp;
      await this.ctx.store.save(activeEpoch);
    }
  }

  private async storeProposalExecuted(eventLog: EvmLog<EvmFieldSelection>) {
    const event = igovernorAbi.events.ProposalExecuted.decode(eventLog);
    const proposalId = this.stdProposalId(event.proposalId);
    const entity = new ProposalExecuted({
      id: eventLog.id,
      ...this.eventFields(eventLog),
      proposalId,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(entity);

    const proposal = await this.findProposal(proposalId);
    if (proposal) {
      const operation = await this.findTimelockOperation(proposal);
      if (operation) {
        operation.state = TIMELOCK_STATE_DONE;
        operation.executedBlockNumber = BigInt(eventLog.block.height);
        operation.executedBlockTimestamp = BigInt(eventLog.block.timestamp);
        operation.executedTransactionHash = eventLog.transactionHash;
        operation.executedCallCount =
          operation.callCount ?? operation.executedCallCount;
        await this.ctx.store.save(operation);
      }
      await this.storeProposalStateEpoch(
        proposal,
        GOVERNANCE_STATE_EXECUTED,
        eventLog,
      );
    }
  }

  private async storeProposalCanceled(eventLog: EvmLog<EvmFieldSelection>) {
    const event = igovernorAbi.events.ProposalCanceled.decode(eventLog);
    const proposalId = this.stdProposalId(event.proposalId);
    const entity = new ProposalCanceled({
      id: eventLog.id,
      ...this.eventFields(eventLog),
      proposalId,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(entity);

    const proposal = await this.findProposal(proposalId);
    if (proposal) {
      const operation = await this.findTimelockOperation(proposal);
      if (operation) {
        operation.state = TIMELOCK_STATE_CANCELED;
        operation.cancelledBlockNumber = BigInt(eventLog.block.height);
        operation.cancelledBlockTimestamp = BigInt(eventLog.block.timestamp);
        operation.cancelledTransactionHash = eventLog.transactionHash;
        await this.ctx.store.save(operation);
      }
      await this.storeProposalStateEpoch(
        proposal,
        GOVERNANCE_STATE_CANCELED,
        eventLog,
      );
    }
  }

  private async storeVotingDelaySet(eventLog: EvmLog<EvmFieldSelection>) {
    const event = igovernorAbi.events.VotingDelaySet.decode(eventLog);
    const entity = new VotingDelaySet({
      id: eventLog.id,
      ...this.eventFields(eventLog),
      oldVotingDelay: event.oldVotingDelay,
      newVotingDelay: event.newVotingDelay,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(entity);
    await this.storeGovernanceParameterCheckpoint({
      eventLog,
      eventName: "VotingDelaySet",
      parameterName: "votingDelay",
      valueType: "uint256",
      oldValue: event.oldVotingDelay.toString(),
      newValue: event.newVotingDelay.toString(),
    });
  }

  private async storeVotingPeriodSet(eventLog: EvmLog<EvmFieldSelection>) {
    const event = igovernorAbi.events.VotingPeriodSet.decode(eventLog);
    const entity = new VotingPeriodSet({
      id: eventLog.id,
      ...this.eventFields(eventLog),
      oldVotingPeriod: event.oldVotingPeriod,
      newVotingPeriod: event.newVotingPeriod,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(entity);
    await this.storeGovernanceParameterCheckpoint({
      eventLog,
      eventName: "VotingPeriodSet",
      parameterName: "votingPeriod",
      valueType: "uint256",
      oldValue: event.oldVotingPeriod.toString(),
      newValue: event.newVotingPeriod.toString(),
    });
  }

  private async storeProposalThresholdSet(eventLog: EvmLog<EvmFieldSelection>) {
    const event = igovernorAbi.events.ProposalThresholdSet.decode(eventLog);
    const entity = new ProposalThresholdSet({
      id: eventLog.id,
      ...this.eventFields(eventLog),
      oldProposalThreshold: event.oldProposalThreshold,
      newProposalThreshold: event.newProposalThreshold,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(entity);
    await this.storeGovernanceParameterCheckpoint({
      eventLog,
      eventName: "ProposalThresholdSet",
      parameterName: "proposalThreshold",
      valueType: "uint256",
      oldValue: event.oldProposalThreshold.toString(),
      newValue: event.newProposalThreshold.toString(),
    });
  }

  private async storeQuorumNumeratorUpdated(
    eventLog: EvmLog<EvmFieldSelection>,
  ) {
    const event = igovernorAbi.events.QuorumNumeratorUpdated.decode(eventLog);
    const entity = new QuorumNumeratorUpdated({
      id: eventLog.id,
      ...this.eventFields(eventLog),
      oldQuorumNumerator: event.oldQuorumNumerator,
      newQuorumNumerator: event.newQuorumNumerator,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(entity);
    await this.storeGovernanceParameterCheckpoint({
      eventLog,
      eventName: "QuorumNumeratorUpdated",
      parameterName: "quorumNumerator",
      valueType: "uint256",
      oldValue: event.oldQuorumNumerator.toString(),
      newValue: event.newQuorumNumerator.toString(),
    });
  }

  private async storeLateQuorumVoteExtensionSet(
    eventLog: EvmLog<EvmFieldSelection>,
  ) {
    const event =
      igovernorAbi.events.LateQuorumVoteExtensionSet.decode(eventLog);
    const entity = new LateQuorumVoteExtensionSet({
      id: eventLog.id,
      ...this.eventFields(eventLog),
      oldLateQuorumVoteExtension: BigInt(event.oldVoteExtension),
      newLateQuorumVoteExtension: BigInt(event.newVoteExtension),
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(entity);
    await this.storeGovernanceParameterCheckpoint({
      eventLog,
      eventName: "LateQuorumVoteExtensionSet",
      parameterName: "lateQuorumVoteExtension",
      valueType: "uint64",
      oldValue: BigInt(event.oldVoteExtension).toString(),
      newValue: BigInt(event.newVoteExtension).toString(),
    });
  }

  private async storeTimelockChange(eventLog: EvmLog<EvmFieldSelection>) {
    const event = igovernorAbi.events.TimelockChange.decode(eventLog);
    const oldTimelock = this.stdAddress(event.oldTimelock) ?? event.oldTimelock;
    const newTimelock = this.stdAddress(event.newTimelock) ?? event.newTimelock;
    const entity = new TimelockChange({
      id: eventLog.id,
      ...this.eventFields(eventLog),
      oldTimelock,
      newTimelock,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });
    await this.ctx.store.insert(entity);
    await this.storeGovernanceParameterCheckpoint({
      eventLog,
      eventName: "TimelockChange",
      parameterName: "timelockAddress",
      valueType: "address",
      oldValue: oldTimelock,
      newValue: newTimelock,
    });
  }

  private async storeVoteCast(eventLog: EvmLog<EvmFieldSelection>) {
    const event = igovernorAbi.events.VoteCast.decode(eventLog);
    const entity = new VoteCast({
      id: eventLog.id,
      ...this.eventFields(eventLog),
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
      ...this.eventFields(eventLog),
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
      ...this.eventFields(eventLog),
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
      ...this.eventFields(eventLog),
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
        where: DegovIndexerHelpers.proposalScopeWhere({
          chainId: vcg.chainId ?? this.options.chainId,
          governorAddress: vcg.governorAddress ?? this.governorAddress(),
          proposalId: vcg.refProposalId,
        }),
      },
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

    // update contributor last vote info
    let storedContributor: Contributor | undefined =
      await this.ctx.store.findOne(Contributor, {
        where: {
          id: vcg.voter,
        },
      });
    if (storedContributor) {
      storedContributor.lastVoteBlockNumber = BigInt(vcg.blockNumber);
      storedContributor.lastVoteTimestamp = BigInt(vcg.blockTimestamp);
      this.applyScopeFields(storedContributor, {
        chainId: vcg.chainId,
        daoCode: vcg.daoCode,
        governorAddress: vcg.governorAddress,
        contractAddress: vcg.contractAddress,
        logIndex: vcg.logIndex,
        transactionIndex: vcg.transactionIndex,
      });
      await this.ctx.store.save(storedContributor);
    }

    // store metric
    await this.storeGlobalDataMetric(
      {
        votesCount: 1,
        votesWithParamsCount: +(vcg.type === "vote-cast-with-params"),
        votesWithoutParamsCount: +(vcg.type === "vote-cast-without-params"),
        votesWeightForSum,
        votesWeightAgainstSum,
        votesWeightAbstainSum,
      },
      vcg,
    );
  }

  private async storeGlobalDataMetric(
    options: DataMetricOptions,
    source: GovernanceScopeFields,
  ) {
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
    this.applyScopeFields(dm, source);
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

export function calculateProposalVoteTimestamp(options: {
  clockMode: ClockMode;
  proposalVoteStart: number;
  proposalVoteEnd: number; // seconds (if clockMode is Timestamp)
  proposalCreatedBlock: number; // block number
  proposalStartTimestamp: number; // milliseconds
  blockInterval: number;
}): ProposalVoteTimestamp {
  let proposalStartTimestamp: Date;
  let proposalEndTimestamp: Date;
  switch (options.clockMode) {
    case ClockMode.BlockNumber:
      const startBlocksSinceCreation =
        options.proposalVoteStart - options.proposalCreatedBlock;
      const endBlocksSinceCreation =
        options.proposalVoteEnd - options.proposalCreatedBlock;
      const voteStartSeconds =
        options.proposalStartTimestamp +
        startBlocksSinceCreation * options.blockInterval * 1000;
      const voteEndSeconds =
        options.proposalStartTimestamp +
        endBlocksSinceCreation * options.blockInterval * 1000;
      proposalStartTimestamp = new Date(Math.round(voteStartSeconds));
      proposalEndTimestamp = new Date(Math.round(voteEndSeconds));
      break;
    case ClockMode.Timestamp:
      proposalStartTimestamp = new Date(+options.proposalVoteStart * 1000);
      proposalEndTimestamp = new Date(+options.proposalVoteEnd * 1000);
      break;
  }

  return {
    voteStart: +proposalStartTimestamp,
    voteEnd: +proposalEndTimestamp,
  };
}
