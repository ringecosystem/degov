"use client";
import Image from "next/image";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { socialConfig } from "@/config/social";
import { cn } from "@/lib/utils";

import packageInfo from "../../package.json";

export const Socials = ({ collapsed }: { collapsed: boolean }) => {
  return (
    <div
      className={`flex items-center gap-[10px] ${
        collapsed ? "flex-col" : "justify-around"
      }`}
    >
      {socialConfig.map((social) => (
        <Tooltip key={social.name}>
          <TooltipTrigger asChild>
            <a
              href={
                social.name === "Github"
                  ? `${social.url}v${packageInfo.version}`
                  : social.url
              }
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "relative flex h-[24px]  items-center justify-center w-[24px] rounded-[36px] bg-card transition-opacity duration-300 hover:opacity-80",
                social.name === "Github" && "px-[5px] w-auto gap-[5px]"
              )}
            >
              <Image
                src={social.lightAssetPath}
                alt={social.name}
                width={social?.width || 24}
                height={social?.height || 24}
                className="object-contain block dark:hidden"
              />
              <Image
                src={social.assetPath}
                alt={social.name}
                width={social?.width || 24}
                height={social?.height || 24}
                className="object-contain hidden dark:block"
              />

              {social.name === "Github" && (
                <span className="text-xs text-muted-foreground">
                  {packageInfo.version}
                </span>
              )}
            </a>
          </TooltipTrigger>
          <TooltipContent side="right" className={collapsed ? "" : "hidden"}>
            {social.name}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
};
