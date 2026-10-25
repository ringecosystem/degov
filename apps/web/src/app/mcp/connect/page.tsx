import { Suspense } from "react";

import { buildNoPublicPreviewMetadata } from "@/lib/metadata";

import { McpConnectClient } from "./connect-client";

import type { Metadata } from "next";

export const metadata: Metadata = buildNoPublicPreviewMetadata("Connect wallet");

export default function McpConnectPage() {
  return (
    <Suspense fallback={null}>
      <McpConnectClient />
    </Suspense>
  );
}
