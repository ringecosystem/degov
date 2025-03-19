const zeroAddress = "0x0000000000000000000000000000000000000000";

// 0xf25f97f6f7657a210daeb1cd6042b769fae95488
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
      toDelegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488"
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0x3e8436e87abb49efe1a958ee73fbb7a12b419aab",
      previousVotes: 25000000000000000000n,
      newVotes: 0n
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xf25f97f6f7657a210daeb1cd6042b769fae95488",
      previousVotes: 20000000000000000000n,
      newVotes: 45000000000000000000n
    }
  ]
];

// 0x92e9fb99e99d79bc47333e451e7c6490dbf24b22
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
];

// 0xa23d90f2fb496f3055d3d96a2dc991e9133efee9
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
      toDelegate: "0x92e9Fb99E99d79Bc47333E451e7c6490dbf24b22",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
      previousVotes: 30000000000000000000n,
      newVotes: 0n,
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0x92e9Fb99E99d79Bc47333E451e7c6490dbf24b22",
      previousVotes: 0n,
      newVotes: 30000000000000000000n,
    },
  ],
  [
    {
      method: "DelegateChanged",
      delegator: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
      fromDelegate: "0x92e9Fb99E99d79Bc47333E451e7c6490dbf24b22",
      toDelegate: "0xa23d90f2fb496f3055d3d96a2dc991e9133efee9",
    },
    {
      method: "DelegateVotesChanged",
      delegate: "0x92e9Fb99E99d79Bc47333E451e7c6490dbf24b22",
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
];

test("testTokens", () => {
  const records = recordsFor_0xf25f97f;

  const ds = new DelegateStorage();
  for (const record of records) {
    // const currentDelegates = [];
    let cdg;
    for (const entry of record) {
      const method = entry.method.toLowerCase();
      switch (method) {
        case "transfer":
          const transferDelegateFrom = {
            delegator: entry.from,
            fromDelegate: entry.from,
            toDelegate: entry.from,
            power: -entry.value,
          };
          const transferDelegateTo = {
            delegator: entry.to,
            fromDelegate: entry.to,
            toDelegate: entry.to,
            power: entry.value,
          };
          ds.pushDelegator(transferDelegateFrom);
          ds.pushDelegator(transferDelegateTo);
          break;
        case "delegatechanged":
          cdg = {
            // id: `${entry.fromDelegate}-${entry.toDelegate}`,
            delegator: entry.delegator,
            fromDelegate: entry.fromDelegate,
            toDelegate: entry.toDelegate,
          };
          break;
        case "delegatevoteschanged":
          if (!cdg) {
            // console.log(
            //   "skipped delegate votes changed, because it's from transfer"
            // );
            break;
          }
          let fromDelegate, toDelegate;
          if (entry.delegate === cdg.fromDelegate) {
            if (
              cdg.delegator === cdg.toDelegate &&
              cdg.fromDelegate !== zeroAddress
            ) {
              fromDelegate = cdg.delegator;
              toDelegate = cdg.fromDelegate;
            } else {
              fromDelegate = cdg.fromDelegate;
              toDelegate = cdg.delegator;
            }
          }
          if (entry.delegate === cdg.toDelegate) {
            fromDelegate = cdg.delegator;
            toDelegate =
              cdg.delegator === cdg.toDelegate ? cdg.delegator : cdg.toDelegate;
          }
          const isFirstDelegateToSelf = cdg.fromDelegate === zeroAddress;
          const cdelegate = {
            ...cdg,
            fromDelegate,
            toDelegate,
            power: entry.newVotes - entry.previousVotes,
          };
          console.log("--------> ", cdg, cdelegate);
          ds.pushDelegator(cdelegate, { isFirstDelegateToSelf });
          break;
        default:
          throw new Error(`wrong method: ${method}`);
      }
    }
  }
  console.log("ds: ", ds.getDelegates());
});

// interface Delegate {
//   id: string;
//   fromDelegate: string;
//   toDelegate: string;
//   blockNumber: BigInt;
//   blockTimestamp: BigInt;
//   transactionHash: string;
//   power: BigInt;
// }

function DelegateStorage() {
  this.delegates = [];
}
const dsfn = DelegateStorage.prototype;

dsfn.getDelegates = function () {
  return this.delegates;
};

dsfn.pushDelegator = function (delegator, options) {
  const isFirstDelegateToSelf = options && options.isFirstDelegateToSelf;
  delegator.id = `${delegator.fromDelegate}_${delegator.toDelegate}`;

  const storedDelegateFromWithTo = this.delegates.find(
    (item) => item.id === delegator.id
  );
  if (!storedDelegateFromWithTo) {
    if (isFirstDelegateToSelf) {
      this.delegates.push(delegator);
    } else {
      const delegateToWithToId = `${delegator.toDelegate}_${delegator.toDelegate}`;
      const storedDelegateToWithTo = this.delegates.find(
        (item) => item.id === delegateToWithToId
      );
      if (storedDelegateToWithTo) {
        this.delegates.push(delegator);
      }
    }
    return;
  }
  storedDelegateFromWithTo.power += delegator.power;
  if (
    storedDelegateFromWithTo.power === 0n &&
    storedDelegateFromWithTo.fromDelegate !==
      storedDelegateFromWithTo.toDelegate
  ) {
    this.delegates = this.delegates.filter(
      (item) => item.id !== storedDelegateFromWithTo.id
    );
  }
};
