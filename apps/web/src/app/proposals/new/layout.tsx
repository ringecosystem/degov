import { buildNoPublicPreviewMetadata } from "@/lib/metadata";

import type { Metadata } from "next";

export const metadata: Metadata = buildNoPublicPreviewMetadata("New proposal");

export default function NewProposalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
