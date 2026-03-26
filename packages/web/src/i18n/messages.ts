import type { AppLocale } from "./routing";
import type { AbstractIntlMessages } from "next-intl";


async function loadEnglishMessages(): Promise<AbstractIntlMessages> {
  const [
    common,
    navigation,
    dashboard,
    delegates,
    proposals,
    treasury,
  ] = await Promise.all([
    import("../../messages/en/common.json"),
    import("../../messages/en/navigation.json"),
    import("../../messages/en/dashboard.json"),
    import("../../messages/en/delegates.json"),
    import("../../messages/en/proposals.json"),
    import("../../messages/en/treasury.json"),
  ]);

  return {
    common: common.default,
    navigation: navigation.default,
    dashboard: dashboard.default,
    delegates: delegates.default,
    proposals: proposals.default,
    treasury: treasury.default,
  };
}

export async function getLocaleMessages(
  locale: AppLocale
): Promise<AbstractIntlMessages> {
  switch (locale) {
    case "en":
    default:
      return loadEnglishMessages();
  }
}
