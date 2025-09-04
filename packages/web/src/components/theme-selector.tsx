"use client";

import { Palette } from "lucide-react";
import { useTheme } from "next-themes";

import { Select, SelectContent, SelectTrigger } from "@/components/ui/select";
import { THEME_COLORS, type ThemeName } from "@/config/theme";
import { useMounted } from "@/hooks/useMounted";

export function ThemeSelector() {
  const { theme, setTheme, themes } = useTheme();
  const mounted = useMounted();

  if (!mounted) return null;

  return (
    <Select value={theme} onValueChange={setTheme}>
      <SelectTrigger className="lg:border lg:border-border rounded-full w-[42px] bg-card lg:bg-background h-[42px] lg:rounded-[10px] border-input  p-0 flex items-center justify-center [&>svg:last-child]:hidden">
        <Palette className="h-[20px] w-[20px]" />
      </SelectTrigger>
      <SelectContent className="w-full sm:w-auto p-0 border-0 bg-transparent shadow-none">
        <div className="bg-card rounded-[26px] p-[20px] sm:p-6 shadow-card w-full">
          <div className="grid grid-cols-4 gap-3 sm:gap-4">
            {themes?.slice(0, 8).map((themeName) => {
              const isSelected = theme === themeName;
              const color = THEME_COLORS[themeName as ThemeName] || "#9E9E9E";

              return (
                <div
                  key={themeName}
                  className="w-[30px] h-[30px] rounded-full transition-all duration-200 hover:scale-110 focus:outline-none focus:scale-110 relative border cursor-pointer"
                  style={{ backgroundColor: color, borderColor: "#7E7E7E" }}
                  onClick={() => setTheme(themeName)}
                  aria-label={`Switch to ${themeName} theme`}
                >
                  {isSelected && (
                    <div
                      className="absolute w-3 h-3 rounded-full top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
                      style={{
                        backgroundColor:
                          themeName === "light" ? "#000000" : "#FFFFFF",
                      }}
                    ></div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </SelectContent>
    </Select>
  );
}
