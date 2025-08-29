const zeroAddress = "0x0000000000000000000000000000000000000000";

// 0xf25f97f6f7657a210daeb1cd6042b769fae95488
/*
delegates:  [
  {
    delegator: '0xf25f97f6f7657a210daeb1cd6042b769fae95488',
    fromDelegate: '0xf25f97f6f7657a210daeb1cd6042b769fae95488',
    toDelegate: '0x92e9fb99e99d79bc47333e451e7c6490dbf24b22',
    power: 20000000000000000000n,
    id: '0xf25f97f6f7657a210daeb1cd6042b769fae95488_0x92e9fb99e99d79bc47333e451e7c6490dbf24b22'
  }
]

mapping:  [
  {
    id: '0xa23d90f2fb496f3055d3d96a2dc991e9133efee9',
    from: '0xa23d90f2fb496f3055d3d96a2dc991e9133efee9',
    to: '0xa23d90f2fb496f3055d3d96a2dc991e9133efee9'
  },
  {
    id: '0x3e8436e87abb49efe1a958ee73fbb7a12b419aab',
    from: '0x3e8436e87abb49efe1a958ee73fbb7a12b419aab',
    to: '0x3e8436e87abb49efe1a958ee73fbb7a12b419aab'
  },
  {
    id: '0xf25f97f6f7657a210daeb1cd6042b769fae95488',
    from: '0xf25f97f6f7657a210daeb1cd6042b769fae95488',
    to: '0x92e9fb99e99d79bc47333e451e7c6490dbf24b22'
  }
]
*/
const recordsFor_0xf25f97f = [
  [
    {
      method: "transfer",
      value: 30000000000000000000n,
      from: "0x3e8436e87abb49efe1a958ee73fbb7a12b419aab",
      to: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
    },
  ],
  [
    {
      method: "DelegateChanged",
      delegator: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      fromDelegate: "0x0000000000000000000000000000000000000000",
      toDelegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      previousVotes: 0n,
      newVotes: 30000000000000000000n,
    },
  ],
  [
    {
      method: "transfer",
      value: 15000000000000000000n,
      from: "0x3e8436e87abb49efe1a958ee73fbb7a12b419aab",
      to: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      previousVotes: 30000000000000000000n,
      newVotes: 45000000000000000000n,
    },
  ],
  [
    {
      method: "DelegateChanged",
      delegator: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      fromDelegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      toDelegate: "0x92e9fb99e99d79bc47333e451e7c6490dbf24b22",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      previousVotes: 45000000000000000000n,
      newVotes: 0n,
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0x92e9fb99e99d79bc47333e451e7c6490dbf24b22",
      previousVotes: 0n,
      newVotes: 45000000000000000000n,
    },
  ],
  [
    {
      method: "DelegateChanged",
      delegator: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
      fromDelegate: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
      toDelegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
      previousVotes: 30000000000000000000n,
      newVotes: 0n,
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      previousVotes: 0n,
      newVotes: 30000000000000000000n,
    },
  ],
  [
    {
      method: "DelegateChanged",
      delegator: "0x3e8436e87abb49efe1a958ee73fbb7a12b419aab",
      fromDelegate: "0x3e8436e87abb49efe1a958ee73fbb7a12b419aab",
      toDelegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0x3e8436e87abb49efe1a958ee73fbb7a12b419aab",
      previousVotes: 25000000000000000000n,
      newVotes: 0n,
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      previousVotes: 30000000000000000000n,
      newVotes: 55000000000000000000n,
    },
  ],
  [
    {
      method: "DelegateChanged",
      delegator: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      fromDelegate: "0x92e9fb99e99d79bc47333e451e7c6490dbf24b22",
      toDelegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0x92e9fb99e99d79bc47333e451e7c6490dbf24b22",
      previousVotes: 45000000000000000000n,
      newVotes: 0n,
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      previousVotes: 55000000000000000000n,
      newVotes: 100000000000000000000n,
    },
  ],
  [
    {
      method: "DelegateChanged",
      delegator: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      fromDelegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      toDelegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
    },
  ],
  [
    {
      method: "Transfer",
      value: 25000000000000000000n,
      from: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      to: "0x92e9fb99e99d79bc47333e451e7c6490dbf24b22",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      previousVotes: 100000000000000000000n,
      newVotes: 75000000000000000000n,
    },
  ],
  [
    {
      method: "DelegateChanged",
      delegator: "0x3e8436e87abb49efe1a958ee73fbb7a12b419aab",
      fromDelegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      toDelegate: "0x3e8436e87abb49efe1a958ee73fbb7a12b419aab",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      previousVotes: 75000000000000000000n,
      newVotes: 50000000000000000000n,
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0x3e8436e87abb49efe1a958ee73fbb7a12b419aab",
      previousVotes: 0n,
      newVotes: 25000000000000000000n,
    },
  ],
  [
    {
      method: "DelegateChanged",
      delegator: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
      fromDelegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      toDelegate: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      previousVotes: 50000000000000000000n,
      newVotes: 20000000000000000000n,
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
      previousVotes: 0n,
      newVotes: 30000000000000000000n,
    },
  ],
  [
    {
      method: "DelegateChanged",
      delegator: "0x3e8436e87abb49efe1a958ee73fbb7a12b419aab",
      fromDelegate: "0x3e8436e87abb49efe1a958ee73fbb7a12b419aab",
      toDelegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0x3e8436e87abb49efe1a958ee73fbb7a12b419aab",
      previousVotes: 25000000000000000000n,
      newVotes: 0n,
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      previousVotes: 20000000000000000000n,
      newVotes: 45000000000000000000n,
    },
  ],
  [
    {
      method: "DelegateChanged",
      delegator: "0x3e8436e87abb49efe1a958ee73fbb7a12b419aab",
      fromDelegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      toDelegate: "0x3e8436e87abb49efe1a958ee73fbb7a12b419aab",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      previousVotes: 45000000000000000000n,
      newVotes: 20000000000000000000n,
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0x3e8436e87abb49efe1a958ee73fbb7a12b419aab",
      previousVotes: 0n,
      newVotes: 25000000000000000000n,
    },
  ],
  [
    {
      method: "DelegateChanged",
      delegator: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      fromDelegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      toDelegate: "0x3e8436e87abb49efe1a958ee73fbb7a12b419aab",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      previousVotes: 20000000000000000000n,
      newVotes: 0n,
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0x3e8436e87abb49efe1a958ee73fbb7a12b419aab",
      previousVotes: 25000000000000000000n,
      newVotes: 45000000000000000000n,
    },
  ],
  [
    {
      method: "DelegateChanged",
      delegator: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      fromDelegate: "0x3e8436e87abb49efe1a958ee73fbb7a12b419aab",
      toDelegate: "0x92e9fb99e99d79bc47333e451e7c6490dbf24b22",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0x3e8436e87abb49efe1a958ee73fbb7a12b419aab",
      previousVotes: 75000000000000000000n,
      newVotes: 55000000000000000000n,
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0x92e9fb99e99d79bc47333e451e7c6490dbf24b22",
      previousVotes: 0n,
      newVotes: 20000000000000000000n,
    },
  ],
];

