"use client";

import { useTranslations } from "next-intl";

import { ExternalLinkIcon } from "@/components/icons";
import type { Config, HiddenProposal } from "@/types/config";

export function HiddenProposalNotice({
  config,
  proposal,
}: {
  config: Config;
  proposal: HiddenProposal;
}) {
  const t = useTranslations("proposalDetail.hidden");
  const explorer = config.chain.explorers?.[0];
  const transactionUrl =
    explorer && proposal.transactionHash
      ? `${explorer.replace(/\/$/, "")}/tx/${proposal.transactionHash}`
      : null;

  return (
    <section className="mx-auto flex w-full max-w-[720px] flex-col gap-[20px] rounded-[14px] bg-card p-[24px] lg:p-[32px]">
      <div className="flex flex-col gap-[8px]">
        <h1 className="text-[20px] font-extrabold lg:text-[24px]">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">{proposal.reason}</p>
      </div>
      <div className="flex flex-col gap-[6px]">
        <span className="text-sm font-semibold">{t("proposalId")}</span>
        <code className="break-all text-xs text-muted-foreground">
          {proposal.id}
        </code>
      </div>
      {transactionUrl ? (
        <a
          className="inline-flex w-fit items-center gap-[6px] text-sm font-semibold text-primary hover:opacity-80"
          href={transactionUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          {t("viewOnExplorer")}
          <ExternalLinkIcon width={16} height={16} />
        </a>
      ) : null}
    </section>
  );
}
