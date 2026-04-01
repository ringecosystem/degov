#!/usr/bin/env node

const defaultPort = process.env.GQL_PORT?.trim() || "4350";
const defaultEndpoint = `http://127.0.0.1:${defaultPort}/graphql`;

function parseArgs(argv) {
  const options = {
    endpoint: defaultEndpoint,
    delegator: "",
    delegate: "",
    limit: 20,
    negativeCurrent: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const [flag, inlineValue] = token.split("=", 2);
    const value = inlineValue ?? argv[index + 1];
    const expectsValue = inlineValue === undefined;

    switch (flag) {
      case "--endpoint":
        options.endpoint = value;
        break;
      case "--delegator":
        options.delegator = value.toLowerCase();
        break;
      case "--delegate":
        options.delegate = value.toLowerCase();
        break;
      case "--limit":
        options.limit = Number.parseInt(value, 10);
        break;
      case "--negative-current":
        options.negativeCurrent = true;
        continue;
      default:
        throw new Error(`Unknown option: ${flag}`);
    }

    if (expectsValue) {
      index += 1;
    }
  }

  if (!Number.isInteger(options.limit) || options.limit <= 0) {
    throw new Error("--limit must be a positive integer");
  }

  if (!options.negativeCurrent && !options.delegator) {
    throw new Error("--delegator is required unless --negative-current is used");
  }

  if (!options.delegate && options.delegator) {
    options.delegate = options.delegator;
  }

  return options;
}

async function graphqlRequest(endpoint, query, variables = {}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }

  return payload.data;
}

function printJson(label, value) {
  console.log(`\n## ${label}`);
  console.log(JSON.stringify(value, null, 2));
}

const NEGATIVE_CURRENT_QUERY = `
  query NegativeCurrent($limit: Int!) {
    delegates(
      limit: $limit
      orderBy: [power_ASC]
      where: { isCurrent_eq: true, power_lt: 0 }
    ) {
      id
      fromDelegate
      toDelegate
      power
      isCurrent
      blockNumber
      transactionHash
    }
    delegateMappings(
      limit: $limit
      orderBy: [power_ASC]
      where: { power_lt: 0 }
    ) {
      id
      from
      to
      power
      blockNumber
      transactionHash
    }
  }
`;

const SAMPLE_QUERY = `
  query Sample($delegator: String!, $delegateId: String!, $delegate: String!) {
    delegateMappings(where: { from_eq: $delegator }) {
      id
      from
      to
      power
      blockNumber
      transactionHash
    }
    delegates(where: { id_eq: $delegateId }) {
      id
      fromDelegate
      toDelegate
      power
      isCurrent
      blockNumber
      transactionHash
    }
    contributors(where: { id_eq: $delegate }) {
      id
      power
      delegatesCountAll
      delegatesCountEffective
      lastVoteBlockNumber
      blockNumber
      transactionHash
    }
    delegateChangeds(
      limit: 10
      orderBy: [blockNumber_DESC, logIndex_DESC]
      where: { delegator_eq: $delegator }
    ) {
      id
      fromDelegate
      toDelegate
      blockNumber
      transactionHash
    }
    votePowerCheckpoints(
      limit: 10
      orderBy: [blockNumber_DESC, logIndex_DESC]
      where: { delegator_eq: $delegator }
    ) {
      id
      account
      cause
      fromDelegate
      toDelegate
      delta
      blockNumber
      transactionHash
    }
  }
`;

async function main() {
  const options = parseArgs(process.argv.slice(2));

  console.log(`Endpoint: ${options.endpoint}`);

  if (options.negativeCurrent) {
    const result = await graphqlRequest(options.endpoint, NEGATIVE_CURRENT_QUERY, {
      limit: options.limit,
    });
    printJson("Current Negative Delegates", result.delegates ?? []);
    printJson("Negative Delegate Mappings", result.delegateMappings ?? []);
    return;
  }

  const delegateId = `${options.delegator}_${options.delegate}`;
  const result = await graphqlRequest(options.endpoint, SAMPLE_QUERY, {
    delegator: options.delegator,
    delegateId,
    delegate: options.delegate,
  });

  printJson("Delegate Mapping", result.delegateMappings ?? []);
  printJson("Delegate Relation", result.delegates ?? []);
  printJson("Contributor", result.contributors ?? []);
  printJson("Recent DelegateChanged", result.delegateChangeds ?? []);
  printJson("Recent VotePowerCheckpoint", result.votePowerCheckpoints ?? []);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
