/**
 * Processes chain icon URL to handle different types of icon paths
 * @param iconUrl - The original icon URL from chain info
 * @returns Processed icon URL that can be used in Image components
 */
export function processChainIconUrl(iconUrl: string | null | undefined): string | null {
  if (!iconUrl) return null;

  // If it's already an absolute URL, return as is
  if (iconUrl.startsWith("http://") || iconUrl.startsWith("https://")) {
    return iconUrl;
  }

  // If it's a relative path starting with /assets/, convert to SubWallet ChainList absolute URL
  if (iconUrl.startsWith("/assets/")) {
    return `https://raw.githubusercontent.com/Koniverse/SubWallet-ChainList/master/packages/chain-list-assets/public${iconUrl}`;
  }

  // For other relative paths, return as is (might be local assets)
  return iconUrl;
}