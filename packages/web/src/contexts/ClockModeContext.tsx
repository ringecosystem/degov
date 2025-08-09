"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from "react";

import { useBlockData } from "@/contexts/BlockContext";
import { useGlobalLoading } from "@/contexts/GlobalLoadingContext";
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
  const { setLoading } = useGlobalLoading();

  // Report combined loading state to global loader
  useEffect(() => {
    const combined = isLoading || isBlockDataLoading;
    setLoading("clock", combined);
    return () => setLoading("clock", false);
  }, [isLoading, isBlockDataLoading, setLoading]);

  const value = {
    isBlockNumberMode,
    clockMode,
    rawClockMode,
    isClockModeLoading: isLoading,
    clockModeError: error,
  };

  return (
    <ClockModeContext.Provider value={value}>
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
