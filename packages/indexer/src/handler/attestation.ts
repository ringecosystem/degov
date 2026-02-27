import { DataHandlerContext, Log as EvmLog } from "@subsquid/evm-processor";
import { Store } from "@subsquid/typeorm-store";
import * as iattestation from "../abi/iattestation";
import {
  Contributor,
  DataMetric,
  Delegate,
} from "../model";
import {
  MetricsId,
  EvmFieldSelection,
  IndexerContract,
  IndexerWork,
} from "../types";
import { DegovIndexerHelpers } from "../internal/helpers";

export interface AttestationHandlerOptions {
  chainId: number;
  work: IndexerWork;
  indexContract: IndexerContract;
}

export class AttestationHandler {
  constructor(
    private readonly ctx: DataHandlerContext<Store, EvmFieldSelection>,
    private readonly options: AttestationHandlerOptions
  ) {}

  async handle(eventLog: EvmLog<EvmFieldSelection>) {
    const topic = eventLog.topics[0];

    switch (topic) {
      case iattestation.events.AttesterRegistered.topic:
        return this.handleAttesterRegistered(eventLog);
      case iattestation.events.AttesterUnregistered.topic:
        return this.handleAttesterUnregistered(eventLog);
      case iattestation.events.StakeIncreased.topic:
        return this.handleStakeIncreased(eventLog);
      case iattestation.events.StakeDecreased.topic:
        return this.handleStakeDecreased(eventLog);
      case iattestation.events.Penalized.topic:
        return this.handlePenalized(eventLog);
      case iattestation.events.Slashed.topic:
        return this.handleSlashed(eventLog);
      case iattestation.events.ForceExitInitiated.topic:
        // No power change on force exit initiation
        this.ctx.log.info(
          `ForceExitInitiated at ${eventLog.block.height}, tx: ${eventLog.transactionHash}`
        );
        return;
    }
  }

  // IStaking: AttesterRegistered(address indexed attester, uint256 stakeAmount, uint256 activationBlock)
  private async handleAttesterRegistered(eventLog: EvmLog<EvmFieldSelection>) {
    const event = iattestation.events.AttesterRegistered.decode(eventLog);
    this.ctx.log.info(
      `AttesterRegistered: ${DegovIndexerHelpers.safeJsonStringify(event)}, at ${eventLog.block.height}, tx: ${eventLog.transactionHash}`
    );
    await this.applyPowerDelta(
      event.attester,
      event.stakeAmount,
      eventLog,
      true
    );
  }

  // IStaking: AttesterUnregistered(address indexed attester, address indexed receiver, uint256 effectiveStakeAmount)
  private async handleAttesterUnregistered(eventLog: EvmLog<EvmFieldSelection>) {
    const event = iattestation.events.AttesterUnregistered.decode(eventLog);
    this.ctx.log.info(
      `AttesterUnregistered: ${DegovIndexerHelpers.safeJsonStringify(event)}, at ${eventLog.block.height}, tx: ${eventLog.transactionHash}`
    );
    await this.zeroOutAttester(event.attester, eventLog);
  }

  private async handleStakeIncreased(eventLog: EvmLog<EvmFieldSelection>) {
    const event = iattestation.events.StakeIncreased.decode(eventLog);
    this.ctx.log.info(
      `StakeIncreased: ${DegovIndexerHelpers.safeJsonStringify(event)}, at ${eventLog.block.height}, tx: ${eventLog.transactionHash}`
    );
    await this.applyPowerDelta(
      event.attester,
      event.additionalStakeAmount,
      eventLog,
      false
    );
  }

  private async handleStakeDecreased(eventLog: EvmLog<EvmFieldSelection>) {
    const event = iattestation.events.StakeDecreased.decode(eventLog);
    this.ctx.log.info(
      `StakeDecreased: ${DegovIndexerHelpers.safeJsonStringify(event)}, at ${eventLog.block.height}, tx: ${eventLog.transactionHash}`
    );
    await this.applyPowerDelta(
      event.attester,
      -event.decreasedStakeAmount,
      eventLog,
      false
    );
  }

