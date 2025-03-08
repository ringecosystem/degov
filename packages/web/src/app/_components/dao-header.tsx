"use client";
import Image from "next/image";

import { useConfig } from "@/hooks/useConfig";

import { Contracts } from "./contracts";
import { Parameters } from "./parameters";

export const DaoHeader = () => {
  const config = useConfig();

  return (
    <div className="grid grid-cols-2 items-end justify-between rounded-[14px] bg-card p-[20px]">
      <div className="flex flex-col gap-[10px]">
        <h1 className="flex items-center gap-[10px] text-[26px] font-extrabold">
          <Image
            src={config?.logo ?? ""}
            alt="logo"
            className="size-[35px] rounded-full"
            width={35}
            height={35}
          />
          {config?.name}
        </h1>
        <p className="line-clamp-2 text-[14px] text-card-foreground">
          {config?.description}
        </p>
        <div className="flex items-center gap-[10px]">
          <Parameters />
          <Contracts />
        </div>
      </div>
      <div className="flex items-center justify-end gap-[20px]">
        {Object.entries(config?.links ?? {})
          .filter(([, value]) => value && value.trim() !== "")
          .map(([key, value]) => (
            <a
              key={key}
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="flex size-[24px] items-center justify-center rounded-full bg-white transition-colors hover:bg-white/80"
              style={{
                backgroundImage: `url(/assets/image/user_social/${key}.svg)`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
              }}
            ></a>
          ))}
      </div>
    </div>
  );
};