// 0x92e9fb99e99d79bc47333e451e7c6490dbf24b22
/*
delegates:  [
  {
    delegator: '0xf25f97f6f7657a210daeb1cd6042b769fae95488',
    fromDelegate: '0xf25f97f6f7657a210daeb1cd6042b769fae95488',
    toDelegate: '0xf25f97f6f7657a210daeb1cd6042b769fae95488',
    power: -25000000000000000000n,
    id: '0xf25f97f6f7657a210daeb1cd6042b769fae95488_0xf25f97f6f7657a210daeb1cd6042b769fae95488'
  },
  {
    delegator: '0xf25f97f6f7657a210daeb1cd6042b769fae95488',
    fromDelegate: '0xf25f97f6f7657a210daeb1cd6042b769fae95488',
    toDelegate: '0x3e8436e87abb49efe1a958ee73fbb7a12b419aab',
    power: -20000000000000000000n,
    id: '0xf25f97f6f7657a210daeb1cd6042b769fae95488_0x3e8436e87abb49efe1a958ee73fbb7a12b419aab'
  },
  {
    delegator: '0xf25f97f6f7657a210daeb1cd6042b769fae95488',
    fromDelegate: '0xf25f97f6f7657a210daeb1cd6042b769fae95488',
    toDelegate: '0x92e9fb99e99d79bc47333e451e7c6490dbf24b22',
    power: 20000000000000000000n,
    id: '0xf25f97f6f7657a210daeb1cd6042b769fae95488_0x92e9fb99e99d79bc47333e451e7c6490dbf24b22'
  }
]

mapping:  [
  {
    id: '0xa23d90f2fb496f3055d3d96a2dc991e9133efee9',
    from: '0xa23d90f2fb496f3055d3d96a2dc991e9133efee9',
    to: '0xa23d90f2fb496f3055d3d96a2dc991e9133efee9'
  },
  {
    id: '0xf25f97f6f7657a210daeb1cd6042b769fae95488',
    from: '0xf25f97f6f7657a210daeb1cd6042b769fae95488',
    to: '0x92e9fb99e99d79bc47333e451e7c6490dbf24b22'
  }
]
 */
const recordsFor_0x92e9fb9 = [
  [
    {
      method: "DelegateChanged",
      delegator: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
      fromDelegate: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
      toDelegate: "0x92e9fb99e99d79bc47333e451e7c6490dbf24b22",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
      previousVotes: 30000000000000000000n,
      newVotes: 0n,
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0x92e9fb99e99d79bc47333e451e7c6490dbf24b22",
      previousVotes: 0n,
      newVotes: 30000000000000000000n,
    },
  ],
  [
    {
      method: "DelegateChanged",
      delegator: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
      fromDelegate: "0x92e9fb99e99d79bc47333e451e7c6490dbf24b22",
      toDelegate: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0x92e9fb99e99d79bc47333e451e7c6490dbf24b22",
      previousVotes: 30000000000000000000n,
      newVotes: 0n,
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
      previousVotes: 0n,
      newVotes: 30000000000000000000n,
    },
  ],
  [
    {
      method: "DelegateChanged",
      delegator: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      fromDelegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      toDelegate: "0x92e9fb99e99d79bc47333e451e7c6490dbf24b22",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      previousVotes: 45000000000000000000n,
      newVotes: 0n,
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0x92e9fb99e99d79bc47333e451e7c6490dbf24b22",
      previousVotes: 0n,
      newVotes: 45000000000000000000n,
    },
  ],
  [
    {
      method: "DelegateChanged",
      delegator: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      fromDelegate: "0x92e9fb99e99d79bc47333e451e7c6490dbf24b22",
      toDelegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0x92e9fb99e99d79bc47333e451e7c6490dbf24b22",
      previousVotes: 45000000000000000000n,
      newVotes: 0n,
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      previousVotes: 55000000000000000000n,
      newVotes: 100000000000000000000n,
    },
  ],
  [
    {
      method: "Transfer",
      value: 25000000000000000000n,
      from: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      to: "0x92e9fb99e99d79bc47333e451e7c6490dbf24b22,",
    },
  ],
  [
    {
      method: "DelegateChanged",
      delegator: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      fromDelegate: "0x3e8436e87abb49efe1a958ee73fbb7a12b419aab",
      toDelegate: "0x92e9fb99e99d79bc47333e451e7c6490dbf24b22",
      txHash:
        "0x075578bbdbf39b366fb962208b473520df0d975ee0389f1dceb3fa23d3e4f95e",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0x3e8436e87abb49efe1a958ee73fbb7a12b419aab",
      previousVotes: 75000000000000000000n,
      newVotes: 55000000000000000000n,
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0x92e9fb99e99d79bc47333e451e7c6490dbf24b22",
      previousVotes: 0n,
      newVotes: 20000000000000000000n,
    },
  ],
];

// 0xa23d90f2fb496f3055d3d96a2dc991e9133efee9
/**
delegates:  [
  {
    delegator: '0xa23d90f2fb496f3055d3d96a2dc991e9133efee9',
    fromDelegate: '0xa23d90f2fb496f3055d3d96a2dc991e9133efee9',
    toDelegate: '0x3e8436e87abb49efe1a958ee73fbb7a12b419aab',
    power: 35000000000000000000n,
    id: '0xa23d90f2fb496f3055d3d96a2dc991e9133efee9_0x3e8436e87abb49efe1a958ee73fbb7a12b419aab'
  }
]

mapping:  [
  {
    id: '0xa23d90f2fb496f3055d3d96a2dc991e9133efee9',
    from: '0xa23d90f2fb496f3055d3d96a2dc991e9133efee9',
    to: '0x3e8436e87abb49efe1a958ee73fbb7a12b419aab'
  }
]
 */
