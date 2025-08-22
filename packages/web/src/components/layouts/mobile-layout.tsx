"use client";

import { Alert } from "@/app/alert";
import { DemoTips } from "@/app/demo-tips";

import { PageTransition } from "../motion/page-transition";

import { MobileHeader } from "./mobile-header";

interface MobileLayoutProps {
  children: React.ReactNode;
}

export const MobileLayout = ({ children }: MobileLayoutProps) => {
  return (
    <div className="flex h-dvh overflow-hidden bg-background font-sans antialiased">
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto h-dvh">
        <MobileHeader />
        <div className="mx-auto w-full flex-1 p-[15px] gap-[20px] flex flex-col max-w-[1460px]">
          <DemoTips />
          <Alert />
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
    </div>
  );
};
