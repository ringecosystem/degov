import fs from "fs";
import path from "path";

import yaml from "js-yaml";

import type { Config } from "@/types/config";
import type { NextRequest } from "next/server";
import {
  isDegovApiConfiguredServer,
  degovApiDaoConfigServer,
} from "@/utils/remote-api";

const cachedConfig: Map<string, Config> = new Map();

export async function degovConfig(reqeust: NextRequest): Promise<Config> {
  const host = getRequestHost(reqeust);
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
      throw new Error("Remote API is not configured properly.");
    }

    const response = await fetch(apiUrl, {
      headers: {
        "x-degov-site": host,
      },
    });
    if (!response.ok) {
      throw new Error(`API responded with ${response.status} -> ${apiUrl}`);
    }

    const yamlText = await response.text();
    const yamlData = yaml.load(yamlText) as Config;

    cachedConfig.set(cacheKey, yamlData);
    return yamlData;
  }

  const configPath = path.join(process.cwd(), "public/degov.yml");
  const yamlText = fs.readFileSync(configPath, "utf-8");
  const config = yaml.load(yamlText) as Config;
  cachedConfig.set(cacheKey, config);
  return config;
}

export function getRequestHost(request: NextRequest): string | null {
  const headers = request.headers;
  return headers.get(":authority") ?? headers.get("host");
}
