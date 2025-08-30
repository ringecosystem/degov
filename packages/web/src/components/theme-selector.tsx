"use client";

import { Palette } from "lucide-react";
import { useTheme } from "next-themes";

import { Select, SelectContent, SelectTrigger } from "@/components/ui/select";
import { useMounted } from "@/hooks/useMounted";

const themeDisplayNames = {
  light: "明亮",
  dark: "暗黑",
  "dark-blue": "暗蓝",
  "dark-red": "暗红",
  "light-green": "浅绿",
  "light-pink": "浅粉",
  "dark-green": "暗绿",
  "dark-purple": "暗紫",
};

// 基于您的调色板的主题预览颜色 - 使用固定颜色仅作为视觉提示
const themePreviewColors = {
  light: "hsl(var(--always-light))", // 浅色 - 白色
  dark: "hsl(var(--always-dark))", // 深色 - 深灰
  "dark-blue": "#87A4FA", // DarkBlue - 蓝紫色
  "dark-red": "#3F0513", // DarkRed - 暗红色
  "light-green": "#09613C", // LightGreen - 绿色
  "light-pink": "#F26D00", // LightPink - 橙色
  "dark-green": "#74FFDE", // DarkGreen - 青色
  "dark-purple": "#F1CBFF", // DarkPurple - 淡紫色
};

export function ThemeSelector() {
  const { theme, setTheme, themes } = useTheme();
  const mounted = useMounted();

  if (!mounted) return null;

  return (
    <Select value={theme} onValueChange={setTheme}>
      <SelectTrigger className="w-[120px] border-0 bg-transparent">
        <Palette className="h-5 w-5" />
      </SelectTrigger>
      <SelectContent className="w-[280px] p-3">
        <div className="grid grid-cols-4 gap-3">
          {themes?.map((themeName) => (
            <div
              key={themeName}
              className={`
                flex flex-col items-center gap-1 p-2 rounded-lg cursor-pointer transition-all
                ${
                  theme === themeName
                    ? "bg-primary/10 ring-2 ring-primary"
                    : "hover:bg-muted/50"
                }
              `}
              onClick={() => setTheme(themeName)}
            >
              <div
                className="w-8 h-8 rounded-full border-2 border-always-light shadow-md"
                style={{
                  backgroundColor:
                    themePreviewColors[
                      themeName as keyof typeof themePreviewColors
                    ] || "#9E9E9E",
                }}
              />
              <span className="text-xs font-medium text-center">
                {themeDisplayNames[
                  themeName as keyof typeof themeDisplayNames
                ] || themeName}
              </span>
            </div>
          ))}
        </div>
      </SelectContent>
    </Select>
  );
}
