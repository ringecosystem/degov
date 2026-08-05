import { buildNoPublicPreviewMetadata } from "@/lib/metadata";

import type { Metadata } from "next";

export const metadata: Metadata = buildNoPublicPreviewMetadata("Delegates");

export default function DelegatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
