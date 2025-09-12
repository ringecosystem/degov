

//# uniswap compound records
//# https://etherscan.io/tx/0x4c6efccf3f03a5618bac7194cccf9d6fdb84f7bfdae75102f1736c6fade22d3d#eventlog
//# https://docs.tally.xyz/set-up-and-technical-documentation/deploying-daos/smart-contract-compatibility/compound-governor-bravo
//# https://docs.tally.xyz/set-up-and-technical-documentation/deploying-daos/smart-contract-compatibility/openzeppelin-governor
/**
delegates:  [
  {
    fromDelegate: '0xf665f2ed351696817898fe0ace20c5c1bc3c5796',
    toDelegate: '0xf665f2ed351696817898fe0ace20c5c1bc3c5796',
    power: 2656182531244817051458n,
    id: '0xf665f2ed351696817898fe0ace20c5c1bc3c5796_0xf665f2ed351696817898fe0ace20c5c1bc3c5796'
  },
  {
    delegator: '0x0f60f8ad6f587561605c7980c5c044b6e809829a',
    fromDelegate: '0x0f60f8ad6f587561605c7980c5c044b6e809829a',
    toDelegate: '0xb63308cb3d88c298ed0e76f8044a731bafef0934',
    power: 10000000000000000000n,
    id: '0x0f60f8ad6f587561605c7980c5c044b6e809829a_0xb63308cb3d88c298ed0e76f8044a731bafef0934'
  }
]

mapping:  [
  {
    id: '0xf665f2ed351696817898fe0ace20c5c1bc3c5796',
    from: '0xf665f2ed351696817898fe0ace20c5c1bc3c5796',
    to: '0xf665f2ed351696817898fe0ace20c5c1bc3c5796'
  },
  {
    id: '0x0f60f8ad6f587561605c7980c5c044b6e809829a',
    from: '0x0f60f8ad6f587561605c7980c5c044b6e809829a',
    to: '0xb63308cb3d88c298ed0e76f8044a731bafef0934'
  }
]
 */
export const recordsFor_0x0F60F8a = [
  [
    // mock
    {
      method: "DelegateChanged",
      delegator: "0xf665F2eD351696817898fe0Ace20c5C1Bc3c5796",
      fromDelegate: "0x0000000000000000000000000000000000000000",
      toDelegate: "0xf665F2eD351696817898fe0Ace20c5C1Bc3c5796",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xf665F2eD351696817898fe0Ace20c5C1Bc3c5796",
      previousVotes: 0n,
      newVotes: 2676182531244817051458n,
    },

    // ===
    {
      method: "DelegateChanged",
      delegator: "0x0F60F8aD6F587561605c7980C5c044b6e809829A",
      fromDelegate: "0x0000000000000000000000000000000000000000",
      toDelegate: "0xB63308CB3d88c298eD0E76f8044a731BAFeF0934",
    },
    {
      method: "Transfer",
      from: "0xf665F2eD351696817898fe0Ace20c5C1Bc3c5796",
      to: "0x0F60F8aD6F587561605c7980C5c044b6e809829A",
      value: 10000000000000000000n,
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xf665F2eD351696817898fe0Ace20c5C1Bc3c5796",
      previousVotes: 2676182531244817051458n,
      newVotes: 2666182531244817051458n,
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xB63308CB3d88c298eD0E76f8044a731BAFeF0934",
      previousVotes: 0n,
      newVotes: 1000000000000000000n,
    },
  ],
];
