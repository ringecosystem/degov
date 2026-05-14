import { getDatabaseOptions, wrapSerializationRetry } from "../../src/database";

describe("database options", () => {
  const hotBlocksEnabled = process.env.DEGOV_INDEXER_HOT_BLOCKS_ENABLED;

  afterEach(() => {
    if (hotBlocksEnabled === undefined) {
      delete process.env.DEGOV_INDEXER_HOT_BLOCKS_ENABLED;
    } else {
      process.env.DEGOV_INDEXER_HOT_BLOCKS_ENABLED = hotBlocksEnabled;
    }
  });

  it("keeps hot blocks disabled without overriding the default isolation level", () => {
    const options = getDatabaseOptions();

    expect(options).toEqual({
      supportHotBlocks: false,
    });
    expect(options).not.toHaveProperty("isolationLevel");
  });

  it("allows hot blocks to be enabled explicitly", () => {
    process.env.DEGOV_INDEXER_HOT_BLOCKS_ENABLED = "true";

    expect(getDatabaseOptions()).toEqual({
      supportHotBlocks: true,
    });
  });

  it("retries database serialization failures without changing isolation level", async () => {
    const calls: string[] = [];
    const database = wrapSerializationRetry(
      {
        async connect() {
          calls.push("connect");
          return {};
        },
        async submit(callback: () => Promise<string>) {
          calls.push("submit");
          if (calls.filter((item) => item === "submit").length === 1) {
            throw { code: "40001" };
          }
          return callback();
        },
      } as any,
      async () => undefined,
    );

    await expect((database as any).connect()).resolves.toEqual({});
    await expect((database as any).submit(async () => "ok")).resolves.toBe("ok");
    expect(calls).toEqual(["connect", "submit", "submit"]);
  });
});
