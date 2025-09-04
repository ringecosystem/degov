import { capitalize } from "lodash-es";
import Link from "next/link";
import { useMemo } from "react";

import { getSocialIcon } from "@/components/icons/social-icon-map";
import type { ProfileData } from "@/services/graphql/types/profile";
import {
  getDiscordLink,
  getGithubLink,
  getTelegramLink,
  getTwitterLink,
} from "@/utils/social";

interface SocialLinksProps {
  profile?: ProfileData;
  isAiBot?: boolean;
}
export const SocialLinks = ({ profile, isAiBot }: SocialLinksProps) => {
  const socialLinks = useMemo(
    () =>
      isAiBot
        ? [
            {
              name: "Twitter",
              value: "https://x.com/ai_degov",
              link: "https://x.com/ai_degov",
            },
            {
              name: "GitHub",
              value: "https://github.com/ringecosystem/degov",
              link: "https://github.com/ringecosystem/degov",
            },
            {
              name: "Telegram",
              value: "https://t.me/RingDAO_Hub",
              link: "https://t.me/RingDAO_Hub",
            },
          ]
        : [
            {
              name: "Email",
              value: profile?.email,
              link: `mailto:${profile?.email}`,
            },
            {
              name: "Twitter",
              value: profile?.twitter,
              link: getTwitterLink(profile?.twitter),
            },
            {
              name: "GitHub",
              value: profile?.github,
              link: getGithubLink(profile?.github),
            },
            {
              name: "Telegram",
              value: profile?.telegram,
              link: getTelegramLink(profile?.telegram),
            },
            {
              name: "Discord",
              value: profile?.discord,
              link: getDiscordLink(profile?.discord),
            },
          ]?.filter((item) => !!item.value),
    [profile, isAiBot]
  );
  return (
    <div className="flex items-center gap-[10px]">
      {socialLinks.map((social) => {
        const IconComponent = getSocialIcon(social.name.toLowerCase());
        
        return (
          <Link
            key={social.name}
            href={social.link || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex size-[24px] cursor-pointer items-center justify-center rounded-full bg-foreground transition-opacity hover:opacity-80"
            title={capitalize(social.name)}
          >
            <IconComponent
              width={16}
              height={16}
              className="text-background"
            />
          </Link>
        );
      })}
    </div>
  );
};
