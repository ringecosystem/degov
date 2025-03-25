import fs from "fs";
import path from "path";

import yaml from "js-yaml";

import type { Config } from "@/types/config";

export const getDaoConfigServer = async (): Promise<Config> => {
  const configPath = path.join(process.cwd(), "public", "degov.yml");

  const yamlText = await fs.readFileSync(configPath, "utf8");
  const config = yaml.load(yamlText) as Config;

  return config;
};
