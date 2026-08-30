"use client";

import { useTranslations } from "next-intl";

import { AlertIcon } from "@/components/icons";

interface DemoTipsBannerProps {
  isDemoDao?: boolean;
  faucetUrl?: string;
}

export function DemoTipsBanner({ isDemoDao, faucetUrl }: DemoTipsBannerProps) {
  const t = useTranslations("common.demoBanner");

  if (!isDemoDao) return null;

  return (
    <div className="flex items-center justify-between w-full">
      <div className="text-[14px] w-full">
        <span className="flex items-center gap-[10px] bg-success p-[20px] rounded-[14px]">
          <AlertIcon width={24} height={24} className="shrink-0" />
          <span className="text-[16px] text-always-light font-semibold">
            {t.rich("message", {
              link: (chunks) => (
                <a
                  href="https://github.com/ringecosystem/degov/discussions/48"
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold underline"
                >
                  {chunks}
                </a>
              ),
            })}
            {faucetUrl ? (
              <a href={faucetUrl} className="ml-3 font-bold underline">
                {t("faucet")}
              </a>
            ) : null}
          </span>
        </span>
      </div>
    </div>
  );
}
