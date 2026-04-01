import "reflect-metadata";

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { DataSource } from "typeorm";

import { DegovDataSource } from "./datasource";
import {
  ChainTool,
  ClockMode,
  HistoricalVotesResult,
} from "./internal/chaintool";
import {
  compareScalarField,
  deriveProjectedProposalState,
  governorStateName,
  ProjectedProposalState,
  ReconciliationCheck,
} from "./internal/reconciliation";

interface ReconcileCliOptions {
  configPath: string;
  outputPath: string;
  proposalSampleLimit: number;
  voteSamplesPerProposal: number;
  proposalIds?: string[];
}

interface ProjectionProposalRow {
  proposalId: string;
  proposalSnapshot: string;
  proposalDeadline: string;
  queueReadyAt: string | null;
  queueExpiresAt: string | null;
  quorum: string;
  clockMode: string;
  timelockAddress: string | null;
  votesFor: string | null;
  votesAgainst: string | null;
  votesAbstain: string | null;
  hasCanceledEvent: boolean;
  hasExecutedEvent: boolean;
  hasQueuedEvent: boolean;
}

interface ProposalCoverageCounts {
  proposalActions: number;
  proposalStateEpochs: number;
  governanceParameterCheckpoints: number;
  votePowerCheckpoints: number;
  timelockOperations: number;
}

interface VotePowerSampleResult {
  account: string;
  projectedVotes?: string;
  onChainVotes: string;
  method: HistoricalVotesResult["method"];
  matches: boolean;
}

interface ProposalReconciliationResult {
  proposalId: string;
  projectedState: ProjectedProposalState;
  onChainState: string;
  checks: ReconciliationCheck<string>[];
  voteSamples: VotePowerSampleResult[];
}

function parseArgs(argv: string[]): ReconcileCliOptions {
  const options: ReconcileCliOptions = {
    configPath: process.env.DEGOV_CONFIG_PATH ?? "../../degov.yml",
    outputPath: path.resolve(
      process.cwd(),
      "artifacts/reconciliation/latest.json"
    ),
    proposalSampleLimit: 25,
    voteSamplesPerProposal: 5,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    switch (current) {
      case "--config":
        options.configPath = next;
        index += 1;
        break;
      case "--output":
        options.outputPath = path.resolve(process.cwd(), next);
        index += 1;
        break;
      case "--proposal-sample-limit":
        options.proposalSampleLimit = Number(next);
        index += 1;
        break;
      case "--vote-samples":
        options.voteSamplesPerProposal = Number(next);
        index += 1;
        break;
      case "--proposal-ids":
        options.proposalIds = next
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
        index += 1;
        break;
      default:
        break;
    }
  }

  if (!options.configPath) {
    throw new Error("Missing --config or DEGOV_CONFIG_PATH");
  }

  if (!Number.isInteger(options.proposalSampleLimit) || options.proposalSampleLimit <= 0) {
    throw new Error("--proposal-sample-limit must be a positive integer");
  }

  if (!Number.isInteger(options.voteSamplesPerProposal) || options.voteSamplesPerProposal <= 0) {
    throw new Error("--vote-samples must be a positive integer");
  }

  return options;
}

function toBigInt(value: string | number | bigint | null | undefined): bigint {
  if (value === null || value === undefined) {
    return 0n;
  }

  if (typeof value === "bigint") {
    return value;
  }

  return BigInt(value);
}

function normalizeAddress(value: string | null | undefined): string | undefined {
  return value ? value.toLowerCase() : undefined;
}

async function createDatabaseConnection(): Promise<DataSource> {
  const databaseUrl = process.env.DATABASE_URL;
  const ssl = process.env.DB_SSL === "true";
  const dataSource = new DataSource(
    databaseUrl
      ? {
          type: "postgres",
          url: databaseUrl,
          ssl,
        }
      : {
          type: "postgres",
          host: process.env.DB_HOST ?? "localhost",
          port: Number(process.env.DB_PORT ?? 5432),
          username: process.env.DB_USER ?? "postgres",
          password: process.env.DB_PASS ?? "postgres",
          database: process.env.DB_NAME ?? "squid",
          ssl,
        }
  );

  await dataSource.initialize();
  return dataSource;
}

