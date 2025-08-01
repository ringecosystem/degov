"use client";

import { createContext, useContext, type ReactNode } from "react";

import { LoadingState } from "@/components/ui/loading-spinner";
import { useBlockData } from "@/contexts/BlockContext";
import { useClockMode } from "@/hooks/useClockMode";

interface ClockModeContextValue {
  isBlockNumberMode: boolean;
  clockMode: "blocknumber" | "timestamp" | null;
  rawClockMode: string | null;
  isClockModeLoading: boolean;
  clockModeError: Error | null;
}

const ClockModeContext = createContext<ClockModeContextValue | null>(null);

interface ClockModeProviderProps {
  children: ReactNode;
}

export function ClockModeProvider({ children }: ClockModeProviderProps) {
  const { isBlockNumberMode, clockMode, rawClockMode, isLoading, error } =
    useClockMode();
  const { isLoading: isBlockDataLoading } = useBlockData();

  const value = {
    isBlockNumberMode,
    clockMode,
    rawClockMode,
    isClockModeLoading: isLoading,
    clockModeError: error,
  };

  return (
    <ClockModeContext.Provider value={value}>
      {(isLoading || isBlockDataLoading) && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <LoadingState
            title="Initializing System"
            description="Loading data, please wait..."
          />
        </div>
      )}
      {children}
    </ClockModeContext.Provider>
  );
}

export function useClockModeContext() {
  const context = useContext(ClockModeContext);
  if (!context) {
    throw new Error(
      "useClockModeContext must be used within ClockModeProvider"
    );
  }
  return context;
}
