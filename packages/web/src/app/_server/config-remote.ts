import { unstable_cache } from "next/cache";
import { headers } from "next/headers";

import { getDaoConfigServer } from "@/lib/config";
import type { Config } from "@/types/config";
import { degovApiDaoConfigServer } from "@/utils/remote-api";

export async function getConfigCachedByHost(): Promise<Config> {
  const hdr = await headers();
  const host = hdr.get("host");
  const hostKey = (host ?? "default").toLowerCase();

  const get = unstable_cache(
    async () => {
      try {
        const apiUrl = degovApiDaoConfigServer();
        if (!apiUrl) {
          return getDaoConfigServer();
        }

        console.log(`[Cache] MISS: Fetching remote config for host: ${host}`);
        const res = await fetch(apiUrl, {
          headers: host ? { "x-degov-site": host } : undefined,
        });

        if (!res.ok) throw new Error(`API ${res.status}`);

        const yamlText = await res.text();
        const yaml = await import("js-yaml");
        const result = yaml.load(yamlText) as Config;

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
