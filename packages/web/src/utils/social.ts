export function getTwitterLink(
  username: string | null | undefined
): string | null {
  if (!username) return null;
  const cleanUsername = username.startsWith("@")
    ? username.substring(1)
    : username;
  return `https://twitter.com/${cleanUsername}`;
}

export function getGithubLink(
  username: string | null | undefined
): string | null {
  if (!username) return null;
  return `https://github.com/${username}`;
}

export function getTelegramLink(
  username: string | null | undefined
): string | null {
  if (!username) return null;
  const cleanUsername = username.startsWith("@")
    ? username.substring(1)
    : username;
  return `https://t.me/${cleanUsername}`;
}

export function getDiscordLink(tag: string | null | undefined): string | null {
  if (!tag) return null;
  return `https://discord.com/users/${encodeURIComponent(tag)}`;
}

export function formatSocialHandle(
  platform: "twitter" | "github" | "telegram" | "discord",
  value: string | null | undefined
): string | null {
  if (!value) return null;

  switch (platform) {
    case "twitter":
    case "telegram":
      return value.startsWith("@") ? value : `@${value}`;
    case "github":
      return value;
    case "discord":
      return value;
    default:
      return value;
  }
}
