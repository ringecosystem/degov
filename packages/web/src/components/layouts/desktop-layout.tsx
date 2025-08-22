"use client";

import { Alert } from "@/app/alert";
import { DemoTips } from "@/app/demo-tips";
import { Header } from "@/components/layouts/header";
import { PageTransition } from "@/components/motion/page-transition";

import { Aside } from "./aside";

interface DesktopLayoutProps {
  children: React.ReactNode;
}

export const DesktopLayout = ({ children }: DesktopLayoutProps) => {
  return (
    <div className="flex h-dvh overflow-hidden bg-background font-sans antialiased">
      <Aside />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto h-dvh">
        <Header />
        <div className="mx-auto w-full flex-1 p-[15px] lg:p-[30px] gap-[15px] lg:gap-[20px] flex flex-col max-w-[1460px]">
          <DemoTips />
          <Alert />
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
    </div>
  );
};
