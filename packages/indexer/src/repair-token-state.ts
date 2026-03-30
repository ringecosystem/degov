import "reflect-metadata";

import path from "path";
import { DataSource } from "typeorm";

import { DegovDataSource } from "./datasource";
import {
  aggregateContributorsFromMappings,
  countRepairedContributorRows,
  resolveRepairedDelegationPower,
  selectEffectiveDelegations,
} from "./internal/token-state-repair";

const zeroAddress = "0x0000000000000000000000000000000000000000";

interface RepairCliOptions {
  configPath: string;
}

interface RepairSourceRow {
  delegator: string;
  toDelegate: string;
  power: string | null;
  daoCode: string | null;
  governorAddress: string | null;
  tokenAddress: string | null;
  contractAddress: string | null;
  logIndex: number | null;
  transactionIndex: number | null;
  blockNumber: string;
  blockTimestamp: string;
  transactionHash: string;
}

interface DelegateRow {
  id: string;
  fromDelegate: string;
  toDelegate: string;
  power: string;
  daoCode: string | null;
  governorAddress: string | null;
  tokenAddress: string | null;
  contractAddress: string | null;
  logIndex: number | null;
  transactionIndex: number | null;
  blockNumber: string;
  blockTimestamp: string;
  transactionHash: string;
}

interface ContributorRow {
  id: string;
  daoCode: string | null;
  governorAddress: string | null;
  tokenAddress: string | null;
  contractAddress: string | null;
  logIndex: number | null;
  transactionIndex: number | null;
  blockNumber: string;
  blockTimestamp: string;
  transactionHash: string;
  lastVoteBlockNumber: string | null;
  lastVoteTimestamp: string | null;
}

function parseArgs(argv: string[]): RepairCliOptions {
  const options: RepairCliOptions = {
    configPath: process.env.DEGOV_CONFIG_PATH ?? "../../degov.yml",
  };

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--config" && argv[index + 1]) {
      options.configPath = argv[index + 1];
      index += 1;
    }
  }

  return options;
}

function normalizeAddress(value: string | null | undefined): string | undefined {
  return value ? value.toLowerCase() : undefined;
}

