#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  classifyDatalensQueryError,
  formatBlockTag,
  graphqlRequest,
  loadTargets,
  normalizeAddress,
  parsePositiveInt,
  readCurrentVotes,
  readTokenBalance,
  readUint256,
  requireOptionValue,
} from "./indexer-diagnostics.mjs";

const PROPOSALS_QUERY = `
  query Proposals($limit: Int!, $offset: Int!) {
    indexerStatus { processedHeight targetHeight syncedPercentage isSynced }
    dataMetrics(where: { id_eq: "global" }) {
      powerSum
      memberCount
      chainId
      daoCode
    }
    proposalsConnection(orderBy: [id_ASC]) { totalCount }
    contributorsConnection(orderBy: [id_ASC]) { totalCount }
    proposals(limit: $limit, offset: $offset, orderBy: [blockNumber_DESC]) {
      proposalId
      title
      description
      proposalSnapshot
      proposalDeadline
      quorum
      voteStartTimestamp
      voteEndTimestamp
      metricsVotesWeightForSum
      metricsVotesWeightAgainstSum
      metricsVotesWeightAbstainSum
      stateEpochs {
        state
        startBlockNumber
      }
    }
  }
`;

const DELEGATES_QUERY = `
  query Delegates($limit: Int!, $offset: Int!) {
    contributors(limit: $limit, offset: $offset, orderBy: [power_DESC]) {
      id
      power
      balance
      delegatesCountAll
      delegatesCountEffective
      blockNumber
    }
  }
`;

const TALLY_PROPOSALS_QUERY = `
  query Proposals($input: ProposalsInput!) {
    proposals(input: $input) {
      nodes {
        ... on Proposal {
          id
          onchainId
          status
          metadata {
            title
            description
          }
          start { ... on Block { number timestamp ts } }
          end { ... on Block { number timestamp ts } }
          voteStats {
            type
            votesCount
            votersCount
          }
          quorum
        }
      }
      pageInfo { firstCursor lastCursor }
    }
  }
`;

export const TALLY_DELEGATES_QUERY = `
  query Delegates($input: DelegatesInput!) {
    delegates(input: $input) {
      nodes {
        ... on Delegate {
          id
          address
          votesCount
          votes
          tokenBalance
          balance
          delegatorsCount
          account {
            address
          }
        }
      }
      pageInfo { firstCursor lastCursor }
    }
  }
`;

const GOVERNOR_STATE_SELECTOR = "0x3e4f49e6";
const GOVERNOR_SNAPSHOT_SELECTOR = "0x2d63f693";
const GOVERNOR_DEADLINE_SELECTOR = "0xc01f9e37";
const GOVERNOR_QUORUM_SELECTOR = "0xf8ce560a";
const TOKEN_PAST_VOTES_SELECTOR = "0x3a46b1a8";
const TOKEN_PRIOR_VOTES_SELECTOR = "0x782d6fe1";

const GOVERNOR_STATES = [
  "Pending",
  "Active",
  "Canceled",
  "Defeated",
  "Succeeded",
  "Queued",
  "Expired",
  "Executed",
];

export function parseArgs(argv) {
  const options = {
    apiKey: process.env.TALLY_API_KEY ?? "",
    delegateLimit: 80,
    deterministicDelegates: 20,
    deterministicProposals: 20,
    failOnMismatches: false,
    fixturesDir: "",
    jsonFile: "",
    markdownFile: "",
    proposalLimit: 300,
    randomDelegates: 10,
    randomProposals: 10,
    seed: "degov-tally-onchain",
    targetsFile: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--fail-on-mismatches") {
      options.failOnMismatches = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    const [flag, inlineValue] = token.split("=", 2);
    const value = inlineValue ?? argv[index + 1];
    const expectsValue = inlineValue === undefined;

    switch (flag) {
      case "--api-key":
        options.apiKey = requireOptionValue(flag, value);
        break;
      case "--delegate-limit":
        options.delegateLimit = parsePositiveInt(value, flag);
        break;
      case "--deterministic-delegates":
        options.deterministicDelegates = parsePositiveInt(value, flag);
        break;
      case "--deterministic-proposals":
        options.deterministicProposals = parsePositiveInt(value, flag);
        break;
      case "--fixtures-dir":
        options.fixturesDir = path.resolve(
          process.cwd(),
          requireOptionValue(flag, value),
        );
        break;
      case "--json-file":
        options.jsonFile = requireOptionValue(flag, value);
        break;
      case "--markdown-file":
        options.markdownFile = requireOptionValue(flag, value);
        break;
      case "--proposal-limit":
        options.proposalLimit = parsePositiveInt(value, flag);
        break;
      case "--random-delegates":
        options.randomDelegates = parsePositiveInt(value, flag);
        break;
      case "--random-proposals":
        options.randomProposals = parsePositiveInt(value, flag);
        break;
      case "--seed":
        options.seed = requireOptionValue(flag, value);
        break;
      case "--targets-file":
        options.targetsFile = path.resolve(
          process.cwd(),
          requireOptionValue(flag, value),
        );
        break;
      default:
        throw new Error(`Unknown option: ${flag}`);
    }
    if (expectsValue) {
      index += 1;
    }
  }
  return options;
}

