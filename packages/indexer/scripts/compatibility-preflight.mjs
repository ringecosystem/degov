const supportOrder = {
  supported: 0,
  degraded: 1,
  unsupported: 2,
};

const requiredGovernorMethods = [
  "hashProposal",
  "proposalDeadline",
  "proposalSnapshot",
  "proposalVotes",
  "quorum",
  "state",
  "votingDelay",
  "votingPeriod",
];

const requiredGovernorEvents = [
  "ProposalCreated",
  "ProposalExecuted",
  "VoteCast",
];

const requiredTokenMethods = {
  ERC20: ["balanceOf", "delegates", "name", "symbol", "totalSupply"],
  ERC721: ["balanceOf", "delegates", "name", "ownerOf", "symbol"],
};

const expectedTransferIndexedArgCounts = {
  ERC20: 2,
  ERC721: 3,
};

const requiredTokenEvents = [
  "DelegateChanged",
  "DelegateVotesChanged",
  "Transfer",
];

function methodState(methods, name) {
  return methods?.[name] ?? "missing";
}

function hasMethod(methods, name) {
  return methodState(methods, name) === "ok";
}

function hasEvent(events, name) {
  return Array.isArray(events) && events.includes(name);
}

function raiseSupport(current, next) {
  return supportOrder[next] > supportOrder[current] ? next : current;
}

function validateMethod(errors, methods, name, owner) {
  const state = methodState(methods, name);

  if (state === "ok") {
    return;
  }

  if (state === "reverts") {
    errors.push(`${owner}.${name} reverts`);
    return;
  }

  errors.push(`${owner}.${name} missing`);
}

function validateEvents(errors, events, names, owner) {
  for (const name of names) {
    if (!hasEvent(events, name)) {
      errors.push(`${owner}.${name} event missing`);
    }
  }
}

function selectVoteRead(methods, preferred, fallback) {
  if (hasMethod(methods, preferred)) {
    return preferred;
  }

  if (hasMethod(methods, fallback)) {
    return fallback;
  }

  return null;
}

export function validateDaoCompatibility({ dao, probes }) {
  const errors = [];
  const warnings = [];
  const standard = dao?.token?.standard;
  const governor = probes?.governor ?? {};
  const token = probes?.token ?? {};
  let support = "supported";

  if (!dao?.code) {
    errors.push("dao.code missing");
  }

  if (!dao?.governor) {
    errors.push("dao.governor missing");
  }

  if (!dao?.token?.contract) {
    errors.push("dao.token.contract missing");
  }

  if (!Object.hasOwn(requiredTokenMethods, standard)) {
    errors.push(`dao.token.standard ${standard ?? "(missing)"} unsupported`);
  }

  for (const name of requiredGovernorMethods) {
    validateMethod(errors, governor.methods, name, "governor");
  }

  validateEvents(errors, governor.events, requiredGovernorEvents, "governor");

  if (standard && Object.hasOwn(requiredTokenMethods, standard)) {
    for (const name of requiredTokenMethods[standard]) {
      validateMethod(errors, token.methods, name, "token");
    }

    const expectedIndexedArgCount = expectedTransferIndexedArgCounts[standard];

    if (token.transferIndexedArgCount !== expectedIndexedArgCount) {
      errors.push(
        `dao.token.standard declares ${standard} but Transfer has ${token.transferIndexedArgCount ?? "unknown"} indexed arguments`,
      );
    }
  }

  validateEvents(errors, token.events, requiredTokenEvents, "token");

  const currentVoteRead = selectVoteRead(
    token.methods,
    "getVotes",
    "getCurrentVotes",
  );
  const historicalVoteRead = selectVoteRead(
    token.methods,
    "getPastVotes",
    "getPriorVotes",
  );

  if (!currentVoteRead) {
    errors.push("token.getVotes/getCurrentVotes missing");
  }

  if (!historicalVoteRead) {
    errors.push("token.getPastVotes/getPriorVotes missing");
  }

  if (currentVoteRead === "getCurrentVotes") {
    support = raiseSupport(support, "degraded");
    warnings.push("token.getVotes missing; using getCurrentVotes fallback");
  }

  if (historicalVoteRead === "getPriorVotes") {
    support = raiseSupport(support, "degraded");
    warnings.push("token.getPastVotes missing; using getPriorVotes fallback");
  }

  if (methodState(governor.methods, "CLOCK_MODE") !== "ok") {
    support = raiseSupport(support, "degraded");
    warnings.push("governor.CLOCK_MODE missing; defaulting to block clock");
  }

  if (methodState(governor.methods, "COUNTING_MODE") !== "ok") {
    support = raiseSupport(support, "degraded");
    warnings.push("governor.COUNTING_MODE missing; inferring vote bucket semantics");
  }

  if (methodState(governor.methods, "timelock") !== "ok") {
    support = raiseSupport(support, "degraded");
    warnings.push("governor.timelock missing; indexing without timelock projection");
  }

  if (errors.length > 0) {
    support = "unsupported";
  }

  return {
    daoCode: dao?.code,
    errors,
    support,
    voteReads: {
      current: currentVoteRead,
      historical: historicalVoteRead,
    },
    warnings,
  };
}
