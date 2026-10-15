"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

import { DiscussionIcon } from "@/components/icons";
import { NewProposalEntry } from "@/components/new-proposal-entry";
import { ProposalsList } from "@/components/proposals-list";
import { ProposalsTable } from "@/components/proposals-table";
import { ResponsiveRenderer } from "@/components/responsive-renderer";
import { Button } from "@/components/ui/button";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { Link } from "@/i18n/navigation";

const Faqs = dynamic(
  () => import("@/components/faqs").then((mod) => mod.Faqs),
  {
    loading: () => (
      <div className="h-[200px] bg-card rounded-[14px] animate-pulse" />
    )
  }
);
export const Proposals = () => {
  const t = useTranslations("dashboard.proposals");
  const daoConfig = useDaoConfig();

  return (
    <div className="flex flex-col gap-[15px] lg:gap-[20px]">
      <div className="flex flex-col lg:flex-row lg:items-start gap-[15px] lg:gap-[20px]">
        <div className="flex-1 flex flex-col gap-[8px] lg:gap-[10px]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-[10px] sm:gap-0">
            <h3 className="text-[16px] lg:text-[18px] font-extrabold">
              {t("title")}
            </h3>
            <div className="items-center gap-[8px] lg:gap-[10px] flex-wrap hidden lg:flex">
              {daoConfig?.offChainDiscussionUrl ? (
                <Button
                  className="rounded-[100px] cursor-pointer text-[13px] lg:text-sm"
                  asChild
                >
                  <Link
                    href={daoConfig?.offChainDiscussionUrl}
                    className="flex items-center gap-[4px] lg:gap-[5px]"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <DiscussionIcon
                      width={16}
                      height={16}
                      className="size-[16px] lg:size-[20px] text-current"
                    />
                    <span className="hidden sm:inline">{t("joinDiscussion")}</span>
                    <span className="sm:hidden">{t("discussion")}</span>
                  </Link>
                </Button>
              ) : null}
              <NewProposalEntry
                className="flex items-center gap-[4px] lg:gap-[5px] rounded-[100px] text-[13px] lg:text-sm"
                iconClassName="size-[16px] lg:size-[20px]"
                labelClassName="hidden sm:inline"
                compactLabelClassName="sm:hidden"
              />
            </div>
            <div className="flex lg:hidden">
              <NewProposalEntry
                className="flex items-center gap-[5px] rounded-[100px] text-[13px]"
                iconClassName="size-[16px]"
              />
            </div>
          </div>
          <ResponsiveRenderer
            desktop={<ProposalsTable type="active" />}
            mobile={<ProposalsList type="active" />}
          />
        </div>
        <Faqs type="general" />
      </div>
    </div>
  );
};
