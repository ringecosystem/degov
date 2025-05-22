import { capitalize } from "lodash-es";
import Link from "next/link";
import { Fragment, useMemo } from "react";

import type { ProfileData } from "@/services/graphql/types/profile";
import {
  formatSocialHandle,
  getDiscordLink,
  getGithubLink,
  getTelegramLink,
  getTwitterLink,
} from "@/utils/social";

interface SocialLinksProps {
  profile?: ProfileData;
}
export const SocialLinks = ({ profile }: SocialLinksProps) => {
  const socialLinks = useMemo(
    () =>
      [
        {
          name: "Email",
          value: profile?.email,
          link: `mailto:${profile?.email}`,
          displayValue: profile?.email,
        },
        {
          name: "Twitter",
          value: profile?.twitter,
          link: getTwitterLink(profile?.twitter),
          displayValue: formatSocialHandle("twitter", profile?.twitter),
        },
        {
          name: "GitHub",
          value: profile?.github,
          link: getGithubLink(profile?.github),
          displayValue: formatSocialHandle("github", profile?.github),
        },
        {
          name: "Telegram",
          value: profile?.telegram,
          link: getTelegramLink(profile?.telegram),
          displayValue: formatSocialHandle("telegram", profile?.telegram),
        },
        {
          name: "Discord",
          value: profile?.discord,
          link: getDiscordLink(profile?.discord),
          displayValue: formatSocialHandle("discord", profile?.discord),
        },
      ]?.filter((item) => !!item.value),
    [profile]
  );
  return (
    <div className="flex items-center gap-[10px]">
      {socialLinks.map((social) => (
        <Fragment key={social.name}>
          <Link
            href={social.link || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex size-[24px] cursor-pointer items-center justify-center rounded-full bg-foreground transition-opacity hover:opacity-80 dark:hidden"
            title={capitalize(social.name)}
            style={{
              backgroundImage: `url(/assets/image/light/user_social/${social.name.toLowerCase()}.svg)`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
            }}
          ></Link>
          <Link
            href={social.link || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="size-[24px] cursor-pointer items-center justify-center rounded-full bg-foreground transition-opacity hover:opacity-80 hidden dark:flex"
            title={capitalize(social.name)}
            style={{
              backgroundImage: `url(/assets/image/user_social/${social.name.toLowerCase()}.svg)`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
            }}
          ></Link>
        </Fragment>
      ))}
    </div>
  );
};