  private async handlePenalized(eventLog: EvmLog<EvmFieldSelection>) {
    const event = iattestation.events.Penalized.decode(eventLog);
    this.ctx.log.info(
      `Penalized: ${DegovIndexerHelpers.safeJsonStringify(event)}, at ${eventLog.block.height}, tx: ${eventLog.transactionHash}`
    );
    await this.applyPowerDelta(
      event.attester,
      -event.penaltyAmount,
      eventLog,
      false
    );
  }

  private async handleSlashed(eventLog: EvmLog<EvmFieldSelection>) {
    const event = iattestation.events.Slashed.decode(eventLog);
    this.ctx.log.info(
      `Slashed: ${DegovIndexerHelpers.safeJsonStringify(event)}, at ${eventLog.block.height}, tx: ${eventLog.transactionHash}`
    );
    await this.applyPowerDelta(
      event.attester,
      -event.slashAmount,
      eventLog,
      false
    );
  }

  /**
   * Zeroes out an attester's power on unregistration.
   * Reads the current Contributor power and applies the negative delta.
   */
  private async zeroOutAttester(
    attester: string,
    eventLog: EvmLog<EvmFieldSelection>
  ) {
    const attesterLower = attester.toLowerCase();
    const storedContributor = await this.ctx.store.findOne(Contributor, {
      where: { id: attesterLower },
    });

    if (!storedContributor || storedContributor.power === 0n) {
      return;
    }

    const delta = -storedContributor.power;
    await this.applyPowerDelta(attester, delta, eventLog, false);
  }

  /**
   * Core method: applies a power delta to Contributor, Delegate, and DataMetric.
   * @param isNewRegistration - if true, creates a new Contributor and increments memberCount
   */
  private async applyPowerDelta(
    attester: string,
    delta: bigint,
    eventLog: EvmLog<EvmFieldSelection>,
    isNewRegistration: boolean
  ) {
    const attesterLower = attester.toLowerCase();
    const blockNumber = BigInt(eventLog.block.height);
    const blockTimestamp = BigInt(eventLog.block.timestamp);
    const transactionHash = eventLog.transactionHash;

    // 1. Upsert Contributor
    let storedContributor = await this.ctx.store.findOne(Contributor, {
      where: { id: attesterLower },
    });

    let isActuallyNew = false;
    if (storedContributor) {
      storedContributor.power += delta;
      storedContributor.blockNumber = blockNumber;
      storedContributor.blockTimestamp = blockTimestamp;
      storedContributor.transactionHash = transactionHash;
      await this.ctx.store.save(storedContributor);
    } else {
      isActuallyNew = true;
      const contributor = new Contributor({
        id: attesterLower,
        blockNumber,
        blockTimestamp,
        transactionHash,
        power: delta,
        delegatesCountAll: 0,
        delegatesCountEffective: 0,
      });
      await this.ctx.store.insert(contributor);
    }

    // 2. Upsert self-delegation Delegate entity
    const delegateId = `${attesterLower}_${attesterLower}`;
    let storedDelegate = await this.ctx.store.findOne(Delegate, {
      where: { id: delegateId },
    });

    if (storedDelegate) {
      storedDelegate.power += delta;
      storedDelegate.blockNumber = blockNumber;
      storedDelegate.blockTimestamp = blockTimestamp;
      storedDelegate.transactionHash = transactionHash;

      if (storedDelegate.power === 0n) {
        await this.ctx.store.remove(Delegate, delegateId);
      } else {
        await this.ctx.store.save(storedDelegate);
      }
    } else if (delta > 0n) {
      const delegate = new Delegate({
        id: delegateId,
        fromDelegate: attesterLower,
        toDelegate: attesterLower,
        blockNumber,
        blockTimestamp,
        transactionHash,
        power: delta,
      });
      await this.ctx.store.insert(delegate);
    }

    // 3. Update DataMetric.powerSum
    let storedDataMetric = await this.ctx.store.findOne(DataMetric, {
      where: { id: MetricsId.global },
    });
    const dm = storedDataMetric
      ? storedDataMetric
      : new DataMetric({ id: MetricsId.global });
    if (!storedDataMetric) {
      await this.ctx.store.insert(dm);
    }
    dm.powerSum = (dm.powerSum ?? 0n) + delta;

    // 4. Increment memberCount for new attesters
    if (isNewRegistration && isActuallyNew) {
      dm.memberCount = (dm.memberCount ?? 0) + 1;
    }

    await this.ctx.store.save(dm);
  }
}
