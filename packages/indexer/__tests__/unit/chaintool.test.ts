import { ChainTool, ClockMode } from "../../src/internal/chaintool";

const mockCreatePublicClient = jest.fn();
const mockHttp = jest.fn((url: string) => ({ url }));

jest.mock("viem", () => ({
  createPublicClient: (config: unknown) => mockCreatePublicClient(config),
  http: (url: string) => mockHttp(url),
  webSocket: jest.fn(),
}));

describe("ChainTool", () => {
  const contractAddress = "0x1111111111111111111111111111111111111111" as const;
  const governorTokenAddress =
    "0x2222222222222222222222222222222222222222" as const;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("stops retrying deterministic contract call failures across RPC fallbacks", async () => {
    const chainTool = new ChainTool();
    let attempts = 0;
    const executeWithFallbacks = (chainTool as any)._executeWithFallbacks.bind(
      chainTool,
    );

    await expect(
      executeWithFallbacks(
        {
          chainId: 999999,
          rpcs: [
            "https://rpc-1.example",
            "https://rpc-2.example",
            "https://rpc-3.example",
          ],
        },
        async () => {
          attempts += 1;
          throw new Error(
            'The contract function "CLOCK_MODE" reverted.\nDetails: execution reverted',
          );
        },
      ),
    ).rejects.toThrow('The contract function "CLOCK_MODE" reverted.');

    expect(attempts).toBe(1);
  });

  it("keeps retrying transient RPC failures across fallback endpoints", async () => {
    const chainTool = new ChainTool();
    let attempts = 0;
    const executeWithFallbacks = (chainTool as any)._executeWithFallbacks.bind(
      chainTool,
    );

    await expect(
      executeWithFallbacks(
        {
          chainId: 999999,
          rpcs: [
            "https://rpc-1.example",
            "https://rpc-2.example",
            "https://rpc-3.example",
          ],
        },
        async () => {
          attempts += 1;
          throw new Error(
            'HTTP request failed.\nStatus: 429\nDetails: "Too many connections. Please try again later."',
          );
        },
      ),
    ).rejects.toThrow("All RPC requests failed for chain 999999.");

    expect(attempts).toBe(3);
  });

  it("falls back to blocknumber when CLOCK_MODE deterministically reverts", async () => {
    const deterministicChainTool = new ChainTool();

    jest
      .spyOn(deterministicChainTool as any, "_executeWithFallbacks")
      .mockRejectedValue(
        new Error(
          'The contract function "CLOCK_MODE" reverted.\nDetails: execution reverted',
        ),
      );

    await expect(
      deterministicChainTool.clockMode({
        chainId: 1,
        contractAddress: "0x323A76393544d5ecca80cd6ef2A560C6a395b7E3",
      }),
    ).resolves.toBe(ClockMode.BlockNumber);
  });

  it("aggregates successful block intervals across RPCs and caches the result", async () => {
    mockCreatePublicClient.mockImplementation(({ transport }) => ({
      rpcUrl: transport.url,
    }));

    const chainTool = new ChainTool();
    const intervalSpy = jest.spyOn<any, any>(
      chainTool as any,
      "_calculateIntervalForSingleRpc",
    );
    intervalSpy.mockImplementation(async (...args: any[]) => {
      const client = args[0] as { rpcUrl: string };
      switch (client.rpcUrl) {
        case "https://rpc-primary.example":
          return 3;
        case "https://rpc-secondary.example":
          return 5;
        default:
          throw new Error("upstream timeout");
      }
    });

    const result = await chainTool.blockIntervalSeconds({
      chainId: 999999,
      rpcs: [
        "wss://rpc-primary.example",
        "https://rpc-failing.example",
        "https://rpc-secondary.example",
      ],
      enableFloatValue: true,
    });

    expect(result).toBe(4);
    expect(mockHttp).toHaveBeenNthCalledWith(1, "https://rpc-primary.example");
    expect(mockHttp).toHaveBeenNthCalledWith(2, "https://rpc-failing.example");
    expect(mockHttp).toHaveBeenNthCalledWith(3, "https://rpc-secondary.example");
    expect(intervalSpy).toHaveBeenCalledTimes(3);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("https://rpc-failing.example"),
    );

    intervalSpy.mockClear();

    const cachedResult = await chainTool.blockIntervalSeconds({
      chainId: 999999,
      rpcs: [
        "wss://rpc-primary.example",
        "https://rpc-failing.example",
        "https://rpc-secondary.example",
      ],
      enableFloatValue: true,
    });

    expect(cachedResult).toBe(4);
    expect(intervalSpy).not.toHaveBeenCalled();
  });

  it("uses clock fallback data to compute quorum and reuses a fresh cache entry", async () => {
    const quorumCalls: bigint[] = [];
    const fakeClient = {
      getBlock: jest.fn(async () => ({
        timestamp: 1000n,
        number: 250n,
      })),
      readContract: jest.fn(
        async ({
          functionName,
          args,
        }: {
          functionName: string;
          args?: bigint[];
        }) => {
          switch (functionName) {
            case "CLOCK_MODE":
              return "mode=timestamp";
            case "clock":
              throw new Error("execution reverted: selector not found");
            case "quorum":
              quorumCalls.push(args?.[0] ?? 0n);
              return 77n;
            case "decimals":
              return 18;
            default:
              throw new Error(`Unexpected functionName: ${functionName}`);
          }
        },
      ),
    };

    const chainTool = new ChainTool();
    const executeSpy = jest.spyOn<any, any>(
      chainTool as any,
      "_executeWithFallbacks",
    );
    executeSpy.mockImplementation(async (...args: any[]) => {
      const action = args[1] as (client: typeof fakeClient) => Promise<unknown>;
      return action(fakeClient);
    });

    const options = {
      chainId: 1,
      contractAddress: "0x0000000000000000000000000000000000000001" as const,
      governorTokenAddress:
        "0x0000000000000000000000000000000000000002" as const,
    };

    const result = await chainTool.quorum(options);

    expect(result).toEqual({
      clockMode: ClockMode.Timestamp,
      quorum: 77n,
      decimals: 18n,
    });
    expect(fakeClient.getBlock).toHaveBeenCalledTimes(1);
    expect(quorumCalls).toEqual([820n]);
    expect(executeSpy).toHaveBeenCalledTimes(5);

    const cachedResult = await chainTool.quorum(options);

    expect(cachedResult).toEqual(result);
    expect(executeSpy).toHaveBeenCalledTimes(5);
  });

  it("serves stale cached quorum data when refresh fails", async () => {
    const chainTool = new ChainTool();
    const cachedResult = {
      clockMode: ClockMode.BlockNumber,
      quorum: 55n,
      decimals: 0n,
    };

    (
      chainTool as unknown as {
        quorumCache: Map<
          string,
          { result: typeof cachedResult; timestamp: number }
        >;
      }
    ).quorumCache.set(`1:0x0000000000000000000000000000000000000003:latest`, {
      result: cachedResult,
      timestamp: Date.now() - 31 * 60 * 1000,
    });

    const executeSpy = jest.spyOn<any, any>(
      chainTool as any,
      "_executeWithFallbacks",
    );
    executeSpy.mockRejectedValue(new Error("RPCs unavailable"));

    const result = await chainTool.quorum({
      chainId: 1,
      contractAddress: "0x0000000000000000000000000000000000000003",
      governorTokenAddress:
        "0x0000000000000000000000000000000000000004",
      governorTokenStandard: "ERC721",
    });

    expect(result).toEqual(cachedResult);
    expect(console.error).toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("chaintool.quorum cache used"),
    );
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

  it("returns undefined when optional contract reads fail through RPC fallback wrapping", async () => {
    const chainTool = new ChainTool();
    jest.spyOn(chainTool, "readContract").mockRejectedValue(
      new Error(
        'All RPC requests failed for chain 46. Last error: The contract function "GRACE_PERIOD" reverted with the following reason:\nVM Exception while processing transaction: revert',
      ),
    );

    await expect(
      chainTool.readOptionalContract({
        chainId: 46,
        contractAddress,
        abi: [],
        functionName: "GRACE_PERIOD",
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
    jest.spyOn(chainTool, "currentClock").mockResolvedValue({
      clockMode: ClockMode.BlockNumber,
      timepoint: 1_500n,
      timestampMs: 1_500_000n,
    });
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

  it("clamps future quorum checkpoints to a safe past timepoint", async () => {
    const chainTool = new ChainTool();
    const readContractCalls: Array<{
      functionName: string;
      args?: readonly unknown[];
    }> = [];

    jest.spyOn(chainTool, "clockMode").mockResolvedValue(ClockMode.Timestamp);
    jest.spyOn(chainTool, "currentClock").mockResolvedValue({
      clockMode: ClockMode.Timestamp,
      timepoint: 1_000n,
      timestampMs: 1_000_000n,
    });
    jest
      .spyOn(chainTool as any, "_executeWithFallbacks")
      .mockImplementation(async (_options: any, action: any) =>
        action({
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
        }),
      );

    await expect(
      chainTool.quorum({
        chainId: 8453,
        contractAddress,
        governorTokenAddress,
        governorTokenStandard: "ERC20",
        timepoint: 1_200n,
      }),
    ).resolves.toEqual({
      clockMode: ClockMode.Timestamp,
      quorum: 42n,
      decimals: 18n,
    });

    expect(readContractCalls).toEqual([
      { functionName: "quorum", args: [999n] },
      { functionName: "decimals", args: undefined },
    ]);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("chaintool.quorum timepoint clamped"),
    );
  });

  it("treats ERC721 governor tokens as zero-decimal without calling decimals()", async () => {
    const chainTool = new ChainTool();
    const readContractCalls: Array<{
      functionName: string;
      args?: readonly unknown[];
    }> = [];

    jest.spyOn(chainTool, "clockMode").mockResolvedValue(ClockMode.BlockNumber);
    jest.spyOn(chainTool, "currentClock").mockResolvedValue({
      clockMode: ClockMode.BlockNumber,
      timepoint: 500n,
      timestampMs: 500_000n,
    });
    const executeWithFallbacks = jest
      .spyOn(chainTool as any, "_executeWithFallbacks")
      .mockImplementation(async (_options: any, action: any) => {
        return action({
          readContract: jest.fn().mockImplementation(async (request) => {
            readContractCalls.push({
              functionName: request.functionName,
              args: request.args,
            });

            if (request.functionName === "quorum") {
              return 7n;
            }

            throw new Error(`Unexpected function: ${request.functionName}`);
          }),
        });
      }) as jest.Mock;

    await expect(
      chainTool.quorum({
        chainId: 1,
        contractAddress,
        governorTokenAddress,
        governorTokenStandard: "ERC721",
        timepoint: 123n,
      }),
    ).resolves.toEqual({
      clockMode: ClockMode.BlockNumber,
      quorum: 7n,
      decimals: 0n,
    });

    expect(executeWithFallbacks).toHaveBeenCalledTimes(1);
    expect(readContractCalls).toEqual([
      { functionName: "quorum", args: [123n] },
    ]);
  });

  it("falls back to latest block when clock is unavailable", async () => {
    const chainTool = new ChainTool();
    jest.spyOn(chainTool, "clockMode").mockResolvedValue(ClockMode.BlockNumber);
    jest
      .spyOn(chainTool, "readContract")
      .mockRejectedValue(new Error("execution reverted: selector not found"));
    jest.spyOn(chainTool as any, "_executeWithFallbacks").mockImplementation(
      async (_options: any, action: any) =>
        action({
          getBlock: jest.fn().mockResolvedValue({
            number: 321n,
            timestamp: 654n,
          }),
        })
    );

    await expect(
      chainTool.currentClock({
        chainId: 1,
        contractAddress,
      })
    ).resolves.toEqual({
      clockMode: ClockMode.BlockNumber,
      timepoint: 321n,
      timestampMs: 654_000n,
    });
  });

  it("falls back to latest block when clock deterministically reverts", async () => {
    const chainTool = new ChainTool();
    jest.spyOn(chainTool, "clockMode").mockResolvedValue(ClockMode.BlockNumber);
    jest
      .spyOn(chainTool, "readContract")
      .mockRejectedValue(new Error('The contract function "clock" reverted.'));
    jest.spyOn(chainTool as any, "_executeWithFallbacks").mockImplementation(
      async (_options: any, action: any) =>
        action({
          getBlock: jest.fn().mockResolvedValue({
            number: 987n,
            timestamp: 111n,
          }),
        }),
    );

    await expect(
      chainTool.currentClock({
        chainId: 1,
        contractAddress,
      }),
    ).resolves.toEqual({
      clockMode: ClockMode.BlockNumber,
      timepoint: 987n,
      timestampMs: 111_000n,
    });
  });

  it("uses getPriorVotes when getPastVotes is unavailable", async () => {
    const chainTool = new ChainTool();
    const readContract = jest.spyOn(chainTool, "readContract");

    readContract
      .mockRejectedValueOnce(new Error("execution reverted: selector not found"))
      .mockResolvedValueOnce(77n as never);

    await expect(
      chainTool.historicalVotes({
        chainId: 1,
        contractAddress,
        account: "0x3333333333333333333333333333333333333333",
        timepoint: 123n,
      })
    ).resolves.toEqual({
      method: "getPriorVotes",
      votes: 77n,
    });

    expect(readContract).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        functionName: "getPriorVotes",
        args: ["0x3333333333333333333333333333333333333333", 123n],
      })
    );
  });
});
