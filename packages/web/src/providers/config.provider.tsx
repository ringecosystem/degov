"use client";
import yaml from "js-yaml";
import { useEffect, useState } from "react";

import ErrorComponent from "@/components/error";
import { ConfigContext } from "@/hooks/useDaoConfig";

import type { Config } from "../types/config";

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetch("/config.yml")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.text();
      })
      .then((yamlText) => {
        const config = yaml.load(yamlText) as Config;
        setConfig(config);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load config:", err);
        if (err instanceof Error) {
          setError(err);
        } else {
          setError(
            new Error(
              typeof err === "string" ? err : "Failed to load configuration"
            )
          );
        }
        setIsLoading(false);
      });
  }, []);

  if (isLoading) return null;
  if (error)
    return (
      <div
        className="flex items-center justify-center"
        style={{
          height: "100dvh",
          width: "100dvw",
        }}
      >
        <ErrorComponent />
      </div>
    );

  return (
    <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>
  );
}
