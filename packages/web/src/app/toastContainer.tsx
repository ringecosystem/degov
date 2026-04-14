"use client";
import { ToastContainer as ToastContainerComponent } from "react-toastify";

import { useCustomTheme } from "@/hooks/useCustomTheme";

export function ToastContainer() {
  const { isDarkTheme } = useCustomTheme();

  return (
    <ToastContainerComponent
      pauseOnFocusLoss={false}
      theme={isDarkTheme ? "dark" : "light"}
      className="w-auto text-[14px] md:w-[380px]"
    />
  );
}