export function normalizeProposalId(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  const text = String(value).trim();
  return text.startsWith("0x") ? BigInt(text).toString(10) : BigInt(text).toString(10);
}

function normalizeState(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "object") {
    return normalizeState(value.type ?? value.status ?? value.name);
  }
  const text = String(value).replace(/_/g, " ").trim();
  if (!text) {
    return null;
  }
  return text
    .split(/\s+/)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join("");
}

function normalizeBigIntString(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return BigInt(String(value)).toString();
}

function normalizeTitle(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find(Boolean) ?? "";
}

function latestStateEpoch(epochs = []) {
  const [latest] = [...epochs].sort((left, right) =>
    BigInt(right.startBlockNumber ?? 0) > BigInt(left.startBlockNumber ?? 0)
      ? 1
      : -1,
  );
  return normalizeState(latest?.state);
}

function hashSeed(seed) {
  let value = 2166136261;
  for (const char of seed) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function selectSamples(items, options) {
  const deterministic = items.slice(0, options.deterministicCount);
  const selected = new Set(deterministic);
  const candidates = items.filter((item) => !selected.has(item));
  const seed = options.seed ?? "sample";
  for (const item of [...candidates].sort((left, right) => {
    const leftScore = hashSeed(`${seed}:${JSON.stringify(left)}`);
    const rightScore = hashSeed(`${seed}:${JSON.stringify(right)}`);
    return leftScore - rightScore;
  })) {
    if (selected.size >= deterministic.length + options.randomCount) {
      break;
    }
    selected.add(item);
  }
  return items.filter((item) => selected.has(item));
}

export async function fetchDatalensProposals(target, limit) {
  const data = await graphqlRequest(target.indexerEndpoint, PROPOSALS_QUERY, {
    limit,
    offset: 0,
  });
  return {
    summary: {
      indexerStatus: data.indexerStatus ?? null,
      metrics: data.dataMetrics?.[0] ?? null,
      proposalsCount: data.proposalsConnection?.totalCount ?? null,
      contributorsCount: data.contributorsConnection?.totalCount ?? null,
    },
    proposals: data.proposals ?? [],
  };
}

export async function fetchDatalensDelegates(target, limit) {
  const data = await graphqlRequest(target.indexerEndpoint, DELEGATES_QUERY, {
    limit,
    offset: 0,
  });
  return data.contributors ?? [];
}

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function loadFixture(options, target, suffix) {
  if (!options.fixturesDir) {
    return null;
  }
  const fixturePath = path.join(options.fixturesDir, `${target.code}.${suffix}.json`);
  try {
    return await readJsonFile(fixturePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function collectNodes(payload, names) {
  if (Array.isArray(payload)) {
    return payload.flatMap((entry) => collectNodes(entry, names));
  }
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const direct = [];
  for (const name of names) {
    const value = payload[name];
    if (Array.isArray(value)) {
      direct.push(...value);
    } else if (Array.isArray(value?.nodes)) {
      direct.push(...value.nodes);
    }
  }
  return direct.length > 0
    ? direct
    : Object.values(payload).flatMap((value) => collectNodes(value, names));
}

async function tallyRequest(apiKey, query, variables) {
  const response = await fetch("https://api.tally.xyz/query", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Api-Key": apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    throw new Error(`Tally request failed with HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }
  return payload.data;
}

async function fetchTallyWithRequestFile(target, requestField, apiKey) {
  if (!target[requestField]) {
    return null;
  }
  const request = await readJsonFile(path.resolve(process.cwd(), target[requestField]));
  const response = await tallyRequest(
    apiKey,
    request.query,
    request.variables ?? {},
  );
  return response;
}

export async function fetchTallyProposals(target, options) {
  const fixture = await loadFixture(options, target, "tally-proposals");
  if (fixture) {
    return collectNodes(fixture, ["proposals", "nodes"]);
  }
  if (!options.apiKey) {
    throw new Error("TALLY_API_KEY or --api-key is required for live Tally proposals");
  }
  const replayed = await fetchTallyWithRequestFile(
    target,
    "tallyProposalsRequestFile",
    options.apiKey,
  );
  if (replayed) {
    return collectNodes(replayed, ["proposals", "nodes"]);
  }
  if (!target.tallyGovernorId) {
    throw new Error(`${target.code} is missing tallyGovernorId`);
  }
  const data = await tallyRequest(options.apiKey, TALLY_PROPOSALS_QUERY, {
    input: {
      filters: { governorId: target.tallyGovernorId },
      page: { limit: options.proposalLimit },
      sort: { sortBy: "id", isDescending: true },
    },
  });
  return collectNodes(data, ["proposals", "nodes"]);
}

export async function fetchTallyDelegates(target, options) {
  const fixture = await loadFixture(options, target, "tally-delegates");
  if (fixture) {
    return collectNodes(fixture, ["delegates", "nodes"]);
  }
  if (!options.apiKey) {
    throw new Error("TALLY_API_KEY or --api-key is required for live Tally delegates");
  }
  const replayed = await fetchTallyWithRequestFile(
    target,
    "tallyDelegatesRequestFile",
    options.apiKey,
  );
  if (replayed) {
    return collectNodes(replayed, ["delegates", "nodes"]);
  }
  if (!target.tallyGovernorId) {
    throw new Error(`${target.code} is missing tallyGovernorId`);
  }
  const data = await tallyRequest(options.apiKey, TALLY_DELEGATES_QUERY, {
    input: {
      filters: { governorId: target.tallyGovernorId },
      page: { limit: options.delegateLimit },
      sort: { sortBy: "votes", isDescending: true },
    },
  });
  return collectNodes(data, ["delegates", "nodes"]);
}

function encodeUint256(value) {
  return BigInt(value).toString(16).padStart(64, "0");
}

export async function readProposalOnchain(target, proposalId) {
  const encodedProposalId = encodeUint256(proposalId);
  const snapshot = await readUint256(
    target.rpcUrl,
    target.governor,
    GOVERNOR_SNAPSHOT_SELECTOR,
    [encodedProposalId],
  );
  const [state, deadline, quorum] = await Promise.all([
    readUint256(target.rpcUrl, target.governor, GOVERNOR_STATE_SELECTOR, [
      encodedProposalId,
    ]).then((value) => GOVERNOR_STATES[Number(value)] ?? value),
    readUint256(target.rpcUrl, target.governor, GOVERNOR_DEADLINE_SELECTOR, [
      encodedProposalId,
    ]),
    readUint256(target.rpcUrl, target.governor, GOVERNOR_QUORUM_SELECTOR, [
      encodeUint256(snapshot),
    ]),
  ]);
  return {
    state,
    proposalSnapshot: snapshot,
    proposalDeadline: deadline,
    quorum,
  };
}

async function readHistoricalVotes(target, address, timepoint) {
  if (!timepoint) {
    return null;
  }
  const args = [
    normalizeAddress(address).replace(/^0x/, "").padStart(64, "0"),
    encodeUint256(timepoint),
  ];
  const blockTag = formatBlockTag(target.comparisonBlockHeight ?? target.blockTag);
  try {
    return await readUint256(
      target.rpcUrl,
      target.governorToken,
      TOKEN_PAST_VOTES_SELECTOR,
      args,
      blockTag,
    );
  } catch (pastVotesError) {
    try {
      return await readUint256(
        target.rpcUrl,
        target.governorToken,
        TOKEN_PRIOR_VOTES_SELECTOR,
        args,
        blockTag,
      );
    } catch {
      throw pastVotesError;
    }
  }
}

export async function readDelegateOnchain(target, address, snapshot) {
  const [currentVotes, balance, historicalVotes] = await Promise.allSettled([
    readCurrentVotes(target, address).then((entry) => entry.value),
    readTokenBalance(target, address).catch(() => null),
    readHistoricalVotes(target, address, snapshot),
  ]);
  return {
    getVotes:
      currentVotes.status === "fulfilled" ? currentVotes.value : undefined,
    getVotesError:
      currentVotes.status === "rejected"
        ? currentVotes.reason?.message ?? String(currentVotes.reason)
        : null,
    balanceOf: balance.status === "fulfilled" ? balance.value : undefined,
    balanceOfError:
      balance.status === "rejected"
        ? balance.reason?.message ?? String(balance.reason)
        : null,
    getPastVotes:
      historicalVotes.status === "fulfilled" ? historicalVotes.value : null,
    getPastVotesError:
      historicalVotes.status === "rejected"
        ? historicalVotes.reason?.message ?? String(historicalVotes.reason)
        : null,
  };
}

function normalizeDatalensProposal(entry) {
  return {
    id: normalizeProposalId(entry.proposalId),
    title: normalizeTitle(entry.title || entry.description),
    state: latestStateEpoch(entry.stateEpochs),
    votesFor: normalizeBigIntString(entry.metricsVotesWeightForSum),
    votesAgainst: normalizeBigIntString(entry.metricsVotesWeightAgainstSum),
    votesAbstain: normalizeBigIntString(entry.metricsVotesWeightAbstainSum),
    proposalSnapshot: normalizeBigIntString(entry.proposalSnapshot),
    proposalDeadline: normalizeBigIntString(entry.proposalDeadline),
    quorum: normalizeBigIntString(entry.quorum),
    voteStartTimestamp: normalizeBigIntString(entry.voteStartTimestamp),
    voteEndTimestamp: normalizeBigIntString(entry.voteEndTimestamp),
  };
}

function findVoteStat(entry, names) {
  const direct = entry.votes ?? entry.voteStats ?? {};
  for (const name of names) {
    if (direct[name] !== undefined) {
      return normalizeBigIntString(direct[name]);
    }
  }
  if (Array.isArray(direct)) {
    const match = direct.find((item) =>
      names.includes(String(item.support ?? item.type ?? "").toLowerCase()),
    );
    return normalizeBigIntString(match?.votes ?? match?.votesCount ?? match?.weight);
  }
  return null;
}

function normalizeTallyProposal(entry) {
  return {
    id: normalizeProposalId(entry.onchainId ?? entry.proposalId ?? entry.id),
    title: normalizeTitle(
      entry.title ||
        entry.description ||
        entry.metadata?.title ||
        entry.metadata?.description,
    ),
    state: normalizeState(entry.state ?? entry.status),
    votesFor: findVoteStat(entry, ["for", "1"]),
    votesAgainst: findVoteStat(entry, ["against", "0"]),
    votesAbstain: findVoteStat(entry, ["abstain", "2"]),
    proposalSnapshot: normalizeBigIntString(
      entry.proposalSnapshot ?? entry.startBlock ?? entry.start?.number,
    ),
    proposalDeadline: normalizeBigIntString(
      entry.proposalDeadline ?? entry.endBlock ?? entry.end?.number,
    ),
    quorum: normalizeBigIntString(entry.quorum),
    voteStartTimestamp: normalizeBigIntString(
      entry.voteStartTimestamp ?? entry.start?.timestamp ?? entry.start?.ts,
    ),
    voteEndTimestamp: normalizeBigIntString(
      entry.voteEndTimestamp ?? entry.end?.timestamp ?? entry.end?.ts,
    ),
  };
}

function normalizeDatalensDelegate(entry) {
  return {
    address: normalizeAddress(entry.id),
    votingPower: normalizeBigIntString(entry.power),
    balance: normalizeBigIntString(entry.balance),
    delegateCount: entry.delegatesCountAll ?? null,
    historicalVotingPower: normalizeBigIntString(
      entry.historicalVotingPower ?? entry.pastVotes,
    ),
  };
}

function normalizeTallyDelegate(entry) {
  return {
    address: normalizeAddress(entry.address ?? entry.account?.address ?? entry.id),
    votingPower: normalizeBigIntString(
      entry.votes ?? entry.votesCount ?? entry.votingPower,
    ),
    balance: normalizeBigIntString(entry.tokenBalance ?? entry.balance),
    delegateCount: entry.delegatorsCount ?? entry.delegateCount ?? null,
    historicalVotingPower: normalizeBigIntString(
      entry.historicalVotingPower ?? entry.pastVotes,
    ),
  };
}

function classifyConclusion({
  degovValue,
  tallyValue,
  onchainValue,
  onchainError = null,
  representationDifference = false,
}) {
  if (onchainError) {
    return "chain-incompatibility";
  }
  if (representationDifference) {
    return "expected-representation-difference";
  }
  if (onchainValue !== null && onchainValue !== undefined) {
    if (degovValue === null && tallyValue === onchainValue) {
      return "degov-bug";
    }
    if (tallyValue === null && degovValue === onchainValue) {
      return "tally-bug";
    }
    if (degovValue === onchainValue && tallyValue !== onchainValue) {
      return "tally-bug";
    }
    if (tallyValue === onchainValue && degovValue !== onchainValue) {
      return "degov-bug";
    }
    if (degovValue !== onchainValue && tallyValue !== onchainValue) {
      return "chain-incompatibility";
    }
  }
  return degovValue === tallyValue ? "match" : "expected-representation-difference";
}

function recordMismatch(mismatches, entry) {
  if (entry.degovValue === entry.tallyValue && entry.degovValue === entry.onchainValue) {
    return;
  }
  mismatches.push({
    ...entry,
    conclusion: classifyConclusion(entry),
  });
}

async function readOnchainSafely(reader, ...args) {
  try {
    return { value: await reader(...args), error: null };
  } catch (error) {
    return {
      value: null,
      error: error?.message ?? String(error),
    };
  }
}

async function compareProposal(target, proposal, tallyById, services, mismatches) {
  const tally = tallyById.get(proposal.id);
  if (!tally) {
    return;
  }
  const onchainResult = await readOnchainSafely(
    services.readProposalOnchain,
    target,
    proposal.id,
  );
  const onchain = onchainResult.value;

  for (const [field, onchainField = field] of [
    ["state"],
    ["title", null],
    ["votesFor", null],
    ["votesAgainst", null],
    ["votesAbstain", null],
    ["proposalSnapshot"],
    ["proposalDeadline"],
    ["quorum"],
    ["voteStartTimestamp", null],
    ["voteEndTimestamp", null],
  ]) {
    const degovValue = proposal[field];
    const tallyValue = tally[field];
    const onchainValue = onchainField ? onchain?.[onchainField] : null;
    const onchainError = onchainField ? onchainResult.error : null;
    if (
      degovValue === null ||
      tallyValue === null ||
      (degovValue === tallyValue &&
        (onchainValue === null || degovValue === onchainValue || onchainError))
    ) {
      continue;
    }
    recordMismatch(mismatches, {
      dao: target.code,
      scope: "proposal",
      proposalId: proposal.id,
      field,
      degovValue,
      tallyValue,
      onchainValue,
      onchainError,
    });
  }
}

async function recordProposalIdentityMismatch({
  target,
  proposalId,
  degovValue,
  tallyValue,
  services,
  mismatches,
}) {
  const onchainResult = await readOnchainSafely(
    services.readProposalOnchain,
    target,
    proposalId,
  );
  const onchainValue = onchainResult.value ? proposalId : null;
  recordMismatch(mismatches, {
    dao: target.code,
    scope: "proposal",
    proposalId,
    field: "identity",
    degovValue,
    tallyValue,
    onchainValue,
    onchainError: onchainResult.error,
  });
}

async function compareProposalIdentityParity({
  target,
  proposals,
  tallyProposalRows,
  datalensById,
  tallyById,
  services,
  mismatches,
}) {
  for (const proposal of proposals) {
    if (!tallyById.has(proposal.id)) {
      await recordProposalIdentityMismatch({
        target,
        proposalId: proposal.id,
        degovValue: proposal.id,
        tallyValue: null,
        services,
        mismatches,
      });
    }
  }
  for (const tally of tallyProposalRows) {
    if (!datalensById.has(tally.id)) {
      await recordProposalIdentityMismatch({
        target,
        proposalId: tally.id,
        degovValue: null,
        tallyValue: tally.id,
        services,
        mismatches,
      });
    }
  }
}

function compareDelegateHistoricalVotes(target, delegate, tally, onchain, mismatches) {
  if (onchain?.getPastVotes === null || onchain?.getPastVotes === undefined) {
    if (onchain?.getPastVotesError) {
      recordMismatch(mismatches, {
        dao: target.code,
        scope: "delegate",
        address: delegate.address,
        field: "historicalVotingPower",
        degovValue: delegate.historicalVotingPower ?? "not-represented",
        tallyValue: tally?.historicalVotingPower ?? "not-represented",
        onchainValue: "unavailable",
        onchainError: onchain.getPastVotesError,
      });
    }
    return;
  }
  const degovValue = delegate.historicalVotingPower ?? "not-represented";
  const tallyValue = tally?.historicalVotingPower ?? "not-represented";
  if (degovValue === onchain.getPastVotes && tallyValue === onchain.getPastVotes) {
    return;
  }
  recordMismatch(mismatches, {
    dao: target.code,
    scope: "delegate",
    address: delegate.address,
    field: "historicalVotingPower",
    degovValue,
    tallyValue,
    onchainValue: onchain.getPastVotes,
    representationDifference:
      degovValue === "not-represented" && tallyValue === "not-represented",
  });
}

async function compareDelegate(target, delegate, tallyByAddress, services, snapshot, mismatches) {
  const tally = tallyByAddress.get(delegate.address);
  if (!tally) {
    return;
  }
  const onchainResult = await readOnchainSafely(
    services.readDelegateOnchain,
    target,
    delegate.address,
    snapshot,
  );
  const onchain = onchainResult.value;

  for (const [field, onchainField, onchainErrorField] of [
    ["votingPower", "getVotes", "getVotesError"],
    ["balance", "balanceOf", "balanceOfError"],
    ["delegateCount", null, null],
  ]) {
    const degovValue =
      delegate[field] === null || delegate[field] === undefined
        ? null
        : String(delegate[field]);
    const tallyValue =
      tally[field] === null || tally[field] === undefined ? null : String(tally[field]);
    const onchainValue = onchainField ? onchain?.[onchainField] : null;
    const onchainError = onchainErrorField
      ? onchain?.[onchainErrorField] ?? onchainResult.error
      : null;
    if (
      degovValue === null ||
      tallyValue === null ||
      (degovValue === tallyValue &&
        (onchainValue === null || degovValue === onchainValue || onchainError))
    ) {
      continue;
    }
    recordMismatch(mismatches, {
      dao: target.code,
      scope: "delegate",
      address: delegate.address,
      field,
      degovValue,
      tallyValue,
      onchainValue,
      onchainError,
    });
  }
  compareDelegateHistoricalVotes(target, delegate, tally, onchain, mismatches);
}

async function recordDelegateIdentityMismatch({
  target,
  address,
  degovValue,
  tallyValue,
  services,
  snapshot,
  mismatches,
}) {
  const onchainResult = await readOnchainSafely(
    services.readDelegateOnchain,
    target,
    address,
    snapshot,
  );
  const onchain = onchainResult.value;
  recordMismatch(mismatches, {
    dao: target.code,
    scope: "delegate",
    address,
    field: "identity",
    degovValue,
    tallyValue,
    onchainValue: onchain?.getVotes !== undefined ? address : null,
    onchainError: onchain?.getVotesError ?? onchainResult.error,
  });
}

async function compareDelegateIdentityParity({
  target,
  delegates,
  tallyDelegateRows,
  datalensByAddress,
  tallyByAddress,
  services,
  snapshot,
  mismatches,
}) {
  for (const delegate of delegates) {
    if (!tallyByAddress.has(delegate.address)) {
      await recordDelegateIdentityMismatch({
        target,
        address: delegate.address,
        degovValue: delegate.address,
        tallyValue: null,
        services,
        snapshot,
        mismatches,
      });
    }
  }
  for (const tally of tallyDelegateRows) {
    if (!datalensByAddress.has(tally.address)) {
      await recordDelegateIdentityMismatch({
        target,
        address: tally.address,
        degovValue: null,
        tallyValue: tally.address,
        services,
        snapshot,
        mismatches,
      });
    }
  }
}

export async function auditTarget(target, options, services = {}) {
  const fetchDatalensSummary = services.fetchDatalensSummary;
  const fetchDatalensProposalRows = services.fetchDatalensProposals;
  const fetchDatalensDelegateRows =
    services.fetchDatalensDelegates ?? fetchDatalensDelegates;
  const fetchTallyProposalRows = services.fetchTallyProposals ?? fetchTallyProposals;
  const fetchTallyDelegateRows = services.fetchTallyDelegates ?? fetchTallyDelegates;
  const proposalReader = services.readProposalOnchain ?? readProposalOnchain;
  const delegateReader = services.readDelegateOnchain ?? readDelegateOnchain;

  const result = {
    code: target.code,
    name: target.name ?? target.code,
    endpoint: target.indexerEndpoint,
    tallyUrl: target.tallyUrl ?? null,
    sync: null,
    aggregate: null,
    queryErrors: [],
    mismatches: [],
    summary: {
      proposals: { degovCount: null, tallyCount: null, sampled: 0 },
      delegates: { degovCount: null, tallyCount: null, sampled: 0 },
    },
  };

  try {
    const datalensResult = fetchDatalensProposalRows
      ? {
          summary: fetchDatalensSummary ? await fetchDatalensSummary(target) : {},
          proposals: await fetchDatalensProposalRows(target, options.proposalLimit),
        }
      : await fetchDatalensProposals(target, options.proposalLimit);
    const [datalensDelegates, tallyProposals, tallyDelegates] = await Promise.all([
      fetchDatalensDelegateRows(target, options.delegateLimit),
      fetchTallyProposalRows(target, options),
      fetchTallyDelegateRows(target, options),
    ]);

    const proposals = datalensResult.proposals.map(normalizeDatalensProposal);
    const delegates = datalensDelegates.map(normalizeDatalensDelegate);
    const tallyProposalRows = tallyProposals.map(normalizeTallyProposal);
    const tallyDelegateRows = tallyDelegates.map(normalizeTallyDelegate);
    const datalensById = new Map(proposals.map((entry) => [entry.id, entry]));
    const tallyById = new Map(tallyProposalRows.map((entry) => [entry.id, entry]));
    const datalensByAddress = new Map(
      delegates.map((entry) => [entry.address, entry]),
    );
    const tallyByAddress = new Map(
      tallyDelegateRows.map((entry) => [entry.address, entry]),
    );

    const sampledProposalIds = selectSamples(
      proposals.map((proposal) => proposal.id),
      {
        deterministicCount: options.deterministicProposals,
        randomCount: options.randomProposals,
        seed: `${options.seed}:${target.code}:proposals`,
      },
    );
    const sampledDelegates = selectSamples(delegates, {
      deterministicCount: options.deterministicDelegates,
      randomCount: options.randomDelegates,
      seed: `${options.seed}:${target.code}:delegates`,
    });

    const servicesForCompare = {
      readProposalOnchain: proposalReader,
      readDelegateOnchain: delegateReader,
    };
    for (const proposal of proposals.filter((entry) =>
      sampledProposalIds.includes(entry.id),
    )) {
      await compareProposal(
        target,
        proposal,
        tallyById,
        servicesForCompare,
        result.mismatches,
      );
    }
    await compareProposalIdentityParity({
      target,
      proposals,
      tallyProposalRows,
      datalensById,
      tallyById,
      services: servicesForCompare,
      mismatches: result.mismatches,
    });

    const historicalSnapshot = proposals.find((entry) => entry.proposalSnapshot)
      ?.proposalSnapshot;
    for (const delegate of sampledDelegates) {
      await compareDelegate(
        target,
        delegate,
        tallyByAddress,
        servicesForCompare,
        historicalSnapshot,
        result.mismatches,
      );
    }
    await compareDelegateIdentityParity({
      target,
      delegates,
      tallyDelegateRows,
      datalensByAddress,
      tallyByAddress,
      services: servicesForCompare,
      snapshot: historicalSnapshot,
      mismatches: result.mismatches,
    });

    result.sync = datalensResult.summary?.indexerStatus ?? null;
    result.aggregate = datalensResult.summary?.metrics ?? null;
    result.summary.proposals.degovCount =
      datalensResult.summary?.proposalsCount ?? proposals.length;
    result.summary.proposals.tallyCount = tallyProposalRows.length;
    result.summary.proposals.sampled = sampledProposalIds.length;
    result.summary.delegates.degovCount =
      datalensResult.summary?.contributorsCount ?? delegates.length;
    result.summary.delegates.tallyCount = tallyDelegateRows.length;
    result.summary.delegates.sampled = sampledDelegates.length;
  } catch (error) {
    result.queryErrors.push({
      classification: classifyDatalensQueryError(error),
      message: error?.message ?? String(error),
    });
  }

  return {
    ...result,
    mismatchCount: result.mismatches.length,
  };
}

export function summarizeReport(targets) {
  const mismatches = targets.flatMap((target) => target.mismatches);
  const countConclusion = (conclusion) =>
    mismatches.filter((entry) => entry.conclusion === conclusion).length;
  return {
    totalMismatches: mismatches.length,
    tallyBug: countConclusion("tally-bug"),
    degovBug: countConclusion("degov-bug"),
    chainIncompatibility: countConclusion("chain-incompatibility"),
    expectedRepresentationDifference: countConclusion(
      "expected-representation-difference",
    ),
    queryErrors: targets.reduce((sum, target) => sum + target.queryErrors.length, 0),
  };
}

export async function runAudit(targets, options, services = {}) {
  const targetResults = [];
  for (const target of targets) {
    targetResults.push(await auditTarget(target, options, services));
  }
  return {
    generatedAt: new Date().toISOString(),
    targets: targetResults,
    summary: summarizeReport(targetResults),
  };
}

export function buildMarkdownReport(report) {
  const lines = [
    "## Tally and Onchain E2E Validation",
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    "### Summary",
    "",
    `- Total mismatches: ${report.summary.totalMismatches}`,
    `- Tally bugs: ${report.summary.tallyBug}`,
    `- DeGov bugs: ${report.summary.degovBug}`,
    `- Chain incompatibilities: ${report.summary.chainIncompatibility}`,
    `- Expected representation differences: ${report.summary.expectedRepresentationDifference}`,
    `- Query errors: ${report.summary.queryErrors ?? 0}`,
    "",
  ];

  for (const target of report.targets) {
    lines.push(`### ${target.name} (\`${target.code}\`)`, "");
    lines.push(`- Endpoint: ${target.endpoint ?? "unknown"}`);
    if (target.tallyUrl) {
      lines.push(`- Tally URL: ${target.tallyUrl}`);
    }
    lines.push(`- Proposal sample: ${target.summary.proposals.sampled}`);
    lines.push(`- Delegate sample: ${target.summary.delegates.sampled}`);
    lines.push(`- Mismatches: ${target.mismatchCount}`);
    if (target.sync) {
      lines.push(`- Sync processed height: ${target.sync.processedHeight ?? "unknown"}`);
      lines.push(`- Sync target height: ${target.sync.targetHeight ?? "unknown"}`);
      lines.push(`- Sync percentage: ${target.sync.syncedPercentage ?? "unknown"}`);
    }
    for (const mismatch of target.mismatches) {
      const subject =
        mismatch.scope === "proposal"
          ? `proposal ${mismatch.proposalId}`
          : `delegate ${mismatch.address}`;
      lines.push(
        `- ${subject} ${mismatch.field}: DeGov ${mismatch.degovValue}, Tally ${mismatch.tallyValue}, onchain ${mismatch.onchainValue}, conclusion \`${mismatch.conclusion}\`${mismatch.onchainError ? `, onchainError ${mismatch.onchainError}` : ""}`,
      );
    }
    for (const error of target.queryErrors) {
      lines.push(`- ${error.classification}: ${error.message}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function writeFileIfNeeded(filePath, content) {
  if (!filePath) {
    return;
  }
  const absolutePath = path.resolve(process.cwd(), filePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, "utf8");
}

export function usage() {
  return [
    "Usage: node apps/indexer/scripts/indexer-tally-onchain-e2e.mjs [options]",
    "",
    "Options:",
    "  --targets-file <path>             JSON target list with DeGov, Tally, governor, token, and RPC details",
    "  --fixtures-dir <path>             Dry-run directory containing <dao>.tally-proposals.json and <dao>.tally-delegates.json",
    "  --api-key <key>                   Tally API key; defaults to TALLY_API_KEY",
    "  --proposal-limit <n>              DeGov/Tally proposal rows to inspect",
    "  --delegate-limit <n>              DeGov/Tally delegate rows to inspect",
    "  --deterministic-proposals <n>     Latest proposals to sample",
    "  --random-proposals <n>            Seeded random proposals to sample",
    "  --deterministic-delegates <n>     Top delegates to sample",
    "  --random-delegates <n>            Seeded random delegates to sample",
    "  --seed <value>                    Stable random sample seed",
    "  --json-file <path>                Write JSON report",
    "  --markdown-file <path>            Write markdown report",
    "  --fail-on-mismatches              Exit non-zero when mismatches or query errors are found",
  ].join("\n");
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const targets = await loadTargets(options.targetsFile || undefined);
  const report = await runAudit(targets, options);
  const markdown = buildMarkdownReport(report);
  await writeFileIfNeeded(options.jsonFile, JSON.stringify(report, null, 2));
  await writeFileIfNeeded(options.markdownFile, markdown);
  console.log(
    `Tally/onchain E2E checked ${report.targets.length} DAOs; mismatches=${report.summary.totalMismatches}; tallyBug=${report.summary.tallyBug}; degovBug=${report.summary.degovBug}; chainIncompatibility=${report.summary.chainIncompatibility}; queryErrors=${report.summary.queryErrors}`,
  );
  if (
    options.failOnMismatches &&
    (report.summary.totalMismatches > 0 || report.summary.queryErrors > 0)
  ) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
