import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastContainer } from "react-toastify";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfigProvider } from "@/providers/config.provider";
import { DAppProvider } from "@/providers/dapp.provider";

import { Aside } from "./aside";
import { Header } from "./header";

import type { Metadata } from "next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Create Next App",
  description: "Generated by create next app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ConfigProvider>
          <DAppProvider>
            <TooltipProvider delayDuration={0}>
              <div className="flex min-h-screen overflow-hidden bg-background font-sans antialiased">
                <aside className="h-auto w-[240px] flex-shrink-0 border-r border-border bg-background">
                  <Aside />
                </aside>
                <main className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
                  <Header />
                  <div className="mx-auto w-full flex-1">{children}</div>
                </main>
              </div>
              <ToastContainer
                theme="dark"
                className="w-auto text-[14px] md:w-[380px]"
              />
            </TooltipProvider>
          </DAppProvider>
        </ConfigProvider>
      </body>
    </html>
  );
}
