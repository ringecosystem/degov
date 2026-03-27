import { ChainTool, ClockMode } from "../src/internal/chaintool";

const mockCreatePublicClient = jest.fn();
const mockHttp = jest.fn((url: string) => ({ url }));

jest.mock("viem", () => ({
  createPublicClient: (config: unknown) => mockCreatePublicClient(config),
  http: (url: string) => mockHttp(url),
  webSocket: jest.fn(),
}));

describe("ChainTool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("aggregates successful block intervals across RPCs and caches the result", async () => {
    mockCreatePublicClient.mockImplementation(({ transport }) => ({
      rpcUrl: transport.url,
    }));

    const chainTool = new ChainTool();
    const intervalSpy = jest.spyOn<any, any>(
      chainTool as any,
      "_calculateIntervalForSingleRpc"
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
      expect.stringContaining("https://rpc-failing.example failed")
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
              throw new Error("clock unavailable");
            case "quorum":
              quorumCalls.push(args?.[0] ?? 0n);
              return 77n;
            case "decimals":
              return 18;
            default:
              throw new Error(`Unexpected functionName: ${functionName}`);
          }
        }
      ),
    };

    const chainTool = new ChainTool();
    const executeSpy = jest.spyOn<any, any>(
      chainTool as any,
      "_executeWithFallbacks"
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
    ).quorumCache.set(`1:0x0000000000000000000000000000000000000003`, {
      result: cachedResult,
      timestamp: Date.now() - 31 * 60 * 1000,
    });

    const executeSpy = jest.spyOn<any, any>(
      chainTool as any,
      "_executeWithFallbacks"
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
      expect.stringContaining("Serving stale quorum data")
    );
  });
});
