import { useTranslations } from "next-intl";
import { useState } from "react";

import {
  VoteForIcon,
  VoteAgainstIcon,
  VoteAbstainIcon,
  VoteForDefaultIcon,
  VoteAgainstDefaultIcon,
  VoteAbstainDefaultIcon,
} from "@/components/icons";
import { VoteType } from "@/config/vote";
import { cn } from "@/lib/utils";

import type { FC } from "react";

interface VoteStatusActionProps {
  variant: VoteType;
  className?: string;
  type: "default" | "active";
  onChangeVote?: () => void;
}

export const VoteStatusAction: FC<VoteStatusActionProps> = ({
  variant,
  className,
  type,
  onChangeVote,
}) => {
  const t = useTranslations("proposals.voteLabels");
  const [isHovered, setIsHovered] = useState(false);
  const text = {
    [VoteType.For]: {
      label: t("for"),
      color: "bg-success",
      icon: VoteForIcon,
      defaultIcon: VoteForDefaultIcon,
    },
    [VoteType.Against]: {
      label: t("against"),
      color: "bg-danger",
      icon: VoteAgainstIcon,
      defaultIcon: VoteAgainstDefaultIcon,
    },
    [VoteType.Abstain]: {
      label: t("abstain"),
      color: "bg-muted-foreground",
      icon: VoteAbstainIcon,
      defaultIcon: VoteAbstainDefaultIcon,
    },
  };

  const isActive = type === "active" || isHovered;
  const IconComponent = isActive
    ? text[variant].icon
    : text[variant].defaultIcon;

  return (
    <div
      className={cn(
        "flex cursor-pointer items-center gap-x-2 rounded-full px-1 lg:px-4 py-1 lg:py-2 text-base font-medium",
        isActive ? "text-foreground" : "text-muted-foreground",
        isActive ? text[variant].color : "bg-transparent",
        isActive
          ? "border border-transparent"
          : "border border-muted-foreground",
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onChangeVote ? onChangeVote : undefined}
    >
      <IconComponent
        width={20}
        height={20}
        className={cn(isActive ? "text-always-light" : "text-muted-foreground")}
      />
      <span className={cn(isActive && "text-always-light")}>
        {text[variant].label}
      </span>
    </div>
  );
};
