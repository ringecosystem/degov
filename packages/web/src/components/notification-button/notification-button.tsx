"use client";

import { NotificationDropdown } from "../notification-dropdown";

interface NotificationButtonProps {
  address: `0x${string}`;
}

export const NotificationButton = ({ address }: NotificationButtonProps) => {
  // Only show notification button if user is connected
  if (!address) {
    return null;
  }

  return <NotificationDropdown />;
};