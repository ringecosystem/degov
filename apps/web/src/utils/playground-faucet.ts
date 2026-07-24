import { isAddress, type Address } from "viem";

import type { AppItem, Config } from "@/types/config";

export const PLAYGROUND_DAO_CODE = "playground-dao";

type FaucetConfig = Pick<Config, "code" | "apps">;

function isFaucetLink(app: AppItem): boolean {
  return /(^|\/)faucet\/?(?:[?#]|$)/i.test(app.link);
}

export function getPlaygroundFaucetAddress(
  config: FaucetConfig | null | undefined
): Address | undefined {
  if (config?.code !== PLAYGROUND_DAO_CODE) return undefined;

  const apps = config.apps ?? [];
  const explicitAddress = apps
    .map((app) => app.params?.faucetAddress)
    .find((value): value is string => Boolean(value && isAddress(value)));
  if (explicitAddress) return explicitAddress as Address;

  const contractAddress = apps
    .filter(isFaucetLink)
    .map((app) => app.params?.contract)
    .find((value): value is string => Boolean(value && isAddress(value)));

  return contractAddress as Address | undefined;
}