const recordsFor_0xa23d90f = [
  [
    {
      method: "Transfer",
      value: 100000000000000000000n,
      from: "0x0000000000000000000000000000000000000000",
      to: "0x3d6d656c1bf92f7028ce4c352563e1c363c58ed5",
    },
  ],
  [
    {
      method: "Transfer",
      value: 100000000000000000000n,
      from: "0x0000000000000000000000000000000000000000",
      to: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
    },
  ],
  [
    {
      method: "Transfer",
      value: 30000000000000000000n,
      from: "0x3e8436e87abb49efe1a958ee73fbb7a12b419aab",
      to: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
    },
  ],
  [
    {
      method: "DelegateChanged",
      delegator: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
      fromDelegate: "0x0000000000000000000000000000000000000000",
      toDelegate: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
      previousVotes: 0n,
      newVotes: 30000000000000000000n,
    },
  ],
  [
    {
      method: "DelegateChanged",
      delegator: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
      fromDelegate: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
      toDelegate: "0x92e9fb99e99d79bc47333e451e7c6490dbf24b22",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
      previousVotes: 30000000000000000000n,
      newVotes: 0n,
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0x92e9fb99e99d79bc47333e451e7c6490dbf24b22",
      previousVotes: 0n,
      newVotes: 30000000000000000000n,
    },
  ],
  [
    {
      method: "DelegateChanged",
      delegator: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
      fromDelegate: "0x92e9fb99e99d79bc47333e451e7c6490dbf24b22",
      toDelegate: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0x92e9fb99e99d79bc47333e451e7c6490dbf24b22",
      previousVotes: 30000000000000000000n,
      newVotes: 0n,
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
      previousVotes: 0n,
      newVotes: 30000000000000000000n,
    },
  ],
  [
    {
      method: "DelegateChanged",
      delegator: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
      fromDelegate: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
      toDelegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
      previousVotes: 30000000000000000000n,
      newVotes: 0n,
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      previousVotes: 0n,
      newVotes: 30000000000000000000n,
    },
  ],
  [
    {
      method: "DelegateChanged",
      delegator: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
      fromDelegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      toDelegate: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      previousVotes: 50000000000000000000n,
      newVotes: 20000000000000000000n,
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
      previousVotes: 0n,
      newVotes: 30000000000000000000n,
    },
  ],
  [
    {
      method: "DelegateChanged",
      delegator: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
      fromDelegate: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
      toDelegate: "0x3e8436e87abb49efe1a958ee73fbb7a12b419aab",
      txHash:
        "0x016dd67b54377c76a624cd21e4ae794e058cc2f2f82e0a40d9585ce132c91bd6",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
      previousVotes: 30000000000000000000n,
      newVotes: 0n,
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0x3e8436e87abb49efe1a958ee73fbb7a12b419aab",
      previousVotes: 45000000000000000000n,
      newVotes: 75000000000000000000n,
    },
  ],
  [
    {
      method: "Transfer",
      value: 5000000000000000000n,
      from: "0xabcf7060a68f62624f7569ada9d78b5a5db0782a",
      to: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
      txHash:
        "0xcf2ba4ee36326c7b4bb3d16c984f1b9a635c29b8f720e2b3293a3fc789416f95",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0x3e8436e87abb49efe1a958ee73fbb7a12b419aab",
      previousVotes: 55000000000000000000n,
      newVotes: 60000000000000000000n,
    },
  ],
];

/**
delegates:  [
  {
    delegator: '0xc1c8f6ef43b39c279417e361969d535f2a20b92e',
    fromDelegate: '0xc1c8f6ef43b39c279417e361969d535f2a20b92e',
    toDelegate: '0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d',
    power: 8385000000000000000000000n,
    id: '0xc1c8f6ef43b39c279417e361969d535f2a20b92e_0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d'
  },
  {
    fromDelegate: '0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d',
    toDelegate: '0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d',
    power: 0n,
    id: '0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d_0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d'
  }
]

mapping:  [
  {
    id: '0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d',
    from: '0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d',
    to: '0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d'
  },
  {
    id: '0xc1c8f6ef43b39c279417e361969d535f2a20b92e',
    from: '0xc1c8f6ef43b39c279417e361969d535f2a20b92e',
    to: '0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d'
  }
]
 */
