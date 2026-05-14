import {
  loadKnownTokenAccounts,
  OnchainPowerReconcileOptions,
  QueryableDataSource,
} from "../reconcile";
import { upsertOnchainRefreshTask } from "./task";

export interface SeedReconcileOnchainRefreshTasksOptions
  extends OnchainPowerReconcileOptions {
  blockNumber: bigint;
  blockTimestamp: bigint;
  now?: bigint;
  chunkSize?: number;
}

export async function seedReconcileOnchainRefreshTasks(
  dataSource: QueryableDataSource,
  options: SeedReconcileOnchainRefreshTasksOptions,
) {
  const accounts = await loadKnownTokenAccounts(dataSource, options);
  let alreadySeeded = 0;
  let seeded = 0;

  for (const accountChunk of chunk(accounts, options.chunkSize ?? 500)) {
    const seededAccounts = await loadReconcileSeededAccounts(
      dataSource,
      options,
      accountChunk,
    );
    alreadySeeded += seededAccounts.size;

    for (const account of accountChunk) {
      if (seededAccounts.has(account.toLowerCase())) {
        continue;
      }

      await upsertOnchainRefreshTask(dataSource, {
        chainId: options.chainId,
        daoCode: options.daoCode,
        governorAddress: options.governorAddress,
        tokenAddress: options.tokenAddress,
        account,
        refreshBalance: true,
        refreshPower: true,
        reason: "reconcile",
        blockNumber: options.blockNumber,
        blockTimestamp: options.blockTimestamp,
        transactionHash: "reconcile",
        now: options.now,
        debounceMs: 0n,
      });
      seeded += 1;
    }
  }

  return {
    accountsKnown: accounts.length,
    alreadySeeded,
    seeded,
  };
}

async function loadReconcileSeededAccounts(
  dataSource: QueryableDataSource,
  options: SeedReconcileOnchainRefreshTasksOptions,
  accounts: string[],
): Promise<Set<string>> {
  if (accounts.length === 0) {
    return new Set();
  }

  const rows = await dataSource.query(
    `
      SELECT lower(account) AS account
      FROM onchain_refresh_task
      WHERE chain_id = $1
        AND lower(governor_address) = lower($2)
        AND lower(token_address) = lower($3)
        AND lower(account) = ANY($4::text[])
        AND EXISTS (
          SELECT 1
          FROM unnest(string_to_array(reason, '+')) AS reason_item
          WHERE btrim(reason_item) = 'reconcile'
        )
    `,
    [
      options.chainId,
      options.governorAddress,
      options.tokenAddress,
      accounts.map((account) => account.toLowerCase()),
    ],
  );

  return new Set(rows.map((row) => String(row.account).toLowerCase()));
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  const normalizedSize = Math.max(1, size);
  for (let index = 0; index < items.length; index += normalizedSize) {
    chunks.push(items.slice(index, index + normalizedSize));
  }
  return chunks;
}
