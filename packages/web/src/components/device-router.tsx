"use client";

import { DesktopLayout } from "@/components/layouts/desktop-layout";
import { MobileLayout } from "@/components/layouts/mobile-layout";
import { useDeviceDetection } from "@/hooks/useDeviceDetection";

interface DeviceRouterProps {
  children: React.ReactNode;
  banner?: React.ReactNode;
}

export const DeviceRouter = ({ children, banner }: DeviceRouterProps) => {
  const { isMobile, isTablet, isClient } = useDeviceDetection();

  if (!isClient) {
    return <DesktopLayout banner={banner}>{children}</DesktopLayout>;
  }

  if (isMobile || isTablet) {
    return <MobileLayout banner={banner}>{children}</MobileLayout>;
  }

  return <DesktopLayout banner={banner}>{children}</DesktopLayout>;
}; 
