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
  },
  reactStrictMode: false,

  serverExternalPackages: ["js-yaml"],

  experimental: {
    staleTimes: {
      dynamic: Infinity,
      static: Infinity,
    },
  },
};

export default nextConfig;
