import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en"],
  defaultLocale: "en",
  localePrefix: "never",
});

export type AppLocale = (typeof routing.locales)[number];

export function isAppLocale(locale: string | undefined): locale is AppLocale {
  return locale != null && routing.locales.includes(locale as AppLocale);
}
