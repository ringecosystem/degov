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

test("testTokens", () => {
  const records = recordsFor_0xa23d90f;

  const ds = new DelegateStorage();
  for (const record of records) {
    // const currentDelegates = [];
    let cdg;
    for (const entry of record) {
      const method = entry.method.toLowerCase();
      switch (method) {
        case "transfer":
          ds.pushTransfer({
            from: entry.from,
            to: entry.to,
            value: entry.value,
          });
          break;
        case "delegatechanged":
          cdg = {
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
          const isDelegateChangeToAnother =
            cdg.delegator !== cdg.fromDelegate &&
            cdg.delegator !== cdg.toDelegate;
          if (entry.delegate === cdg.fromDelegate) {
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
          if (entry.delegate === cdg.toDelegate) {
            fromDelegate = cdg.delegator;
            toDelegate =
              cdg.delegator === cdg.toDelegate ? cdg.delegator : cdg.toDelegate;
          }
          const cdelegate = {
            ...cdg,
            fromDelegate,
            toDelegate,
            power: entry.newVotes - entry.previousVotes,
          };
          console.log("--------> ", cdg, cdelegate);
          ds.pushDelegator(cdelegate);
          break;
        default:
          throw new Error(`wrong method: ${method}`);
      }
    }
  }
  console.log("ds: ", ds.getDelegates());
});

function DelegateStorage() {
  this.delegates = [];
}
const dsfn = DelegateStorage.prototype;

dsfn.getDelegates = function () {
  return this.delegates;
};

dsfn.pushDelegator = function (delegator, options) {
  delegator.id = `${delegator.fromDelegate}_${delegator.toDelegate}`;

  const storedDelegateFromWithTo = this.delegates.find(
    (item) => item.id === delegator.id
  );
  if (!storedDelegateFromWithTo) {
    this.delegates.push(delegator);
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

dsfn.pushTransfer = function (transfer) {
  const { from, to, value } = transfer;

  const fromDelegateMapping = this.delegates.filter(
    (item) => item.fromDelegate === from
  );
  const toDelegateMapping = this.delegates.filter(
    (item) => item.fromDelegate === to
  );
  let betterFromDelegateMapping = fromDelegateMapping.find(
    (item) => item.fromDelegate !== item.toDelegate
  );
  if (!betterFromDelegateMapping) {
    betterFromDelegateMapping = fromDelegateMapping.find(
      (item) => item.fromDelegate === item.toDelegate
    );
  }
  let betterToDelegateMapping = toDelegateMapping.find(
    (item) => item.fromDelegate !== item.toDelegate
  );
  if (!betterToDelegateMapping) {
    betterToDelegateMapping = toDelegateMapping.find(
      (item) => item.fromDelegate === item.toDelegate
    );
  }

  if (betterFromDelegateMapping) {
    console.log("better from mapping ====>", betterFromDelegateMapping);
    const transferFromDelegateFrom = {
      delegator: from,
      fromDelegate: betterFromDelegateMapping.fromDelegate,
      toDelegate: betterFromDelegateMapping.toDelegate,
      power: -value,
    };
    this.pushDelegator(transferFromDelegateFrom);
  }
  if (betterToDelegateMapping) {
    console.log("better to mapping ====>", betterToDelegateMapping);
    const transferDelegateTo = {
      delegator: to,
      fromDelegate: betterToDelegateMapping.fromDelegate,
      toDelegate: betterToDelegateMapping.toDelegate,
      power: value,
    };
    this.pushDelegator(transferDelegateTo);
  }
};
