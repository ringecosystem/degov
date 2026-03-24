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
});
