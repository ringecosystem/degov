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
    "https://x.com/ai_degov",
    "/assets/image/social/x.svg",
    12,
    12
  ),
  createSocialConfig(
    "Telegram",
    "https://t.me/DeGov_AI",
    "/assets/image/social/telegram.svg",
    12,
    10
  ),
  createSocialConfig(
    "Email",
    "mailto:support@degov.ai",
    "/assets/image/social/email.svg",
    13.333,
    10
  ),
  createSocialConfig(
    "Github",
    "https://github.com/ringecosystem/degov/tree/",
    "/assets/image/social/github.svg",
    10.714,
    12.857
  ),
];
