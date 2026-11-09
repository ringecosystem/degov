import assert from "node:assert/strict";
import test from "node:test";

import { createPublicClient, custom, decodeFunctionData, encodeAbiParameters, encodeFunctionResult, parseAbi, stringToHex, zeroAddress } from "viem";
import { mainnet } from "viem/chains";

import { confirmWrapperTransaction, getTokenWrapper, parseWrapperAmount, readWrapperValues, wrapperAction, wrapperReadContracts } from "../src/lib/token-wrapper.ts";

import type { Config } from "../src/types/config.ts";
import type { Hash } from "viem";

const underlying = "0x1111111111111111111111111111111111111111";
const token = "0x2222222222222222222222222222222222222222";
const governor = "0x3333333333333333333333333333333333333333";
const config = {
  chain: { id: 1 },
  contracts: { governor, governorToken: { address: token, standard: "ERC20", wrapper: { type: "erc20-wrapper", underlyingToken: underlying } } },
} as Config;

test("wrapping is opt-in and restricted to valid ERC20 wrapper configuration", () => {
  assert.ok(getTokenWrapper(config));
  for (const change of [
    { wrapper: undefined }, { standard: "ERC721" },
    { address: underlying }, { address: zeroAddress },
    { wrapper: { type: "vault", underlyingToken: underlying } },
    { wrapper: { type: "erc20-wrapper", underlyingToken: "invalid" } },
  ]) {
    const candidate = structuredClone(config);
    Object.assign(candidate.contracts.governorToken, change);
    assert.equal(getTokenWrapper(candidate), null);
  }
});

test("amounts preserve bigint precision and reject rounding, exponents, negatives and overflow", () => {
  assert.equal(parseWrapperAmount("123456789.123456789123456789", 18), 123456789123456789123456789n);
  assert.equal(parseWrapperAmount("0.000000000000000001", 18), 1n);
  assert.equal(parseWrapperAmount("1", 0), 1n);
  for (const input of ["", "0", "-1", "1e3", ".", "NaN", "1,000", "0.0000000000000000001", String(2n ** 256n)]) {
    assert.equal(parseWrapperAmount(input, 18), null, input);
  }
  assert.equal(parseWrapperAmount("1.1", 0), null);
});

test("approval is needed only for wrap and only when allowance is insufficient", () => {
  assert.equal(wrapperAction("wrap", 10n, 0n), "approve");
  assert.equal(wrapperAction("wrap", 10n, 10n), "wrap");
  assert.equal(wrapperAction("wrap", 10n, 20n), "wrap");
  assert.equal(wrapperAction("unwrap", 10n, 0n), "unwrap");
});

const reads = [underlying, token, "KTON", "gKTON", 18, 18, 100n, 20n, 10n, zeroAddress, 70n];
const successfulReads = (values: readonly unknown[]) => [
  ...values.map((result) => ({ status: "success" as const, result })),
  { status: "failure" as const }, { status: "failure" as const },
];
test("readback verifies both token relationships and decimals, preserving voting power independently of balance", () => {
  const wrapper = getTokenWrapper(config);
  const values = readWrapperValues(successfulReads(reads), wrapper)!;
  assert.equal(values.votes, 70n);
  assert.equal(values.balance, 20n);
  for (const [position, value] of [[0, token], [1, governor], [5, 6], [7, undefined], [9, "bad"]] as const) {
    const changed = [...reads];
    changed[position] = value as string;
    assert.equal(readWrapperValues(successfulReads(changed), wrapper), undefined);
  }
});

test("wrapper metadata and both balances are independent of token names and support six decimals", () => {
  const values = readWrapperValues(successfulReads([underlying, token, "ASSET", "vASSET", 6, 6, 1234567n, 7654321n, 0n, zeroAddress, 0n]), getTokenWrapper(config))!;
  assert.equal(values.underlyingSymbol, "ASSET");
  assert.equal(values.symbol, "vASSET");
  assert.equal(values.decimals, 6);
  assert.equal(values.underlyingBalance, 1234567n);
  assert.equal(values.balance, 7654321n);
});

const hash = `0x${"1".repeat(64)}` as Hash;
function transaction() {
  const events: string[] = [];
  return {
    events,
    assertContext: () => { events.push("context"); },
    simulate: async () => { events.push("simulate"); },
    write: async () => { events.push("write"); return hash; },
    onSubmitted: () => { events.push("submitted"); },
    wait: async () => { events.push("confirmed"); return { status: "success" as const }; },
  };
}

test("success requires simulation, context recheck and a successful chain receipt", async () => {
  const tx = transaction();
  assert.equal(await confirmWrapperTransaction(tx), hash);
  assert.deepEqual(tx.events, ["context", "simulate", "context", "write", "submitted", "confirmed"]);
});

test("wallet changes during preflight prevent submission", async () => {
  const tx = transaction();
  let checks = 0;
  await assert.rejects(confirmWrapperTransaction({ ...tx, assertContext: () => { if (++checks === 2) throw new Error("wallet changed"); } }), /wallet changed/);
  assert.deepEqual(tx.events, ["simulate"]);
});

