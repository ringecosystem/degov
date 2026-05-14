import {
  isPostgresSerializationFailure,
  serializationRetryDelayMs,
} from "../../src/internal/retry";

describe("retry helpers", () => {
  it("detects postgres serialization failures", () => {
    expect(isPostgresSerializationFailure({ code: "40001" })).toBe(true);
    expect(
      isPostgresSerializationFailure({ driverError: { code: "40001" } }),
    ).toBe(true);
    expect(
      isPostgresSerializationFailure({
        message: "could not serialize access due to read/write dependencies",
      }),
    ).toBe(true);
    expect(isPostgresSerializationFailure({ code: "23505" })).toBe(false);
    expect(isPostgresSerializationFailure(new Error("network failed"))).toBe(false);
  });

  it("caps serialization retry delay", () => {
    expect(serializationRetryDelayMs(0)).toBe(5_000);
    expect(serializationRetryDelayMs(2)).toBe(10_000);
    expect(serializationRetryDelayMs(20)).toBe(60_000);
  });
});
