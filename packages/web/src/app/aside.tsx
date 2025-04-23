"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";

import { IndexerStatus } from "@/components/indexer-status";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { INDEXER_CONFIG } from "@/config/indexer";
import { socialConfig } from "@/config/social";
import { useBlockSync } from "@/hooks/useBlockSync";
import { cn } from "@/lib/utils";

import packageInfo from "../../package.json";

import { Nav } from "./nav";

const SIDEBAR_WIDTH = {
  EXPANDED: 240,
  COLLAPSED: 80,
};

const SIDEBAR_PADDING = {
  EXPANDED: 20,
  COLLAPSED: 10,
};

export const Aside = () => {
  const [collapsed, setCollapsed] = useState(false);
  const { status, syncPercentage, currentBlock, indexedBlock } = useBlockSync();

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
      className="h-auto flex-shrink-0 border-r border-[#474747] bg-background transition-all duration-300"
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
          <Link
            className={`flex h-[76px] items-center justify-center transition-all duration-300`}
            href="/"
          >
            {collapsed ? (
              <Image
                src="/assets/image/logo-simple.svg"
                alt="logo"
                width={32}
                height={32}
                priority
                className="h-[32px] w-[32px]"
              />
            ) : (
              <Image
                src="/assets/image/logo.svg"
                alt="logo"
                width={128}
                height={26}
                priority
                className="h-[26px] w-[128px]"
              />
            )}
          </Link>

          <Nav collapsed={collapsed} />
        </div>

        <footer className="space-y-[16px]  duration-300">
          {collapsed ? (
            <div className="flex justify-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "h-5 w-5 cursor-help rounded-full",
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

          <div
            className={`flex items-center gap-[10px] ${
              collapsed ? "flex-col" : "justify-around"
            }`}
          >
            {socialConfig.map((social) => (
              <Tooltip key={social.name}>
                <TooltipTrigger asChild>
                  <a
                    href={
                      social.name === "Github"
                        ? `${social.url}v${packageInfo.version}`
                        : social.url
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "relative flex h-[24px]  items-center justify-center w-[24px] rounded-[36px] bg-card transition-opacity duration-300 hover:opacity-80",
                      social.name === "Github" && "px-[5px] w-auto gap-[5px]"
                    )}
                  >
                    <Image
                      src={social.assetPath}
                      alt={social.name}
                      width={social?.width || 24}
                      height={social?.height || 24}
                      className="object-contain"
                    />
                    {social.name === "Github" && (
                      <span className="text-xs text-muted-foreground">
                        {packageInfo.version}
                      </span>
                    )}
                  </a>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  className={collapsed ? "" : "hidden"}
                >
                  {social.name}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </footer>
      </div>
    </aside>
  );
};
