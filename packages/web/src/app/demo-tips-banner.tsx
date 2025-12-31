"use client";

import { AlertIcon } from "@/components/icons";

interface DemoTipsBannerProps {
  isDemoDao?: boolean;
}

export function DemoTipsBanner({ isDemoDao }: DemoTipsBannerProps) {
  if (!isDemoDao) return null;

  return (
    <div className="flex items-center justify-between w-full">
      <div className="text-[14px] w-full">
        <span className="flex items-center gap-[10px] bg-success p-[20px] rounded-[14px]">
          <AlertIcon width={24} height={24} className="shrink-0" />
          <span className="text-[16px] text-always-light font-semibold">
            Note: Welcome to the DeGov demo. Comment your ETH address at{" "}
            <a
              href="https://github.com/ringecosystem/degov/discussions/48"
              target="_blank"
              rel="noreferrer"
              className="font-bold underline"
            >
              here
            </a>{" "}
            to receive test tokens.
          </span>
        </span>
      </div>
    </div>
  );
}
