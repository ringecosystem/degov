import * as itimelockcontrollerAbi from "../abi/itimelockcontroller";
import { Store } from "@subsquid/typeorm-store";
import { DataHandlerContext, Log as EvmLog } from "@subsquid/evm-processor";
import {
  Proposal,
  ProposalStateEpoch,
  TimelockCall,
  TimelockMinDelayChange,
  TimelockOperation,
  TimelockRoleEvent,
} from "../model";
import { EvmFieldSelection, IndexerContract, IndexerWork } from "../types";
import { ChainTool, ClockMode } from "../internal/chaintool";
import { DegovIndexerHelpers } from "../internal/helpers";
import {
  TIMELOCK_STATE_CANCELED,
  TIMELOCK_STATE_DONE,
  TIMELOCK_STATE_READY,
  TIMELOCK_STATE_WAITING,
  TIMELOCK_TYPE_CONTROL,
  timelockCallEntityId,
  timelockOperationEntityId,
  timelockRoleLabel,
} from "../internal/timelock";

const GOVERNANCE_STATE_CANCELED = "Canceled";
const GOVERNANCE_STATE_EXECUTED = "Executed";

export interface TimelockHandlerOptions {
  chainId: number;
  rpcs: string[];
  work: IndexerWork;
  indexContract: IndexerContract;
  chainTool: ChainTool;
}

interface TimelockScopeFields {
  chainId?: number;
  daoCode?: string;
  governorAddress?: string;
  timelockAddress?: string;
  contractAddress?: string;
  logIndex?: number;
  transactionIndex?: number;
}

export class TimelockHandler {
  constructor(
    private readonly ctx: DataHandlerContext<Store, EvmFieldSelection>,
    private readonly options: TimelockHandlerOptions,
  ) {}

  private governorAddress(): string | undefined {
    return DegovIndexerHelpers.findContractAddress(
      this.options.work,
      "governor",
    );
  }

  private timelockAddress(): string {
    return (
      DegovIndexerHelpers.normalizeAddress(
        this.options.indexContract.address,
      ) ?? this.options.indexContract.address.toLowerCase()
    );
  }

  private stdAddress(value?: string | null): string | undefined {
    return DegovIndexerHelpers.normalizeAddress(value);
  }

  private scopeFields(): TimelockScopeFields {
    return {
      chainId: this.options.chainId,
      daoCode: this.options.work.daoCode,
      governorAddress: this.governorAddress(),
      timelockAddress: this.timelockAddress(),
    };
  }

  private eventFields(
    eventLog: EvmLog<EvmFieldSelection>,
  ): TimelockScopeFields {
    return {
      ...this.scopeFields(),
      contractAddress: this.timelockAddress(),
      logIndex: eventLog.logIndex,
      transactionIndex: eventLog.transactionIndex,
    };
  }

  private hasTopic(
    eventLog: EvmLog<EvmFieldSelection>,
    topic: string,
  ): boolean {
    return eventLog.topics.includes(topic);
  }

  private proposalStateEpochId(
    proposal: Proposal,
    state: string,
    eventLog: EvmLog<EvmFieldSelection>,
  ): string {
    return `${proposal.id}:state:${state.toLowerCase()}:${eventLog.id}`;
  }

  private proposalActionId(proposal: Proposal, actionIndex: number): string {
    return `${proposal.id}:action:${actionIndex}`;
  }

  private async findOperation(operationId: string) {
    return this.ctx.store.findOne(TimelockOperation, {
      where: {
        chainId: this.options.chainId,
        timelockAddress: this.timelockAddress(),
        operationId: operationId.toLowerCase(),
      },
    });
  }

