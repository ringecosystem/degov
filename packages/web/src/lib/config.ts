import fs from "fs/promises";
import path from "path";

import yaml from "js-yaml";
import { unstable_cache } from "next/cache";

import type { Config } from "@/types/config";

const defaultConfig = {
  name: "DeGov",
};

export const getDaoConfigServer = unstable_cache(
  async (): Promise<Config> => {
    try {
      const configPath = path.join(process.cwd(), "public", "degov.yml");
      const yamlText = await fs.readFile(configPath, "utf8");

      if (!yamlText) {
        return defaultConfig as Config;
      }

      const config = yaml.load(yamlText) as Config;

      if (
        config &&
        typeof config === "object" &&
        typeof config.name === "string"
      ) {
        return config;
      }

      return defaultConfig as Config;
    } catch {
      return defaultConfig as Config;
    }
  },
  ["local-dao-config"],
  { revalidate: 3600 }
);
