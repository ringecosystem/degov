"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useMemo } from "react";

import { Nav } from "@/app/nav";
import { AppIcon, LogoIcon, BottomLogoIcon } from "@/components/icons";
import { IndexerStatus } from "@/components/indexer-status";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { INDEXER_CONFIG } from "@/config/indexer";
import { useBlockSync } from "@/hooks/useBlockSync";
import { useCustomTheme } from "@/hooks/useCustomTheme";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { cn } from "@/lib/utils";

const SIDEBAR_WIDTH = {
  EXPANDED: 240,
  COLLAPSED: 100,
};

const SIDEBAR_PADDING = {
  EXPANDED: 20,
  COLLAPSED: 20,
};

export const Aside = () => {
  const config = useDaoConfig();
  const [collapsed, setCollapsed] = useState(false);
  const { status, syncPercentage, currentBlock, indexedBlock } = useBlockSync();
  const { isDarkTheme } = useCustomTheme();

  const isCustomLogo = useMemo(() => {
    return !!config?.theme?.logoDark && !!config?.theme?.logoLight;
  }, [config]);

  useEffect(() => {
    const savedState = localStorage.getItem("sidebar-collapsed");
    if (savedState) {
      setCollapsed(savedState === "true");
    }
  }, []);

  const currentWidth = collapsed
    ? SIDEBAR_WIDTH.COLLAPSED
    : SIDEBAR_WIDTH.EXPANDED;
  const currentPadding = collapsed
    ? SIDEBAR_PADDING.COLLAPSED
    : SIDEBAR_PADDING.EXPANDED;

  const toggleCollapse = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    localStorage.setItem("sidebar-collapsed", String(newState));
  };

  return (
    <aside
      className="h-auto flex-shrink-0 border-r border-gray-1 bg-background transition-all duration-300"
      style={{ width: currentWidth }}
    >
      <div
        className={`relative flex h-full flex-col justify-between gap-[20px] pb-[20px] transition-all duration-300 ease-in-out`}
        style={{
          width: currentWidth,
          paddingLeft: currentPadding,
          paddingRight: currentPadding,
        }}
      >
        <button
          onClick={toggleCollapse}
          className="absolute -right-3 top-[100px] z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-background shadow-md hover:scale-105 transition-all duration-100 focus:outline-none border border-border"
          aria-label={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div className="flex flex-col gap-[10px]">
          <div
            className={`flex h-[76px] items-center justify-center transition-all duration-300`}
          >
            {collapsed ? (
              <Link href="/">
                <Image
                  src={config?.logo ?? ""}
                  alt="logo"
                  width={60}
                  height={60}
                  priority
                  className="h-[60px] w-[60px] rounded-full"
                />
              </Link>
            ) : (
              <div className="flex items-center gap-[10px]">
                <Link href="/">
                  {isCustomLogo ? (
                    <Image
                      src={isDarkTheme ? (config?.theme?.logoDark ?? "") : (config?.theme?.logoLight ?? "")}
                      alt="logo"
                      width={128}
                      height={26}
                      priority
                      className="h-[26px] w-[128px] rounded-full border border-[var(--card-background)]"
                    />
                  ) : (
                    <LogoIcon
                      width={128}
                      height={26}
                      className="h-[26px] w-[128px]"
                    />
                  )}
                </Link>
                <Link
                  href="https://apps.degov.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground hover:opacity-80 transition-opacity"
                >
                  <AppIcon width={32} height={32} />
                </Link>
              </div>
            )}
          </div>

          <Nav collapsed={collapsed} />
        </div>

        <footer className="space-y-[16px] duration-300">
          {collapsed ? (
            <div className="flex justify-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "h-[24px] w-[24px] cursor-help rounded-full",
                      INDEXER_CONFIG.colors[status]
                    )}
                  ></div>
                </TooltipTrigger>
                <TooltipContent side="right" className="w-[200px]">
                  <IndexerStatus
                    status={status}
                    syncPercentage={syncPercentage}
                    currentBlock={currentBlock}
                    indexedBlock={indexedBlock}
                  />
                </TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <IndexerStatus
              status={status}
              syncPercentage={syncPercentage}
              currentBlock={currentBlock}
              indexedBlock={indexedBlock}
            />
          )}
          <p
            className={cn(
              "text-xs text-muted-foreground flex items-center gap-[5px]",
              collapsed ? "hidden" : "flex"
            )}
          >
            <span className="text-[12px]">Powered By</span>
            <Link
              href="https://degov.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-80 transition-all duration-300"
            >
              <BottomLogoIcon width={16} height={16} />
            </Link>
            <span className="text-[12px]">DeGov.AI</span>
          </p>
        </footer>
      </div>
    </aside>
  );
};
