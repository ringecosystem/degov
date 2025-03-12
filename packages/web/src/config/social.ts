type SocialConfig = {
  name: string;
  url: string;
  assetPath: string;
  width?: number;
  height?: number;
};

function createSocialConfig(
  name: string,
  url: string,
  assetPath: string,
  width?: number,
  height?: number
): SocialConfig {
  return {
    name,
    url,
    assetPath,
    width,
    height,
  };
}

export const socialConfig: SocialConfig[] = [
  createSocialConfig(
    "X",
    "https://x.com/ringecosystem",
    "/assets/image/social/x.svg",
    12,
    12
  ),
  createSocialConfig(
    "Telegram",
    "https://t.me/ringecosystem",
    "/assets/image/social/telegram.svg",
    12,
    10
  ),
  createSocialConfig(
    "Discord",
    " https://discord.com/invite/BhNbKWWfGV",
    "/assets/image/social/discord.svg",
    16,
    12
  ),
  createSocialConfig(
    "Github",
    "https://github.com/ringecosystem/degov",
    "/assets/image/social/github.svg",
    12,
    14
  ),
];
