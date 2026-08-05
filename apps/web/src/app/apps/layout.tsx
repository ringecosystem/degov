import { buildNoPublicPreviewMetadata } from "@/lib/metadata";

import type { Metadata } from "next";

export const metadata: Metadata = buildNoPublicPreviewMetadata("Apps");

export default function AppsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
