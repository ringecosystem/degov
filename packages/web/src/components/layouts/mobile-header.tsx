"use client";
import { Menu, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React, { useMemo } from "react";

import { SearchModal } from "@/components/search-modal";
import { useDaoConfig } from "@/hooks/useDaoConfig";

import { MobileMenu } from "./mobile-menu";

export const MobileHeader = () => {
  const [open, setOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const config = useDaoConfig();

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
                <>
                  <Image
                    src={config?.theme?.logoDark ?? ""}
                    alt="logo"
                    width={128}
                    height={26}
                    priority
                    className="h-[26px] w-[128px] rounded-full hidden dark:block border border-[var(--card-background)]"
                  />
                  <Image
                    src={config?.theme?.logoLight ?? ""}
                    alt="logo"
                    width={128}
                    height={26}
                    priority
                    className="h-[26px] w-[128px] rounded-full block dark:hidden border border-[var(--card-background)]"
                  />
                </>
              ) : (
                <>
                  <Image
                    src="/assets/image/logo.svg"
                    alt="logo"
                    width={128}
                    height={26}
                    priority
                    className="h-[26px] w-[128px] hidden dark:block"
                  />
                  <Image
                    src="/assets/image/light/logo.svg"
                    alt="logo"
                    width={128}
                    height={26}
                    priority
                    className="h-[26px] w-[128px] block dark:hidden"
                  />
                </>
              )}
            </Link>
            <Link
              href="https://apps.degov.ai"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Image
                src="/assets/image/app.svg"
                alt="logo"
                width={24}
                height={24}
                priority
                className="hidden dark:block"
              />
              <Image
                src="/assets/image/light/app.svg"
                alt="logo"
                width={24}
                height={24}
                priority
                className="block dark:hidden"
              />
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
