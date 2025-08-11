"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { routes } from "@/config/route";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { cn } from "@/lib/utils";

interface NavProps {
  collapsed?: boolean;
  onMenuToggle?: () => void;
}

export const Nav = ({ collapsed = false, onMenuToggle }: NavProps) => {
  const pathname = usePathname();
  const daoConfig = useDaoConfig();

  // Filter routes based on configuration
  const visibleRoutes = useMemo(() => {
    return routes.filter((route) => {
      // Show apps route only if apps are configured
      if (route.key === "apps") {
        return daoConfig?.apps && daoConfig.apps.length > 0;
      }
      return true;
    });
  }, [daoConfig?.apps]);

  return (
    <nav className="space-y-2">
      <TooltipProvider delayDuration={0}>
        {visibleRoutes.map((route) => {
          const isActive =
            pathname === route.pathname ||
            pathname.startsWith(route.pathname + "/") ||
            (pathname.startsWith("/proposal") &&
              route.pathname === "/proposals") ||
            (pathname.startsWith("/delegate") &&
              route.pathname === "/delegates") ||
            (pathname.startsWith("/apps") && route.pathname === "/apps");

          return (
            <Tooltip key={route.key}>
              <TooltipTrigger asChild>
                <Link
                  href={route.pathname}
                  prefetch={false}
                  className={cn(
                    "group flex w-full items-center gap-[10px] rounded-[10px] px-[30px] capitalize",
                    "transition-all duration-100 hover:bg-foreground hover:font-semibold hover:text-card",
                    isActive && "bg-foreground font-semibold text-card",
                    collapsed
                      ? "h-[60px] w-[60px] justify-center p-0"
                      : "h-[60px] w-full px-[20px] gap-[15px]"
                  )}
                  style={{
                    transition: "all 300ms cubic-bezier(0.4, 0, 0.2, 1)",
                  }}
                >
                  <span className="relative flex-shrink-0 h-[32px] w-[32px]">
                    <Image
                      src={`/assets/image/light/nav/${route.key}.svg`}
                      alt={route.key}
                      width={32}
                      height={32}
                      className={cn(
                        "absolute size-[32px] transition-opacity duration-200 block dark:hidden",
                        "group-hover:opacity-0"
                      )}
                    />
                    <Image
                      src={`/assets/image/nav/${route.key}.svg`}
                      alt={route.key}
                      width={32}
                      height={32}
                      className={cn(
                        "absolute size-[32px] transition-opacity duration-200 hidden dark:block",
                        "group-hover:opacity-0"
                      )}
                    />
                    <Image
                      src={`/assets/image/light/nav/${route.key}-active.svg`}
                      alt={route.key}
                      width={32}
                      height={32}
                      className={cn(
                        "absolute size-[32px] transition-opacity duration-200 block dark:hidden",
                        isActive ? "opacity-100" : "opacity-0",
                        "group-hover:opacity-100"
                      )}
                    />
                    <Image
                      src={`/assets/image/nav/${route.key}-active.svg`}
                      alt={route.key}
                      width={32}
                      height={32}
                      className={cn(
                        "absolute size-[32px] transition-opacity duration-200 hidden dark:block",
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
        })}
      </TooltipProvider>
    </nav>
  );
};
