import { TextPlus } from "../src/internal/textplus";

const mockGenerateObject = jest.fn();
const mockCreateOpenRouter = jest.fn(
  (_config?: unknown) => (model: string) => model
);

jest.mock("ai", () => ({
  generateObject: (input: unknown) => mockGenerateObject(input),
}));

jest.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: (input: unknown) => mockCreateOpenRouter(input),
}));

describe("TextPlus", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_DEFAULT_MODEL;
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("extracts titles locally when AI features are unavailable", async () => {
    const textPlus = new TextPlus();

    await expect(
      textPlus.extractInfo("# Steward for Operations & Coordination\n\nBody copy")
    ).resolves.toEqual({
      title: "Steward for Operations & Coordination",
    });

    await expect(
      textPlus.extractInfo("Add 2,222,222 UP for Incentives on Uniswap + Gamma")
    ).resolves.toEqual({
      title: "Add 2,222,222 UP for Incentives on Uniswap + Gamma",
    });

    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it("prefers an AI-generated title when OpenRouter is configured", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_DEFAULT_MODEL = "openai/gpt-4.1-mini";
    mockGenerateObject.mockResolvedValue({
      object: { title: "AI curated title" },
    });

    const textPlus = new TextPlus();
    const result = await textPlus.extractInfo("# Local fallback title");

    expect(result).toEqual({ title: "AI curated title" });
    expect(mockCreateOpenRouter).toHaveBeenCalledWith({
      apiKey: "test-key",
    });
    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "openai/gpt-4.1-mini",
      })
    );
  });

  it("falls back to local extraction when AI generation errors", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    mockGenerateObject.mockRejectedValue(new Error("provider timeout"));

    const textPlus = new TextPlus();
    const result = await textPlus.extractInfo(
      "# Retroactive Funding August 2024"
    );

    expect(result).toEqual({
      title: "Retroactive Funding August 2024",
    });
    expect(console.error).toHaveBeenCalledWith(
      "Error generating title with AI. Falling back to local extraction.",
      expect.any(Error)
    );
  });
});
