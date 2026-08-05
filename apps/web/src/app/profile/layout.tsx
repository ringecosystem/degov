import { buildNoPublicPreviewMetadata } from "@/lib/metadata";

import type { Metadata } from "next";

export const metadata: Metadata = buildNoPublicPreviewMetadata("Profile");

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
