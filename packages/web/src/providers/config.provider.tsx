"use client";
import yaml from "js-yaml";
import { useEffect, useState } from "react";

import ErrorComponent from "@/components/error";
import { BlockProvider } from "@/contexts/BlockContext";
import { ClockModeProvider } from "@/contexts/ClockModeContext";
import { GlobalLoadingProvider } from "@/contexts/GlobalLoadingContext";
import { useGlobalLoading } from "@/contexts/GlobalLoadingContext";
import { ConfigContext } from "@/hooks/useDaoConfig";
import { DAppProvider } from "@/providers/dapp.provider";
import { processStandardProperties } from "@/utils";
import { degovApiDaoConfigClient } from "@/utils/remote-api";

import type { Config } from "../types/config";

function ConfigProviderContent({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Manage config loading
  useEffect(() => {
    const configSource = degovApiDaoConfigClient() ?? "/degov.yml";

    fetch(configSource)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.text();
      })
      .then((yamlText) => {
        const config = yaml.load(yamlText) as Config;
        setConfig(processStandardProperties(config));
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

  // Hook into global loading overlay (inside provider tree)
  const { setLoading } = useGlobalLoading();
  useEffect(() => {
    setLoading("config", isLoading);
    return () => setLoading("config", false);
  }, [isLoading, setLoading]);

  if (error)
    return (
      <div
        className="flex items-center justify-center"
        style={{ height: "100dvh", width: "100dvw" }}
      >
        <ErrorComponent />
      </div>
    );

  // Render nothing (except overlay) while config is loading
  if (isLoading || !config) return null;

  return (
    <ConfigContext.Provider value={config}>
      <DAppProvider>
        <BlockProvider>
          <ClockModeProvider>{children}</ClockModeProvider>
        </BlockProvider>
      </DAppProvider>
    </ConfigContext.Provider>
  );
}

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  return (
    <GlobalLoadingProvider>
      <ConfigProviderContent>{children}</ConfigProviderContent>
    </GlobalLoadingProvider>
  );
}
