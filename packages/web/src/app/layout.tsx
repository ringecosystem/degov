import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastContainer } from "react-toastify";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfigProvider } from "@/providers/config.provider";
import { DAppProvider } from "@/providers/dapp.provider";

import { Alert } from "./alert";
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
  title: "DEGOV.AI",
  description: "DEGOV.AI",
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
                <Aside />
                <main className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
                  <Header />
                  <div className="mx-auto w-full flex-1 p-[30px] gap-[20px] flex flex-col max-w-[1400px]">
                    <Alert />
                    {children}
                  </div>
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
