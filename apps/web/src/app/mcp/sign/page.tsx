import { Suspense } from "react";

import { buildNoPublicPreviewMetadata } from "@/lib/metadata";

import { McpSignClient } from "./sign-client";

import type { Metadata } from "next";

export const metadata: Metadata = buildNoPublicPreviewMetadata("Sign");

export default function McpSignPage() {
  return (
    <Suspense fallback={null}>
      <McpSignClient />
    </Suspense>
  );
}
