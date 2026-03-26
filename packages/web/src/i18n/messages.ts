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
    profile,
    proposalDetail,
    notifications,
    proposalEditor,
    aiAnalysis,
  ] = await Promise.all([
    import("../../messages/en/common.json"),
    import("../../messages/en/navigation.json"),
    import("../../messages/en/dashboard.json"),
    import("../../messages/en/delegates.json"),
    import("../../messages/en/proposals.json"),
    import("../../messages/en/treasury.json"),
    import("../../messages/en/profile.json"),
    import("../../messages/en/proposal-detail.json"),
    import("../../messages/en/notifications.json"),
    import("../../messages/en/proposal-editor.json"),
    import("../../messages/en/ai-analysis.json"),
  ]);

  return {
    common: common.default,
    navigation: navigation.default,
    dashboard: dashboard.default,
    delegates: delegates.default,
    proposals: proposals.default,
    treasury: treasury.default,
    profile: profile.default,
    proposalDetail: proposalDetail.default,
    notifications: notifications.default,
    proposalEditor: proposalEditor.default,
    aiAnalysis: aiAnalysis.default,
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
