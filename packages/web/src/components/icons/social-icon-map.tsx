import { XIcon, TelegramIcon, EmailIcon, DocsIcon, GithubIcon } from './social';
import { IconProps } from './types';

export const SocialIconMap: Record<string, React.ComponentType<IconProps>> = {
  X: XIcon,
  Telegram: TelegramIcon,
  Email: EmailIcon,
  Docs: DocsIcon,
  Github: GithubIcon,
};

export const getSocialIcon = (socialName: string): React.ComponentType<IconProps> => {
  return SocialIconMap[socialName] || XIcon; // fallback to X icon
};