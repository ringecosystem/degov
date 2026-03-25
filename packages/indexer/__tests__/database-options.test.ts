import { getDatabaseOptions } from "../src/database";

describe("database options", () => {
  it("keeps hot blocks enabled without overriding the default isolation level", () => {
    const options = getDatabaseOptions();

    expect(options).toEqual({
      supportHotBlocks: true,
    });
    expect(options).not.toHaveProperty("isolationLevel");
  });
});
