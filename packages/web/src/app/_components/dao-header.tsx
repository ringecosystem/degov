"use client";
import { TooltipTrigger } from "@radix-ui/react-tooltip";
import { capitalize } from "lodash-es";
import Image from "next/image";
import { useTheme } from "next-themes";
import { Fragment, useMemo, useState } from "react";

import {
  UserGithubIcon,
  WebsiteIcon,
  UserTelegramIcon,
  TwitterIcon,
  UserEmailIcon,
  DiscordIcon,
  CoingeckoIcon,
} from "@/components/icons";
import { Tooltip, TooltipContent } from "@/components/ui/tooltip";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { cn } from "@/lib/utils";

import { Contracts } from "./contracts";
import { Parameters } from "./parameters";

const socialIconMap = {
  github: UserGithubIcon,
  website: WebsiteIcon,
  telegram: UserTelegramIcon,
  twitter: TwitterIcon,
  email: UserEmailIcon,
  discord: DiscordIcon,
  coingecko: CoingeckoIcon,
} as const;

export const DaoHeader = () => {
  const config = useDaoConfig();
  const [showFullDescription, setShowFullDescription] = useState(false);
  const { theme } = useTheme();

  const isCustomBanner = useMemo(() => {
    return !!config?.theme?.banner && !!config?.theme?.bannerMobile;
  }, [config]);

  return (
    <div
      className="lg:grid grid-cols-[1fr_250px] items-end justify-between rounded-[14px] bg-always-dark p-[20px] shadow-card"
      style={{
        backgroundImage:
          isCustomBanner && (theme === "dark" || theme === "light")
            ? `url(${config?.theme?.banner})`
            : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="flex flex-col gap-[10px]">
        <h1
          className={cn(
            "flex items-center gap-[10px] text-[26px] font-extrabold text-always-light"
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
          <div className="px-2.5 py-[5px] bg-always-light rounded-[10px] inline-flex justify-start items-center gap-2.5 hover:bg-foreground/80 transition-colors">
            <div className="justify-start text-always-dark text-xs font-semibold font-['SF_UI_Display']">
              {config?.chain?.name}
            </div>
          </div>
        </h1>

        <div className="lg:hidden">
          <p
            className={`text-[13px] lg:text-[14px] text-always-light max-w-[693px] ${
              !showFullDescription ? "line-clamp-2" : ""
            } cursor-pointer`}
            onClick={() => setShowFullDescription(!showFullDescription)}
          >
            {config?.description}
          </p>
        </div>

        <div className="hidden lg:block">
          <Tooltip>
            <TooltipTrigger asChild>
              <p
                className={cn(
                  "line-clamp-2 text-[14px] max-w-[693px] text-always-light"
                )}
              >
                {config?.description}
              </p>
            </TooltipTrigger>
            <TooltipContent className="max-w-[600px] rounded-[26px] bg-card p-[20px] border border-card-background shadow-sm">
              <p className="text-[14px] text-foreground">
                {config?.description}
              </p>
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-[10px]">
          <Parameters />
          <Contracts />
        </div>
      </div>
      <div className="flex items-center lg:justify-end gap-[20px] mt-4 lg:mt-0">
        {Object.entries(config?.links ?? {})
          .filter(([, value]) => value && value.trim() !== "")
          .map(([key, value]) => {
            const IconComponent =
              socialIconMap[key as keyof typeof socialIconMap];
            if (!IconComponent) return null;

            return (
              <Fragment key={key}>
                <a
                  href={value}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={capitalize(key)}
                  className="flex size-[24px] items-center justify-center rounded-full bg-always-light transition-colors hover:bg-always-light/80"
                >
                  <IconComponent
                    width={12}
                    height={12}
                    className="text-always-dark"
                  />
                </a>
              </Fragment>
            );
          })}
      </div>
    </div>
  );
};