const recordsFor_0xebd9a48 = [
  [
    {
      method: "DelegateChanged",
      delegator: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      fromDelegate: "0x0000000000000000000000000000000000000000",
      toDelegate: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      blockNumber: "4779675",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      previousVotes: 0n,
      newVotes: 5739535584620845365681336n,
    },
  ],
  [
    {
      method: "DelegateChanged",
      delegator: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      fromDelegate: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      toDelegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "4779688",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      previousVotes: 5739535584620845365681336n,
      newVotes: 0n,
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      previousVotes: 0n,
      newVotes: 5739535584620845365681336n,
    },
  ],
  [
    {
      method: "Transfer",
      value: 966000000000000000000000n,
      from: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      to: "0x0000000000000000000000000000000000000000",
    },
    {
      method: "DelegateVotesChanged",
      previousVotes: 5739535584620845365681336n,
      newVotes: 4773535584620845365681336n,
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      txHash:
        "0x70b187d4ae6c839cd215711c70278e9d43916e9d066cfe231a41a74dbacd48e1",
      blockNumber: "4886258",
    },
  ],
  [
    {
      method: "Transfer",
      value: 2598885584620845365681336n,
      from: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      to: "0x0000000000000000000000000000000000000000",
    },
    {
      method: "DelegateVotesChanged",
      previousVotes: 4773535584620845365681336n,
      newVotes: 2174650000000000000000000n,
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      txHash:
        "0x9f85c74ade70f66940cf9c68548b91a30e787b718b069c9968a7c3f8a4530acb",
      blockNumber: "4886263",
    },
  ],
  [
    {
      method: "Transfer",
      value: 163650000000000000000000n,
      from: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      to: "0x0000000000000000000000000000000000000000",
    },
    {
      method: "DelegateVotesChanged",
      previousVotes: 2174650000000000000000000n,
      newVotes: 2011000000000000000000000n,
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      transactionHash:
        "0xd777bd7f9ea65efb0521afe671c6461da7ed635a1ccedb0431be113890db3321",
      blockNumber: "4886271",
    },
  ],
  [
    {
      method: "Transfer",
      value: 2011000000000000000000000n,
      from: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      to: "0x0000000000000000000000000000000000000000",
    },
    {
      method: "DelegateVotesChanged",
      previousVotes: 2011000000000000000000000n,
      newVotes: 0n,
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      txHash:
        "0xb1f22bee0bc907376074e73160b11aede0e6dd0447f20ebfcdf23d6566e2a26c",
      blockNumber: "4886277",
    },
  ],
  [
    {
      method: "Transfer",
      value: 975000000000000000000000n,
      from: "0x0000000000000000000000000000000000000000",
      to: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      txHash:
        "0x1fc4d14ea8d2e1b45a95209695c3a02e4bf16293a4f41936677dcad180205324",
    },
    {
      method: "DelegateVotesChanged",
      previousVotes: 0n,
      newVotes: 975000000000000000000000n,
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      txHash:
        "0x1fc4d14ea8d2e1b45a95209695c3a02e4bf16293a4f41936677dcad180205324",
      blockNumber: "4886284",
    },
  ],
  [
    {
      method: "Transfer",
      value: 1039685584620845365681336n,
      from: "0x0000000000000000000000000000000000000000",
      to: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      txHash:
        "0x652b6be20f5c796ee2ce65c55fad7cdf99f221c02d1de293702840289f1bfd19",
    },
    {
      method: "DelegateVotesChanged",
      transactionHash:
        "0x652b6be20f5c796ee2ce65c55fad7cdf99f221c02d1de293702840289f1bfd19",
      previousVotes: 975000000000000000000000n,
      newVotes: 2014685584620845365681336n,
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "4886293",
    },
  ],
  [
    {
      method: "Transfer",
      value: 108850000000000000000000n,
      from: "0x0000000000000000000000000000000000000000",
      to: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      txHash:
        "0xd0f9d7c9483a077f44c541bc481c82b26f80c188c49ea238f13031c3a7426ae9",
    },
    {
      method: "DelegateVotesChanged",
      transactionHash:
        "0xd0f9d7c9483a077f44c541bc481c82b26f80c188c49ea238f13031c3a7426ae9",
      previousVotes: 2014685584620845365681336n,
      newVotes: 2123535584620845365681336n,
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "4886298",
    },
  ],
  [
    {
      method: "Transfer",
      value: 2000000000000000000000000n,
      from: "0x0000000000000000000000000000000000000000",
      to: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      txHash:
        "0x597d37c4e21acdc3cc8a8bf8d8241ca241cba91bb43aa0bca357c16d42ed21b7",
    },
    {
      method: "DelegateVotesChanged",
      transactionHash:
        "0x597d37c4e21acdc3cc8a8bf8d8241ca241cba91bb43aa0bca357c16d42ed21b7",
      previousVotes: 2123535584620845365681336n,
      newVotes: 4123535584620845365681336n,
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "4886304",
    },
  ],
  [
    {
      method: "Transfer",
      value: 1650000000000000000000000n,
      from: "0x0000000000000000000000000000000000000000",
      to: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      txHash:
        "0x3eea589f55f96785f9f935a7eb5a4de34e903d9d8bef29598ce47461c32c218f",
    },
    {
      method: "DelegateVotesChanged",
      transactionHash:
        "0x3eea589f55f96785f9f935a7eb5a4de34e903d9d8bef29598ce47461c32c218f",
      previousVotes: "4123535584620845365681336",
      newVotes: "5773535584620845365681336",
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "4886341",
    },
  ],
  [
    {
      method: "Transfer",
      value: 527000000000000000000000n,
      from: "0x0000000000000000000000000000000000000000",
      to: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      txHash:
        "0xee2561ecc3e36aa6eb12a84b8f3bf311d5be9e8e555cc67cf00676d251afb60f",
    },
    {
      method: "DelegateVotesChanged",
      transactionHash:
        "0xee2561ecc3e36aa6eb12a84b8f3bf311d5be9e8e555cc67cf00676d251afb60f",
      previousVotes: 5773535584620845365681336n,
      newVotes: 6300535584620845365681336n,
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "4947740",
    },
  ],
  [
    {
      method: "Transfer",
      value: 800000000000000000000000n,
      from: "0x0000000000000000000000000000000000000000",
      to: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      txHash:
        "0x973b8cfcd529eccfa2c38f315d0bbe9d8c5adcd202c21d5d09ff815d0ea6b2ef",
    },
    {
      method: "DelegateVotesChanged",
      transactionHash:
        "0x973b8cfcd529eccfa2c38f315d0bbe9d8c5adcd202c21d5d09ff815d0ea6b2ef",
      previousVotes: 6300535584620845365681336n,
      newVotes: 7100535584620845365681336n,
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "5245978",
    },
  ],
  [
    {
      method: "Transfer",
      value: 50000000000000000000000n,
      from: "0x0000000000000000000000000000000000000000",
      to: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      txHash:
        "0xa38ac29f777fa2dcf613ee425a1c6e7b97474f8646991d6c5f93f791e13e3045",
    },
    {
      method: "DelegateVotesChanged",
      transactionHash:
        "0xa38ac29f777fa2dcf613ee425a1c6e7b97474f8646991d6c5f93f791e13e3045",
      previousVotes: 7100535584620845365681336n,
      newVotes: 7150535584620845365681336n,
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "5357884",
    },
  ],
  [
    {
      method: "Transfer",
      value: 4798535584620845365681336n,
      from: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      to: "0x0000000000000000000000000000000000000000",
      txHash:
        "0xc55814ae1214921a0c7eb2d0c44345be3a567329fb82be10963e44060b31a35b",
    },
    {
      method: "DelegateVotesChanged",
      transactionHash:
        "0xc55814ae1214921a0c7eb2d0c44345be3a567329fb82be10963e44060b31a35b",
      previousVotes: 7150535584620845365681336n,
      newVotes: 2352000000000000000000000n,
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "5441832",
    },
  ],
  [
    {
      method: "Transfer",
      value: 3143650000000000000000000n,
      from: "0x0000000000000000000000000000000000000000",
      to: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      txHash:
        "0x2bd1044adec2bcc9d76fa48b99873d06f810ea008289a02cadc25c6969c9b48e",
    },
    {
      method: "DelegateVotesChanged",
      transactionHash:
        "0x2bd1044adec2bcc9d76fa48b99873d06f810ea008289a02cadc25c6969c9b48e",
      previousVotes: 2352000000000000000000000,
      newVotes: 5495650000000000000000000,
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "5441883",
    },
  ],
  [
    {
      method: "Transfer",
      value: 1686000000000000000000000n,
      from: "0x0000000000000000000000000000000000000000",
      to: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      txHash:
        "0xee7c56c4b504a950866d860ec99c102073f3428560aefe2d60b8a780fc465761",
    },
    {
      method: "DelegateVotesChanged",
      transactionHash:
        "0xee7c56c4b504a950866d860ec99c102073f3428560aefe2d60b8a780fc465761",
      previousVotes: 5495650000000000000000000n,
      newVotes: 7181650000000000000000000n,
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "5441906",
    },
  ],
  [
    {
      method: "Transfer",
      value: 300000000000000000000000n,
      from: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      to: "0x0000000000000000000000000000000000000000",
      txHash:
        "0xf209d715129ca34b3b59eae41b2e02826875b268befb5f8f0e7e8842ccb1b907",
    },
    {
      method: "DelegateVotesChanged",
      transactionHash:
        "0xf209d715129ca34b3b59eae41b2e02826875b268befb5f8f0e7e8842ccb1b907",
      previousVotes: 7181650000000000000000000n,
      newVotes: 6881650000000000000000000n,
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "5481823",
    },
  ],
  [
    {
      method: "Transfer",
      value: 640000000000000000000000n,
      from: "0x0000000000000000000000000000000000000000",
      to: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      txHash:
        "0x8d8be05706de7ccfccd706e6d6bfb0f7aa1c6982e8594c9eed8970d51e932c8a",
    },
    {
      method: "DelegateVotesChanged",
      transactionHash:
        "0x8d8be05706de7ccfccd706e6d6bfb0f7aa1c6982e8594c9eed8970d51e932c8a",
      previousVotes: 6881650000000000000000000n,
      newVotes: 7521650000000000000000000n,
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "5573676",
    },
  ],
  [
    {
      method: "Transfer",
      value: 193650000000000000000000n,
      from: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      to: "0x0000000000000000000000000000000000000000",
      txHash:
        "0xa3aa156b27fecaf07c5e26e3ce0c46eba352c2099376d4437e2e37cc81f17a44",
    },
    {
      method: "DelegateVotesChanged",
      transactionHash:
        "0xa3aa156b27fecaf07c5e26e3ce0c46eba352c2099376d4437e2e37cc81f17a44",
      previousVotes: 7521650000000000000000000n,
      newVotes: 7328000000000000000000000n,
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "5742227",
    },
  ],
  [
    {
      method: "Transfer",
      value: 200000000000000000000000n,
      from: "0x0000000000000000000000000000000000000000",
      to: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      txHash:
        "0xb89fd670bae392a5c17c2cc290ee1457a083b3dbf035754237a03967b0e4e262",
    },
    {
      method: "DelegateVotesChanged",
      transactionHash:
        "0xb89fd670bae392a5c17c2cc290ee1457a083b3dbf035754237a03967b0e4e262",
      previousVotes: 7328000000000000000000000n,
      newVotes: 7528000000000000000000000n,
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "5742318",
    },
  ],
  [
    {
      method: "Transfer",
      value: 936000000000000000000000n,
      from: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      to: "0x0000000000000000000000000000000000000000",
      txHash:
        "0xbbd61caf19b2858e01d6c5e483c3aa665d08083051c88deca7c161a0ead0ddef",
    },
    {
      method: "DelegateVotesChanged",
      transactionHash:
        "0xbbd61caf19b2858e01d6c5e483c3aa665d08083051c88deca7c161a0ead0ddef",
      previousVotes: 7528000000000000000000000n,
      newVotes: 6592000000000000000000000n,
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "5811563",
    },
  ],
  [
    {
      method: "Transfer",
      value: 936000000000000000000000n,
      from: "0x0000000000000000000000000000000000000000",
      to: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      txHash:
        "0xe38523b2d855fecb5f1a0fc497317f7cc837338a6c06ffa1d449e86f25f4c2b2",
    },
    {
      method: "DelegateVotesChanged",
      transactionHash:
        "0xe38523b2d855fecb5f1a0fc497317f7cc837338a6c06ffa1d449e86f25f4c2b2",
      previousVotes: "6592000000000000000000000",
      newVotes: "7528000000000000000000000",
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "5811599",
    },
  ],
  [
    {
      method: "Transfer",
      value: 750000000000000000000000n,
      from: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      to: "0x0000000000000000000000000000000000000000",
      txHash:
        "0x02547b33b34d398d6c7bc069785e90566b7082d75613417164d32f0ec02ebdbd",
    },
    {
      method: "DelegateVotesChanged",
      transactionHash:
        "0x02547b33b34d398d6c7bc069785e90566b7082d75613417164d32f0ec02ebdbd",
      previousVotes: "7528000000000000000000000",
      newVotes: "6778000000000000000000000",
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "5856041",
    },
  ],
  [
    {
      method: "Transfer",
      value: 800000000000000000000000n,
      from: "0x0000000000000000000000000000000000000000",
      to: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      txHash:
        "0xd28276226fafa172b412bc14b5bd3c8bea1d31dfcc1e88843147f82c51bd1b9a",
    },
    {
      method: "DelegateVotesChanged",
      transactionHash:
        "0xd28276226fafa172b412bc14b5bd3c8bea1d31dfcc1e88843147f82c51bd1b9a",
      previousVotes: "6778000000000000000000000",
      newVotes: "7578000000000000000000000",
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "5856313",
    },
  ],
  [
    {
      method: "Transfer",
      value: 750000000000000000000000n,
      from: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      to: "0x0000000000000000000000000000000000000000",
      txHash:
        "0xe05750652405a9f870e1ea1e3ac01e08e42fed2ff8cc8bd2b52fcaf317a7fb4d",
    },
    {
      method: "DelegateVotesChanged",
      transactionHash:
        "0xe05750652405a9f870e1ea1e3ac01e08e42fed2ff8cc8bd2b52fcaf317a7fb4d",
      previousVotes: "7578000000000000000000000",
      newVotes: "6828000000000000000000000",
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "5872380",
    },
  ],
  [
    {
      method: "Transfer",
      value: 750000000000000000000000n,
      from: "0x0000000000000000000000000000000000000000",
      to: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      txHash:
        "0x6b6b665de7b2bfa2b227f1b8bc4e02902fd245963a881485da65298ff521c8aa",
    },
    {
      method: "DelegateVotesChanged",
      transactionHash:
        "0x6b6b665de7b2bfa2b227f1b8bc4e02902fd245963a881485da65298ff521c8aa",
      previousVotes: "6828000000000000000000000",
      newVotes: "7578000000000000000000000",
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "5872403",
    },
  ],
  [
    {
      method: "Transfer",
      value: 750000000000000000000000n,
      from: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      to: "0x0000000000000000000000000000000000000000",
      txHash:
        "0x87d90c39226e06d8775a5b7605158109ff10d3672a7c588ef9875717651e334c",
    },
    {
      method: "DelegateVotesChanged",
      transactionHash:
        "0x87d90c39226e06d8775a5b7605158109ff10d3672a7c588ef9875717651e334c",
      previousVotes: "7578000000000000000000000",
      newVotes: "6828000000000000000000000",
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "5898608",
    },
  ],
  [
    {
      method: "Transfer",
      value: 750000000000000000000000n,
      from: "0x0000000000000000000000000000000000000000",
      to: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      txHash:
        "0xfad0fc7a03de777081edc4ddbd3599d736ec82f6c3b79295112cdb321681f952",
    },
    {
      method: "DelegateVotesChanged",
      transactionHash:
        "0xfad0fc7a03de777081edc4ddbd3599d736ec82f6c3b79295112cdb321681f952",
      previousVotes: "6828000000000000000000000",
      newVotes: "7578000000000000000000000",
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "5898617",
    },
  ],
  [
    {
      method: "Transfer",
      value: 750000000000000000000000n,
      from: "0x0000000000000000000000000000000000000000",
      to: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      txHash:
        "0xc72d67fe9c45cdd3b6fc194b806f1a2ff7aaaea8630bf1589588785a1a5fe3e6",
    },
    {
      method: "DelegateVotesChanged",
      transactionHash:
        "0xc72d67fe9c45cdd3b6fc194b806f1a2ff7aaaea8630bf1589588785a1a5fe3e6",
      previousVotes: "7578000000000000000000000",
      newVotes: "8328000000000000000000000",
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "5898638",
    },
  ],
  [
    {
      method: "Transfer",
      value: 1500000000000000000000000n,
      from: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      to: "0x0000000000000000000000000000000000000000",
      txHash:
        "0x97a8bb6402e6fb77bf8460ce1fca5a6b3b5ffd9f3f8dda732770ef9ad51f9dcc",
    },
    {
      method: "DelegateVotesChanged",
      transactionHash:
        "0x97a8bb6402e6fb77bf8460ce1fca5a6b3b5ffd9f3f8dda732770ef9ad51f9dcc",
      previousVotes: "8328000000000000000000000",
      newVotes: "6828000000000000000000000",
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "5917307",
    },
  ],
  [
    {
      method: "Transfer",
      value: 1000000000000000000000000n,
      from: "0x0000000000000000000000000000000000000000",
      to: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      txHash:
        "0x5faffe3b0e8c9d8db054b3aefe5a7f574c262fd983f7359d7ed880da9da12f56",
    },
    {
      method: "DelegateVotesChanged",
      transactionHash:
        "0x5faffe3b0e8c9d8db054b3aefe5a7f574c262fd983f7359d7ed880da9da12f56",
      previousVotes: "6828000000000000000000000",
      newVotes: "7828000000000000000000000",
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "5917347",
    },
  ],
  [
    {
      method: "Transfer",
      value: 557000000000000000000000n,
      from: "0x0000000000000000000000000000000000000000",
      to: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      txHash:
        "0xfc26f8db319f32ab79b94e91f182a5d79b7edd91a96fc13cd88a88e8b687476f",
    },
    {
      method: "DelegateVotesChanged",
      transactionHash:
        "0xfc26f8db319f32ab79b94e91f182a5d79b7edd91a96fc13cd88a88e8b687476f",
      previousVotes: "7828000000000000000000000",
      newVotes: "8385000000000000000000000",
      delegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "5917362",
    },
  ],

  [
    {
      method: "DelegateChanged",
      delegator: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      fromDelegate: "0x0000000000000000000000000000000000000000",
      toDelegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "6005841",
      txHash:
        "0x895438ac4b84fe8d26e603e1cd507cc0ff4008ed97b63034ac4d25bee7c69cec",
    },
  ],
  [
    {
      method: "DelegateChanged",
      delegator: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      fromDelegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      toDelegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "6005846",
    },
  ],
  [
    {
      method: "DelegateChanged",
      delegator: "0xc1c8f6ef43b39c279417e361969d535f2a20b92e",
      fromDelegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      toDelegate: "0xebd9a48ed1128375eb4383ed4d53478b4fd85a8d",
      blockNumber: "6005859",
      txHash:
        "0x04c523df8a0208637ed2d848a97e117207f5c98382d41dbb037476a5c8593239",
    },
  ],
];

