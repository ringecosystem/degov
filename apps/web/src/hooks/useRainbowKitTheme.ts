'use client';
import { darkTheme, lightTheme } from '@rainbow-me/rainbowkit';


import { useCustomTheme } from './useCustomTheme';
import { useMounted } from './useMounted';

export function useRainbowKitTheme() {
  const { isDarkTheme } = useCustomTheme();
  const mounted = useMounted();

  // Use default theme for server-side rendering to avoid hydration mismatch
  const defaultTheme = lightTheme({
    borderRadius: 'medium'
  });

  // During server-side rendering and initial client render before mounting,
  // return the default theme to prevent hydration mismatch
  if (!mounted) {
    return defaultTheme;
  }

  if (isDarkTheme) {
    return darkTheme({
      borderRadius: 'medium',
      accentColor: 'hsl(var(--foreground))',
      accentColorForeground: 'hsl(var(--card))',
    });
  } else {
    return lightTheme({
      borderRadius: 'medium',
      accentColor: 'hsl(var(--foreground))',
      accentColorForeground: 'hsl(var(--card))',
    });
  }
}
