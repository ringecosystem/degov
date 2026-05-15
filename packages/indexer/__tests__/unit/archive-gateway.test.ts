import {
  fallbackRpcEndBlock,
  shouldUseArchiveGateway,
} from "../../src/archive-gateway";

describe("archive gateway selection", () => {
  it("skips archive when the next worker block is unavailable", async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () =>
        "not ready to serve block 13644700 of dataset ethereum-mainnet",
    });

    const decision = await shouldUseArchiveGateway({
      gateway: "https://v2.archive.subsquid.io/network/ethereum-mainnet",
      nextBlock: 13644700,
      fetchFn,
    });

    expect(decision.useGateway).toBe(false);
    expect(decision.reason).toBe("archive worker unavailable");
    expect(fetchFn).toHaveBeenCalledWith(
      "https://v2.archive.subsquid.io/network/ethereum-mainnet/13644700/worker",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("limits RPC fallback to a bounded block range", () => {
    expect(fallbackRpcEndBlock({ nextBlock: 13644700 })).toBe(13654699);
    expect(
      fallbackRpcEndBlock({
        nextBlock: 13644700,
        configuredEndBlock: 13644710,
      }),
    ).toBe(13644710);
  });
});
