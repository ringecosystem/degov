test("testTokens", () => {
  const flows = [
    [
      {
        method: "transfer",
        value: 30000000000000000000n,
        from: "0x3E8436e87Abb49efe1A958EE73fbB7A12B419aAB",
        to: "0xF25f97f6f7657A210DAEB1cD6042B769fae95488",
      },
    ],
    [
      {
        method: "DelegateChanged",
        delegator: "0xF25f97f6f7657A210DAEB1cD6042B769fae95488",
        fromDelegate: "0x0000000000000000000000000000000000000000",
        toDelegate: "0xF25f97f6f7657A210DAEB1cD6042B769fae95488",
      },
      {
        method: "DelegateVotesChanged",
        delegate: "0xF25f97f6f7657A210DAEB1cD6042B769fae95488",
        previousVotes: 0n,
        newVotes: 30000000000000000000n,
      },
    ],
    [
      {
        method: "transfer",
        value: 15000000000000000000n,
        from: "0x3E8436e87Abb49efe1A958EE73fbB7A12B419aAB",
        to: "0xF25f97f6f7657A210DAEB1cD6042B769fae95488",
      },
      {
        method: "DelegateVotesChanged",
        delegate: "0xF25f97f6f7657A210DAEB1cD6042B769fae95488",
        previousVotes: 30000000000000000000n,
        newVotes: 45000000000000000000n,
      },
    ],
    [
      {
        method: "DelegateChanged",
        delegator: "0xF25f97f6f7657A210DAEB1cD6042B769fae95488",
        fromDelegate: "0xF25f97f6f7657A210DAEB1cD6042B769fae95488",
        toDelegate: "0x92e9Fb99E99d79Bc47333E451e7c6490dbf24b22",
      },
      {
        method: "DelegateVotesChanged",
        delegate: "0xF25f97f6f7657A210DAEB1cD6042B769fae95488",
        previousVotes: 45000000000000000000n,
        newVotes: 0n,
      },
      {
        method: "DelegateVotesChanged",
        delegate: "0x92e9Fb99E99d79Bc47333E451e7c6490dbf24b22",
        previousVotes: 0n,
        newVotes: 45000000000000000000n,
      },
    ],
    [
      {
        method: "DelegateChanged",
        delegator: "0xa23D90f2FB496F3055D3D96A2Dc991e9133EFEE9",
        fromDelegate: "0xa23D90f2FB496F3055D3D96A2Dc991e9133EFEE9",
        toDelegate: "0xF25f97f6f7657A210DAEB1cD6042B769fae95488",
      },
      {
        method: "DelegateVotesChanged",
        delegate: "0xa23D90f2FB496F3055D3D96A2Dc991e9133EFEE9",
        previousVotes: 30000000000000000000n,
        newVotes: 0n,
      },
      {
        method: "DelegateVotesChanged",
        delegate: "0xF25f97f6f7657A210DAEB1cD6042B769fae95488",
        previousVotes: 0n,
        newVotes: 30000000000000000000n,
      },
    ],
    [
      {
        method: "DelegateChanged",
        delegator: "0x3E8436e87Abb49efe1A958EE73fbB7A12B419aAB",
        fromDelegate: "0x3E8436e87Abb49efe1A958EE73fbB7A12B419aAB",
        toDelegate: "0xF25f97f6f7657A210DAEB1cD6042B769fae95488",
      },
      {
        method: "DelegateVotesChanged",
        delegate: "0x3E8436e87Abb49efe1A958EE73fbB7A12B419aAB",
        previousVotes: 25000000000000000000n,
        newVotes: 0n,
      },
      {
        method: "DelegateVotesChanged",
        delegate: "0xF25f97f6f7657A210DAEB1cD6042B769fae95488",
        previousVotes: 30000000000000000000n,
        newVotes: 55000000000000000000n,
      },
    ],
    [
      {
        method: "DelegateChanged",
        delegator: "0xF25f97f6f7657A210DAEB1cD6042B769fae95488",
        fromDelegate: "0x92e9Fb99E99d79Bc47333E451e7c6490dbf24b22",
        toDelegate: "0xF25f97f6f7657A210DAEB1cD6042B769fae95488",
      },
      {
        method: "DelegateVotesChanged",
        delegate: "0x92e9Fb99E99d79Bc47333E451e7c6490dbf24b22",
        previousVotes: 45000000000000000000n,
        newVotes: 0n,
      },
      {
        method: "DelegateVotesChangedm",
        delegate: "0xF25f97f6f7657A210DAEB1cD6042B769fae95488",
        previousVotes: 55000000000000000000n,
        newVotes: 100000000000000000000n,
      },
    ],
    [
      {
        method: "DelegateChanged",
        delegator: "0xF25f97f6f7657A210DAEB1cD6042B769fae95488",
        fromDelegate: "0xF25f97f6f7657A210DAEB1cD6042B769fae95488",
        toDelegate: "0xF25f97f6f7657A210DAEB1cD6042B769fae95488",
      },
    ],
    [
      {
        method: "Transfer",
        value: 25000000000000000000n,
        from: "0xF25f97f6f7657A210DAEB1cD6042B769fae95488",
        to: "0x92e9Fb99E99d79Bc47333E451e7c6490dbf24b22",
      },
      {
        method: "DelegateVotesChanged",
        delegate: "0xF25f97f6f7657A210DAEB1cD6042B769fae95488",
        previousVotes: 100000000000000000000n,
        newVotes: 75000000000000000000n,
      },
    ],
    [
      {
        method: "DelegateChanged",
        delegator: "0x3E8436e87Abb49efe1A958EE73fbB7A12B419aAB",
        fromDelegate: "0xF25f97f6f7657A210DAEB1cD6042B769fae95488",
        toDelegate: "0x3E8436e87Abb49efe1A958EE73fbB7A12B419aAB",
      },
      {
        method: "DelegateVotesChanged",
        delegate: "0xF25f97f6f7657A210DAEB1cD6042B769fae95488",
        previousVotes: 75000000000000000000n,
        newVotes: 50000000000000000000n,
      },
      {
        method: "DelegateVotesChanged",
        delegate: "0x3E8436e87Abb49efe1A958EE73fbB7A12B419aAB",
        previousVotes: 0n,
        newVotes: 25000000000000000000n,
      },
    ],
    [
      {
        method: "DelegateChanged",
        delegator: "0xa23D90f2FB496F3055D3D96A2Dc991e9133EFEE9",
        fromDelegate: "0xF25f97f6f7657A210DAEB1cD6042B769fae95488",
        toDelegate: "0xa23D90f2FB496F3055D3D96A2Dc991e9133EFEE9",
      },
      {
        method: "DelegateVotesChanged",
        delegate: "0xF25f97f6f7657A210DAEB1cD6042B769fae95488",
        previousVotes: 50000000000000000000n,
        newVotes: 20000000000000000000n,
      },
      {
        method: "DelegateVotesChanged",
        delegate: "0xa23D90f2FB496F3055D3D96A2Dc991e9133EFEE9",
        previousVotes: 0n,
        newVotes: 30000000000000000000n,
      },
    ],
  ];
});
