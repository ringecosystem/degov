import { assertNotNull } from "@subsquid/util-internal";
import {
  BlockHeader,
  DataHandlerContext,
  EvmBatchProcessor,
  EvmBatchProcessorFields,
  Log as _Log,
  Transaction as _Transaction,
} from "@subsquid/evm-processor";
import {
  IGOVERNOR_CONTRACT_ADDRESS,
  ITOKEN_CONTRACT_ADDRESS,
} from "./constants";

export const processor = new EvmBatchProcessor()
  // .setGateway("https://v2.archive.subsquid.io/network/ethereum-mainnet")
  .setRpcEndpoint({
    // url: assertNotNull(process.env.RPC_ETH_HTTP, "No RPC endpoint supplied"),
    url: "wss://rpc.darwinia.network",
    capacity: 30,
    maxBatchCallSize: 200,

    // More RPC connection options at https://docs.subsquid.io/evm-indexing/configuration/initialization/#set-data-source
    // maxBatchCallSize: 100,
  })
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
    // 2576160 //# contract crated block
    range: { from: 2632000 },
    address: [
      IGOVERNOR_CONTRACT_ADDRESS, // governorContract
      ITOKEN_CONTRACT_ADDRESS, // token
    ],
  });
//

export type Fields = EvmBatchProcessorFields<typeof processor>;
export type Block = BlockHeader<Fields>;
export type Log = _Log<Fields>;
export type Transaction = _Transaction<Fields>;
export type ProcessorContext<Store> = DataHandlerContext<Store, Fields>;
