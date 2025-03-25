import fs from "fs";
import path from "path";

import yaml from "js-yaml";

import type { Config } from "@/types/config";

const defaultConfig = {
  name: "DeGov",
};

export const getDaoConfigServer = (): Config => {
  try {
    const configPath = path.join(process.cwd(), "public", "degov.yml");

    if (!configPath) {
      return defaultConfig as Config;
    }

    let yamlText: string | undefined;

    try {
      yamlText = fs.readFileSync(configPath, "utf8");
      console.log(`[Config] Loaded from ${configPath}`);
    } catch {
      console.log("[Config] Using default config");
      return defaultConfig as Config;
    }

    if (!yamlText) {
      console.log("[Config] Using default config");
      return defaultConfig as Config;
    }

    const config = yaml.load(yamlText) as Config;

    if (
      config &&
      typeof config === "object" &&
      typeof config.name === "string"
    ) {
      return config;
    }

    return defaultConfig as Config;
  } catch {
    console.log("[Config] Error occurred, using default config");
    return defaultConfig as Config;
  }
};
