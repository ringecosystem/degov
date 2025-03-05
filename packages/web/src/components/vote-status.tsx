import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

import type { FC } from "react";

type VoteVariant = "for" | "against" | "abstain";

interface VoteStatusProps {
  variant: VoteVariant;
  className?: string;
}

const text = {
  for: {
    label: "For",
    color: "bg-success",
    icon: "/assets/image/proposal/vote-for.svg",
    defaultIcon: "/assets/image/proposal/vote-for-default.svg",
  },
  against: {
    label: "Against",
    color: "bg-danger",
    icon: "/assets/image/proposal/vote-against.svg",
    defaultIcon: "/assets/image/proposal/vote-against-default.svg",
  },
  abstain: {
    label: "Abstain",
    color: "bg-muted-foreground",
    icon: "/assets/image/proposal/vote-abstain.svg",
    defaultIcon: "/assets/image/proposal/vote-abstain-default.svg",
  },
};

export const VoteStatus: FC<VoteStatusProps> = ({ variant, className }) => {
  return (
    <div
      className={cn(
        "t flex items-center gap-x-2 rounded-full px-4 py-2 text-base font-medium text-white transition-opacity hover:opacity-80",
        text[variant].color,
        className
      )}
    >
      <Image
        src={text[variant].icon}
        alt={text[variant].label}
        width={20}
        height={20}
      />
      <span>{text[variant].label}</span>
    </div>
  );
};

type VoteStatusActionType = "for" | "against" | "abstain";

interface VoteStatusActionProps {
  variant: VoteStatusActionType;
  className?: string;
  type: "default" | "active";
  onChangeVote: () => void;
}

export const VoteStatusAction: FC<VoteStatusActionProps> = ({
  variant,
  className,
  type,
  onChangeVote,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const isActive = type === "active" || isHovered;

  return (
    <div
      className={cn(
        "t flex cursor-pointer items-center gap-x-2 rounded-full px-4 py-2 text-base font-medium",
        isActive ? "text-white" : "text-muted-foreground",
        isActive ? text[variant].color : "bg-transparent",
        isActive
          ? "border border-transparent"
          : "border border-muted-foreground",
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onChangeVote}
    >
      <Image
        src={isActive ? text[variant].icon : text[variant].defaultIcon}
        alt={text[variant].label}
        width={20}
        height={20}
      />
      <span>{text[variant].label}</span>
    </div>
  );
};
