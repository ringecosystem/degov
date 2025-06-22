import React, { useState } from "react";
import { AgentVotingAnalysisDialog } from "./agent-voting-analysis-dialog";
import { AiLogo } from "./icons/ai-logo";
import { LoadingSpinner } from "./ui/loading-spinner";
import { ProposalState } from "@/types/proposal";

interface AiAnalysisButtonProps {
  proposalData: {
    proposalId: string;
    title: string;
    description: string;
    proposer: string;
    blockTimestamp: string;
    status: ProposalState;
    chainId?: number;
  };
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const AiAnalysisButton: React.FC<AiAnalysisButtonProps> = ({
  proposalData,
  variant = "default",
  size = "md",
  className = "",
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);

  const baseClasses =
    "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

  const variantClasses = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    outline:
      "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
    ghost: "hover:bg-accent hover:text-accent-foreground",
  };

  const sizeClasses = {
    sm: "h-8 px-3 text-xs",
    md: "h-9 px-4 text-sm",
    lg: "h-10 px-6 text-base",
  };

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  const buttonClasses = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;

  return (
    <>
      <button
        onClick={() => setDialogOpen(true)}
        className={buttonClasses}
        title="View AI Analysis"
      >
        <AiLogo className={iconSizes[size]} />
        AI Analysis
      </button>

      <AgentVotingAnalysisDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        proposalData={proposalData}
      />
    </>
  );
};

// Simplified version for quick integration
interface QuickAiAnalysisProps {
  proposalId: string;
  proposalTitle?: string;
  proposer?: string;
  chainId?: number;
  className?: string;
}

export const QuickAiAnalysis: React.FC<QuickAiAnalysisProps> = ({
  proposalId,
  proposalTitle = "Governance Proposal",
  proposer = "0x0000000000000000000000000000000000000000",
  chainId = 46,
  className = "",
}) => {
  const proposalData = {
    proposalId,
    title: proposalTitle,
    description: "",
    proposer,
    blockTimestamp: new Date().toISOString(),
    status: ProposalState.Active,
    chainId,
  };

  return (
    <AiAnalysisButton
      proposalData={proposalData}
      variant="outline"
      size="sm"
      className={className}
    />
  );
};
