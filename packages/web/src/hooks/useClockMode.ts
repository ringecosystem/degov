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

/**
 * Clock mode result interface
 */
interface ClockModeResult {
  /** The detected clock mode */
  clockMode: ClockMode | null;
  /** Raw CLOCK_MODE string from contract */
  rawClockMode: string | null;
  /** Whether the contract uses timestamp mode */
  isTimestampMode: boolean;
  /** Whether the contract uses block number mode */
  isBlockNumberMode: boolean;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
}

export function useClockMode(): ClockModeResult {
  const daoConfig = useDaoConfig();
  const config = useConfig();
  const governorAddress = daoConfig?.contracts?.governor as Address;
  const chainId = daoConfig?.chain?.id;

  const {
    data: rawClockMode,
    isLoading,
    error,
  } = useQuery({
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
    enabled: Boolean(governorAddress) && Boolean(chainId),
    ...QUERY_CONFIGS.STATIC,
    retry: false,
  });

  const result = useMemo((): ClockModeResult => {
    if (isLoading) {
      return {
        clockMode: null,
        rawClockMode: null,
        isTimestampMode: false,
        isBlockNumberMode: false,
        isLoading: true,
        error: null,
      };
    }

    if (error) {
      console.warn("[useClockMode] Unexpected error:", error);
      return {
        clockMode: "blocknumber",
        rawClockMode: null,
        isTimestampMode: false,
        isBlockNumberMode: true,
        isLoading: false,
        error: error as Error,
      };
    }

    const clockModeString = rawClockMode || null;
    let detectedMode: ClockMode;

    if (clockModeString?.includes("mode=timestamp")) {
      detectedMode = "timestamp";
    } else if (clockModeString?.includes("mode=blocknumber")) {
      detectedMode = "blocknumber";
    } else {
      console.warn(
        `[useClockMode] Unknown clock mode format: ${clockModeString}. Defaulting to blocknumber mode.`
      );
      detectedMode = "blocknumber";
    }

    return {
      clockMode: detectedMode,
      rawClockMode:
        clockModeString === "mode=blocknumber" ? null : clockModeString,
      isTimestampMode: detectedMode === "timestamp",
      isBlockNumberMode: detectedMode === "blocknumber",
      isLoading: false,
      error: null,
    };
  }, [rawClockMode, isLoading, error]);

  return result;
}
