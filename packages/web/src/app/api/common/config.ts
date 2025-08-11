import fs from "fs";
import path from "path";

import yaml from "js-yaml";

import type { Config } from "@/types/config";
import type { DaoDetectlResult } from "@/types/api";
import type { NextRequest } from "next/server";
import {
  isDegovApiConfigured,
  degovApiDaoConfig,
  degovApiDaoDetect,
} from "@/utils/remote-api";
import { Resp } from "@/types/api";

let cachedConfig: Config | undefined = undefined;

export async function degovConfig(
  reqeust: NextRequest
): Promise<Config | undefined> {
  if (cachedConfig) {
    return cachedConfig;
  }

  const host = getRequestHost(reqeust);

  if (isDegovApiConfigured() && host) {
    const apiUrl = degovApiDaoConfig();
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

    cachedConfig = yamlData;
    return yamlData;
  }

  const configPath = path.join(process.cwd(), "public/degov.yml");
  const yamlText = fs.readFileSync(configPath, "utf-8");
  const config = yaml.load(yamlText) as Config;
  cachedConfig = config;
  return config;
}

export async function detectDao(
  reqeust: NextRequest
): Promise<DaoDetectlResult | undefined> {
  const host = getRequestHost(reqeust);
  if (!host) {
    return undefined;
  }

  const daoCode = process.env.NEXT_PUBLIC_DEGOV_DAO;
  if (daoCode) {
    return {
      daocode: daoCode,
      daosite: host,
    };
  }

  const apiUrl = degovApiDaoDetect();
  if (!apiUrl) {
    return undefined;
  }
  const response = await fetch(apiUrl, {
    headers: {
      "x-degov-site": host,
    },
  });
  if (!response.ok) {
    return undefined;
  }
  const resp: Resp<DaoDetectlResult> | undefined = await response.json();
  if (!resp || !resp.data) {
    console.error("Failed to detect DAO:", resp);
    return undefined;
  }
  if (resp.code !== 0) {
    console.error("Failed to detect DAO:", resp);
    return undefined;
  }
  return resp.data;
}

export function getRequestHost(request: NextRequest): string | null {
  const headers = request.headers;
  return headers.get(":authority") ?? headers.get("host");
}
