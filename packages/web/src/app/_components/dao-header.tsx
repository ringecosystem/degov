"use client";
import { TooltipTrigger } from "@radix-ui/react-tooltip";
import { capitalize } from "lodash-es";
import Image from "next/image";
import { Fragment } from "react";

import { Tooltip, TooltipContent } from "@/components/ui/tooltip";
import { useDaoConfig } from "@/hooks/useDaoConfig";

import { Contracts } from "./contracts";
import { Parameters } from "./parameters";

export const DaoHeader = () => {
  const config = useDaoConfig();

  return (
    <div className="grid grid-cols-[1fr_250px] items-end justify-between rounded-[14px] bg-card p-[20px]">
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
          <div className="px-2.5 py-[5px] bg-foreground rounded-[10px] inline-flex justify-start items-center gap-2.5 hover:bg-foreground/80 transition-colors">
            <div className="justify-start text-card text-xs font-semibold font-['SF_UI_Display']">
              {config?.chain?.name}
            </div>
          </div>
        </h1>

        <Tooltip>
          <TooltipTrigger asChild>
            <p className="line-clamp-2 text-[14px] text-foreground/80 max-w-[693px]">
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
      <div className="flex items-center justify-end gap-[20px]">
        {Object.entries(config?.links ?? {})
          .filter(([, value]) => value && value.trim() !== "")
          .map(([key, value]) => (
            <Fragment key={key}>
              <a
                key={`${key}-light`}
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                title={capitalize(key)}
                className="flex size-[24px] items-center justify-center rounded-full bg-foreground transition-colors hover:bg-foreground/80 dark:hidden"
                style={{
                  backgroundImage: `url(/assets/image/light/user_social/${key}.svg)`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "center",
                }}
              ></a>

              <a
                key={key}
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                title={capitalize(key)}
                className="size-[24px] items-center justify-center rounded-full bg-foreground transition-colors hover:bg-foreground/80 hidden dark:flex"
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
