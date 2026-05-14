import { parseDebounceMs } from "../../src/onchain-refresh/task";

describe("onchain refresh task", () => {
  it("defaults debounce to two minutes", () => {
    expect(parseDebounceMs()).toBe(120_000n);
  });
});
