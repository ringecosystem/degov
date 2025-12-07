"use client";
import yaml from "js-yaml";
import { useEffect, useState, type ReactNode } from "react";

import ErrorComponent from "@/components/error";
import { BlockProvider } from "@/contexts/BlockContext";
import { GlobalLoadingProvider } from "@/contexts/GlobalLoadingContext";
import { useGlobalLoading } from "@/contexts/GlobalLoadingContext";
import { useClockMode } from "@/hooks/useClockMode";
import { ConfigContext } from "@/hooks/useDaoConfig";
import { DAppProvider } from "@/providers/dapp.provider";
import { processStandardProperties } from "@/utils";
import { degovApiDaoConfigClient } from "@/utils/remote-api";

import type { Config } from "../types/config";

function ConfigProviderContent({
  children,
  initialConfig,
}: {
  children: React.ReactNode;
  initialConfig?: Config | null;
}) {
  const [config, setConfig] = useState<Config | null>(
    initialConfig ? processStandardProperties(initialConfig) : null
  );
  const [isLoading, setIsLoading] = useState(!initialConfig);
  const [error, setError] = useState<Error | null>(null);

  // Manage config loading
  useEffect(() => {
    if (initialConfig) return;

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
  }, [initialConfig]);

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
          <ClockLoadingManager>{children}</ClockLoadingManager>
        </BlockProvider>
      </DAppProvider>
    </ConfigContext.Provider>
  );
}

// Lightweight component to manage clock loading state
function ClockLoadingManager({ children }: { children: ReactNode }) {
  const { isLoading: isClockLoading } = useClockMode();
  const { setLoading } = useGlobalLoading();

  useEffect(() => {
    setLoading("clock", isClockLoading);
    return () => setLoading("clock", false);
  }, [isClockLoading, setLoading]);

  return <>{children}</>;
}

export function ConfigProvider({
  children,
  initialConfig,
}: {
  children: React.ReactNode;
  initialConfig?: Config | null;
}) {
  return (
    <GlobalLoadingProvider>
      <ConfigProviderContent initialConfig={initialConfig}>
        {children}
      </ConfigProviderContent>
    </GlobalLoadingProvider>
  );
}
