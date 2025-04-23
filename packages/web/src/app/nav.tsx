"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { routes } from "@/config/route";
import { cn } from "@/lib/utils";

interface NavProps {
  collapsed?: boolean;
}

export const Nav = ({ collapsed = false }: NavProps) => {
  const pathname = usePathname();
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMenuMouseEnter = (key: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setActiveMenu(key);
  };

  const handleMenuMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setActiveMenu(null);
    }, 100);
  };

  return (
    <nav className="space-y-2">
      <TooltipProvider delayDuration={0}>
        {routes.map((route) => {
          const isActive =
            pathname === route.pathname ||
            pathname.startsWith(route.pathname + "/") ||
            (pathname.startsWith("/proposal") &&
              route.pathname === "/proposals");

          const hasChildren = route.children && route.children.length > 0;

          if (!hasChildren) {
            return (
              <Tooltip key={route.key}>
                <TooltipTrigger asChild>
                  <Link
                    href={route.pathname}
                    className={cn(
                      "group flex w-full items-center gap-[10px] rounded-[10px] px-[30px] capitalize",
                      "transition-all duration-100 hover:bg-foreground hover:font-semibold hover:text-card",
                      isActive && "bg-foreground font-semibold text-card",
                      collapsed
                        ? "h-[50px] w-[50px] justify-center p-0"
                        : "h-[60px] w-full px-[20px] gap-[15px]"
                    )}
                    style={{
                      transition: "all 300ms cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                  >
                    <span className="relative flex-shrink-0 h-[32px] w-[32px]">
                      <Image
                        src={`/assets/image/nav/${route.key}.svg`}
                        alt={route.key}
                        width={32}
                        height={32}
                        className={cn(
                          "absolute size-[32px] transition-opacity duration-200",
                          "group-hover:opacity-0"
                        )}
                      />
                      <Image
                        src={`/assets/image/nav/${route.key}-active.svg`}
                        alt={route.key}
                        width={32}
                        height={32}
                        className={cn(
                          "absolute size-[32px] transition-opacity duration-200",
                          isActive ? "opacity-100" : "opacity-0",
                          "group-hover:opacity-100"
                        )}
                      />
                    </span>

                    {!collapsed && (
                      <span className="text-[16px] truncate">{route.key}</span>
                    )}
                  </Link>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  className={collapsed ? "" : "hidden"}
                >
                  {route.key}
                </TooltipContent>
              </Tooltip>
            );
          }

          return (
            <div
              key={route.key}
              className="relative"
              onMouseEnter={() => handleMenuMouseEnter(route.key)}
              onMouseLeave={handleMenuMouseLeave}
            >
              <div
                className={cn(
                  "group flex w-full items-center gap-[10px] rounded-[10px] px-[30px] capitalize cursor-pointer",
                  "transition-all duration-100 hover:bg-foreground hover:font-semibold hover:text-card",
                  isActive && "bg-foreground font-semibold text-card",
                  collapsed
                    ? "h-[50px] w-[50px] justify-center p-0"
                    : "h-[60px] w-full px-[20px] gap-[15px]"
                )}
                style={{
                  transition: "all 300ms cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              >
                <span className="relative flex-shrink-0 h-[32px] w-[32px]">
                  <Image
                    src={`/assets/image/nav/${route.key}.svg`}
                    alt={route.key}
                    width={32}
                    height={32}
                    className={cn(
                      "absolute size-[32px] transition-opacity duration-200",
                      "group-hover:opacity-0"
                    )}
                  />
                  <Image
                    src={`/assets/image/nav/${route.key}-active.svg`}
                    alt={route.key}
                    width={32}
                    height={32}
                    className={cn(
                      "absolute size-[32px] transition-opacity duration-200",
                      isActive ? "opacity-100" : "opacity-0",
                      "group-hover:opacity-100"
                    )}
                  />
                </span>

                {!collapsed && (
                  <span className="text-[16px] truncate">{route.key}</span>
                )}
              </div>

              {activeMenu === route.key && (
                <div className="p-[5px] absolute left-[calc(100%+12px)] top-0 bg-foreground rounded-[10px] inline-flex flex-col justify-start items-center gap-[5px] shadow-md z-50">
                  {route.children?.map((child) => (
                    <Link
                      key={child.key}
                      href={child.pathname}
                      className="px-2.5 py-[5px] inline-flex justify-start items-center gap-2.5 hover:bg-gray-100 rounded-[4px] transition-colors duration-150 w-full min-w-[150px]"
                    >
                      <div className="text-background text-sm font-normal">
                        {child.key}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </TooltipProvider>
    </nav>
  );
};
