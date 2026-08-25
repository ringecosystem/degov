import type { Config, HiddenProposal } from "@/types/config";

function normalizeProposalId(proposalId: string): string | null {
  try {
    return BigInt(proposalId).toString();
  } catch {
    return null;
  }
}

export function findHiddenProposal(
  config: Pick<Config, "hiddenProposals"> | null | undefined,
  proposalId: string
): HiddenProposal | undefined {
  const normalizedId = normalizeProposalId(proposalId);
  if (!normalizedId) return undefined;

  return config?.hiddenProposals?.find(
    (proposal) => normalizeProposalId(proposal.id) === normalizedId
  );
}

export function filterHiddenProposals<T extends { proposalId: string }>(
  config: Pick<Config, "hiddenProposals"> | null | undefined,
  proposals: T[]
): T[] {
  return proposals.filter(
    (proposal) => !findHiddenProposal(config, proposal.proposalId)
  );
}
