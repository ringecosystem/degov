"use client";

import { useState } from "react";
import { AgentVotingAnalysisDialog } from "@/components/agent-voting-analysis-dialog";
import { ProposalState } from "@/types/proposal";
import { getShortProposalId } from "@/utils/ai-analysis";

export default function DemoAiAnalysisPage() {
  const [dialogOpen, setDialogOpen] = useState(false);

  // Real proposal data from the API response
  const proposalData = {
    proposalId:
      "0xd405fa55165a239bc26d7324dee1a30e9baa5fc257ac16233ba20cd204a56909",
    title: "[Non-Constitutional] DCDAO Delegate Incentive Program",
    description:
      "This proposal aims to establish a delegate incentive program for the DCDAO to enhance governance participation and delegate engagement.",
    proposer: "0x1234567890123456789012345678901234567890",
    blockTimestamp: "2025-06-20T06:24:11.879Z",
    status: ProposalState.Defeated,
    chainId: 46,
  };

  const shortProposalId = getShortProposalId(proposalData.proposalId);
  const apiUrl = `https://agent.degov.ai/degov/vote/${proposalData.chainId}/${shortProposalId}?format=json`;

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold">DeGov.AI Analysis Demo</h1>
          <p className="text-muted-foreground text-lg">
            Click the button below to view the AI voting analysis dialog with
            real API data
          </p>
        </div>

        <div className="bg-card rounded-lg p-6 space-y-4">
          <h2 className="text-2xl font-semibold">Proposal Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-medium text-muted-foreground">
                Full Proposal ID
              </h3>
              <p className="font-mono text-sm break-all">
                {proposalData.proposalId}
              </p>
            </div>
            <div>
              <h3 className="font-medium text-muted-foreground">
                Short Proposal ID
              </h3>
              <p className="font-mono text-sm">{shortProposalId}</p>
            </div>
            <div>
              <h3 className="font-medium text-muted-foreground">Chain ID</h3>
              <p>{proposalData.chainId} (Darwinia Network)</p>
            </div>
            <div>
              <h3 className="font-medium text-muted-foreground">Status</h3>
              <p className="text-red-500 font-medium">DEFEATED</p>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-medium text-muted-foreground">API Endpoint</h3>
            <div className="bg-muted rounded-lg p-3">
              <code className="text-sm break-all">{apiUrl}</code>
            </div>
          </div>

          <div className="flex justify-center pt-4">
            <button
              onClick={() => setDialogOpen(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-3 rounded-lg font-medium transition-colors"
            >
              View AI Analysis Dialog
            </button>
          </div>
        </div>

        <div className="bg-card rounded-lg p-6 space-y-4">
          <h2 className="text-2xl font-semibold">API Integration Features</h2>
          <div className="bg-muted rounded-lg p-4">
            <h3 className="font-medium mb-2">Features Demonstrated:</h3>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>• Real API integration with DeGov.AI agent service</li>
              <li>• Automatic proposal ID shortening (first 11 characters)</li>
              <li>• Loading states with spinner and progress indicators</li>
              <li>• Error handling with retry functionality</li>
              <li>• Dynamic data fetching based on chain ID and proposal ID</li>
              <li>• Markdown rendering for AI analysis reasoning</li>
              <li>• Responsive vote breakdown visualizations</li>
              <li>• Confidence scoring with star rating system</li>
            </ul>
          </div>
        </div>

        <div className="bg-card rounded-lg p-6 space-y-4">
          <h2 className="text-2xl font-semibold">API Response Structure</h2>
          <div className="bg-muted rounded-lg p-4">
            <h3 className="font-medium mb-2">Expected Response Format:</h3>
            <pre className="text-xs text-muted-foreground overflow-x-auto">
              {`{
  "code": 0,
  "data": [{
    "id": "1935946765317832887",
    "proposal_id": "0xd405fa55...",
    "chain_id": 46,
    "status": "defeated",
    "fulfilled_explain": {
      "input": {
        "pollOptions": [
          {"label": "For", "votes": 0, "position": 1},
          {"label": "Against", "votes": 5, "position": 2},
          {"label": "Abstain", "votes": 0, "position": 3}
        ]
      },
      "output": {
        "finalResult": "Against",
        "confidence": 9,
        "reasoning": "## Analysis...",
        "votingBreakdown": {
          "twitterPoll": {"for": 0, "against": 100, "abstain": 0},
          "onChainVotes": {"for": 0, "against": 1047, "abstain": 0}
        }
      }
    }
  }]
}`}
            </pre>
          </div>
        </div>
      </div>

      <AgentVotingAnalysisDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        proposalData={proposalData}
      />
    </div>
  );
}
