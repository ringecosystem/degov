import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";
import "./markdown-body.css";

import { TooltipProvider } from "@/components/ui/tooltip";
import { getDaoConfigServer } from "@/lib/config";
import { ConfigProvider } from "@/providers/config.provider";
import { DAppProvider } from "@/providers/dapp.provider";
import { NextThemeProvider } from "@/providers/theme.provider";

import { Alert } from "./alert";
import { Aside } from "./aside";
import { DemoTips } from "./demo-tips";
import { Header } from "./header";
import { ToastContainer } from "./toastContainer";

import type { Metadata } from "next";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getDaoConfigServer();
  const daoName = config?.name || "DeGov";
  const description = `${daoName} - DAO governance platform powered by DeGov.AI`;
  const siteUrl = config?.siteUrl;
  const ogImageUrl = `${siteUrl}/assets/image/og.png`;

  return {
    title: {
      template: `%s | ${daoName} - Powered by DeGov.AI`,
      default: `${daoName} - Powered by DeGov.AI`,
    },
    description,
    metadataBase: new URL(siteUrl),
    openGraph: {
      type: "website",
      siteName: daoName,
      title: `${daoName} - Powered by DeGov.AI`,
      description,
      url: siteUrl,
      images: [
        {
          url: ogImageUrl,
          width: 512,
          height: 512,
          alt: `${daoName} - DAO governance platform`,
        },
      ],
    },
    twitter: {
      card: "summary",
      site: "@ai_degov",
      creator: "@ai_degov",
      title: `${daoName} - Powered by DeGov.AI`,
      description,
      images: [ogImageUrl],
    },
    other: {
      timestamp: Date.now(),
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <NextThemeProvider>
          <ConfigProvider>
            <DAppProvider>
              <TooltipProvider delayDuration={0}>
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
                <ToastContainer />
              </TooltipProvider>
            </DAppProvider>
          </ConfigProvider>
        </NextThemeProvider>
      </body>
    </html>
  );
}
