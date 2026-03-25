import { ChainTool, ClockMode } from "../src/internal/chaintool";

describe("ChainTool", () => {
  const contractAddress = "0x1111111111111111111111111111111111111111" as const;
  const governorTokenAddress =
    "0x2222222222222222222222222222222222222222" as const;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns undefined for optional contract functions that are not available", async () => {
    const chainTool = new ChainTool();
    jest
      .spyOn(chainTool, "readContract")
      .mockRejectedValue(new Error("execution reverted: selector not found"));

    await expect(
      chainTool.readOptionalContract({
        chainId: 1,
        contractAddress,
        abi: [],
        functionName: "timelock",
      }),
    ).resolves.toBeUndefined();
  });

  it("resolves block-number timepoints to block timestamps in milliseconds", async () => {
    const chainTool = new ChainTool();
    const executeWithFallbacks = jest
      .spyOn(chainTool as any, "_executeWithFallbacks")
      .mockImplementation(async (_options: any, action: any) => {
        return action({
          getBlock: jest.fn().mockResolvedValue({ timestamp: 123n }),
        });
      }) as jest.Mock;

    await expect(
      chainTool.timepointToTimestampMs({
        chainId: 1,
        contractAddress,
        timepoint: 456n,
        clockMode: ClockMode.BlockNumber,
      }),
    ).resolves.toBe(123_000n);
    expect(executeWithFallbacks).toHaveBeenCalledTimes(1);
  });

  it("returns timestamp timepoints directly in milliseconds", async () => {
    const chainTool = new ChainTool();
    const executeWithFallbacks = jest.spyOn(
      chainTool as any,
      "_executeWithFallbacks",
    );

    await expect(
      chainTool.timepointToTimestampMs({
        chainId: 1,
        contractAddress,
        timepoint: 789n,
        clockMode: ClockMode.Timestamp,
      }),
    ).resolves.toBe(789_000n);
    expect(executeWithFallbacks).not.toHaveBeenCalled();
  });

  it("queries quorum with the proposal snapshot timepoint instead of a near-head fallback", async () => {
    const chainTool = new ChainTool();
    const readContractCalls: Array<{
      functionName: string;
      args?: readonly unknown[];
    }> = [];

    jest.spyOn(chainTool, "clockMode").mockResolvedValue(ClockMode.BlockNumber);
    const executeWithFallbacks = jest
      .spyOn(chainTool as any, "_executeWithFallbacks")
      .mockImplementation(async (_options: any, action: any) => {
        return action({
          readContract: jest.fn().mockImplementation(async (request) => {
            readContractCalls.push({
              functionName: request.functionName,
              args: request.args,
            });

            switch (request.functionName) {
              case "quorum":
                return 42n;
              case "decimals":
                return 18;
              default:
                throw new Error(`Unexpected function: ${request.functionName}`);
            }
          }),
        });
      }) as jest.Mock;

    await expect(
      chainTool.quorum({
        chainId: 1,
        contractAddress,
        governorTokenAddress,
        governorTokenStandard: "ERC20",
        timepoint: 999n,
      }),
    ).resolves.toEqual({
      clockMode: ClockMode.BlockNumber,
      quorum: 42n,
      decimals: 18n,
    });

    expect(executeWithFallbacks).toHaveBeenCalledTimes(2);
    expect(readContractCalls).toEqual([
      { functionName: "quorum", args: [999n] },
      { functionName: "decimals", args: undefined },
    ]);
  });
});
