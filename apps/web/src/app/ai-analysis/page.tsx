import { notFound } from "next/navigation";

import { buildNoPublicPreviewMetadata } from "@/lib/metadata";

import type { Metadata } from "next";

export const metadata: Metadata = buildNoPublicPreviewMetadata("AI analysis");

export default function AiAnalysisIndexPage() {
  notFound();
}
