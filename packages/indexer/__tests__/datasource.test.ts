import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { DegovDataSource } from "../src/datasource";

describe("DegovDataSource", () => {
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
});
