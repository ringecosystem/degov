"use client";

import { type ReactNode } from "react";

import { BlockProvider } from "@/contexts/BlockContext";

interface BlockProviderProps {
  children: ReactNode;
}

/**
 * Provider that wraps all blockchain-related contexts and providers
 * This should be placed high in the component tree, ideally in layout or app component
 */
export function BlockDataProvider({ children }: BlockProviderProps) {
  return <BlockProvider>{children}</BlockProvider>;
}
