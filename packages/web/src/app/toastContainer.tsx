"use client";
import { useTheme } from "next-themes";
import { ToastContainer as ToastContainerComponent } from "react-toastify";

export function ToastContainer() {
  const { resolvedTheme } = useTheme();

  return (
    <ToastContainerComponent
      pauseOnFocusLoss={false}
      theme={resolvedTheme}
      className="w-auto text-[14px] md:w-[380px]"
    />
  );
}