// 0x9Fc3d617873c95D8dd8DbBDb8377A16cf11376eE
/**
delegates:  [
  {
    fromDelegate: '0x9fc3d617873c95d8dd8dbbdb8377a16cf11376ee',
    toDelegate: '0x9fc3d617873c95d8dd8dbbdb8377a16cf11376ee',
    power: 0n,
    id: '0x9fc3d617873c95d8dd8dbbdb8377a16cf11376ee_0x9fc3d617873c95d8dd8dbbdb8377a16cf11376ee'
  },
  {
    delegator: '0x3e8436e87abb49efe1a958ee73fbb7a12b419aab',
    fromDelegate: '0x3e8436e87abb49efe1a958ee73fbb7a12b419aab',
    toDelegate: '0x3e8436e87abb49efe1a958ee73fbb7a12b419aab',
    power: -30000000000000000000n,
    id: '0x3e8436e87abb49efe1a958ee73fbb7a12b419aab_0x3e8436e87abb49efe1a958ee73fbb7a12b419aab'
  },
  {
    delegator: '0x3e8436e87abb49efe1a958ee73fbb7a12b419aab',
    fromDelegate: '0x3e8436e87abb49efe1a958ee73fbb7a12b419aab',
    toDelegate: '0x92e9fb99e99d79bc47333e451e7c6490dbf24b22',
    power: 30000000000000000000n,
    id: '0x3e8436e87abb49efe1a958ee73fbb7a12b419aab_0x92e9fb99e99d79bc47333e451e7c6490dbf24b22'
  }
]


mapping:  [
  {
    id: '0x9fc3d617873c95d8dd8dbbdb8377a16cf11376ee',
    from: '0x9fc3d617873c95d8dd8dbbdb8377a16cf11376ee',
    to: '0x9fc3d617873c95d8dd8dbbdb8377a16cf11376ee'
  },
  {
    id: '0x3e8436e87abb49efe1a958ee73fbb7a12b419aab',
    from: '0x3e8436e87abb49efe1a958ee73fbb7a12b419aab',
    to: '0x92e9fb99e99d79bc47333e451e7c6490dbf24b22'
  }
]
 */
