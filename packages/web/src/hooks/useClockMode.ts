import { useQuery } from "@tanstack/react-query";
import { readContract } from "@wagmi/core";
import { useMemo } from "react";
import { useConfig } from "wagmi";

import { abi as governorAbi } from "@/config/abi/governor";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { QUERY_CONFIGS } from "@/utils/query-config";

import type { Address } from "viem";

/**
 * Clock mode types based on ERC-6372 standard
 */
export type ClockMode = "blocknumber" | "timestamp";
type ClockModeStatus = "loading" | "resolved";

interface ClockModeResult {
  clockMode: ClockMode | null;
  rawClockMode: string | null;
  isTimestampMode: boolean;
  isBlockNumberMode: boolean;
  isLoading: boolean;
  status: ClockModeStatus;
  isResolved: boolean;
}

export function useClockMode(): ClockModeResult {
  const daoConfig = useDaoConfig();
  const config = useConfig();
  const governorAddress = daoConfig?.contracts?.governor as Address;
  const chainId = daoConfig?.chain?.id;
  const enabled = Boolean(governorAddress) && Boolean(chainId);

  const { data: rawClockMode, isLoading } = useQuery({
    queryKey: ["clockMode", governorAddress, chainId],
    queryFn: async (): Promise<string> => {
      try {
        const result = await readContract(config, {
          abi: governorAbi,
          address: governorAddress as `0x${string}`,
          functionName: "CLOCK_MODE" as const,
          chainId,
        });

        if (!result || typeof result !== "string") {
          throw new Error("Invalid response from contract");
        }

        return result as string;
      } catch (contractError) {
        console.log(
          "[useClockMode] Contract call failed:",
          (contractError as Error).message
        );
        return "mode=blocknumber";
      }
    },
    enabled,
    ...QUERY_CONFIGS.STATIC,
    retry: false,
  });

  const result = useMemo((): ClockModeResult => {
    if (!enabled) {
      return resolved("blocknumber", null);
    }

    if (isLoading) {
      return loadingState();
    }

    const normalized =
      typeof rawClockMode === "string" && rawClockMode.length > 0
        ? rawClockMode.trim().toLowerCase()
        : null;

    const isTimestamp =
      normalized === "timestamp" || normalized?.includes("mode=timestamp");
    const isBlock =
      normalized === "blocknumber" || normalized?.includes("mode=blocknumber");

    if (!normalized) return resolved("blocknumber", null);

    const detectedMode: ClockMode = isTimestamp ? "timestamp" : "blocknumber";
    const raw = isBlock ? null : rawClockMode ?? null;
    console.log("[useClockMode]", detectedMode);
    return resolved(detectedMode, raw);
  }, [rawClockMode, isLoading, enabled]);

  return result;
}

function resolved(
  mode: ClockMode,
  rawClockMode: string | null
): ClockModeResult {
  return {
    clockMode: mode,
    rawClockMode,
    isTimestampMode: mode === "timestamp",
    isBlockNumberMode: mode === "blocknumber",
    isLoading: false,
    status: "resolved",
    isResolved: true,
  };
}

function loadingState(): ClockModeResult {
  return {
    clockMode: null,
    rawClockMode: null,
    isTimestampMode: false,
    isBlockNumberMode: false,
    isLoading: true,
    status: "loading",
    isResolved: false,
  };
}