  private async findOrCreateOperation(
    operationId: string,
  ): Promise<TimelockOperation> {
    const existing = await this.findOperation(operationId);
    if (existing) {
      return existing;
    }

    return new TimelockOperation({
      id: timelockOperationEntityId({
        chainId: this.options.chainId,
        timelockAddress: this.timelockAddress(),
        operationId,
      }),
      ...this.scopeFields(),
      operationId: operationId.toLowerCase(),
      timelockType: TIMELOCK_TYPE_CONTROL,
      state: TIMELOCK_STATE_WAITING,
      callCount: 0,
      executedCallCount: 0,
    });
  }

  private async findProposalById(proposalId?: string | null) {
    if (!proposalId) {
      return undefined;
    }

    const governorAddress = this.governorAddress();
    if (!governorAddress) {
      return undefined;
    }

    return this.ctx.store.findOne(Proposal, {
      where: DegovIndexerHelpers.proposalScopeWhere({
        chainId: this.options.chainId,
        governorAddress,
        proposalId,
      }),
    });
  }

  private async bindOperationToProposal(
    operation: TimelockOperation,
    proposal: Proposal,
  ) {
    operation.proposal = proposal;
    operation.proposalId = proposal.proposalId;
    operation.governorAddress = proposal.governorAddress;

    const calls = await this.ctx.store.find(TimelockCall, {
      where: {
        chainId: this.options.chainId,
        timelockAddress: this.timelockAddress(),
        operationId: operation.operationId,
      },
    });

    for (const call of calls) {
      call.proposal = proposal;
      call.proposalId = proposal.proposalId;
      call.proposalActionIndex = call.actionIndex;
      call.proposalActionId = this.proposalActionId(proposal, call.actionIndex);
    }

    await this.ctx.store.save(operation);
    if (calls.length > 0) {
      await this.ctx.store.save(calls);
    }
  }

  private async ensureProposalStateEpoch(
    proposal: Proposal,
    state: string,
    eventLog: EvmLog<EvmFieldSelection>,
  ) {
    const existing = await this.ctx.store.findOne(ProposalStateEpoch, {
      where: {
        chainId: this.options.chainId,
        governorAddress:
          proposal.governorAddress ?? this.governorAddress() ?? undefined,
        proposalId: proposal.proposalId,
        state,
        transactionHash: eventLog.transactionHash,
      },
    });
    if (existing) {
      return;
    }

    const clockMode =
      proposal.clockMode === ClockMode.Timestamp
        ? ClockMode.Timestamp
        : ClockMode.BlockNumber;

    const epoch = new ProposalStateEpoch({
      id: this.proposalStateEpochId(proposal, state, eventLog),
      chainId: this.options.chainId,
      daoCode: this.options.work.daoCode,
      governorAddress: proposal.governorAddress,
      contractAddress: this.timelockAddress(),
      logIndex: eventLog.logIndex,
      transactionIndex: eventLog.transactionIndex,
      proposal,
      proposalId: proposal.proposalId,
      state,
      startTimepoint:
        clockMode === ClockMode.Timestamp
          ? BigInt(Math.floor(eventLog.block.timestamp / 1000))
          : BigInt(eventLog.block.height),
      startBlockNumber: BigInt(eventLog.block.height),
      startBlockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });

    await this.ctx.store.insert(epoch);
  }

  private async finalizeOperationExecution(
    operation: TimelockOperation,
    eventLog: EvmLog<EvmFieldSelection>,
  ) {
    operation.state = TIMELOCK_STATE_DONE;
    operation.executedBlockNumber = BigInt(eventLog.block.height);
    operation.executedBlockTimestamp = BigInt(eventLog.block.timestamp);
    operation.executedTransactionHash = eventLog.transactionHash;
    await this.ctx.store.save(operation);

    if (operation.proposal) {
      await this.ensureProposalStateEpoch(
        operation.proposal,
        GOVERNANCE_STATE_EXECUTED,
        eventLog,
      );
    }
  }

