"use client";
import { TooltipTrigger } from "@radix-ui/react-tooltip";
import { capitalize } from "lodash-es";
import Image from "next/image";
import { Fragment, useMemo } from "react";

import { Tooltip, TooltipContent } from "@/components/ui/tooltip";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { cn } from "@/lib/utils";

import { Contracts } from "./contracts";
import { Parameters } from "./parameters";

export const DaoHeader = () => {
  const config = useDaoConfig();

  const isCustomBanner = useMemo(() => {
    return !!config?.theme?.banner && !!config?.theme?.bannerMobile;
  }, [config]);

  return (
    <div
      className="lg:grid grid-cols-[1fr_250px] items-end justify-between rounded-[14px] bg-[#202224] p-[20px]"
      style={{
        backgroundImage: isCustomBanner
          ? `url(${config?.theme?.banner})`
          : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="flex flex-col gap-[10px]">
        <h1
          className={cn(
            "flex items-center gap-[10px] text-[26px] font-extrabold text-white"
          )}
        >
          <Image
            src={config?.logo ?? ""}
            alt="logo"
            className={cn("size-[35px] rounded-full")}
            width={35}
            height={35}
          />

          {config?.name}
          <div className="px-2.5 py-[5px] bg-white rounded-[10px] inline-flex justify-start items-center gap-2.5 hover:bg-foreground/80 transition-colors">
            <div className="justify-start text-[#202224] text-xs font-semibold font-['SF_UI_Display']">
              {config?.chain?.name}
            </div>
          </div>
        </h1>

        <Tooltip>
          <TooltipTrigger asChild>
            <p
              className={cn(
                "line-clamp-2 text-[14px] text-foreground/80 max-w-[693px] text-white"
              )}
            >
              {config?.description}
            </p>
          </TooltipTrigger>
          <TooltipContent className="max-w-[600px] rounded-[26px] bg-card p-[20px] border border-card-background shadow-sm">
            <p className="text-[14px]">{config?.description}</p>
          </TooltipContent>
        </Tooltip>

        <div className="flex items-center gap-[10px]">
          <Parameters />
          <Contracts />
        </div>
      </div>
      <div className="flex items-center lg:justify-end gap-[20px] mt-4 lg:mt-0">
        {Object.entries(config?.links ?? {})
          .filter(([, value]) => value && value.trim() !== "")
          .map(([key, value]) => (
            <Fragment key={key}>
              <a
                key={key}
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                title={capitalize(key)}
                className="size-[24px] items-center justify-center rounded-full bg-white transition-colors hover:bg-white/80 "
                style={{
                  backgroundImage: `url(/assets/image/user_social/${key}.svg)`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "center",
                }}
              ></a>
            </Fragment>
          ))}
      </div>
    </div>
  );
};