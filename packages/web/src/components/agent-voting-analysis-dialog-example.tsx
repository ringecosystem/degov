import React, { useState } from "react";
import { AgentVotingAnalysisDialog } from "./agent-voting-analysis-dialog";
import { ProposalState } from "@/types/proposal";

export const AgentVotingAnalysisDialogExample = () => {
  const [open, setOpen] = useState(false);

  const mockProposalData = {
    proposalId:
      "0x474ec4da8ae93a02f63445e646682dbc06a4b55286e86c750bcd7916385b3907",
    title: "[Non-Constitutional] DCDAO Delegate Incentive Program",
    description:
      "A proposal to establish an incentive program for DCDAO delegates...",
    proposer: "0x1234567890123456789012345678901234567890",
    blockTimestamp: "1704499200000", // Jan 6th 2025
    status: ProposalState.Defeated,
  };

  return (
    <div className="p-8 flex flex-col gap-4">
      <h2 className="text-2xl font-bold">Agent Voting Analysis Dialog Demo</h2>
      <p className="text-muted-foreground">
        This dialog shows AI agent's voting analysis with the project's design
        system.
      </p>

      <button
        onClick={() => setOpen(true)}
        className="px-6 py-3 bg-primary text-primary-foreground rounded-[14px] hover:bg-primary/90 transition-colors w-fit"
      >
        Open Agent Voting Analysis Dialog
      </button>

      <AgentVotingAnalysisDialog
        open={open}
        onOpenChange={setOpen}
        proposalData={mockProposalData}
      />
    </div>
  );
};
