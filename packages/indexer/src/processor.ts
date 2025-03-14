import {
  BlockHeader,
  DataHandlerContext,
  EvmBatchProcessor,
  EvmBatchProcessorFields,
  Log as _Log,
  Transaction as _Transaction,
} from "@subsquid/evm-processor";
import * as indexConfig from "./config";

const rpcEndpoint = {
  // More RPC connection options at https://docs.subsquid.io/evm-indexing/configuration/initialization/#set-data-source
  capacity: 30,
  maxBatchCallSize: 200,
  url: indexConfig.endpoint.rpcs[0],
};

export const processor = new EvmBatchProcessor()
  .setRpcEndpoint(rpcEndpoint)
  .setFinalityConfirmation(10)
  .setFields({
    transaction: {
      from: true,
      value: true,
      hash: true,
    },
    log: {
      transactionHash: true,
    },
  })
  .addLog({
    range: { from: indexConfig.indexLog.startBlock },
    address: indexConfig.indexLog.contracts.map((item) => item.address),
  });

if (indexConfig.gateway) {
  processor.setGateway(indexConfig.gateway);
}

export type Fields = EvmBatchProcessorFields<typeof processor>;
export type Block = BlockHeader<Fields>;
export type Log = _Log<Fields>;
export type Transaction = _Transaction<Fields>;
export type ProcessorContext<Store> = DataHandlerContext<Store, Fields>;
