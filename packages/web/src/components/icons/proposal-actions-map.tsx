import type { ProposalActionType } from "@/config/proposals";

import {
  TransferOutlineIcon,
  CustomOutlineIcon,
  CrossChainOutlineIcon,
  ProposalsOutlineIcon,
  PreviewOutlineIcon,
} from "./proposal-actions";

import type { IconProps } from "./types";

export const ProposalActionIconMap: Record<
  Exclude<ProposalActionType, "add">,
  React.ComponentType<IconProps>
> = {
  proposal: ProposalsOutlineIcon,
  transfer: TransferOutlineIcon,
  custom: CustomOutlineIcon,
  preview: PreviewOutlineIcon,
  xaccount: CrossChainOutlineIcon,
};

export const getProposalActionIcon = (
  actionType: Exclude<ProposalActionType, "add"> | string
): React.ComponentType<IconProps> => {
  if ((actionType as string) in ProposalActionIconMap) {
    return ProposalActionIconMap[
      actionType as Exclude<ProposalActionType, "add">
    ];
  }
  return ProposalsOutlineIcon;
};
