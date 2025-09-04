"use client";

import { useTheme } from "next-themes";

export function useCustomTheme() {
  const { theme, setTheme, themes } = useTheme();

  const isDarkTheme = (themeName: string | undefined): boolean => {
    if (!themeName) return false;
    return themeName === "dark" || themeName.startsWith("dark-");
  };

  const isLightTheme = (themeName: string | undefined): boolean => {
    if (!themeName) return true; 
    return themeName === "light" || themeName.startsWith("light-");
  };

  const currentIsDark = isDarkTheme(theme);
  const currentIsLight = isLightTheme(theme);

  return {
    theme,
    setTheme,
    themes,
    isDarkTheme: currentIsDark,
    isLightTheme: currentIsLight,
    isDarkThemeByName: isDarkTheme,
    isLightThemeByName: isLightTheme,
  };
}