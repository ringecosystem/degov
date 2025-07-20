import fs from "fs";
import path from "path";

import yaml from "js-yaml";

import type { Config } from "@/types/config";

const defaultConfig = {
  name: "DeGov",
};

// Cache the config to avoid reading file system on every request
let cachedConfig: Config | null = null;

export const getDaoConfigServer = (): Config => {
  // Return cached config if available
  if (cachedConfig) {
    return cachedConfig;
  }
  try {
    const configPath = path.join(process.cwd(), "public", "degov.yml");

    if (!configPath) {
      cachedConfig = defaultConfig as Config;
      return cachedConfig;
    }

    let yamlText: string | undefined;

    try {
      yamlText = fs.readFileSync(configPath, "utf8");
      console.log(`[Config] Loaded from ${configPath}`);
    } catch {
      console.log("[Config] Using default config");
      cachedConfig = defaultConfig as Config;
      return cachedConfig;
    }

    if (!yamlText) {
      console.log("[Config] Using default config");
      cachedConfig = defaultConfig as Config;
      return cachedConfig;
    }

    const config = yaml.load(yamlText) as Config;

    if (
      config &&
      typeof config === "object" &&
      typeof config.name === "string"
    ) {
      cachedConfig = config;
      return cachedConfig;
    }

    cachedConfig = defaultConfig as Config;
    return cachedConfig;
  } catch {
    console.log("[Config] Error occurred, using default config");
    cachedConfig = defaultConfig as Config;
    return cachedConfig;
  }
};
