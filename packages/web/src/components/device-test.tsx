"use client";

import { useDeviceDetection } from "@/hooks/useDeviceDetection";

export const DeviceTest = () => {
  const { deviceType, isMobile, isTablet, isDesktop, isClient } = useDeviceDetection();

  return (
    <div className="fixed top-4 right-4 z-50 bg-black/80 text-white p-2 rounded text-xs">
      <div>Device: {deviceType}</div>
      <div>Mobile: {isMobile ? "Yes" : "No"}</div>
      <div>Tablet: {isTablet ? "Yes" : "No"}</div>
      <div>Desktop: {isDesktop ? "Yes" : "No"}</div>
      <div>Client: {isClient ? "Yes" : "No"}</div>
    </div>
  );
}; 