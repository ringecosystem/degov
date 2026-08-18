import { buildNoPublicPreviewMetadata } from "@/lib/metadata";

import type { Metadata } from "next";

export const metadata: Metadata = buildNoPublicPreviewMetadata("Proposal drafts");

export default function ProposalDraftsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
