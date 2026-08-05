import fs from "fs/promises";
import path from "path";

import { unstable_cache } from "next/cache";

import { loadConfigYaml } from "@/lib/config-yaml";
import {
  getPublicOriginFromEnvironment,
  withKnownProductionSiteUrl,
} from "@/lib/request-origin";
import type { Config } from "@/types/config";

const defaultConfig = {
  name: "DeGov",
};

function normalizeConfig(config: Config): Config {
  const productionOrigin = getPublicOriginFromEnvironment({
    DEGOV_PUBLIC_SITE_URL: process.env.DEGOV_PUBLIC_SITE_URL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  });

  return withKnownProductionSiteUrl(config, productionOrigin);
}

export const getDaoConfigServer = unstable_cache(
  async (): Promise<Config> => {
    try {
      const configPath = path.join(process.cwd(), "public", "degov.yml");
      const yamlText = await fs.readFile(configPath, "utf8");

      if (!yamlText) {
        return defaultConfig as Config;
      }

      const config = loadConfigYaml(yamlText);

      if (
        config &&
        typeof config === "object" &&
        typeof config.name === "string"
      ) {
        return normalizeConfig(config);
      }

      return defaultConfig as Config;
    } catch {
      return defaultConfig as Config;
    }
  },
  ["local-dao-config"],
  { revalidate: 3600 }
);
