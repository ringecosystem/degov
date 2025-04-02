"use client";
import Image from "next/image";

import AlertUI from "@/components/alert";
import { useDaoConfig } from "@/hooks/useDaoConfig";
export function DemoTips() {
  const daoConfig = useDaoConfig();
  return (
    daoConfig?.name === "DeGov Development Test DAO" && (
      <AlertUI
        message={
          <span className="flex items-center gap-[10px] bg-success p-[20px] rounded-[14px]">
            <Image
              src="/assets/image/alert.svg"
              alt="warning"
              width={24}
              height={24}
            />
            <span className="text-[16px] text-white">
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
