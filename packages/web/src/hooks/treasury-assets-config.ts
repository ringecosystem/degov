export type TreasuryAssetConfigEntry = {
  name: string;
  contract: string;
  standard: string;
  priceId?: string;
  logo?: string | null;
};

type GovernorTokenConfig = {
  address?: string;
  standard?: string;
};

export function hasConfiguredTreasuryAssets(
  treasuryAssets?: TreasuryAssetConfigEntry[] | null
): treasuryAssets is TreasuryAssetConfigEntry[] {
  return Array.isArray(treasuryAssets) && treasuryAssets.length > 0;
}

export function buildFallbackTreasuryAssets(
  governorToken?: GovernorTokenConfig
): TreasuryAssetConfigEntry[] {
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
