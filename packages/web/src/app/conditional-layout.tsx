"use client";

import { usePathname } from "next/navigation";

import { DeviceRouter } from "@/components/device-router";
import { PageTransition } from "@/components/motion/page-transition";

interface ConditionalLayoutProps {
  children: React.ReactNode;
}

export function ConditionalLayout({ children }: ConditionalLayoutProps) {
  const pathname = usePathname();

  // Check if current path is a standalone route (AI analysis)
  const isStandalonePage = pathname?.startsWith("/ai-analysis") ?? false;

  if (isStandalonePage) {
    // Standalone layout - no sidebar, header, etc.
    return (
      <div className="min-h-screen bg-background font-sans antialiased">
        <PageTransition>{children}</PageTransition>
      </div>
    );
  }

  // Use device router to render appropriate layout
  return <DeviceRouter>{children}</DeviceRouter>;
}
