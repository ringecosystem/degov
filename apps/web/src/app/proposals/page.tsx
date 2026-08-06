import { buildProposalDirectoryMetadata } from "@/lib/metadata";

import { getActiveDaoConfig, getPublicProposalList } from "../_server/public-seo";

import { ProposalsClient } from "./proposals-client";

import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getActiveDaoConfig();
  return buildProposalDirectoryMetadata(config);
}

export default async function ProposalsPage() {
  const config = await getActiveDaoConfig();
  const initialPage = await getPublicProposalList(config);

  return (
    <div className="flex flex-col gap-[20px]">
      <ProposalsClient initialPage={initialPage} />
    </div>
  );
}
