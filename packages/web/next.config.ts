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
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "**",
      },
    ],
    formats: ["image/webp", "image/avif"],
    minimumCacheTTL: 60,
  },
  reactStrictMode: false,

  serverExternalPackages: ["js-yaml"],

  experimental: {
    clientSegmentCache: true,
    staleTimes: {
      dynamic: 300,
      static: 86400,
    },
    optimizePackageImports: [
      "@rainbow-me/rainbowkit",
      "@tanstack/react-query",
      "wagmi",
      "viem",
      "framer-motion",
      "lucide-react",
    ],
  },

  // Compression and caching
  compress: true,
};

export default nextConfig;
