import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { DegovDataSource } from "../../src/datasource";

describe("DegovDataSource", () => {
  const startBlockOverride = process.env.DEGOV_INDEXER_START_BLOCK;
  const endBlockOverride = process.env.DEGOV_INDEXER_END_BLOCK;

  afterEach(() => {
    if (startBlockOverride === undefined) {
      delete process.env.DEGOV_INDEXER_START_BLOCK;
    } else {
      process.env.DEGOV_INDEXER_START_BLOCK = startBlockOverride;
    }

    if (endBlockOverride === undefined) {
      delete process.env.DEGOV_INDEXER_END_BLOCK;
    } else {
      process.env.DEGOV_INDEXER_END_BLOCK = endBlockOverride;
    }
  });

  it("includes timeLock in indexed contracts", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "degov-datasource-"));
    const configPath = join(tempDir, "degov.yml");

    try {
      await writeFile(
        configPath,
        `
code: demo
chain:
  id: 46
  rpcs:
    - https://rpc.darwinia.network
indexer:
  startBlock: 1
contracts:
  governor: "0x1111111111111111111111111111111111111111"
  governorToken:
    address: "0x2222222222222222222222222222222222222222"
    standard: ERC20
  timeLock: "0x3333333333333333333333333333333333333333"
`
      );

      const config = await DegovDataSource.fromDegovConfigPath(configPath);

      expect(config.works[0].contracts).toEqual([
        {
          name: "governor",
          address: "0x1111111111111111111111111111111111111111",
          standard: undefined,
        },
        {
          name: "governorToken",
          address: "0x2222222222222222222222222222222222222222",
          standard: "ERC20",
        },
        {
          name: "timeLock",
          address: "0x3333333333333333333333333333333333333333",
          standard: undefined,
        },
      ]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("allows start and end block overrides from the environment", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "degov-datasource-"));
    const configPath = join(tempDir, "degov.yml");

    process.env.DEGOV_INDEXER_START_BLOCK = "100";
    process.env.DEGOV_INDEXER_END_BLOCK = "200";

    try {
      await writeFile(
        configPath,
        `
code: demo
chain:
  id: 46
  rpcs:
    - https://rpc.darwinia.network
indexer:
  startBlock: 1
  endBlock: 2
contracts:
  governor: "0x1111111111111111111111111111111111111111"
  governorToken:
    address: "0x2222222222222222222222222222222222222222"
    standard: ERC20
`
      );

      const config = await DegovDataSource.fromDegovConfigPath(configPath);

      expect(config.startBlock).toBe(100);
      expect(config.endBlock).toBe(200);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("preserves unquoted hex contract addresses as strings", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "degov-datasource-"));
    const configPath = join(tempDir, "degov.yml");

    try {
      await writeFile(
        configPath,
        `
code: demo
chain:
  id: 1
  rpcs:
    - https://ethereum-rpc.publicnode.com
indexer:
  startBlock: 21390346
contracts:
  governor: 0x7ae22bebF28366c328d5558E6Fad935487299DfE
  governorToken:
    address: 0x970C30646E5c95DC77A3D768C4362E113Ed92b5b
    standard: ERC20
  timeLock: 0xEd4f981249Dde7Cd3c295fc28CB934D4682d7ef9
`
      );

      const config = await DegovDataSource.fromDegovConfigPath(configPath);

      expect(config.works[0].contracts).toEqual([
        {
          name: "governor",
          address: "0x7ae22bebF28366c328d5558E6Fad935487299DfE",
          standard: undefined,
        },
        {
          name: "governorToken",
          address: "0x970C30646E5c95DC77A3D768C4362E113Ed92b5b",
          standard: "ERC20",
        },
        {
          name: "timeLock",
          address: "0xEd4f981249Dde7Cd3c295fc28CB934D4682d7ef9",
          standard: undefined,
        },
      ]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
