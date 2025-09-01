import { ThemeProvider } from "next-themes";

import { THEME_COLORS } from "@/config/theme";

export function NextThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      themes={Object.keys(THEME_COLORS)}
      enableSystem={false}
    >
      {children}
    </ThemeProvider>
  );
}
