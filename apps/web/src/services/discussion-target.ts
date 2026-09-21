export const discussionTargetInputs = (
  daoCode: string,
  proposalId: string
) => {
  const value = proposalId.trim();
  if (!value) throw new Error("Invalid proposal ID");

  const id = BigInt(value);
  if (id < 0n || id >= 1n << 256n) throw new Error("Invalid proposal ID");

  const hex = id.toString(16);
  const candidates = new Set([
    id.toString(),
    `0x${hex}`,
    `0x${hex.padStart(64, "0")}`,
  ]);
  return Array.from(candidates, (candidate) => ({
    space: "degov",
    path: `/daos/${daoCode}/proposals/${candidate}`,
  }));
};

export const discussionTargetInput = (daoCode: string, proposalId: string) =>
  discussionTargetInputs(daoCode, proposalId)[0];
