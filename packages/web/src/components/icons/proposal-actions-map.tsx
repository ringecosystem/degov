import { TransferOutlineIcon, CustomOutlineIcon, CrossChainOutlineIcon, ProposalsOutlineIcon, PreviewOutlineIcon } from './proposal-actions';
import { IconProps } from './types';

export const ProposalActionIconMap: Record<string, React.ComponentType<IconProps>> = {
  proposal: ProposalsOutlineIcon,
  transfer: TransferOutlineIcon,
  custom: CustomOutlineIcon,
  preview: PreviewOutlineIcon,
  xaccount: CrossChainOutlineIcon,
};

export const getProposalActionIcon = (actionType: string): React.ComponentType<IconProps> => {
  return ProposalActionIconMap[actionType] || ProposalsOutlineIcon; // fallback to proposals icon
};