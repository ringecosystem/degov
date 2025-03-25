import fs from "fs";
import path from "path";

import yaml from "js-yaml";

import type { Config } from "@/types/config";

export const getDaoConfigServer = async (): Promise<Config> => {
  const possiblePaths = [
    path.join(process.cwd(), "degov.yml"),
    path.join(process.cwd(), "public", "degov.yml"),
  ];

  let yamlText: string | null = null;
  let error: Error | null = null;

  for (const configPath of possiblePaths) {
    try {
      yamlText = await fs.readFileSync(configPath, "utf8");
      console.log(`Successfully read config from ${configPath}`);
      break;
    } catch (e) {
      error = e as Error;
      continue;
    }
  }

  if (!yamlText) {
    try {
      const response = await fetch("/degov.yml", {
        next: { revalidate: 0 },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      yamlText = await response.text();
      console.log("Successfully fetched config via HTTP");
    } catch (e) {
      console.error("Failed to fetch config:", e);
      error = e as Error;
    }
  }

  if (!yamlText) {
    console.warn("Failed to load config, using default:", error);
    return {
      name: "DeGov",
    } as Config;
  }

  try {
    return yaml.load(yamlText) as Config;
  } catch (e) {
    console.error("Failed to parse YAML:", e);
    throw e;
  }
};
