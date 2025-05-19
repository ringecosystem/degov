'use client';
import { darkTheme, lightTheme } from '@rainbow-me/rainbowkit';
import { useTheme } from 'next-themes';

import { useMounted } from './useMounted';

export const dark = darkTheme({
  borderRadius: 'medium'
});

export const light = lightTheme({
  borderRadius: 'medium'
});

export function useRainbowKitTheme() {
  const { theme, systemTheme } = useTheme();
  const mounted = useMounted();

  // Use default theme for server-side rendering to avoid hydration mismatch
  const defaultTheme = dark; // Use dark theme as default on server

  // During server-side rendering and initial client render before mounting,
  // return the default theme to prevent hydration mismatch
  if (!mounted) {
    return defaultTheme;
  }

  const resolvedTheme = theme === 'system' ? systemTheme : theme;
  return resolvedTheme === 'dark' ? dark : light;
}
