"use client";

import { usePathname } from "next/navigation";
import { Alert } from "./alert";
import { Aside } from "./aside";
import { DemoTips } from "./demo-tips";
import { Header } from "./header";

interface ConditionalLayoutProps {
  children: React.ReactNode;
}

export function ConditionalLayout({ children }: ConditionalLayoutProps) {
  const pathname = usePathname();

  // Check if current path is a standalone route (AI analysis)
  const isStandalonePage = pathname.startsWith("/ai-analysis");

  if (isStandalonePage) {
    // Standalone layout - no sidebar, header, etc.
    return (
      <div className="min-h-screen bg-background font-sans antialiased">
        {children}
      </div>
    );
  }

  // Default layout with sidebar and header
  return (
    <div className="flex h-dvh overflow-hidden bg-background font-sans antialiased">
      <Aside />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto h-dvh">
        <Header />
        <div className="mx-auto w-full flex-1 p-[30px] gap-[20px] flex flex-col max-w-[1400px]">
          <DemoTips />
          <Alert />
          {children}
        </div>
      </main>
    </div>
  );
}
