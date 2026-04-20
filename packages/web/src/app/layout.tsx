// MIGRATED: Removed 'import { unstable_noStore } from "next/cache"' (incompatible with Cache Components)
// Layout with async data fetching is automatically dynamic in Next.js 16
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Suspense } from "react";

import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getDaoConfigServer } from "@/lib/config";
import { buildSiteMetadata } from "@/lib/metadata";
import { ConfigProvider } from "@/providers/config.provider";
import { NextThemeProvider } from "@/providers/theme.provider";
import type { Config } from "@/types/config";
import { isDegovApiConfiguredServer } from "@/utils/remote-api";
import { parseOrigin } from "@/utils/url";

import { ConditionalLayout } from "./conditional-layout";
import { DemoTipsBanner } from "./demo-tips-banner";
import { ToastContainer } from "./toastContainer";

import type { Metadata } from "next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap", // Optimized: swap for better performance
  preload: true,
  fallback: ["system-ui", "arial"], // Better fallback chain
  adjustFontFallback: true, // Reduce layout shift
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap", // Optimized: swap for better performance
  preload: true,
  fallback: ["ui-monospace", "monospace"], // Better fallback chain
  adjustFontFallback: true, // Reduce layout shift
});

async function getRemoteConfig(): Promise<Config> {
  const { getConfigCachedByHost } = await import("./_server/config-remote");
  return getConfigCachedByHost();
}

export async function generateMetadata(): Promise<Metadata> {
  // With Cache Components, accessing async data automatically makes this dynamic
  const apiMode = isDegovApiConfiguredServer();

  if (!apiMode) {
    const config = await getDaoConfigServer();
    return buildSiteMetadata(config);
  }

  const config = await getRemoteConfig();
  return buildSiteMetadata(config);
}

// Analytics Scripts component that accesses dynamic data
async function AnalyticsScripts() {
  const config = await getRemoteConfig();
  const gaTag = config.analysis?.ga?.tag;

  if (!gaTag) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gaTag}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${gaTag}');
        `}
      </Script>
    </>
  );
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();
  const initialConfig = isDegovApiConfiguredServer()
    ? await getRemoteConfig()
    : await getDaoConfigServer();

  const indexerOrigin = parseOrigin(initialConfig?.indexer?.endpoint);
  const rpcOrigin = parseOrigin(initialConfig?.chain?.rpcs?.[0]);
  const siteOrigin = parseOrigin(initialConfig?.siteUrl);
  const isDemoDao = initialConfig?.name === "DeGov Demo DAO";

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {indexerOrigin && <link rel="preconnect" href={indexerOrigin} />}
        {rpcOrigin && <link rel="preconnect" href={rpcOrigin} />}
        {siteOrigin && <link rel="preconnect" href={siteOrigin} />}
        <Script
          id="public-env"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `window.__ENV = ${JSON.stringify({
              NEXT_PUBLIC_DEGOV_API: process.env.NEXT_PUBLIC_DEGOV_API ?? "",
              NEXT_PUBLIC_DEGOV_ENS_API:
                process.env.NEXT_PUBLIC_DEGOV_ENS_API ?? "",
              NEXT_PUBLIC_DEGOV_DAO: process.env.NEXT_PUBLIC_DEGOV_DAO ?? "",
              NEXT_PUBLIC_LOCAL_CONFIG:
                process.env.NEXT_PUBLIC_LOCAL_CONFIG ?? "",
            })}`,
          }}
        />
        <Suspense fallback={null}>
          <AnalyticsScripts />
        </Suspense>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <NextThemeProvider>
            <ConfigProvider initialConfig={initialConfig}>
              <TooltipProvider delayDuration={0}>
                <ConditionalLayout banner={<DemoTipsBanner isDemoDao={isDemoDao} />}>
                  {children}
                </ConditionalLayout>
                <ToastContainer />
              </TooltipProvider>
            </ConfigProvider>
          </NextThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
