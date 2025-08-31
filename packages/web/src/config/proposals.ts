import { ProposalState } from "@/types/proposal";

export type ProposalActionType =
  | "proposal"
  | "transfer"
  | "custom"
  | "xaccount"
  | "preview"
  | "add";

export const getDisplayText = (status: ProposalState) => {
  switch (status) {
    case ProposalState.Pending:
      return "Pending";
    case ProposalState.Active:
      return "Active";
    case ProposalState.Canceled:
      return "Canceled";
    case ProposalState.Defeated:
      return "Defeated";
    case ProposalState.Succeeded:
      return "Succeeded";
    case ProposalState.Queued:
      return "Queued";
    case ProposalState.Expired:
      return "Expired";
    case ProposalState.Executed:
      return "Executed";
    default:
      return "-";
  }
};

export const getStatusColor = (status: ProposalState) => {
  switch (status) {
    case ProposalState.Pending:
      return {
        bg: "bg-pending/10",
        text: "text-pending",
      };
    case ProposalState.Active:
      return {
        bg: "bg-active/10",
        text: "text-active",
      };
    case ProposalState.Canceled:
      return {
        bg: "bg-canceled/10",
        text: "text-canceled",
      };
    case ProposalState.Defeated:
      return {
        bg: "bg-defeated/10",
        text: "text-defeated",
      };
    case ProposalState.Succeeded:
      return {
        bg: "bg-succeeded/10",
        text: "text-succeeded",
      };
    case ProposalState.Queued:
      return {
        bg: "bg-succeeded/10",
        text: "text-succeeded",
      };
    case ProposalState.Expired:
      return {
        bg: "bg-succeeded/10",
        text: "text-succeeded",
      };
    case ProposalState.Executed:
      return {
        bg: "bg-executed/10",
        text: "text-executed",
      };
    default:
      return {
        bg: "",
        text: "",
      };
  }
};