async function loadProjectionRows(
  dataSource: DataSource,
  chainId: number,
  governorAddress: string,
  proposalSampleLimit: number,
  proposalIds?: string[]
): Promise<ProjectionProposalRow[]> {
  const filters: string[] = [
    `p.chain_id = $1`,
    `lower(p.governor_address) = lower($2)`,
    `p.proposal_snapshot IS NOT NULL`,
    `p.proposal_deadline IS NOT NULL`,
  ];
  const params: unknown[] = [chainId, governorAddress];

  if (proposalIds && proposalIds.length > 0) {
    filters.push(`p.proposal_id = ANY($3)`);
    params.push(proposalIds);
  }

  params.push(proposalSampleLimit);
  const limitPosition = params.length;

  return dataSource.query(
    `
      SELECT
        p.proposal_id AS "proposalId",
        p.proposal_snapshot AS "proposalSnapshot",
        p.proposal_deadline AS "proposalDeadline",
        p.queue_ready_at AS "queueReadyAt",
        p.queue_expires_at AS "queueExpiresAt",
        p.quorum AS "quorum",
        p.clock_mode AS "clockMode",
        p.timelock_address AS "timelockAddress",
        COALESCE(p.metrics_votes_weight_for_sum, 0) AS "votesFor",
        COALESCE(p.metrics_votes_weight_against_sum, 0) AS "votesAgainst",
        COALESCE(p.metrics_votes_weight_abstain_sum, 0) AS "votesAbstain",
        EXISTS (
          SELECT 1
          FROM proposal_canceled pc
          WHERE pc.chain_id = p.chain_id
            AND lower(pc.governor_address) = lower(p.governor_address)
            AND pc.proposal_id = p.proposal_id
        ) AS "hasCanceledEvent",
        EXISTS (
          SELECT 1
          FROM proposal_executed pe
          WHERE pe.chain_id = p.chain_id
            AND lower(pe.governor_address) = lower(p.governor_address)
            AND pe.proposal_id = p.proposal_id
        ) AS "hasExecutedEvent",
        EXISTS (
          SELECT 1
          FROM proposal_queued pq
          WHERE pq.chain_id = p.chain_id
            AND lower(pq.governor_address) = lower(p.governor_address)
            AND pq.proposal_id = p.proposal_id
        ) AS "hasQueuedEvent"
      FROM proposal p
      WHERE ${filters.join(" AND ")}
      ORDER BY p.block_number DESC NULLS LAST
      LIMIT $${limitPosition}
    `,
    params
  );
}

async function loadCoverageCounts(
  dataSource: DataSource,
  chainId: number,
  governorAddress: string
): Promise<ProposalCoverageCounts> {
  const [row] = await dataSource.query(
    `
      SELECT
        (SELECT COUNT(*) FROM proposal_action WHERE chain_id = $1 AND lower(governor_address) = lower($2)) AS "proposalActions",
        (SELECT COUNT(*) FROM proposal_state_epoch WHERE chain_id = $1 AND lower(governor_address) = lower($2)) AS "proposalStateEpochs",
        (SELECT COUNT(*) FROM governance_parameter_checkpoint WHERE chain_id = $1 AND lower(governor_address) = lower($2)) AS "governanceParameterCheckpoints",
        (SELECT COUNT(*) FROM vote_power_checkpoint WHERE chain_id = $1 AND lower(governor_address) = lower($2)) AS "votePowerCheckpoints",
        (SELECT COUNT(*) FROM timelock_operation WHERE chain_id = $1 AND lower(governor_address) = lower($2)) AS "timelockOperations"
    `,
    [chainId, governorAddress]
  );

  return {
    proposalActions: Number(row.proposalActions ?? 0),
    proposalStateEpochs: Number(row.proposalStateEpochs ?? 0),
    governanceParameterCheckpoints: Number(
      row.governanceParameterCheckpoints ?? 0
    ),
    votePowerCheckpoints: Number(row.votePowerCheckpoints ?? 0),
    timelockOperations: Number(row.timelockOperations ?? 0),
  };
}

async function loadVoteSampleAccounts(
  dataSource: DataSource,
  chainId: number,
  governorAddress: string,
  tokenAddress: string,
  proposalId: string,
  clockMode: string,
  proposalSnapshot: bigint,
  limit: number
): Promise<string[]> {
  const voterRows = await dataSource.query(
    `
      SELECT DISTINCT voter AS account
      FROM vote_cast_group
      WHERE chain_id = $1
        AND lower(governor_address) = lower($2)
        AND ref_proposal_id = $3
      ORDER BY account ASC
      LIMIT $4
    `,
    [chainId, governorAddress, proposalId, limit]
  );

  const accounts = new Set<string>(
    voterRows.map((row: { account: string }) => row.account.toLowerCase())
  );

  if (accounts.size >= limit) {
    return [...accounts].slice(0, limit);
  }

  const checkpointRows = await dataSource.query(
    `
      SELECT DISTINCT ON (account) account
      FROM vote_power_checkpoint
      WHERE chain_id = $1
        AND lower(governor_address) = lower($2)
        AND lower(token_address) = lower($3)
        AND clock_mode = $4
        AND timepoint <= $5
      ORDER BY account ASC, timepoint DESC
      LIMIT $6
    `,
    [chainId, governorAddress, tokenAddress, clockMode, proposalSnapshot.toString(), limit]
  );

  checkpointRows.forEach((row: { account: string }) => {
    if (accounts.size < limit) {
      accounts.add(row.account.toLowerCase());
    }
  });

  return [...accounts];
}

