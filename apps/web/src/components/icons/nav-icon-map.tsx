import { DashboardIcon, ProposalsIcon, TreasuryIcon, DelegatesIcon, ProfileNavIcon, AppsIcon } from './nav';
import { getIconProps } from './types';

import type { IconProps } from './types';

// Generic icon component for routes that don't have specific icons yet
const GenericNavIcon = (props: IconProps) => {
  const svgProps = getIconProps(props);
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" {...svgProps}>
      <rect x="4" y="4" width="24" height="24" rx="6" className="fill-current opacity-20" />
    </svg>
  );
};

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
