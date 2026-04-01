import { DegovIndexerHelpers } from "../../src/internal/helpers";

describe("DegovIndexerHelpers", () => {
  const originalVerboseLogs = process.env.DEGOV_INDEXER_VERBOSE_LOGS;

  afterEach(() => {
    if (originalVerboseLogs === undefined) {
      delete process.env.DEGOV_INDEXER_VERBOSE_LOGS;
      return;
    }

    process.env.DEGOV_INDEXER_VERBOSE_LOGS = originalVerboseLogs;
  });

  it("normalizes addresses to lowercase", () => {
    expect(
      DegovIndexerHelpers.normalizeAddress(
        "0xABCdefABCdefABCdefABCdefABCdefABCdefABCD"
      )
    ).toBe("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd");
    expect(DegovIndexerHelpers.normalizeAddress()).toBeUndefined();
  });

  it("finds normalized contract addresses by contract name", () => {
    expect(
      DegovIndexerHelpers.findContractAddress(
        {
          daoCode: "unlock-dao",
          contracts: [
            {
              name: "governor",
              address: "0xABCdefABCdefABCdefABCdefABCdefABCdefABCD",
            },
            {
              name: "governorToken",
              address: "0x1234512345123451234512345123451234512345",
            },
          ],
        },
        "governor"
      )
    ).toBe("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd");
  });

  it("builds a composite proposal scope lookup", () => {
    expect(
      DegovIndexerHelpers.proposalScopeWhere({
        chainId: 8453,
        governorAddress: "0xABCdefABCdefABCdefABCdefABCdefABCdefABCD",
        proposalId: "0x01",
      })
    ).toEqual({
      chainId: 8453,
      governorAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      proposalId: "0x01",
    });
  });

  it("formats log lines with compact ordered fields", () => {
    expect(
      DegovIndexerHelpers.formatLogLine("token.transfer recorded", {
        from: "0xabc",
        to: "0xdef",
        value: 42n,
        block: 123,
        note: "from mint",
        ignored: undefined,
      })
    ).toBe(
      'token.transfer recorded | from=0xabc to=0xdef value=42 block=123 note="from mint"'
    );
  });

  it("formats errors without leaking object noise", () => {
    expect(
      DegovIndexerHelpers.formatError(new Error("rpc timeout"))
    ).toBe("rpc timeout");
    expect(DegovIndexerHelpers.formatError("plain error")).toBe("plain error");
    expect(
      DegovIndexerHelpers.formatError({ code: "E_TIMEOUT", retryable: true })
    ).toBe('{"code":"E_TIMEOUT","retryable":true}');
  });

  it("keeps verbose logs disabled by default", () => {
    delete process.env.DEGOV_INDEXER_VERBOSE_LOGS;

    expect(DegovIndexerHelpers.verboseLoggingEnabled()).toBe(false);
  });

  it("emits verbose info logs only when enabled", () => {
    const logger = {
      info: jest.fn(),
    };

    delete process.env.DEGOV_INDEXER_VERBOSE_LOGS;
    DegovIndexerHelpers.logVerboseInfo(logger, "token.transfer recorded", {
      tx: "0xabc",
    });
    expect(logger.info).not.toHaveBeenCalled();

    process.env.DEGOV_INDEXER_VERBOSE_LOGS = "true";
    DegovIndexerHelpers.logVerboseInfo(logger, "token.transfer recorded", {
      tx: "0xabc",
    });
    expect(logger.info).toHaveBeenCalledWith(
      "token.transfer recorded | tx=0xabc"
    );
  });
});
