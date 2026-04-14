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

/**
 * Resolve the canonical public origin for the current request.
 *
 * Priority:
 *  1. Origin header  – set by browsers for same-origin and cross-origin requests
 *  2. Referer header – fallback when Origin is absent (e.g. navigation)
 *  3. Host header    – last resort; only reliable when the request comes
 *                      directly from a browser, NOT from Next.js internal
 *                      revalidation (which uses the pod IP as Host)
 *
 * The returned value is passed as the `Origin` header to the remote config
 * API so that the backend DegovMiddleware can resolve the DAO code by
 * matching the public hostname against registered DAO endpoints/domains.
 */
function resolveRequestOrigin(request: NextRequest): string | null {
  const headers = request.headers;

  const origin = headers.get("origin");
  if (origin) return origin;

  const referer = headers.get("referer");
  if (referer) {
    try {
      const url = new URL(referer);
      return url.origin; // e.g. "https://demo-blocknumber.degov.ai"
    } catch {
      // malformed referer – fall through
    }
  }

  const host = headers.get("host");
  if (host) {
    // Only trust bare host when it looks like a real domain, not a pod IP.
    // Pod IPs match /^\d+\.\d+\.\d+\.\d+(:\d+)?$/.
    const isPodIp = /^\d+\.\d+\.\d+\.\d+(:\d+)?$/.test(host);
    if (!isPodIp) {
      return `https://${host}`;
    }
  }

  return null;
}

export async function degovConfig(request: NextRequest): Promise<Config> {
  const origin = resolveRequestOrigin(request);
  if (!origin) {
    throw new Error("Unable to resolve request origin.");
  }

  const cacheKey = origin;

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
        // Pass the real public origin so the backend DegovMiddleware can
        // resolve the DAO code via Origin matching instead of Host matching.
        Origin: origin,
      },
    });
    if (!response.ok) {
      throw new Error(`API responded with ${response.status} -> ${apiUrl}`);
    }

    const yamlText = await response.text();
    const yamlData = loadConfigYaml(yamlText);

    cachedConfig.set(cacheKey, yamlData);
    return yamlData;
  }

  const config = loadLocalConfig();
  cachedConfig.set(cacheKey, config);
  return config;
}

export function getRequestHost(request: NextRequest): string | null {
  const headers = request.headers;
  return headers.get("host");
}
