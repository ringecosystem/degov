import NotFound from "@/components/not-found";
import { buildNoPublicPreviewMetadata } from "@/lib/metadata";

import type { Metadata } from "next";

export const metadata: Metadata = buildNoPublicPreviewMetadata("Page not found");

export default function NotFoundPage() {
  return <NotFound />;
}
