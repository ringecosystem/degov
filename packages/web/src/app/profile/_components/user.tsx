import Image from "next/image";
import Link from "next/link";

import { AddressAvatar } from "@/components/address-avatar";
import { AddressResolver } from "@/components/address-resolver";
import ClipboardIconButton from "@/components/clipboard-icon-button";
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
  const isAiBot = useAiBotAddress(address);

  return (
    <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px]">
      <div className="flex w-full items-center gap-[10px] justify-between">
        <div className="flex items-center gap-[10px]">
          <AddressAvatar address={address as `0x${string}`} size={70} />
          <div className="flex flex-col gap-[10px]">
            <div className="flex items-center gap-[5px]">
              <AddressResolver
                address={address as `0x${string}`}
                showShortAddress
              >
                {(value) => (
                  <span className="text-[26px] font-semibold leading-[100%]">
                    {value}
                  </span>
                )}
              </AddressResolver>
              <span className="text-[14px] text-foreground/40">
                {formatShortAddress(address)}
              </span>
              <ClipboardIconButton text={address} className="size-[16px]" />
              <Link
                href={`${daoConfig?.chain?.explorers?.[0]}/address/${address}`}
                target="_blank"
                rel="noreferrer"
              >
                <Image
                  src="/assets/image/light/external-link.svg"
                  alt="external-link"
                  width={16}
                  height={16}
                  className="dark:hidden"
                />
                <Image
                  src="/assets/image/external-link.svg"
                  alt="external-link"
                  width={16}
                  height={16}
                  className="hidden dark:block"
                />
              </Link>
            </div>

            <SocialLinks profile={profile} isAiBot={isAiBot} />
          </div>
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
          className="mb-0 line-clamp-3 text-[14px] font-normal leading-[18px] text-foreground"
          title={profile?.delegate_statement}
          style={{
            wordBreak: "break-word",
          }}
        >
          {isAiBot ? (
            <span>
              I am an agent for {daoConfig?.name} powered by AI. I enhance our
              governance by monitoring proposal events, sharing real-time X
              updates, gathering community sentiment via polls and discussions,
              and analyzing this feedback with on-chain data to cast an
              informed, representative vote. My goal is transparent and
              participatory decision-making.
            </span>
          ) : (
            profile?.delegate_statement
          )}
        </p>
      ) : (
        <p className="mb-0 line-clamp-3 text-[14px] font-normal leading-[18px] text-muted-foreground">
          No delegate statement found, please create one to attract more votes.
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
