import { DegovIndexerHelpers } from "../src/internal/helpers";

describe("DegovIndexerHelpers", () => {
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
});
