"use client";

import "@/lib/bigint-devtools-fix";

import { useEffect, type ReactNode } from "react";

import ErrorComponent from "@/components/error";
import { BlockProvider } from "@/contexts/BlockContext";
import { GlobalLoadingProvider } from "@/contexts/GlobalLoadingContext";
import { useGlobalLoading } from "@/contexts/GlobalLoadingContext";
import { useClockMode } from "@/hooks/useClockMode";
import { useConfigSWR } from "@/hooks/useConfigSWR";
import { ConfigContext } from "@/hooks/useDaoConfig";
import { DAppProvider } from "@/providers/dapp.provider";

import type { Config } from "../types/config";

function ConfigProviderContent({
  children,
  initialConfig,
}: {
  children: React.ReactNode;
  initialConfig?: Config | null;
}) {
  // SWR pattern: use initialConfig for instant render, revalidate in background
  const { config, isLoading, error } = useConfigSWR(initialConfig);

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
