export const DEVICE_CONFIG = {
  breakpoints: {
    mobile: 768, // < 768px
    tablet: 1024, // 768px - 1024px
    desktop: 1024, // > 1024px
  },
  features: {
    mobile: {
      sidebar: false,
      searchBar: false,
      compactHeader: true,
      touchOptimized: true,
    },
    tablet: {
      sidebar: false,
      searchBar: false,
      compactHeader: true,
      touchOptimized: true,
    },
    desktop: {
      sidebar: true,
      searchBar: true,
      compactHeader: false,
      touchOptimized: false,
    },
  },
  layout: {
    mobile: {
      headerHeight: "h-14",
      contentPadding: "p-4",
      maxWidth: "max-w-full",
    },
    tablet: {
      headerHeight: "h-16",
      contentPadding: "p-6",
      maxWidth: "max-w-full",
    },
    desktop: {
      headerHeight: "h-[60px]",
      contentPadding: "p-[30px]",
      maxWidth: "max-w-[1460px]",
    },
  },
} as const;

export type DeviceType = keyof typeof DEVICE_CONFIG.features; 