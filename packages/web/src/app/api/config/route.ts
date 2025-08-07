import yaml from "js-yaml";
import { NextResponse } from "next/server";

import type { Config } from "@/types/config";
import { buildRemoteApiUrl } from "@/utils/remote-api";

import type { NextRequest} from "next/server";

export async function GET(request: NextRequest) {
  try {
    const remoteApiUrl = buildRemoteApiUrl();

    if (!remoteApiUrl) {
      return NextResponse.json(
        { error: "Remote API not configured" },
        { status: 400 }
      );
    }

    const host = request.headers.get("host");

    if (!host) {
      return NextResponse.json(
        { error: "Missing Host header" },
        { status: 400 }
      );
    }

    const configUrl = remoteApiUrl;
    const apiResponse = await fetch(configUrl, {
      method: "GET",
      headers: {
        Accept: "text/yaml, application/x-yaml, text/plain",
        "Cache-Control": "no-cache",
        "x-degov-site": host,
      },
      signal: AbortSignal.timeout(60000),
    });

    if (!apiResponse.ok) {
      return NextResponse.json(
        {
          error: `Remote API failed: ${apiResponse.status} ${apiResponse.statusText}`,
        },
        { status: apiResponse.status }
      );
    }

    const yamlText = await apiResponse.text();

    try {
      const config = yaml.load(yamlText) as Config;

      if (
        !config ||
        typeof config !== "object" ||
        typeof config.name !== "string"
      ) {
        throw new Error("Invalid config format");
      }

      console.log(`[Config API] Successfully fetched config: ${config.name}`);

      return new NextResponse(yamlText, {
        status: 200,
        headers: {
          "Content-Type": "text/yaml",
          "Cache-Control": "public, max-age=300",
        },
      });
    } catch (parseError) {
      console.error(`[Config API] Invalid YAML format:`, parseError);
      return NextResponse.json(
        { error: "Invalid YAML format from remote API" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error(`[Config API] Unexpected error:`, error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
