import type { Config } from "@/types/config";

const DEMO_DAO_CODE = "degov-demo-dao";

export function isDemoDaoConfig(config?: Pick<Config, "code"> | null) {
  return config?.code === DEMO_DAO_CODE;
}
