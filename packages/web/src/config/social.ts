type SocialConfig = {
  name: string;
  url: string;
  lightAssetPath: string;
  assetPath: string;
  width?: number;
  height?: number;
};

function createSocialConfig(
  name: string,
  url: string,
  lightAssetPath: string,
  assetPath: string,
  width?: number,
  height?: number
): SocialConfig {
  return {
    name,
    url,
    lightAssetPath,
    assetPath,
    width,
    height,
  };
}

export const socialConfig: SocialConfig[] = [
  createSocialConfig(
    "X",
    "https://x.com/ai_degov",
    "/assets/image/light/social/x.svg",
    "/assets/image/social/x.svg",
    12,
    12
  ),
  createSocialConfig(
    "Telegram",
    "https://t.me/RingDAO_Hub",
    "/assets/image/light/social/telegram.svg",
    "/assets/image/social/telegram.svg",
    12,
    10
  ),
  createSocialConfig(
    "Email",
    "mailto:support@degov.ai",
    "/assets/image/light/social/email.svg",
    "/assets/image/social/email.svg",
    13.333,
    10
  ),
  createSocialConfig(
    "Docs",
    "https://docs.degov.ai",
    "/assets/image/light/social/docs.svg",
    "/assets/image/social/docs.svg",
    16,
    16
  ),
  createSocialConfig(
    "Github",
    "https://github.com/ringecosystem/degov/tree/",
    "/assets/image/light/social/github.svg",
    "/assets/image/social/github.svg",
    10.714,
    12.857
  ),
];