test("failed simulation does not open a signing request", async () => {
  const tx = transaction();
  await assert.rejects(confirmWrapperTransaction({ ...tx, simulate: async () => { throw new Error("insufficient balance"); } }), /insufficient/);
  assert.deepEqual(tx.events, ["context"]);
});

test("a reverted receipt is not treated as a successful wrap", async () => {
  const tx = transaction();
  await assert.rejects(confirmWrapperTransaction({ ...tx, wait: async () => ({ status: "reverted" }) }), /reverted/);
});

test("rejecting a signing request never advances to confirmation", async () => {
  const tx = transaction();
  await assert.rejects(confirmWrapperTransaction({ ...tx, write: async () => { throw new Error("user rejected"); } }), /rejected/);
  assert.deepEqual(tx.events, ["context", "simulate", "context"]);
});

test("a cancelled or different replacement transaction is not an operation success", async () => {
  for (const reason of ["cancelled", "replaced"] as const) {
    await assert.rejects(confirmWrapperTransaction({
      ...transaction(),
      wait: async (_hash, onReplaced) => {
        onReplaced({ reason, transactionReceipt: { transactionHash: hash } });
        return { status: "success" };
      },
    }), /cancelled or replaced/);
  }
});

test("fee-only replacements update the transaction hash and can succeed", async () => {
  const nextHash = `0x${"2".repeat(64)}` as Hash;
  const submitted: Hash[] = [];
  const result = await confirmWrapperTransaction({
    ...transaction(),
    onSubmitted: (hash) => { submitted.push(hash); },
    wait: async (_hash, onReplaced) => {
      onReplaced({ reason: "repriced", transactionReceipt: { transactionHash: nextHash } });
      return { status: "success" };
    },
  });
  assert.equal(result, nextHash);
  assert.deepEqual(submitted, [hash, nextHash]);
});

// Feed raw contract return bytes through viem and the same read list used by the
// hook. Decoded string fixtures alone do not catch ERC20 metadata ABI mismatches.
const aggregateAbi = parseAbi([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
]);

function metadataClient(symbols: readonly [`0x${string}`, `0x${string}`]) {
  const wrapper = getTokenWrapper(config)!;
  const contracts = wrapperReadContracts(wrapper, underlying);
  return createPublicClient({
    chain: mainnet,
    transport: custom({
      async request({ method, params }) {
        assert.equal(method, "eth_call");
        const [request] = params as [{ data: `0x${string}` }];
        const decoded = decodeFunctionData({ abi: aggregateAbi, data: request.data });
        const results = decoded.args[0].map((call) => {
          const index = contracts.findIndex((contract) =>
            contract.address.toLowerCase() === call.target.toLowerCase() &&
            decodeFunctionData({ abi: contract.abi, data: call.callData }).functionName === contract.functionName);
          assert.ok(index >= 0);
          const contract = contracts[index];
          const returnData = index === 2 ? symbols[0] : index === 3 ? symbols[1]
            : encodeFunctionResult({ abi: contract.abi, functionName: contract.functionName, result: reads[index] });
          return { success: true, returnData };
        });
        return encodeFunctionResult({ abi: aggregateAbi, functionName: "aggregate3", result: results });
      },
    }),
  });
}

for (const underlyingLegacy of [false, true]) {
  for (const wrappedLegacy of [false, true]) {
    test(`raw metadata decodes with underlying bytes32=${underlyingLegacy}, wrapped bytes32=${wrappedLegacy}`, async () => {
      const symbols = ["KTON", "gKTON"].map((symbol, index) =>
        (index === 0 ? underlyingLegacy : wrappedLegacy)
          ? stringToHex(symbol, { size: 32 })
          : encodeAbiParameters([{ type: "string" }], [symbol])) as [`0x${string}`, `0x${string}`];
      const wrapper = getTokenWrapper(config)!;
      const results = await metadataClient(symbols).multicall({
        contracts: wrapperReadContracts(wrapper, underlying), allowFailure: true, batchSize: 0,
      });
      const values = readWrapperValues(results, wrapper);
      assert.ok(values);
      assert.equal(values.underlyingSymbol, "KTON");
      assert.equal(values.symbol, "gKTON");
      assert.equal(values.underlyingBalance, 100n);
      assert.equal(values.allowance, 10n);
      if (underlyingLegacy) assert.equal(results[2].status, "failure");
      if (wrappedLegacy) assert.equal(results[3].status, "failure");
    });
  }
}

test("metadata fallback never permits missing balances, allowances or contract validation", () => {
  const wrapper = getTokenWrapper(config)!;
  for (const index of [0, 1, 4, 5, 6, 7, 8, 9, 10]) {
    const results = successfulReads(reads);
    results[index] = { status: "failure" };
    assert.equal(readWrapperValues(results, wrapper), undefined, `failed read ${index}`);
  }
  for (const index of [2, 3]) {
    const results = successfulReads(reads);
    results[index] = { status: "failure" };
    assert.equal(readWrapperValues(results, wrapper), undefined);
    results[index + 9] = { status: "success", result: "0x1234" };
    assert.equal(readWrapperValues(results, wrapper), undefined);
  }
});
