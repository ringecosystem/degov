import yaml from "js-yaml";

import type { Config } from "@/types/config";

const ETH_ADDRESS_SCALAR_VALUE =
  /^(\s*[^:#\n][^:\n]*:\s*)(0x[0-9a-fA-F]{40})(\s*(?:#.*)?)$/gm;

function quoteAddressScalars(yamlText: string): string {
  return yamlText.replace(
    ETH_ADDRESS_SCALAR_VALUE,
    (_match, prefix: string, value: string, suffix: string) =>
      `${prefix}"${value}"${suffix ?? ""}`
  );
}

export function loadConfigYaml(yamlText: string): Config {
  return yaml.load(quoteAddressScalars(yamlText)) as Config;
}
