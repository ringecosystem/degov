"use client";

import { useEffect, useState } from "react";

export type DeviceType = "mobile" | "tablet" | "desktop";

interface DeviceConfig {
  mobile: number;
  tablet: number;
  desktop: number;
}

const DEVICE_BREAKPOINTS: DeviceConfig = {
  mobile: 768, // < 768px
  tablet: 1024, // 768px - 1024px
  desktop: 1024, // > 1024px
};

export const useDeviceDetection = () => {
  const [deviceType, setDeviceType] = useState<DeviceType>("desktop");
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    
    const checkDeviceType = () => {
      const width = window.innerWidth;
      
      if (width < DEVICE_BREAKPOINTS.mobile) {
        setDeviceType("mobile");
      } else if (width < DEVICE_BREAKPOINTS.tablet) {
        setDeviceType("tablet");
      } else {
        setDeviceType("desktop");
      }
    };

    checkDeviceType();

    window.addEventListener("resize", checkDeviceType);

    return () => {
      window.removeEventListener("resize", checkDeviceType);
    };
  }, []);

  return {
    deviceType: isClient ? deviceType : "desktop",
    isMobile: deviceType === "mobile",
    isTablet: deviceType === "tablet",
    isDesktop: deviceType === "desktop",
    isClient,
  };
}; 