import { ThemeProvider } from "next-themes";

export function NextThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      themes={[
        "light",
        "dark",
        "dark-blue",
        "dark-red",
        "light-green",
        "light-pink",
        "dark-green",
        "dark-purple",
      ]}
    >
      {children}
    </ThemeProvider>
  );
}
