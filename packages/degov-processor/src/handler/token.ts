import { Log as EvmLog } from "@subsquid/evm-processor";
import * as itokenerc20 from "../abi/itokenerc20";
import * as itokenerc721 from "../abi/itokenerc721";
import { DegovConfigIndexLogContract, EvmFieldSelection } from "../types";

const zeroAddress = "0x0000000000000000000000000000000000000000";

export class TokenHandler {
  constructor(private readonly indexContract: DegovConfigIndexLogContract) {}

  async handle(eventLog: EvmLog<EvmFieldSelection>) {
    const itokenAbi = this.itokenAbi();
    const isDelegateChanged =
      eventLog.topics.findIndex(
        (item) => item === itokenAbi.events.DelegateChanged.topic
      ) != -1;
    if (isDelegateChanged) {
      // await this.storeDelegateChanged(eventLog);
    }

    const isDelegateVotesChanged =
      eventLog.topics.findIndex(
        (item) => item === itokenAbi.events.DelegateVotesChanged.topic
      ) != -1;
    if (isDelegateVotesChanged) {
      // await this.storeDelegateVotesChanged(eventLog);
    }

    const isTokenTransfer =
      eventLog.topics.findIndex(
        (item) => item === itokenAbi.events.Transfer.topic
      ) != -1;
    if (isTokenTransfer) {
      // await this.storeTokenTransfer(eventLog);
    }
  }

  private contractStandard() {
    const contractStandard = (
      this.indexContract.standard ?? "erc20"
    ).toLowerCase();
    return contractStandard;
  }

  private itokenAbi() {
    const contractStandard = this.contractStandard();
    const isErc721 = contractStandard === "erc721";
    return isErc721 ? itokenerc721 : itokenerc20;
  }
}
