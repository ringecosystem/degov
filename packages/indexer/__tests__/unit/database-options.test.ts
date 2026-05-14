import { getDatabaseOptions } from "../../src/database";

describe("database options", () => {
  const previousIsolationLevel = process.env.DEGOV_INDEXER_DATABASE_ISOLATION_LEVEL;

  afterEach(() => {
    if (previousIsolationLevel === undefined) {
      delete process.env.DEGOV_INDEXER_DATABASE_ISOLATION_LEVEL;
    } else {
      process.env.DEGOV_INDEXER_DATABASE_ISOLATION_LEVEL = previousIsolationLevel;
    }
  });

  it("keeps hot blocks enabled without overriding the default isolation level", () => {
    delete process.env.DEGOV_INDEXER_DATABASE_ISOLATION_LEVEL;
    const options = getDatabaseOptions();

    expect(options).toEqual({
      supportHotBlocks: true,
    });
    expect(options).not.toHaveProperty("isolationLevel");
  });

  it("allows overriding the database transaction isolation level", () => {
    process.env.DEGOV_INDEXER_DATABASE_ISOLATION_LEVEL = "READ COMMITTED";

    expect(getDatabaseOptions()).toEqual({
      supportHotBlocks: true,
      isolationLevel: "READ COMMITTED",
    });
  });
});
