import { getRequestConfig } from "next-intl/server";

import { getLocaleMessages } from "./messages";
import { isAppLocale, routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requestedLocale = await requestLocale;
  const locale = isAppLocale(requestedLocale)
    ? requestedLocale
    : routing.defaultLocale;

  return {
    locale,
    messages: await getLocaleMessages(locale),
  };
});
