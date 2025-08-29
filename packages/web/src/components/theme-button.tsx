"use client";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { useMounted } from "@/hooks/useMounted";

import { Button } from "./ui/button";
export function ThemeButton() {
  const { setTheme, resolvedTheme } = useTheme();

  const mounted = useMounted();
  if (!mounted) return null;
  return (
    <Button
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      variant="outline"
      className="lg:border lg:border-border rounded-full w-[44px] h-[44px] lg:rounded-[10px]"
    >
      {resolvedTheme === "dark" ? <Moon /> : <Sun />}
    </Button>
  );
}