const recordsFor_0x9Fc3d61 = [
  [
    {
      method: "DelegateChanged",
      delegator: "0x9Fc3d617873c95D8dd8DbBDb8377A16cf11376eE",
      fromDelegate: "0x0000000000000000000000000000000000000000",
      toDelegate: "0x9Fc3d617873c95D8dd8DbBDb8377A16cf11376eE",
      blockNumber: "5966610",
    },
  ],
  [
    {
      method: "DelegateChanged",
      delegator: "0x3E8436e87Abb49efe1A958EE73fbB7A12B419aAB",
      fromDelegate: "0x3E8436e87Abb49efe1A958EE73fbB7A12B419aAB",
      toDelegate: "0x9Fc3d617873c95D8dd8DbBDb8377A16cf11376eE",
      blockNumber: "5983939",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0x3E8436e87Abb49efe1A958EE73fbB7A12B419aAB",
      previousVotes: 65000000000000000000n,
      newVotes: 35000000000000000000n,
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0x9Fc3d617873c95D8dd8DbBDb8377A16cf11376eE",
      previousVotes: 0n,
      newVotes: 30000000000000000000,
    },
  ],
  [
    {
      method: "DelegateChanged",
      delegator: "0x3E8436e87Abb49efe1A958EE73fbB7A12B419aAB",
      fromDelegate: "0x9Fc3d617873c95D8dd8DbBDb8377A16cf11376eE",
      toDelegate: "0x92e9Fb99E99d79Bc47333E451e7c6490dbf24b22",
      txHash:
        "0x842829165341e8ccf3caa65008d80696f56fcfbcfe9de7c2d7c7f01125de39d7",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0x9Fc3d617873c95D8dd8DbBDb8377A16cf11376eE",
      previousVotes: 30000000000000000000n,
      newVotes: 0n,
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0x92e9Fb99E99d79Bc47333E451e7c6490dbf24b22",
      previousVotes: 20000000000000000000n,
      newVotes: 50000000000000000000n,
    },
  ],
  // [
  //   {
  //     method: "DelegateChanged",
  //     delegator: "0x9Fc3d617873c95D8dd8DbBDb8377A16cf11376eE",
  //     fromDelegate: "0x9Fc3d617873c95D8dd8DbBDb8377A16cf11376eE",
  //     toDelegate: "0xaFc3d617873c95D8dd8DbBDb8377A16cf11376eE",
  //   },
  //   {
  //     method: "DelegateVotesChanged",
  //     delegate: "0x9Fc3d617873c95D8dd8DbBDb8377A16cf11376eE",
  //     previousVotes: 0n,
  //     newVotes: 0n,
  //   },
  //   {
  //     method: "DelegateVotesChanged",
  //     delegate: "0xaFc3d617873c95D8dd8DbBDb8377A16cf11376eE",
  //     previousVotes: 0n,
  //     newVotes: 0n,
  //   },
  // ],
];

