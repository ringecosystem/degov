import { createContext, useContext } from "react";

import type { Config } from "@/types/config";

export const ConfigContext = createContext<Config | null>(null);

export function useDaoConfig() {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error("useDaoConfig must be used within a DaoConfigProvider");
  }
  return context;
}
