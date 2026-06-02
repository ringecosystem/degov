import { unstable_cache } from "next/cache";
import { headers } from "next/headers";

import { loadConfigYaml } from "@/lib/config-yaml";
import { getDaoConfigServer } from "@/lib/config";
import type { Config } from "@/types/config";
import { degovApiDaoConfigServer } from "@/utils/remote-api";

export async function getConfigCachedByHost(): Promise<Config> {
  const hdr = await headers();
  const host = hdr.get("host");

  // Resolve the canonical public origin to pass to the remote config API.
  // Next.js internal revalidation requests use the pod IP as the Host header,
  // which the backend cannot match to any DAO. Prefer Origin > Referer > Host,
  // and skip bare pod IPs so the backend can use its database lookup correctly.
  const originHeader = hdr.get("origin");
  const refererHeader = hdr.get("referer");

  let resolvedOrigin: string | null = null;
  if (originHeader) {
    resolvedOrigin = originHeader;
  } else if (refererHeader) {
    try {
      resolvedOrigin = new URL(refererHeader).origin;
    } catch {
      // malformed referer
    }
  }
  if (!resolvedOrigin && host) {
    const isPodIp = /^\d+\.\d+\.\d+\.\d+(:\d+)?$/.test(host);
    if (!isPodIp) {
      resolvedOrigin = `https://${host}`;
    }
  }

  const hostKey = (host ?? "default").toLowerCase();

  const get = unstable_cache(
    async () => {
      try {
        const apiUrl = degovApiDaoConfigServer();
        if (!apiUrl) {
          return getDaoConfigServer();
        }

        console.log(`[Cache] MISS: Fetching remote config for origin: ${resolvedOrigin}`);
        const res = await fetch(apiUrl, {
          headers: resolvedOrigin ? { Origin: resolvedOrigin } : undefined,
        });

        if (!res.ok) throw new Error(`API ${res.status}`);

        const yamlText = await res.text();
        const result = loadConfigYaml(yamlText);

        return result;
      } catch (err) {
        console.error("[Cache] Remote config failed, fallback to local:", err);
        return getDaoConfigServer();
      }
    },
    ["metadata-config", hostKey],
    {
      revalidate: 300,
      tags: ["config", `host-${hostKey}`],
    }
  );

  const result = await get();
  return result;
}
