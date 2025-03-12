"use client";

import { ProposalsTable } from "@/components/proposals-table";

export const Proposals = () => {
  return (
    <div className="flex flex-col gap-[20px]">
      <h3 className="text-[18px] font-extrabold">Proposals</h3>
      <ProposalsTable type="active" />
    </div>
  );
};
