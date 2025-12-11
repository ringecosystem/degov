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

const text = {
  [VoteType.For]: {
    label: "For",
    color: "bg-success",
    icon: VoteForIcon,
    defaultIcon: VoteForDefaultIcon,
  },
  [VoteType.Against]: {
    label: "Against",
    color: "bg-danger",
    icon: VoteAgainstIcon,
    defaultIcon: VoteAgainstDefaultIcon,
  },
  [VoteType.Abstain]: {
    label: "Abstain",
    color: "bg-muted-foreground",
    icon: VoteAbstainIcon,
    defaultIcon: VoteAbstainDefaultIcon,
  },
};

interface VoteStatusProps {
  variant: VoteType;
  className?: string;
}

export const VoteStatus: FC<VoteStatusProps> = ({ variant, className }) => {
  const IconComponent = text[variant].icon;

  return (
    <div
      className={cn(
        "t flex items-center gap-x-2 rounded-full px-4 py-2 text-base font-medium text-foreground transition-opacity hover:opacity-80",
        text[variant].color,
        className
      )}
    >
      <IconComponent width={20} height={20} className="text-always-light" />
      <span className="text-always-light">{text[variant].label}</span>
    </div>
  );
};

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
  const [isHovered, setIsHovered] = useState(false);

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
