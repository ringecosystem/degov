import yaml from "js-yaml";

import type { Config } from "@/types/config";

const HEX_SCALAR_VALUE = /^(\s*[^:#\n][^:\n]*:\s*)(0x[0-9a-fA-F]+)(\s*(?:#.*)?)$/gm;

function quoteHexScalars(yamlText: string): string {
  return yamlText.replace(
    HEX_SCALAR_VALUE,
    (_match, prefix: string, value: string, suffix: string) =>
      `${prefix}"${value}"${suffix ?? ""}`
  );
}

export function loadConfigYaml(yamlText: string): Config {
  return yaml.load(quoteHexScalars(yamlText)) as Config;
}
