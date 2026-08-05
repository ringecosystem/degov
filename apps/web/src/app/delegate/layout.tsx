import { buildNoPublicPreviewMetadata } from "@/lib/metadata";

import type { Metadata } from "next";

export const metadata: Metadata = buildNoPublicPreviewMetadata("Delegate");

export default function DelegateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
