import type { Config } from "@/types/config";

function safeExternalUrl(value?: string | null): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function explorerAddressUrl(config: Config, address?: string | null): string | null {
  const explorerUrl = safeExternalUrl(config.chain.explorers[0]);
  if (!explorerUrl || !address) return null;

  return new URL(`/address/${address}`, explorerUrl.endsWith("/") ? explorerUrl : `${explorerUrl}/`)
    .toString();
}

export function buildDaoPublicSummaryFacts(config: Config) {
  return {
    canonicalSiteUrl: safeExternalUrl(config.siteUrl),
    officialWebsiteUrl: safeExternalUrl(config.links?.website),
    discussionUrl: safeExternalUrl(config.offChainDiscussionUrl),
    registrySourceUrl: safeExternalUrl(config.editLink),
    chain: {
      id: config.chain.id,
      name: config.chain.name,
      explorerUrl: safeExternalUrl(config.chain.explorers[0]),
    },
    contracts: {
      governor: {
        address: config.contracts.governor,
        url: explorerAddressUrl(config, config.contracts.governor),
      },
      governanceToken: {
        address: config.contracts.governorToken.address,
        standard: config.contracts.governorToken.standard,
        url: explorerAddressUrl(config, config.contracts.governorToken.address),
      },
      timelock: config.contracts.timeLock
        ? {
            address: config.contracts.timeLock,
            url: explorerAddressUrl(config, config.contracts.timeLock),
          }
        : null,
    },
    indexer: {
      endpoint: safeExternalUrl(config.indexer.endpoint),
      startBlock: config.indexer.startBlock,
    },
  };
}
