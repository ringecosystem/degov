const GA_MEASUREMENT_ID = /^G-[A-Z0-9]{10}$/;

export function buildGoogleAnalyticsConfig({
  daoCode,
  individualTag,
  aggregateTag,
}: {
  daoCode: string;
  individualTag?: string;
  aggregateTag?: string;
}) {
  const individual = individualTag?.trim();
  const aggregate = aggregateTag?.trim();
  const tags = [individual, aggregate].filter(
    (tag, index, all): tag is string =>
      Boolean(tag && GA_MEASUREMENT_ID.test(tag) && all.indexOf(tag) === index)
  );

  return {
    loaderTag: tags[0],
    configCommands: tags.map((tag) => ({
      tag,
      params: tag === aggregate && daoCode ? { dao_code: daoCode } : undefined,
    })),
  };
}

export function canUseGoogleAnalytics({
  isDemoDao,
  siteUrl,
}: {
  isDemoDao: boolean;
  siteUrl: string;
}) {
  if (isDemoDao) return false;

  try {
    const { hostname, protocol } = new URL(siteUrl);
    return (
      protocol === "https:" &&
      hostname !== "localhost" &&
      !hostname.endsWith(".next.degov.ai") &&
      !hostname.endsWith(".vercel.app")
    );
  } catch {
    return false;
  }
}
