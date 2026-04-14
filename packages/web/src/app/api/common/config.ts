import fs from "fs";
import path from "path";

import { loadConfigYaml } from "@/lib/config-yaml";
import type { Config } from "@/types/config";
import {
  isDegovApiConfiguredServer,
  degovApiDaoConfigServer,
} from "@/utils/remote-api";

import type { NextRequest } from "next/server";

const cachedConfig: Map<string, Config> = new Map();

function loadLocalConfig(): Config {
  const configPath = path.join(process.cwd(), "public/degov.yml");
  const yamlText = fs.readFileSync(configPath, "utf-8");
  return loadConfigYaml(yamlText);
}

export async function degovConfig(request: NextRequest): Promise<Config> {
  const host = getRequestHost(request);
  if (!host) {
    throw new Error("Host header is missing in the request.");
  }

  const cacheKey = host;

  // check if the config is already cached
  if (cachedConfig.has(cacheKey)) {
    const cachedValue = cachedConfig.get(cacheKey);
    if (cachedValue) {
      return cachedValue;
    }
    cachedConfig.delete(cacheKey); // Remove stale cache
  }

  if (isDegovApiConfiguredServer()) {
    const apiUrl = degovApiDaoConfigServer();
    if (!apiUrl) {
      return loadLocalConfig();
    }

    try {
      const response = await fetch(apiUrl, {
        headers: {
          "x-degov-site": host,
        },
      });
      if (!response.ok) {
        console.warn(
          `[config] Remote config failed (${response.status}), falling back to local. host=${host}`
        );
        return loadLocalConfig();
      }

      const yamlText = await response.text();
      const yamlData = loadConfigYaml(yamlText);

      cachedConfig.set(cacheKey, yamlData);
      return yamlData;
    } catch (err) {
      console.warn("[config] Remote config fetch error, falling back to local:", err);
      return loadLocalConfig();
    }
  }

  const config = loadLocalConfig();
  cachedConfig.set(cacheKey, config);
  return config;
}

export function getRequestHost(request: NextRequest): string | null {
  const headers = request.headers;
  return headers.get("host");
}
