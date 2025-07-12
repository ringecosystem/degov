/**
 * @deprecated Use BlockProvider and useBlockData instead.
 * This file is kept for backward compatibility and will be removed in next version.
 * 
 * Migration guide:
 * - Wrap your app with <BlockProvider>
 * - Replace useCurrentBlockTime() with useCurrentBlockTime() from BlockContext
 * - Replace useAverageBlockTime() with useAverageBlockTime() from BlockContext
 */

import { 
  useCurrentBlockTime as useCurrentBlockTimeFromContext,
  useAverageBlockTime as useAverageBlockTimeFromContext,
  useBlockData
} from "@/contexts/BlockContext";

/**
 * @deprecated Use useCurrentBlockTime from BlockContext instead
 */
export function useCurrentBlockTime(_watch = true): number | null {
  console.warn("useCurrentBlockTime from useBlockTime.ts is deprecated. Use BlockProvider and useCurrentBlockTime from BlockContext instead.");
  return useCurrentBlockTimeFromContext();
}

/**
 * @deprecated Use useAverageBlockTime from BlockContext instead  
 */
export function useAverageBlockTime(_sampleSize = 50): number | null {
  console.warn("useAverageBlockTime from useBlockTime.ts is deprecated. Use BlockProvider and useAverageBlockTime from BlockContext instead.");
  return useAverageBlockTimeFromContext();
}

/**
 * @deprecated Use useBlockData from BlockContext instead
 */
export function useBlockTime(_options = {}) {
  console.warn("useBlockTime is deprecated. Use BlockProvider and useBlockData from BlockContext instead.");
  return useBlockData();
}