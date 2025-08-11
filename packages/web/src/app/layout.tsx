import { unstable_noStore } from "next/cache";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";

import "./globals.css";
import "./markdown-body.css";

import { TooltipProvider } from "@/components/ui/tooltip";
import { getDaoConfigServer } from "@/lib/config";
import { ConfigProvider } from "@/providers/config.provider";
import { NextThemeProvider } from "@/providers/theme.provider";
import type { Config } from "@/types/config";
import { isDegovApiConfigured } from "@/utils/remote-api";

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

function buildMetadata(config: Config | null | undefined): Metadata {
  const daoName = config?.name || "DeGov";
  const description = `${daoName} - DAO governance platform powered by DeGov.AI`;
  const siteUrl = config?.siteUrl ?? "https://localhost";
  const metadataBase: URL = new URL(siteUrl);

  let ogImageUrl: string | undefined;
  if (siteUrl) {
    const og = new URL("/assets/image/og.png", siteUrl);
    ogImageUrl = og.toString();
  }

  const metadata = {
    title: {
      template: `%s | ${daoName}`,
      default: `${daoName}`,
    },
    description,
    icons: config?.logo
      ? {
          icon: [{ url: config.logo }],
          shortcut: [config.logo],
        }
      : undefined,
    metadataBase,
    openGraph: {
      type: "website",
      siteName: daoName,
      title: `${daoName} - Powered by DeGov.AI`,
      description,
      url: siteUrl,
      images: ogImageUrl
        ? [
            {
              url: ogImageUrl,
              width: 512,
              height: 512,
              alt: `${daoName} - DAO governance platform`,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary",
      site: "@ai_degov",
      creator: "@ai_degov",
      title: `${daoName} - Powered by DeGov.AI`,
      description,
      images: ogImageUrl ? [ogImageUrl] : undefined,
    },
    other: {
      configName: daoName,
    },
  };
  return metadata;
}

async function getRemoteConfig(): Promise<Config> {
  const { getConfigCachedByHost } = await import("./_server/config-remote");
  return getConfigCachedByHost();
}

export async function generateMetadata(): Promise<Metadata> {
  const apiMode = isDegovApiConfigured();

  if (!apiMode) {
    unstable_noStore();
    const config = await getDaoConfigServer();
    return buildMetadata(config);
  }

  const config = await getRemoteConfig();
  return buildMetadata(config);
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script
          id="public-env"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `window.__ENV = ${JSON.stringify({
              NEXT_PUBLIC_DEGOV_API: process.env.NEXT_PUBLIC_DEGOV_API ?? "",
              NEXT_PUBLIC_DEGOV_DAO: process.env.NEXT_PUBLIC_DEGOV_DAO ?? "",
            })}`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <NextThemeProvider>
          <ConfigProvider>
            <TooltipProvider delayDuration={0}>
              <ConditionalLayout>{children}</ConditionalLayout>
              <ToastContainer />
            </TooltipProvider>
          </ConfigProvider>
        </NextThemeProvider>
      </body>
    </html>
  );
}
