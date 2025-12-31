import yaml from "js-yaml";
import { useEffect, useState } from "react";

import type { Config } from "@/types/config";
import { processStandardProperties } from "@/utils";
import { degovApiDaoConfigClient } from "@/utils/remote-api";

interface UseConfigSWROptions {
  /** Delay before background revalidation in ms (default: 3000) */
  revalidateDelay?: number;
  /** Enable background revalidation on mount (default: true) */
  revalidateOnMount?: boolean;
}

interface UseConfigSWRResult {
  config: Config | null;
  isLoading: boolean;
  error: Error | null;
}

const DEFAULT_REVALIDATE_DELAY = 3000;
const LOG_PREFIX = "[Config]";

async function fetchConfig(signal?: AbortSignal): Promise<Config> {
  const configSource = degovApiDaoConfigClient() ?? "/degov.yml";
  const response = await fetch(configSource, { signal });

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  const yamlText = await response.text();
  return yaml.load(yamlText) as Config;
}

function configsAreEqual(a: Config | null, b: Config | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useConfigSWR(
  initialConfig: Config | null | undefined,
  options: UseConfigSWROptions = {}
): UseConfigSWRResult {
  const {
    revalidateDelay = DEFAULT_REVALIDATE_DELAY,
    revalidateOnMount = true,
  } = options;

  const [config, setConfig] = useState<Config | null>(() =>
    initialConfig ? processStandardProperties(initialConfig) : null
  );
  const [isLoading, setIsLoading] = useState(!initialConfig);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (initialConfig) {
      const processed = processStandardProperties(initialConfig);
      setConfig((current) => {
        if (configsAreEqual(current, processed)) return current;
        return processed;
      });
      setIsLoading(false);
      setError(null);
    } else {
      setConfig((current) => (current === null ? current : null));
      setIsLoading((prev) => (prev ? prev : true));
      setError(null);
    }
  }, [initialConfig]);

  useEffect(() => {
    if (initialConfig) return;

    let ignore = false;
    const controller = new AbortController();

    async function fetchInitialConfig() {
      try {
        const freshConfig = await fetchConfig(controller.signal);
        if (!ignore) {
          setConfig(processStandardProperties(freshConfig));
          setIsLoading(false);
        }
      } catch (err) {
        if (!ignore) {
          // Don't log abort errors
          if (err instanceof Error && err.name !== "AbortError") {
            console.error(`${LOG_PREFIX} Initial fetch failed:`, err);
            setError(err);
          }
          setIsLoading(false);
        }
      }
    }

    fetchInitialConfig();

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [initialConfig]);

  useEffect(() => {
    if (!initialConfig || !revalidateOnMount) return;

    let ignore = false;
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const freshConfig = await fetchConfig(controller.signal);
        if (!ignore) {
          const processed = processStandardProperties(freshConfig);
          setConfig((current) => {
            if (!configsAreEqual(current, processed)) {
              console.log(
                `${LOG_PREFIX} Background revalidation: config updated`
              );
              return processed;
            }
            return current;
          });
        }
      } catch (err) {
        if (!ignore && err instanceof Error && err.name !== "AbortError") {
          console.warn(`${LOG_PREFIX} Background revalidation failed:`, err);
        }
      }
    }, revalidateDelay);

    return () => {
      ignore = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [initialConfig, revalidateDelay, revalidateOnMount]);

  return { config, isLoading, error };
}
