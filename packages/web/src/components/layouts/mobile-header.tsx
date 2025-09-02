"use client";
import { Menu, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React, { useMemo } from "react";

import { AppIcon, LogoIcon } from "@/components/icons";
import { SearchModal } from "@/components/search-modal";
import { useCustomTheme } from "@/hooks/useCustomTheme";
import { useDaoConfig } from "@/hooks/useDaoConfig";

import { MobileMenu } from "./mobile-menu";

export const MobileHeader = () => {
  const [open, setOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const config = useDaoConfig();
  const { isDarkTheme } = useCustomTheme();

  const isCustomLogo = useMemo(() => {
    return !!config?.theme?.logoDark && !!config?.theme?.logoLight;
  }, [config]);

  const handleMenuToggle = () => {
    setMenuOpen(!menuOpen);
  };

  return (
    <>
      <header className="sticky top-0 z-10 w-full border-b border-gray-1 px-[10px] py-[10px] backdrop-blur-sm bg-background/80 shadow-sm">
        <div className="relative flex h-[24px] items-center justify-between">
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
                <LogoIcon width={128} height={26} className="h-[26px] w-[128px]" />
              )}
            </Link>
            <Link
              href="https://apps.degov.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:opacity-80 transition-opacity"
            >
              <AppIcon width={24} height={24} />
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <button className="p-2 rounded-lg hover:bg-card transition-colors">
              <Search
                className="h-5 w-5 text-foreground"
                onClick={() => setOpen(true)}
              />
            </button>
            <MobileMenu open={menuOpen} onMenuToggle={handleMenuToggle}>
              <button className="p-2 rounded-lg hover:bg-card transition-colors">
                <Menu className="h-5 w-5 text-foreground" />
              </button>
            </MobileMenu>
          </div>
        </div>
      </header>

      <SearchModal open={open} onOpenChange={setOpen} />
    </>
  );
};
