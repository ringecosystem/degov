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
      "lucide-react",
      "ethers",
      "@walletconnect/ethereum-provider",
      "@walletconnect/sign-client",
      "@walletconnect/core",
      "@radix-ui/react-select",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-tooltip",
      "lodash-es",
      "date-fns",
      "bignumber.js",
      "graphql",
    ],
  },

  compress: true,
};

export default nextConfig;