  async handle(eventLog: EvmLog<EvmFieldSelection>) {
    if (
      this.hasTopic(eventLog, itimelockcontrollerAbi.events.CallScheduled.topic)
    ) {
      await this.storeCallScheduled(eventLog);
    }
    if (
      this.hasTopic(eventLog, itimelockcontrollerAbi.events.CallExecuted.topic)
    ) {
      await this.storeCallExecuted(eventLog);
    }
    if (this.hasTopic(eventLog, itimelockcontrollerAbi.events.CallSalt.topic)) {
      await this.storeCallSalt(eventLog);
    }
    if (
      this.hasTopic(eventLog, itimelockcontrollerAbi.events.Cancelled.topic)
    ) {
      await this.storeCancelled(eventLog);
    }
    if (
      this.hasTopic(
        eventLog,
        itimelockcontrollerAbi.events.MinDelayChange.topic,
      )
    ) {
      await this.storeMinDelayChange(eventLog);
    }
    if (
      this.hasTopic(eventLog, itimelockcontrollerAbi.events.RoleGranted.topic)
    ) {
      await this.storeRoleGranted(eventLog);
    }
    if (
      this.hasTopic(eventLog, itimelockcontrollerAbi.events.RoleRevoked.topic)
    ) {
      await this.storeRoleRevoked(eventLog);
    }
    if (
      this.hasTopic(
        eventLog,
        itimelockcontrollerAbi.events.RoleAdminChanged.topic,
      )
    ) {
      await this.storeRoleAdminChanged(eventLog);
    }
  }

  private async storeCallScheduled(eventLog: EvmLog<EvmFieldSelection>) {
    const event = itimelockcontrollerAbi.events.CallScheduled.decode(eventLog);
    const operationId = event.id.toLowerCase();
    const target = this.stdAddress(event.target) ?? event.target;
    const operation = await this.findOrCreateOperation(operationId);

    operation.contractAddress = this.timelockAddress();
    operation.logIndex ??= eventLog.logIndex;
    operation.transactionIndex ??= eventLog.transactionIndex;
    operation.predecessor = event.predecessor.toLowerCase();
    operation.delaySeconds = BigInt(event.delay);
    operation.readyAt =
      BigInt(eventLog.block.timestamp) + BigInt(event.delay) * 1000n;
    operation.state =
      operation.readyAt <= BigInt(eventLog.block.timestamp)
        ? TIMELOCK_STATE_READY
        : TIMELOCK_STATE_WAITING;
    operation.callCount = Math.max(
      operation.callCount ?? 0,
      Number(event.index) + 1,
    );
    operation.queuedBlockNumber ??= BigInt(eventLog.block.height);
    operation.queuedBlockTimestamp ??= BigInt(eventLog.block.timestamp);
    operation.queuedTransactionHash ??= eventLog.transactionHash;

    const call =
      (await this.ctx.store.findOne(TimelockCall, {
        where: { id: timelockCallEntityId(operation.id, Number(event.index)) },
      })) ??
      new TimelockCall({
        id: timelockCallEntityId(operation.id, Number(event.index)),
        ...this.scopeFields(),
        operation,
        operationId,
        proposal: operation.proposal,
        proposalId: operation.proposalId,
        proposalActionIndex: Number(event.index),
        proposalActionId: operation.proposal
          ? this.proposalActionId(operation.proposal, Number(event.index))
          : undefined,
        actionIndex: Number(event.index),
        target,
        value: event.value.toString(),
        data: event.data,
        predecessor: event.predecessor.toLowerCase(),
        state: TIMELOCK_STATE_WAITING,
      });

    call.chainId = this.options.chainId;
    call.daoCode = this.options.work.daoCode;
    call.governorAddress = operation.governorAddress ?? this.governorAddress();
    call.timelockAddress = this.timelockAddress();
    call.contractAddress = this.timelockAddress();
    call.logIndex = eventLog.logIndex;
    call.transactionIndex = eventLog.transactionIndex;
    call.operation = operation;
    call.operationId = operationId;
    call.proposal = operation.proposal;
    call.proposalId = operation.proposalId;
    call.proposalActionIndex = Number(event.index);
    call.proposalActionId = operation.proposal
      ? this.proposalActionId(operation.proposal, Number(event.index))
      : undefined;
    call.target = target;
    call.value = event.value.toString();
    call.data = event.data;
    call.predecessor = event.predecessor.toLowerCase();
    call.delaySeconds = BigInt(event.delay);
    call.state = operation.state;
    call.scheduledBlockNumber = BigInt(eventLog.block.height);
    call.scheduledBlockTimestamp = BigInt(eventLog.block.timestamp);
    call.scheduledTransactionHash = eventLog.transactionHash;

    await this.ctx.store.save(operation);
    await this.ctx.store.save(call);
  }

