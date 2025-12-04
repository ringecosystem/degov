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
    // Optimized device sizes for responsive images
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    // Optimized image sizes for different use cases
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  reactStrictMode: false,

  serverExternalPackages: ["js-yaml"],

  // Cache Components - Disabled temporarily to ensure stable builds
  // The app is primarily client-heavy with Web3 interactions
  // Can be gradually enabled with "use cache" directives for specific components
  // See: NEXTJS16_OPTIMIZATION_SUMMARY.md for gradual adoption strategy
  // cacheComponents: true,

  // Enable React Compiler for automatic optimization
  // Reduces unnecessary re-renders without manual useMemo/useCallback
  reactCompiler: true,

  experimental: {
    staleTimes: {
      dynamic: 300, // 5 minutes for dynamic content
      static: 86400, // 24 hours for static content
    },

    // Optimize package imports for large barrel-file libraries
    // Next.js auto-optimizes: lucide-react, date-fns, lodash-es, recharts, @mui/*, @headlessui/*, @heroicons/*, @visx/visx, @tremor/react, rxjs, @material-ui/*, @tabler/icons-react, react-use, mui-core
    // Only add packages that: 1) export many modules, 2) NOT in default list
    optimizePackageImports: [
      "@rainbow-me/rainbowkit",
      "@tanstack/react-query",
      "wagmi",
      "viem",
      "framer-motion",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-label",
      "@radix-ui/react-progress",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-slot",
      "@radix-ui/react-tabs",
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
