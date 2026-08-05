"use client";

import { useLocale } from "next-intl";
import { useEffect } from "react";

import {
  buildProposalReadEventParams,
  PROPOSAL_READ_EVENT_NAME,
  sendAnalyticsEvent,
} from "@/lib/analytics";

type ProposalReadAnalyticsProps = {
  daoCode: string;
  proposalId: string;
};

export function ProposalReadAnalytics({
  daoCode,
  proposalId,
}: ProposalReadAnalyticsProps) {
  const locale = useLocale();

  useEffect(() => {
    const params = buildProposalReadEventParams({
      daoCode,
      proposalId,
      locale,
      referrer: document.referrer,
      currentHost: window.location.hostname,
    });
    const dedupeKey = `${PROPOSAL_READ_EVENT_NAME}:${params.dao_slug_or_public_id}:${params.proposal_public_id}`;

    try {
      if (window.sessionStorage.getItem(dedupeKey)) return;
      if (sendAnalyticsEvent(PROPOSAL_READ_EVENT_NAME, params)) {
        window.sessionStorage.setItem(dedupeKey, "1");
      }
    } catch {
      sendAnalyticsEvent(PROPOSAL_READ_EVENT_NAME, params);
    }
  }, [daoCode, locale, proposalId]);

  return null;
}
