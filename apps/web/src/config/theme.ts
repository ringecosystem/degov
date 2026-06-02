
export const THEME_COLORS = {
  dark: "#000000",
  light: "#FFFFFF",
  "dark-red": "#5C0017",
  "dark-blue": "#0C233B",
  "dark-green": "#005832",
  "light-pink": "#F50",
  "light-green": "#00FFD7",
  "dark-purple": "#8500AD",
} as const;

export type ThemeName = keyof typeof THEME_COLORS;