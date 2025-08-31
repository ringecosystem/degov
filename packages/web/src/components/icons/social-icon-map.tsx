import { XIcon, TelegramIcon, EmailIcon, DocsIcon, GithubIcon } from "./social";

import type { IconProps } from "./types";

export const SocialIconMap: Record<string, React.ComponentType<IconProps>> = {
  x: XIcon,
  twitter: XIcon,
  telegram: TelegramIcon,
  email: EmailIcon,
  docs: DocsIcon,
  github: GithubIcon,
};

export const getSocialIcon = (
  socialName: string
): React.ComponentType<IconProps> => {
  const key = (socialName || "").trim().toLowerCase();
  return SocialIconMap[key] || XIcon;
};
