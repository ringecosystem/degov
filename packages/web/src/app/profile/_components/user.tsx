import Link from "next/link";
import { useState } from "react";

import { AddressAvatar } from "@/components/address-avatar";
import { AddressResolver } from "@/components/address-resolver";
import ClipboardIconButton from "@/components/clipboard-icon-button";
import { ExternalLinkIcon } from "@/components/icons";
import { useAiBotAddress } from "@/hooks/useAiBotAddress";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import type { ProfileData } from "@/services/graphql/types/profile";
import { formatShortAddress } from "@/utils";

import { Overview } from "./overview";
import { SocialLinks } from "./social-links";
import { UserActionGroup } from "./user-action-group";

import type { Address } from "viem";
interface UserProps {
  address: Address;
  profile?: ProfileData;
  isOwnProfile: boolean;
  isDelegate?: boolean;
  buttonText: string;
  tokenBalance?: string;
  isLoadingTokenBalance?: boolean;
  isDelegateMappingsLoading?: boolean;
  delegationStatusText?: React.ReactNode;
  onEditProfile: () => void;
  onDelegate: () => void;
}

export const User = ({
  address,
  profile,
  isOwnProfile,
  isDelegate,
  buttonText,
  tokenBalance,
  isLoadingTokenBalance,
  isDelegateMappingsLoading,
  delegationStatusText,
  onEditProfile,
  onDelegate,
}: UserProps) => {
  const daoConfig = useDaoConfig();
  const { isAiBot } = useAiBotAddress(address);
  const [showFullDescription, setShowFullDescription] = useState(false);

  return (
    <div className="flex flex-col gap-[15px] lg:gap-[20px] rounded-[14px] bg-card p-[15px] lg:p-[20px] shadow-card">
      <div className="flex w-full flex-col lg:flex-row lg:items-center gap-[15px] lg:gap-[10px] lg:justify-between">
        <div className="flex items-center gap-[10px] lg:gap-[10px]">
          <AddressAvatar
            address={address as `0x${string}`}
            size={60}
            className="lg:w-[70px] lg:h-[70px]"
          />
          <div className="flex flex-row lg:flex-col gap-[8px] lg:gap-[10px] flex-1 min-w-0">
            <div className="flex flex-col items-start lg:flex-row lg:items-center gap-[5px] flex-wrap">
              <AddressResolver
                address={address as `0x${string}`}
                showShortAddress
              >
                {(value) => (
                  <span className="text-[20px] lg:text-[26px] font-semibold leading-[100%] break-words">
                    {value}
                  </span>
                )}
              </AddressResolver>
              <div className="flex gap-[8px] lg:gap-[10px]">
                <span className="text-[12px] lg:text-[14px] text-foreground/60 flex-shrink-0">
                  {formatShortAddress(address)}
                </span>
                <div className="flex items-center gap-[5px]">
                  <ClipboardIconButton
                    text={address}
                    className="size-[14px] lg:size-[16px] flex-shrink-0"
                  />
                  <Link
                    href={`${daoConfig?.chain?.explorers?.[0]}/address/${address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-shrink-0"
                  >
                    <ExternalLinkIcon
                      width={14}
                      height={14}
                      className="text-foreground lg:w-4 lg:h-4"
                    />
                  </Link>
                </div>
              </div>
            </div>
            <div className="hidden lg:block">
              <SocialLinks profile={profile} isAiBot={isAiBot} />
            </div>
          </div>
        </div>
        <div className="block lg:hidden">
          <SocialLinks profile={profile} isAiBot={isAiBot} />
        </div>
        <UserActionGroup
          isOwnProfile={isOwnProfile}
          isDelegate={isDelegate}
          buttonText={buttonText}
          onEditProfile={onEditProfile}
          onDelegate={onDelegate}
        />
      </div>
      <div className="w-full h-[1px] bg-border/20"></div>

      {profile?.delegate_statement || isAiBot ? (
        <p
          className={`mb-0 text-[14px] font-normal leading-[18px] text-foreground ${
            !showFullDescription ? "line-clamp-3" : ""
          } cursor-pointer`}
          onClick={() => setShowFullDescription(!showFullDescription)}
          title={profile?.delegate_statement}
          style={{
            wordBreak: "break-word",
          }}
        >
          {isAiBot ? (
            <span>
              An AI-powered delegate that actively votes on governance
              proposals. Learn more at
              <a
                href="https://docs.degov.ai/governance/agent/overview"
                target="_blank"
                rel="noreferrer"
                className="hover:underline ml-1"
              >
                https://docs.degov.ai/governance/agent/overview
                <ExternalLinkIcon
                  width={16}
                  height={16}
                  className="text-muted-foreground"
                />
              </a>
            </span>
          ) : (
            <div onClick={() => setShowFullDescription(!showFullDescription)}>
              {profile?.delegate_statement}
            </div>
          )}
        </p>
      ) : (
        <p className="mb-0 line-clamp-3 text-[14px] font-normal leading-[18px] text-foreground">
          No delegate statement found.
        </p>
      )}

      <Overview
        address={address}
        tokenBalance={tokenBalance}
        isOwnProfile={isOwnProfile}
        isLoadingTokenBalance={isLoadingTokenBalance}
        delegationStatusText={delegationStatusText}
        isDelegateMappingsLoading={isDelegateMappingsLoading}
      />
    </div>
  );
};

export default User;
