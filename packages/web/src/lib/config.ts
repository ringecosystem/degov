// import fs from "fs";
import { promises as fs } from "fs";
import path from "path";

import yaml from "js-yaml";

import type { Config } from "@/types/config";

const defaultConfig = {
  name: "DeGov1",
};

// export const getDaoConfigServer = (): Config => {
//   try {
//     const degovConfigPath = process.env.DEGOV_CONFIG_PATH;
//     if (!degovConfigPath) {
//       return defaultConfig as Config;
//     }
//     const filePath = path.isAbsolute(degovConfigPath)
//       ? degovConfigPath
//       : path.join(process.cwd(), degovConfigPath);

//     let yamlText: string | undefined;

//     try {
//       yamlText = fs.readFileSync(filePath, "utf8");
//       console.log(`[Config] Loaded from ${filePath}`);
//     } catch {
//       console.log("[Config] Using default config");
//       return defaultConfig as Config;
//     }

//     if (!yamlText) {
//       console.log("[Config] Using default config");
//       return defaultConfig as Config;
//     }

//     const config = yaml.load(yamlText) as Config;

//     if (
//       config &&
//       typeof config === "object" &&
//       typeof config.name === "string"
//     ) {
//       return config;
//     }

//     return defaultConfig as Config;
//   } catch {
//     console.log("[Config] Error occurred, using default config");
//     return defaultConfig as Config;
//   }
// };

export async function getDaoConfigServer() {
  const degovConfigPath = process.env.DEGOV_CONFIG_PATH;
  if (!degovConfigPath) {
    // throw new Error("DEGOV_CONFIG_PATH not set");
    return defaultConfig as Config;
  }
  let degovConfigRaw;
  let times = 0;
  while (true) {
    times += 1;
    if (times > 3) {
      // throw new Error("cannot read config file");
      return defaultConfig as Config;
    }

    try {
      if (
        degovConfigPath.startsWith("http://") ||
        degovConfigPath.startsWith("https://")
      ) {
        // read from http
        const response = await fetch(degovConfigPath);
        if (!response.ok) {
          // throw new Error(
          //   `failed to load config, http error! status: ${response.status}`
          // );
          return defaultConfig as Config;
        }
        degovConfigRaw = await response.text();
        break;
      } else {
        // read from file system
        const filePath = path.isAbsolute(degovConfigPath)
          ? degovConfigPath
          : path.join(process.cwd(), degovConfigPath);
        await fs.access(filePath); // Check if file exists
        degovConfigRaw = await fs.readFile(filePath, "utf-8");
        break;
      }
    } catch (e) {
      console.error(e);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!degovConfigRaw) {
    // throw new Error(`cannot read config file from ${degovConfigPath}`);
    return defaultConfig as Config;
  }
  console.log(`loaded config from ${degovConfigPath}`);
  try {
    return yaml.load(degovConfigRaw) as Config;
  } catch (e) {
    console.error(e);
    // throw new Error(`cannot parse config file from ${degovConfigPath}`);
    return defaultConfig as Config;
  }
}