  private async storeCallExecuted(eventLog: EvmLog<EvmFieldSelection>) {
    const event = itimelockcontrollerAbi.events.CallExecuted.decode(eventLog);
    const operationId = event.id.toLowerCase();
    const target = this.stdAddress(event.target) ?? event.target;
    const operation = await this.findOrCreateOperation(operationId);
    const actionIndex = Number(event.index);
    const callId = timelockCallEntityId(operation.id, actionIndex);
    const existingCall = await this.ctx.store.findOne(TimelockCall, {
      where: { id: callId },
    });

    const call =
      existingCall ??
      new TimelockCall({
        id: callId,
        ...this.scopeFields(),
        operation,
        operationId,
        proposal: operation.proposal,
        proposalId: operation.proposalId,
        proposalActionIndex: actionIndex,
        proposalActionId: operation.proposal
          ? this.proposalActionId(operation.proposal, actionIndex)
          : undefined,
        actionIndex,
        target,
        value: event.value.toString(),
        data: event.data,
        state: TIMELOCK_STATE_DONE,
      });

    const wasExecuted = existingCall?.state === TIMELOCK_STATE_DONE;
    call.chainId = this.options.chainId;
    call.daoCode = this.options.work.daoCode;
    call.governorAddress = operation.governorAddress ?? this.governorAddress();
    call.timelockAddress = this.timelockAddress();
    call.contractAddress = this.timelockAddress();
    call.logIndex = eventLog.logIndex;
    call.transactionIndex = eventLog.transactionIndex;
    call.operation = operation;
    call.operationId = operationId;
    call.proposal = operation.proposal;
    call.proposalId = operation.proposalId;
    call.proposalActionIndex = actionIndex;
    call.proposalActionId = operation.proposal
      ? this.proposalActionId(operation.proposal, actionIndex)
      : undefined;
    call.actionIndex = actionIndex;
    call.target = target;
    call.value = event.value.toString();
    call.data = event.data;
    call.state = TIMELOCK_STATE_DONE;
    call.executedBlockNumber = BigInt(eventLog.block.height);
    call.executedBlockTimestamp = BigInt(eventLog.block.timestamp);
    call.executedTransactionHash = eventLog.transactionHash;

    operation.contractAddress = this.timelockAddress();
    operation.callCount = Math.max(operation.callCount ?? 0, actionIndex + 1);
    if (!wasExecuted) {
      operation.executedCallCount = (operation.executedCallCount ?? 0) + 1;
    }

    await this.ctx.store.save(operation);
    await this.ctx.store.save(call);

    if (
      (operation.callCount ?? 0) > 0 &&
      (operation.executedCallCount ?? 0) >= (operation.callCount ?? 0)
    ) {
      await this.finalizeOperationExecution(operation, eventLog);
    }
  }

  private async storeCallSalt(eventLog: EvmLog<EvmFieldSelection>) {
    const event = itimelockcontrollerAbi.events.CallSalt.decode(eventLog);
    const operation = await this.findOrCreateOperation(event.id.toLowerCase());
    operation.contractAddress = this.timelockAddress();
    operation.salt = event.salt.toLowerCase();
    await this.ctx.store.save(operation);
  }

