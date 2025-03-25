import { promises as fs } from "fs";
import path from "path";

import yaml from "js-yaml";

import type { Config } from "@/types/config";

export const getDaoConfigServer = async (): Promise<Config> => {
  const possiblePaths = [
    path.join(process.cwd(), "degov.yml"),
    path.join(process.cwd(), "public", "degov.yml"),
  ];

  let yamlText: string | null = null;
  let lastError: Error | null = null;

  const results = await Promise.allSettled(
    possiblePaths.map(async (configPath) => {
      try {
        const content = await fs.readFile(configPath, "utf8");
        return { path: configPath, content };
      } catch (e) {
        lastError = e as Error;
        return null;
      }
    })
  );

  const successfulResult = results
    .filter(
      (
        result
      ): result is PromiseFulfilledResult<{
        path: string;
        content: string;
      } | null> => result.status === "fulfilled"
    )
    .map((result) => result.value)
    .find((result) => result !== null);

  if (successfulResult) {
    yamlText = successfulResult.content;
    console.log(`Successfully read config from ${successfulResult.path}`);
  }

  if (!yamlText) {
    console.warn("Failed to load config from all paths:", lastError);
    return {
      name: "DeGov1",
    } as Config;
  }

  try {
    const config = yaml.load(yamlText) as Config;

    if (!config || typeof config !== "object") {
      throw new Error("Invalid config format: must be an object");
    }

    if (!config.name || typeof config.name !== "string") {
      throw new Error("Invalid config: missing or invalid 'name' property");
    }

    return config;
  } catch (e) {
    console.error("Failed to parse YAML or validate config:", e);
    throw e;
  }
};
