import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";
import "./markdown-body.css";

import { TooltipProvider } from "@/components/ui/tooltip";
import { getDaoConfigServer } from "@/lib/config";
import { BlockDataProvider } from "@/providers/block.provider";
import { ConfigProvider } from "@/providers/config.provider";
import { DAppProvider } from "@/providers/dapp.provider";
import { NextThemeProvider } from "@/providers/theme.provider";

import { ConditionalLayout } from "./conditional-layout";
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
      template: `%s | ${daoName} | DeGov.AI`,
      default: `${daoName} | DeGov.AI`,
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
              <BlockDataProvider>
                <TooltipProvider delayDuration={0}>
                  <ConditionalLayout>{children}</ConditionalLayout>
                  <ToastContainer />
                </TooltipProvider>
              </BlockDataProvider>
            </DAppProvider>
          </ConfigProvider>
        </NextThemeProvider>
      </body>
    </html>
  );
}
