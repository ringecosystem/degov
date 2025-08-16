"use client";

import { DesktopLayout } from "@/components/layouts/desktop-layout";
import { MobileLayout } from "@/components/layouts/mobile-layout";
import { useDeviceDetection } from "@/hooks/useDeviceDetection";

interface DeviceRouterProps {
  children: React.ReactNode;
}

export const DeviceRouter = ({ children }: DeviceRouterProps) => {
  const { isMobile, isTablet, isClient } = useDeviceDetection();

  if (!isClient) {
    return <DesktopLayout>{children}</DesktopLayout>;
  }

  if (isMobile || isTablet) {
    return <MobileLayout>{children}</MobileLayout>;
  }

  return <DesktopLayout>{children}</DesktopLayout>;
}; 