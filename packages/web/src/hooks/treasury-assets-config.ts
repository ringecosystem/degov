import type { GovernorToken, TokenDetails } from "../types/config";

export function hasConfiguredTreasuryAssets(
  treasuryAssets?: TokenDetails[] | null
): treasuryAssets is TokenDetails[] {
  return Array.isArray(treasuryAssets) && treasuryAssets.length > 0;
}

export function buildFallbackTreasuryAssets(
  governorToken?: Partial<GovernorToken>
): TokenDetails[] {
  if (!governorToken?.address || !governorToken.standard) {
    return [];
  }

  return [
    {
      name: "Governance Token",
      contract: governorToken.address,
      standard: governorToken.standard.toUpperCase(),
      logo: null,
    },
  ];
}
