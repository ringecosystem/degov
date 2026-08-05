import { buildNoPublicPreviewMetadata } from "@/lib/metadata";

import type { Metadata } from "next";

export const metadata: Metadata = buildNoPublicPreviewMetadata("Treasury");

export default function TreasuryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