function nonZeroAddress(value: string | null | undefined): string | undefined {
  const normalized = normalizeAddress(value);
  if (!normalized || normalized === zeroAddress) {
    return undefined;
  }
  return normalized;
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
        },
  );

  await dataSource.initialize();
  return dataSource;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const config = await DegovDataSource.fromDegovConfigPath(options.configPath);
  const work = config.works[0];
  const governor = work.contracts.find((contract) => contract.name === "governor");
  const token = work.contracts.find((contract) => contract.name === "governorToken");

  if (!governor?.address || !token?.address) {
    throw new Error("Repair requires both governor and governorToken addresses");
  }

  const chainId = config.chainId;
  const governorAddress = governor.address.toLowerCase();
  const tokenAddress = token.address.toLowerCase();

  const dataSource = await createDatabaseConnection();

  try {
    await dataSource.transaction(async (manager) => {
      const fallbackRows = (await manager.query(
        `
          SELECT DISTINCT ON (lower(dm.from))
            lower(dm.from) AS "delegator",
            lower(dm.to) AS "toDelegate",
            dm.power::text AS "power",
            dm.dao_code AS "daoCode",
            lower(dm.governor_address) AS "governorAddress",
            lower(dm.token_address) AS "tokenAddress",
            dm.contract_address AS "contractAddress",
            dm.log_index AS "logIndex",
            dm.transaction_index AS "transactionIndex",
            dm.block_number::text AS "blockNumber",
            dm.block_timestamp::text AS "blockTimestamp",
            dm.transaction_hash AS "transactionHash"
          FROM delegate_mapping dm
          WHERE dm.chain_id = $1
            AND lower(dm.governor_address) = lower($2)
            AND lower(dm.token_address) = lower($3)
          ORDER BY lower(dm.from), dm.block_number DESC, dm.transaction_index DESC NULLS LAST, dm.log_index DESC NULLS LAST, dm.id DESC
        `,
        [chainId, governorAddress, tokenAddress],
      )) as RepairSourceRow[];

      const latestChanges = (await manager.query(
        `
          SELECT DISTINCT ON (lower(dc.delegator))
            lower(dc.delegator) AS "delegator",
            lower(dc.to_delegate) AS "toDelegate",
            NULL::text AS "power",
            dc.dao_code AS "daoCode",
            lower(dc.governor_address) AS "governorAddress",
            lower(dc.token_address) AS "tokenAddress",
            dc.contract_address AS "contractAddress",
            dc.log_index AS "logIndex",
            dc.transaction_index AS "transactionIndex",
            dc.block_number::text AS "blockNumber",
            dc.block_timestamp::text AS "blockTimestamp",
            dc.transaction_hash AS "transactionHash"
          FROM delegate_changed dc
          WHERE dc.chain_id = $1
            AND lower(dc.governor_address) = lower($2)
            AND lower(dc.token_address) = lower($3)
          ORDER BY lower(dc.delegator), dc.block_number DESC, dc.transaction_index DESC NULLS LAST, dc.log_index DESC NULLS LAST, dc.id DESC
        `,
        [chainId, governorAddress, tokenAddress],
      )) as RepairSourceRow[];

      const sourceByDelegator = new Map<string, RepairSourceRow>();
      const fallbackByDelegator = new Map<string, RepairSourceRow>();
      for (const row of fallbackRows) {
        fallbackByDelegator.set(row.delegator, row);
        sourceByDelegator.set(row.delegator, row);
      }
      for (const row of latestChanges) {
        sourceByDelegator.set(row.delegator, row);
      }

      const effectiveDelegations = selectEffectiveDelegations({
        fallbackRows,
        latestChanges,
      });

      const delegateRows = (await manager.query(
        `
          SELECT
            d.id,
            lower(d.from_delegate) AS "fromDelegate",
            lower(d.to_delegate) AS "toDelegate",
            d.power::text AS "power",
            d.dao_code AS "daoCode",
            lower(d.governor_address) AS "governorAddress",
            lower(d.token_address) AS "tokenAddress",
            d.contract_address AS "contractAddress",
            d.log_index AS "logIndex",
            d.transaction_index AS "transactionIndex",
            d.block_number::text AS "blockNumber",
            d.block_timestamp::text AS "blockTimestamp",
            d.transaction_hash AS "transactionHash"
          FROM delegate d
          WHERE d.chain_id = $1
            AND lower(d.governor_address) = lower($2)
            AND lower(d.token_address) = lower($3)
        `,
        [chainId, governorAddress, tokenAddress],
      )) as DelegateRow[];

      const delegateRowById = new Map(
        delegateRows.map((row) => [row.id.toLowerCase(), row]),
      );

      await manager.query(
        `
          UPDATE delegate
          SET is_current = false,
              power = CASE WHEN power < 0 THEN 0 ELSE power END
          WHERE chain_id = $1
            AND lower(governor_address) = lower($2)
            AND lower(token_address) = lower($3)
        `,
        [chainId, governorAddress, tokenAddress],
      );

      for (const delegation of effectiveDelegations) {
        const relationId = `${delegation.delegator}_${delegation.toDelegate}`;
        const existing = delegateRowById.get(relationId);
        const source = sourceByDelegator.get(delegation.delegator);
        const repairedPower = resolveRepairedDelegationPower({
          existingPower: existing?.power,
          fallbackPower: fallbackByDelegator.get(delegation.delegator)?.power,
        });

        if (existing) {
          await manager.query(
            `
              UPDATE delegate
              SET is_current = true,
                  power = CASE WHEN power < 0 THEN 0 ELSE power END
              WHERE id = $1
            `,
            [relationId],
          );
          continue;
        }

        if (!source) {
          continue;
        }

        await manager.query(
          `
            INSERT INTO delegate (
              id, chain_id, dao_code, governor_address, token_address, contract_address,
              log_index, transaction_index, from_delegate, to_delegate, block_number,
              block_timestamp, transaction_hash, is_current, power
            )
            VALUES (
              $1, $2, $3, $4, $5, $6,
              $7, $8, $9, $10, $11::numeric,
              $12::numeric, $13, true, $14::numeric
            )
            ON CONFLICT (id) DO NOTHING
          `,
          [
            relationId,
            chainId,
            source.daoCode,
            source.governorAddress ?? governorAddress,
            source.tokenAddress ?? tokenAddress,
            source.contractAddress,
            source.logIndex,
            source.transactionIndex,
            delegation.delegator,
            delegation.toDelegate,
            source.blockNumber,
            source.blockTimestamp,
            source.transactionHash,
            repairedPower.toString(),
          ],
        );

        delegateRowById.set(relationId, {
          id: relationId,
          fromDelegate: delegation.delegator,
          toDelegate: delegation.toDelegate,
          power: repairedPower.toString(),
          daoCode: source.daoCode,
          governorAddress: source.governorAddress ?? governorAddress,
          tokenAddress: source.tokenAddress ?? tokenAddress,
          contractAddress: source.contractAddress,
          logIndex: source.logIndex,
          transactionIndex: source.transactionIndex,
          blockNumber: source.blockNumber,
          blockTimestamp: source.blockTimestamp,
          transactionHash: source.transactionHash,
        });
      }

      await manager.query(
        `
          DELETE FROM delegate_mapping
          WHERE chain_id = $1
            AND lower(governor_address) = lower($2)
            AND lower(token_address) = lower($3)
        `,
        [chainId, governorAddress, tokenAddress],
      );

      const repairedMappings = effectiveDelegations.map((delegation) => {
        const relationId = `${delegation.delegator}_${delegation.toDelegate}`;
        const delegateRow = delegateRowById.get(relationId);
        const source = sourceByDelegator.get(delegation.delegator) ?? delegateRow;

        return {
          delegator: delegation.delegator,
          toDelegate: delegation.toDelegate,
          power: resolveRepairedDelegationPower({
            existingPower: delegateRow?.power,
            fallbackPower: fallbackByDelegator.get(delegation.delegator)?.power,
          }),
          daoCode: source?.daoCode ?? work.daoCode,
          contractAddress: source?.contractAddress ?? token.address,
          logIndex: source?.logIndex ?? null,
          transactionIndex: source?.transactionIndex ?? null,
          blockNumber: source?.blockNumber ?? "0",
          blockTimestamp: source?.blockTimestamp ?? "0",
          transactionHash: source?.transactionHash ?? "0xrepair",
        };
      });

      for (const mapping of repairedMappings) {
        await manager.query(
          `
            INSERT INTO delegate_mapping (
              id, chain_id, dao_code, governor_address, token_address, contract_address,
              log_index, transaction_index, "from", "to", power, block_number,
              block_timestamp, transaction_hash
            )
            VALUES (
              $1, $2, $3, $4, $5, $6,
              $7, $8, $9, $10, $11::numeric, $12::numeric,
              $13::numeric, $14
            )
          `,
          [
            mapping.delegator,
            chainId,
            mapping.daoCode,
            governorAddress,
            tokenAddress,
            mapping.contractAddress,
            mapping.logIndex,
            mapping.transactionIndex,
            mapping.delegator,
            mapping.toDelegate,
            mapping.power.toString(),
            mapping.blockNumber,
            mapping.blockTimestamp,
            mapping.transactionHash,
          ],
        );
      }

      const contributorRows = (await manager.query(
        `
          SELECT
            c.id,
            c.dao_code AS "daoCode",
            lower(c.governor_address) AS "governorAddress",
            lower(c.token_address) AS "tokenAddress",
            c.contract_address AS "contractAddress",
            c.log_index AS "logIndex",
            c.transaction_index AS "transactionIndex",
            c.block_number::text AS "blockNumber",
            c.block_timestamp::text AS "blockTimestamp",
            c.transaction_hash AS "transactionHash",
            c.last_vote_block_number::text AS "lastVoteBlockNumber",
            c.last_vote_timestamp::text AS "lastVoteTimestamp"
          FROM contributor c
          WHERE c.chain_id = $1
            AND lower(c.governor_address) = lower($2)
            AND lower(c.token_address) = lower($3)
        `,
        [chainId, governorAddress, tokenAddress],
      )) as ContributorRow[];

      const contributorRowById = new Map(
        contributorRows.map((row) => [row.id.toLowerCase(), row]),
      );

      const contributorAggregates = aggregateContributorsFromMappings(
        repairedMappings.map((mapping) => ({
          delegator: mapping.delegator,
          toDelegate: mapping.toDelegate,
          power: mapping.power,
        })),
      );
      const contributorAggregateById = new Map(
        contributorAggregates.map((aggregate) => [aggregate.contributorId, aggregate]),
      );

      for (const existing of contributorRows) {
        const aggregate = contributorAggregateById.get(existing.id.toLowerCase());
        await manager.query(
          `
            UPDATE contributor
            SET power = $2::numeric,
                delegates_count_all = $3,
                delegates_count_effective = $4
            WHERE id = $1
          `,
          [
            existing.id,
            aggregate?.power.toString() ?? "0",
            aggregate?.delegatesCountAll ?? 0,
            aggregate?.delegatesCountEffective ?? 0,
          ],
        );
      }

      for (const aggregate of contributorAggregates) {
        if (contributorRowById.has(aggregate.contributorId)) {
          continue;
        }

        const sourceMapping = repairedMappings.find(
          (mapping) => mapping.toDelegate === aggregate.contributorId,
        );
        if (!sourceMapping) {
          continue;
        }

        await manager.query(
          `
            INSERT INTO contributor (
              id, chain_id, dao_code, governor_address, token_address, contract_address,
              log_index, transaction_index, block_number, block_timestamp, transaction_hash,
              last_vote_block_number, last_vote_timestamp, power, delegates_count_all,
              delegates_count_effective
            )
            VALUES (
              $1, $2, $3, $4, $5, $6,
              $7, $8, $9::numeric, $10::numeric, $11,
              NULL, NULL, $12::numeric, $13, $14
            )
          `,
          [
            aggregate.contributorId,
            chainId,
            work.daoCode,
            governorAddress,
            tokenAddress,
            sourceMapping.contractAddress,
            sourceMapping.logIndex,
            sourceMapping.transactionIndex,
            sourceMapping.blockNumber,
            sourceMapping.blockTimestamp,
            sourceMapping.transactionHash,
            aggregate.power.toString(),
            aggregate.delegatesCountAll,
            aggregate.delegatesCountEffective,
          ],
        );
      }

      const totalPower = contributorAggregates.reduce(
        (sum, aggregate) => sum + aggregate.power,
        0n,
      );
      const repairedContributorCount = countRepairedContributorRows({
        existingContributorIds: contributorRows.map((row) => row.id),
        aggregateContributorIds: contributorAggregates.map(
          (aggregate) => aggregate.contributorId,
        ),
      });

      const dataMetricRows = await manager.query(
        `
          SELECT id
          FROM data_metric
          WHERE id = 'global'
            AND chain_id = $1
            AND lower(governor_address) = lower($2)
            AND lower(token_address) = lower($3)
          LIMIT 1
        `,
        [chainId, governorAddress, tokenAddress],
      );

      if (dataMetricRows.length === 0) {
        await manager.query(
          `
            INSERT INTO data_metric (
              id, chain_id, dao_code, governor_address, token_address, power_sum, member_count
            )
            VALUES ('global', $1, $2, $3, $4, $5::numeric, $6)
          `,
          [
            chainId,
            work.daoCode,
            governorAddress,
            tokenAddress,
            totalPower.toString(),
            repairedContributorCount,
          ],
        );
      } else {
        await manager.query(
          `
            UPDATE data_metric
            SET power_sum = $4::numeric,
                member_count = $5
            WHERE id = 'global'
              AND chain_id = $1
              AND lower(governor_address) = lower($2)
              AND lower(token_address) = lower($3)
          `,
          [
            chainId,
            governorAddress,
            tokenAddress,
            totalPower.toString(),
            repairedContributorCount,
          ],
        );
      }

      const negativeDelegateCount = await manager.query(
        `
          SELECT COUNT(*)::int AS count
          FROM delegate
          WHERE chain_id = $1
            AND lower(governor_address) = lower($2)
            AND lower(token_address) = lower($3)
            AND power < 0
        `,
        [chainId, governorAddress, tokenAddress],
      );

      console.log(
        JSON.stringify(
          {
            chainId,
            daoCode: work.daoCode,
            governorAddress,
            tokenAddress,
            repairedDelegations: effectiveDelegations.length,
            repairedContributors: contributorAggregates.length,
            negativeDelegateRowsAfterRepair: Number(negativeDelegateCount[0]?.count ?? 0),
          },
          null,
          2,
        ),
      );
    });
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