// 0xb25805118F1b471844687A1D1374ffb18207De6c
/**
delegates:  [
  {
    fromDelegate: '0xb25805118f1b471844687a1d1374ffb18207de6c',
    toDelegate: '0xb25805118f1b471844687a1d1374ffb18207de6c',
    power: 0n,
    id: '0xb25805118f1b471844687a1d1374ffb18207de6c_0xb25805118f1b471844687a1d1374ffb18207de6c'
  }
]

mapping:  [
  {
    id: '0xb25805118f1b471844687a1d1374ffb18207de6c',
    from: '0xb25805118f1b471844687a1d1374ffb18207de6c',
    to: '0xb25805118f1b471844687a1d1374ffb18207de6c'
  }
]
 */
const recordsFor_0xb258051 = [
  [
    {
      method: "DelegateChanged",
      delegator: "0xb25805118F1b471844687A1D1374ffb18207De6c",
      fromDelegate: "0x0000000000000000000000000000000000000000",
      toDelegate: "0xb25805118F1b471844687A1D1374ffb18207De6c",
      blockNumber: "6608398",
      txHash:
        "0xb1272dcd1a95f7b26823f452a09dfe6294482aa6d6bbf147cd86880e3aeba17d",
    },
  ],
];

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
const recordsFor_0x0F60F8a = [
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

// const recordsFor_0xc183602 = [
//   // mock
//   [
//     {
//       method: "DelegateChanged",
//       delegator: "0x1F3D3A7A9c548bE39539b39D7400302753E20591",
//       fromDelegate: "0x0000000000000000000000000000000000000000",
//       toDelegate: "0x1F3D3A7A9c548bE39539b39D7400302753E20591",
//     },
//     {
//       method: "DelegateVotesChanged",
//       delegate: "0x1F3D3A7A9c548bE39539b39D7400302753E20591",
//       previousVotes: 0n,
//       newVotes: 5032302606544916775545n,
//     },
//   ],
//   [
//     {
//       method: "DelegateChanged",
//       delegator: "0x9de403Ef57b032afa295fEFc65057365EfEfD3C3",
//       fromDelegate: "0x0000000000000000000000000000000000000000",
//       toDelegate: "0x1F3D3A7A9c548bE39539b39D7400302753E20591",
//     },
//     {
//       method: "Transfer",
//       from: "0x73cD8626b3cD47B009E68380720CFE6679A3Ec3D",
//       to: "0x9de403Ef57b032afa295fEFc65057365EfEfD3C3",
//       value: 15000000000000000000000n,
//     },
//     {
//       method: "DelegateVotesChanged",
//       delegate: "0x1F3D3A7A9c548bE39539b39D7400302753E20591",
//       previousVotes: 5032302606544916775545n,
//       newVotes: 20032302606544916775545n,
//     },
//     {
//       method: "Transfer",
//       from: "0x04b05BD584a414cd87796e2c536b4161E5A3CA0a",
//       to: "0x000ee9A6Bcec9AadCc883bD52B2c9A75FB098991",
//       value: 519953196347027812164n,
//     },
//     {
//       method: "Transfer",
//       from: "0x9de403Ef57b032afa295fEFc65057365EfEfD3C3",
//       to: "0x000ee9A6Bcec9AadCc883bD52B2c9A75FB098991",
//       value: 4842414145738195837622n,
//     },
//     {
//       method: "Transfer",
//       from: "0x000ee9A6Bcec9AadCc883bD52B2c9A75FB098991",
//       to: "0x53fa6D5428f16e4e8b67Ff29B5C95aa53239c653",
//       value: 5300000000000000000000n,
//     },
//     {
//       method: "DelegateVotesChanged",
//       delegate: "0x1F3D3A7A9c548bE39539b39D7400302753E20591",
//       previousVotes: 20032302606544916775545n,
//       newVotes: 14732302606544916775545n,
//     },
//     {
//       method: "DelegateVotesChanged",
//       delegate: "0xD4A46A9ef66d7352790f131FE49e7CF84ae68B55",
//       previousVotes: 0n,
//       newVotes: 5300000000000000000000n,
//     },
//   ],
// ];

test("testTokens", () => {
  const records: any[] = recordsFor_0x92e9fb9;

  const ds = new DelegateStorage();
  for (const record of records) {
    // const currentDelegates = [];
    let cdg: DelegateChanged | undefined;
    for (const entry of record) {
      const method = entry.method.toLowerCase();
      switch (method) {
        case "transfer":
          ds.pushTransfer({
            from: entry.from.toLowerCase(),
            to: entry.to.toLowerCase(),
            value: BigInt(entry.value),
          } as Transfer);
          cdg = undefined; // reset cdg after transfer
          break;
        case "delegatechanged":
          cdg = {
            delegator: entry.delegator.toLowerCase(),
            fromDelegate: entry.fromDelegate.toLowerCase(),
            toDelegate: entry.toDelegate.toLowerCase(),
          };
          ds.pushMapping(cdg);
          if (
            cdg.fromDelegate === zeroAddress &&
            cdg.delegator === cdg.toDelegate
          ) {
            const cdelegate: Delegate = {
              delegator: cdg.toDelegate,
              fromDelegate: cdg.delegator,
              toDelegate: cdg.toDelegate,
              power: 0n,
            };
            ds.pushDelegator(cdelegate);
          }
          break;
        case "delegatevoteschanged":
          if (!cdg) {
            console.log(
              "skipped delegate votes changed, because it's from transfer"
            );
            break;
          }
          let fromDelegate, toDelegate;
          const isDelegateChangeToAnother =
            cdg.delegator !== cdg.fromDelegate &&
            cdg.delegator !== cdg.toDelegate;
          if (entry.delegate.toLowerCase() === cdg.fromDelegate) {
            if (
              (cdg.delegator === cdg.toDelegate &&
                cdg.fromDelegate !== zeroAddress) ||
              isDelegateChangeToAnother
            ) {
              fromDelegate = cdg.delegator;
              toDelegate = cdg.fromDelegate;
            } else {
              fromDelegate = cdg.fromDelegate;
              toDelegate = cdg.delegator;
            }
          }
          if (entry.delegate.toLowerCase() === cdg.toDelegate) {
            fromDelegate = cdg.delegator;
            toDelegate =
              cdg.delegator === cdg.toDelegate ? cdg.delegator : cdg.toDelegate;
          }
          const cdelegate: Delegate = {
            ...cdg,
            fromDelegate: fromDelegate!,
            toDelegate: toDelegate!,
            power: BigInt(entry.newVotes) - BigInt(entry.previousVotes),
          };
          console.log("check --------> ", cdg, cdelegate, entry);
          ds.pushDelegator(cdelegate);
          break;
        default:
          throw new Error(`wrong method: ${method}`);
      }
    }
  }

  const dss = ds.getDelegates();
  console.log("delegates: ", dss);
  console.log("mapping: ", ds.getMapping());
});

class DelegateStorage {
  private delegates: Delegate[] = [];
  private delegateMapping: DelegateMapping[] = [];

  constructor() {}

  getMapping(): DelegateMapping[] {
    return this.delegateMapping;
  }

  getDelegates(): Delegate[] {
    return this.delegates;
  }

  pushMapping(delegateChange: DelegateChanged) {
    const delegator = delegateChange.delegator;
    const clearifyMapping: DelegateMapping[] = this.delegateMapping.filter(
      (item) => item.from !== delegator
    );
    clearifyMapping.push({
      id: delegator,
      from: delegator,
      to: delegateChange.toDelegate,
    });
    this.delegateMapping = clearifyMapping;
  }

  pushDelegator(delegator: Delegate) {
    delegator.id = `${delegator.fromDelegate}_${delegator.toDelegate}`;

    const storedDelegateFromWithTo = this.delegates.find(
      (item) => item.id === delegator.id
    );
    if (!storedDelegateFromWithTo) {
      this.delegates.push(delegator);
      return;
    }
    storedDelegateFromWithTo.power += delegator.power;
    if (storedDelegateFromWithTo.power === 0n) {
      this.delegates = this.delegates.filter(
        (item) => item.id !== storedDelegateFromWithTo.id
      );
    }
  }

  pushTransfer(transfer: Transfer) {
    const { from, to, value } = transfer;

    const fromDelegateMapping = this.delegateMapping.find(
      (item) => item.from === from
    );
    const toDelegateMappings = this.delegateMapping.find(
      (item) => item.from === to
    );
    if (fromDelegateMapping) {
      console.log("better from mapping ====>", fromDelegateMapping);
      const transferFromDelegateFrom: Delegate = {
        delegator: from,
        fromDelegate: fromDelegateMapping.from,
        toDelegate: fromDelegateMapping.to,
        power: -value,
      };
      this.pushDelegator(transferFromDelegateFrom);
    }

    if (toDelegateMappings) {
      console.log("better to mapping ====>", toDelegateMappings);
      const transferDelegateTo = {
        delegator: to,
        fromDelegate: toDelegateMappings.from,
        toDelegate: toDelegateMappings.to,
        power: value,
      };
      this.pushDelegator(transferDelegateTo);
    }
  }
}

// function DelegateStoragex() {
//   this.delegates = [];
//   this.delegateMapping = [];
// }
// const dsfn = DelegateStorage.prototype;

// dsfn.getMapping = function () {
//   return this.delegateMapping;
// };

// dsfn.getDelegates = function () {
//   return this.delegates;
// };

// dsfn.pushMapping = function (delegateChange) {
//   const delegator = delegateChange.delegator;
//   const clearifyMapping = this.delegateMapping.filter(
//     (item) => item.from !== delegator
//   );
//   clearifyMapping.push({
//     id: delegator,
//     from: delegator,
//     to: delegateChange.toDelegate,
//   });
//   this.delegateMapping = clearifyMapping;
// };

// dsfn.pushDelegator = function (delegator, options) {
//   delegator.id = `${delegator.fromDelegate}_${delegator.toDelegate}`;

//   const storedDelegateFromWithTo = this.delegates.find(
//     (item) => item.id === delegator.id
//   );
//   if (!storedDelegateFromWithTo) {
//     this.delegates.push(delegator);
//     return;
//   }
//   storedDelegateFromWithTo.power += delegator.power;
//   if (storedDelegateFromWithTo.power === 0n) {
//     this.delegates = this.delegates.filter(
//       (item) => item.id !== storedDelegateFromWithTo.id
//     );
//   }
// };

// dsfn.pushTransfer = function (transfer) {
//   const { from, to, value } = transfer;

//   const fromDelegateMapping = this.delegateMapping.find(
//     (item) => item.from === from
//   );
//   const toDelegateMappings = this.delegateMapping.find(
//     (item) => item.from === to
//   );
//   if (fromDelegateMapping) {
//     console.log("better from mapping ====>", fromDelegateMapping);
//     const transferFromDelegateFrom = {
//       delegator: from,
//       fromDelegate: fromDelegateMapping.from,
//       toDelegate: fromDelegateMapping.to,
//       power: -value,
//     };
//     this.pushDelegator(transferFromDelegateFrom);
//   }

//   if (toDelegateMappings) {
//     console.log("better to mapping ====>", toDelegateMappings);
//     const transferDelegateTo = {
//       delegator: to,
//       fromDelegate: toDelegateMappings.from,
//       toDelegate: toDelegateMappings.to,
//       power: value,
//     };
//     this.pushDelegator(transferDelegateTo);
//   }
// };

interface Delegate {
  id?: string;
  delegator: string;
  fromDelegate: string;
  toDelegate: string;
  power: bigint;
}

interface DelegateChanged {
  delegator: string;
  fromDelegate: string;
  toDelegate: string;
}

interface DelegateMapping {
  id: string;
  from: string;
  to: string;
}

interface Transfer {
  from: string;
  to: string;
  value: bigint;
}
