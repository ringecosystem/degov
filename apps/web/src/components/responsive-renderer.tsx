"use client";

import { type ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/hooks/useMediaQuery";

interface ResponsiveRendererProps {
  /**
   * Desktop component to render
   */
  desktop: ReactNode;
  /**
   * Mobile component to render
   */
  mobile: ReactNode;
  /**
   * Breakpoint for switching layouts (defaults to "1024px" for lg breakpoint)
   */
  breakpoint?: string;
  loadingFallback?: ReactNode;
}

/**
 * Responsive Renderer Component
 *
 * @example
 * ```tsx
 * <ResponsiveRenderer
 *   desktop={<ProposalsTable />}
 *   mobile={<ProposalsList />}
 * />
 * ```
 */
export function ResponsiveRenderer({
  desktop,
  mobile,
  breakpoint = "1024px",
  loadingFallback,
}: ResponsiveRendererProps) {
  const isDesktop = useMediaQuery(`(min-width: ${breakpoint})`);

  if (isDesktop === null)
    return loadingFallback ?? <Skeleton className="w-full min-h-[120px]" />;

  return isDesktop ? desktop : mobile;
}
