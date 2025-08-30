import { ThemeProvider } from "next-themes";

export function NextThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider 
      attribute="class" 
      defaultTheme="light"
      themes={[
        'light',        // 明亮模式 (对应调色板的浅色)
        'dark',         // 暗黑模式 (对应调色板的深色)
        'dark-blue',    // 暗蓝主题
        'dark-red',     // 暗红主题
        'light-green',  // 浅绿主题
        'light-pink',   // 浅粉主题
        'dark-green',   // 暗绿主题
        'dark-purple'   // 暗紫主题
      ]}
    >
      {children}
    </ThemeProvider>
  );
}
