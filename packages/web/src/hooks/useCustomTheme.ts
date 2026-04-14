"use client";

import { useTheme } from "next-themes";

export function useCustomTheme() {
  const { theme, setTheme, themes, resolvedTheme } = useTheme();

  const isDarkTheme = (themeName: string | undefined): boolean => {
    if (!themeName) return false;
    return themeName === "dark" || themeName.startsWith("dark-");
  };

  const isLightTheme = (themeName: string | undefined): boolean => {
    if (!themeName) return true; 
    return themeName === "light" || themeName.startsWith("light-");
  };

  const activeTheme = resolvedTheme ?? theme;
  const currentIsDark = isDarkTheme(activeTheme);
  const currentIsLight = isLightTheme(activeTheme);

  return {
    theme: activeTheme,
    setTheme,
    themes,
    isDarkTheme: currentIsDark,
    isLightTheme: currentIsLight,
    isDarkThemeByName: isDarkTheme,
    isLightThemeByName: isLightTheme,
  };
}
