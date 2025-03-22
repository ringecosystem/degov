import path from "path";
import fs from "fs";
import yaml from "js-yaml";
import { Config } from "@/types/config";

let cachedConfig: Config | undefined = undefined;

export function degovConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }
  const configPath = path.join(process.cwd(), "public/degov.yml");
  const yamlText = fs.readFileSync(configPath, "utf-8");
  const config = yaml.load(yamlText) as Config;
  cachedConfig = config;
  return config;
}
