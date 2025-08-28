import { DashboardIcon, ProposalsIcon, TreasuryIcon, DelegatesIcon, ProfileNavIcon, AppsIcon } from './nav';
import { IconProps } from './types';

// Generic icon component for routes that don't have specific icons yet
const GenericNavIcon = (props: IconProps) => (
  <div className="w-8 h-8 bg-current opacity-20 rounded" {...props} />
);

export const NavIconMap: Record<string, React.ComponentType<IconProps>> = {
  dashboard: DashboardIcon,
  proposals: ProposalsIcon,
  treasury: TreasuryIcon,
  delegates: DelegatesIcon,
  profile: ProfileNavIcon,
  apps: AppsIcon,
};

export const getNavIcon = (routeKey: string): React.ComponentType<IconProps> => {
  return NavIconMap[routeKey] || GenericNavIcon;
};