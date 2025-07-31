import { useMemo } from "react";
import { useReadContract } from "wagmi";

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

/**
 * Hook to detect the clock mode used by the Governor contract
 *
 * According to ERC-6372 standard, the CLOCK_MODE() function returns:
 * - "mode=blocknumber&from=default" for block number mode
 * - "mode=timestamp" for timestamp mode
 * - "mode=blocknumber&from=<CAIP-2-ID>" for custom block number mode
 *
 * This affects how voting delays and periods should be interpreted:
 * - timestamp mode: values are in seconds (Unix timestamps)
 * - blocknumber mode: values are in block numbers
 *
 * @returns Clock mode information and utilities
 *
 * @example
 * ```typescript
 * const { clockMode, isTimestampMode, isLoading } = useClockMode()
 *
 * if (isLoading) return <div>Loading...</div>
 *
 * const votingDelayText = isTimestampMode
 *   ? `${votingDelay} seconds`
 *   : `${votingDelay} blocks`
 * ```
 */
export function useClockMode(): ClockModeResult {
  const daoConfig = useDaoConfig();
  const governorAddress = daoConfig?.contracts?.governor as Address;

  const {
    data: rawClockMode,
    isLoading,
    error,
  } = useReadContract({
    address: governorAddress as `0x${string}`,
    abi: governorAbi,
    functionName: "CLOCK_MODE" as const,
    chainId: daoConfig?.chain?.id,
    query: {
      enabled: Boolean(governorAddress) && Boolean(daoConfig?.chain?.id),
      ...QUERY_CONFIGS.DEFAULT,
    },
  });

  const result = useMemo((): ClockModeResult => {
    // If loading, return loading state without assuming mode
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

    // If there's an error (method doesn't exist) or no data, assume blocknumber mode
    if (error || !rawClockMode) {
      return {
        clockMode: "blocknumber",
        rawClockMode: null,
        isTimestampMode: false,
        isBlockNumberMode: true,
        isLoading: false,
        error: error as Error | null,
      };
    }

    const clockModeString = rawClockMode as string;

    // Parse the clock mode string according to ERC-6372
    let detectedMode: ClockMode;

    if (clockModeString.includes("mode=timestamp")) {
      detectedMode = "timestamp";
    } else if (clockModeString.includes("mode=blocknumber")) {
      detectedMode = "blocknumber";
    } else {
      // If we can't parse the format, default to blocknumber mode for older contracts
      console.warn(
        `[useClockMode] Unknown clock mode format: ${clockModeString}. Defaulting to blocknumber mode.`
      );
      detectedMode = "blocknumber";
    }

    const result = {
      clockMode: detectedMode,
      rawClockMode: clockModeString,
      isTimestampMode: detectedMode === "timestamp",
      isBlockNumberMode: detectedMode === "blocknumber",
      isLoading,
      error: error as Error | null,
    };

    return result;
  }, [rawClockMode, isLoading, error]);

  return result;
}
