"use client";

import AlertUI from "@/components/alert";
import { AlertIcon } from "@/components/icons";
import { useIsDemoDao } from "@/hooks/useIsDemoDao";
export function DemoTips() {
  const isDemoDao = useIsDemoDao();
  return (
    isDemoDao && (
      <AlertUI
        message={
          <span className="flex items-center gap-[10px] bg-success p-[20px] rounded-[14px]">
            <AlertIcon width={24} height={24} className="flex-shrink-0" />
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
        }
      />
    )
  );
}
