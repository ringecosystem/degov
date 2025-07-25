import fs from "fs";
import path from "path";

import yaml from "js-yaml";

import type { Config } from "@/types/config";

const defaultConfig = {
  name: "DeGov",
};

// Cache the config with timestamp to enable dynamic reloading
let cachedConfig: Config | null = null;
let configLastModified: number = 0;

export const getDaoConfigServer = (): Config => {
  try {
    const configPath = path.join(process.cwd(), "public", "degov.yml");

    // Check if config file exists and get its modification time
    let fileModified = 0;
    
    try {
      const stats = fs.statSync(configPath);
      fileModified = stats.mtime.getTime();
    } catch {
      // File doesn't exist, use default config
      if (!cachedConfig) {
        console.log("[Config] File not found, using default config");
        cachedConfig = defaultConfig as Config;
      }
      return cachedConfig;
    }

    // Return cached config if file hasn't been modified
    if (cachedConfig && fileModified <= configLastModified) {
      return cachedConfig;
    }

    // File has been modified or first load, read the file
    let yamlText: string | undefined;

    try {
      yamlText = fs.readFileSync(configPath, "utf8");
      configLastModified = fileModified;
      console.log(`[Config] Loaded from ${configPath} (modified: ${new Date(fileModified).toISOString()})`);
    } catch {
      console.log("[Config] Error reading file, using cached or default config");
      if (!cachedConfig) {
        cachedConfig = defaultConfig as Config;
      }
      return cachedConfig;
    }

    if (!yamlText) {
      console.log("[Config] Empty file, using default config");
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
      console.log(`[Config] Successfully loaded config: ${config.name}`);
      return cachedConfig;
    }

    console.log("[Config] Invalid config format, using default config");
    cachedConfig = defaultConfig as Config;
    return cachedConfig;
  } catch (error) {
    console.log("[Config] Error occurred, using cached or default config", error);
    if (!cachedConfig) {
      cachedConfig = defaultConfig as Config;
    }
    return cachedConfig;
  }
};
