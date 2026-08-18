import type { Config } from "@/types/config";

export function isProposalFeatureEnabled(
  config: Config | null | undefined,
  feature: string,
  apiEndpoint: string | undefined
): boolean {
  return Boolean(apiEndpoint && config?.features?.includes(feature));
}
