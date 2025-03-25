import fs from "fs";
import path from "path";

import yaml from "js-yaml";

import type { Config } from "@/types/config";

const defaultConfig = {
  name: "DeGov1",
};

export const getDaoConfigServer = (): Config => {
  try {
    const degovConfigPath = process.env.DEGOV_CONFIG_PATH;
    if (!degovConfigPath) {
      return defaultConfig as Config;
    }
    const filePath = path.isAbsolute(degovConfigPath)
      ? degovConfigPath
      : path.join(process.cwd(), degovConfigPath);

    let yamlText: string | undefined;

    try {
      yamlText = fs.readFileSync(filePath, "utf8");
      console.log(`[Config] Loaded from ${filePath}`);
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