  private async storeCancelled(eventLog: EvmLog<EvmFieldSelection>) {
    const event = itimelockcontrollerAbi.events.Cancelled.decode(eventLog);
    const operation = await this.findOrCreateOperation(event.id.toLowerCase());

    operation.contractAddress = this.timelockAddress();
    operation.state = TIMELOCK_STATE_CANCELED;
    operation.cancelledBlockNumber = BigInt(eventLog.block.height);
    operation.cancelledBlockTimestamp = BigInt(eventLog.block.timestamp);
    operation.cancelledTransactionHash = eventLog.transactionHash;
    await this.ctx.store.save(operation);

    const calls = await this.ctx.store.find(TimelockCall, {
      where: {
        chainId: this.options.chainId,
        timelockAddress: this.timelockAddress(),
        operationId: operation.operationId,
      },
    });
    for (const call of calls) {
      if (call.state !== TIMELOCK_STATE_DONE) {
        call.state = TIMELOCK_STATE_CANCELED;
      }
    }
    if (calls.length > 0) {
      await this.ctx.store.save(calls);
    }

    if (operation.proposal) {
      await this.ensureProposalStateEpoch(
        operation.proposal,
        GOVERNANCE_STATE_CANCELED,
        eventLog,
      );
    }
  }

  private async storeMinDelayChange(eventLog: EvmLog<EvmFieldSelection>) {
    const event = itimelockcontrollerAbi.events.MinDelayChange.decode(eventLog);
    const entity = new TimelockMinDelayChange({
      id: eventLog.id,
      ...this.eventFields(eventLog),
      oldDuration: event.oldDuration,
      newDuration: event.newDuration,
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });

    await this.ctx.store.insert(entity);
  }

  private async storeRoleGranted(eventLog: EvmLog<EvmFieldSelection>) {
    const event = itimelockcontrollerAbi.events.RoleGranted.decode(eventLog);
    const entity = new TimelockRoleEvent({
      id: eventLog.id,
      ...this.eventFields(eventLog),
      eventName: "RoleGranted",
      role: event.role.toLowerCase(),
      roleLabel: timelockRoleLabel(event.role),
      account: DegovIndexerHelpers.normalizeAddress(event.account),
      sender: DegovIndexerHelpers.normalizeAddress(event.sender),
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });

    await this.ctx.store.insert(entity);
  }

  private async storeRoleRevoked(eventLog: EvmLog<EvmFieldSelection>) {
    const event = itimelockcontrollerAbi.events.RoleRevoked.decode(eventLog);
    const entity = new TimelockRoleEvent({
      id: eventLog.id,
      ...this.eventFields(eventLog),
      eventName: "RoleRevoked",
      role: event.role.toLowerCase(),
      roleLabel: timelockRoleLabel(event.role),
      account: DegovIndexerHelpers.normalizeAddress(event.account),
      sender: DegovIndexerHelpers.normalizeAddress(event.sender),
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });

    await this.ctx.store.insert(entity);
  }

  private async storeRoleAdminChanged(eventLog: EvmLog<EvmFieldSelection>) {
    const event =
      itimelockcontrollerAbi.events.RoleAdminChanged.decode(eventLog);
    const entity = new TimelockRoleEvent({
      id: eventLog.id,
      ...this.eventFields(eventLog),
      eventName: "RoleAdminChanged",
      role: event.role.toLowerCase(),
      roleLabel: timelockRoleLabel(event.role),
      previousAdminRole: event.previousAdminRole.toLowerCase(),
      previousAdminRoleLabel: timelockRoleLabel(event.previousAdminRole),
      newAdminRole: event.newAdminRole.toLowerCase(),
      newAdminRoleLabel: timelockRoleLabel(event.newAdminRole),
      blockNumber: BigInt(eventLog.block.height),
      blockTimestamp: BigInt(eventLog.block.timestamp),
      transactionHash: eventLog.transactionHash,
    });

    await this.ctx.store.insert(entity);
  }
}