async function loadProjectedVotePower(
  dataSource: DataSource,
  chainId: number,
  governorAddress: string,
  tokenAddress: string,
  clockMode: string,
  account: string,
  proposalSnapshot: bigint
): Promise<bigint | undefined> {
  const [row] = await dataSource.query(
    `
      SELECT new_power AS "newPower"
      FROM vote_power_checkpoint
      WHERE chain_id = $1
        AND lower(governor_address) = lower($2)
        AND lower(token_address) = lower($3)
        AND clock_mode = $4
        AND lower(account) = lower($5)
        AND timepoint <= $6
      ORDER BY timepoint DESC
      LIMIT 1
    `,
    [
      chainId,
      governorAddress,
      tokenAddress,
      clockMode,
      account,
      proposalSnapshot.toString(),
    ]
  );

  if (!row) {
    return undefined;
  }

  return BigInt(row.newPower);
}

async function reconcileProposal(
  dataSource: DataSource,
  chainTool: ChainTool,
  row: ProjectionProposalRow,
  context: {
    chainId: number;
    governorAddress: `0x${string}`;
    tokenAddress: `0x${string}`;
    tokenStandard: string;
    rpcs: string[];
    currentTimepoint: bigint;
    currentTimestampMs: bigint;
    voteSamplesPerProposal: number;
  }
): Promise<ProposalReconciliationResult> {
  const proposalIdAsBigInt = BigInt(row.proposalId);
  const [stateOnChain, snapshotOnChain, deadlineOnChain, quorumOnChain] =
    await Promise.all([
      chainTool.readContract<bigint>({
        chainId: context.chainId,
        contractAddress: context.governorAddress,
        rpcs: context.rpcs,
        abi: [
          {
            inputs: [{ internalType: "uint256", name: "proposalId", type: "uint256" }],
            name: "state",
            outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
            stateMutability: "view",
            type: "function",
          },
        ],
        functionName: "state",
        args: [proposalIdAsBigInt],
      }),
      chainTool.readContract<bigint>({
        chainId: context.chainId,
        contractAddress: context.governorAddress,
        rpcs: context.rpcs,
        abi: [
          {
            inputs: [{ internalType: "uint256", name: "proposalId", type: "uint256" }],
            name: "proposalSnapshot",
            outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
            stateMutability: "view",
            type: "function",
          },
        ],
        functionName: "proposalSnapshot",
        args: [proposalIdAsBigInt],
      }),
      chainTool.readContract<bigint>({
        chainId: context.chainId,
        contractAddress: context.governorAddress,
        rpcs: context.rpcs,
        abi: [
          {
            inputs: [{ internalType: "uint256", name: "proposalId", type: "uint256" }],
            name: "proposalDeadline",
            outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
            stateMutability: "view",
            type: "function",
          },
        ],
        functionName: "proposalDeadline",
        args: [proposalIdAsBigInt],
      }),
      chainTool.quorum({
        chainId: context.chainId,
        contractAddress: context.governorAddress,
        rpcs: context.rpcs,
        governorTokenAddress: context.tokenAddress,
        governorTokenStandard: context.tokenStandard === "ERC721" ? "ERC721" : "ERC20",
        timepoint: BigInt(row.proposalSnapshot),
      }),
    ]);

  const projectedState = deriveProjectedProposalState({
    clockMode:
      row.clockMode === ClockMode.Timestamp
        ? ClockMode.Timestamp
        : ClockMode.BlockNumber,
    proposalSnapshot: BigInt(row.proposalSnapshot),
    proposalDeadline: BigInt(row.proposalDeadline),
    quorum: BigInt(row.quorum),
    votesFor: toBigInt(row.votesFor),
    votesAgainst: toBigInt(row.votesAgainst),
    votesAbstain: toBigInt(row.votesAbstain),
    currentTimepoint: context.currentTimepoint,
    currentTimestampMs: context.currentTimestampMs,
    hasCanceledEvent: row.hasCanceledEvent,
    hasExecutedEvent: row.hasExecutedEvent,
    hasQueuedEvent: row.hasQueuedEvent,
    queueReadyAt: row.queueReadyAt ? BigInt(row.queueReadyAt) : undefined,
    queueExpiresAt: row.queueExpiresAt ? BigInt(row.queueExpiresAt) : undefined,
    timelockAddress: row.timelockAddress,
  });

  const checks: ReconciliationCheck<string>[] = [
    compareScalarField("state", projectedState, governorStateName(stateOnChain)),
    compareScalarField(
      "proposalSnapshot",
      BigInt(row.proposalSnapshot).toString(),
      snapshotOnChain.toString()
    ),
    compareScalarField(
      "proposalDeadline",
      BigInt(row.proposalDeadline).toString(),
      deadlineOnChain.toString()
    ),
    compareScalarField("quorum", BigInt(row.quorum).toString(), quorumOnChain.quorum.toString()),
  ];

  const sampleAccounts = await loadVoteSampleAccounts(
    dataSource,
    context.chainId,
    context.governorAddress,
    context.tokenAddress,
    row.proposalId,
    row.clockMode,
    BigInt(row.proposalSnapshot),
    context.voteSamplesPerProposal
  );

  const voteSamples = await Promise.all(
    sampleAccounts.map(async (account) => {
      const [projectedVotes, onChainVotes] = await Promise.all([
        loadProjectedVotePower(
          dataSource,
          context.chainId,
          context.governorAddress,
          context.tokenAddress,
          row.clockMode,
          account,
          BigInt(row.proposalSnapshot)
        ),
        chainTool.historicalVotes({
          chainId: context.chainId,
          contractAddress: context.tokenAddress,
          rpcs: context.rpcs,
          account: account as `0x${string}`,
          timepoint: BigInt(row.proposalSnapshot),
        }),
      ]);

      return {
        account,
        projectedVotes: projectedVotes?.toString(),
        onChainVotes: onChainVotes.votes.toString(),
        method: onChainVotes.method,
        matches:
          projectedVotes !== undefined && projectedVotes === onChainVotes.votes,
      };
    })
  );

  return {
    proposalId: row.proposalId,
    projectedState,
    onChainState: governorStateName(stateOnChain),
    checks,
    voteSamples,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const config = await DegovDataSource.fromDegovConfigPath(options.configPath);
  const work = config.works[0];
  const governor = work.contracts.find((item) => item.name === "governor");
  const governorToken = work.contracts.find(
    (item) => item.name === "governorToken"
  );

  if (!governor || !governorToken) {
    throw new Error("Governor and governorToken must exist in the selected config");
  }

  const chainTool = new ChainTool();
  const currentClock = await chainTool.currentClock({
    chainId: config.chainId,
    contractAddress: governor.address,
    rpcs: config.rpcs,
  });
  const dataSource = await createDatabaseConnection();

  try {
    const [projectionRows, coverage] = await Promise.all([
      loadProjectionRows(
        dataSource,
        config.chainId,
        governor.address,
        options.proposalSampleLimit,
        options.proposalIds
      ),
      loadCoverageCounts(dataSource, config.chainId, governor.address),
    ]);

    if (projectionRows.length === 0) {
      throw new Error("No proposals found for reconciliation in the selected scope");
    }

    const proposals = await Promise.all(
      projectionRows.map((row) =>
        reconcileProposal(dataSource, chainTool, row, {
          chainId: config.chainId,
          governorAddress: governor.address,
          tokenAddress: governorToken.address,
          tokenStandard: (governorToken.standard ?? "ERC20").toUpperCase(),
          rpcs: config.rpcs,
          currentTimepoint: currentClock.timepoint,
          currentTimestampMs: currentClock.timestampMs,
          voteSamplesPerProposal: options.voteSamplesPerProposal,
        })
      )
    );

    const fieldChecks = proposals.flatMap((proposal) => proposal.checks);
    const voteSamples = proposals.flatMap((proposal) => proposal.voteSamples);
    const summary = {
      proposalsChecked: proposals.length,
      fieldChecks: fieldChecks.length,
      fieldMismatches: fieldChecks.filter((item) => !item.matches).length,
      voteSamplesChecked: voteSamples.length,
      voteSampleMismatches: voteSamples.filter((item) => !item.matches).length,
    };

    const output = {
      generatedAt: new Date().toISOString(),
      configPath: path.resolve(process.cwd(), options.configPath),
      daoCode: work.daoCode,
      chainId: config.chainId,
      governorAddress: governor.address,
      governorTokenAddress: governorToken.address,
      governorTokenStandard: governorToken.standard ?? "ERC20",
      currentClock,
      coverage,
      summary,
      proposals,
    };

    await mkdir(path.dirname(options.outputPath), { recursive: true });
    await writeFile(options.outputPath, JSON.stringify(output, null, 2) + "\n");

    console.log(
      JSON.stringify(
        {
          outputPath: options.outputPath,
          ...summary,
        },
        null,
        2
      )
    );

    process.exitCode =
      summary.fieldMismatches === 0 && summary.voteSampleMismatches === 0
        ? 0
        : 1;
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
