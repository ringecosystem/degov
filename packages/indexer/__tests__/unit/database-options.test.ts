import { getDatabaseOptions, wrapSerializationRetry } from "../../src/database";

describe("database options", () => {
  it("keeps hot blocks enabled without overriding the default isolation level", () => {
    const options = getDatabaseOptions();

    expect(options).toEqual({
      supportHotBlocks: true,
    });
    expect(options).not.toHaveProperty("isolationLevel");
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
