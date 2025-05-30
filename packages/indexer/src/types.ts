export const evmFieldSelection = {
  transaction: {
    from: true,
    value: true,
    hash: true,
  },
  log: {
    transactionHash: true,
  },
};

export type EvmFieldSelection = typeof evmFieldSelection;
