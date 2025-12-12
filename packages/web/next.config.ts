import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/": ["./public/**/*"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**", // Broad allowlist keeps existing external avatars/assets working; tighten once domains are audited
      },
      {
        protocol: "http",
        hostname: "**",
      },
    ],
    formats: ["image/webp", "image/avif"],
    minimumCacheTTL: 60,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  reactStrictMode: false,

  serverExternalPackages: ["js-yaml"],

  reactCompiler: true,

  experimental: {
    staleTimes: {
      dynamic: 300, // 5 minutes for dynamic content
      static: 86400, // 24 hours for static content
    },

    optimizePackageImports: [
      "@rainbow-me/rainbowkit",
      "@tanstack/react-query",
      "wagmi",
      "viem",
      "framer-motion",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-label",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-slot",
      "@radix-ui/react-tooltip",
    ],
  },

  // Empty turbopack config to silence webpack warning
  turbopack: {},

  // Webpack fallback for production builds (still uses webpack)
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },

  // Compression and caching
  compress: true,
};

export default nextConfig;
