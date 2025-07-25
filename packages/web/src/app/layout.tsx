import { unstable_noStore as noStore } from "next/cache";
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
  display: "swap",
  preload: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

export async function generateMetadata(): Promise<Metadata> {
  // Disable static optimization for metadata generation
  noStore();

  // Force dynamic metadata generation by adding timestamp
  const timestamp = Date.now();
  const config = getDaoConfigServer();
  const daoName = config?.name || "DeGov";
  const description = `${daoName} - DAO governance platform powered by DeGov.AI`;
  const siteUrl = config?.siteUrl;
  const ogImageUrl = `${siteUrl}/assets/image/og.png?t=${timestamp}`;

  console.log(
    `[Metadata] Generating metadata for: ${daoName} at ${new Date().toISOString()} (timestamp: ${timestamp})`
  );

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
      configName: daoName,
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
