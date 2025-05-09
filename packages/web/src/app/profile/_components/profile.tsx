"use client";
import { useQuery } from "@tanstack/react-query";
import { capitalize } from "lodash-es";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { isAddress, type Address } from "viem";
import { useAccount, useReadContract } from "wagmi";

import { ChangeDelegate } from "@/app/profile/_components/change-delegate";
import { AddressAvatar } from "@/components/address-avatar";
import { AddressResolver } from "@/components/address-resolver";
import ClipboardIconButton from "@/components/clipboard-icon-button";
import { DelegateAction } from "@/components/delegate-action";
import { DelegateSelector } from "@/components/delegate-selector";
import NotFound from "@/components/not-found";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { WithConnect } from "@/components/with-connect";
import { abi as tokenAbi } from "@/config/abi/token";
import { useAddressVotes } from "@/hooks/useAddressVotes";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useFormatGovernanceTokenAmount } from "@/hooks/useFormatGovernanceTokenAmount";
import { useGovernanceToken } from "@/hooks/useGovernanceToken";
import { delegateService, profileService } from "@/services/graphql";
import { formatShortAddress } from "@/utils/address";
import {
  getTwitterLink,
  getGithubLink,
  getTelegramLink,
  getDiscordLink,
  formatSocialHandle,
} from "@/utils/social";

import { JoinDelegate } from "./join-delegate";
import { ReceivedDelegations } from "./received-delegations";
import { ProfileSkeleton } from "./skeleton";
interface ProfileProps {
  address: Address;
  isDelegate?: boolean;
}

export const Profile = ({ address, isDelegate }: ProfileProps) => {
  const [open, setOpen] = useState(false);
  const { isConnected } = useAccount();
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [showConnectPrompt, setShowConnectPrompt] = useState(false);
  const [changeDelegateOpen, setChangeDelegateOpen] = useState(false);
  const daoConfig = useDaoConfig();
  const router = useRouter();
  const formatTokenAmount = useFormatGovernanceTokenAmount();
  const { data: governanceToken } = useGovernanceToken();
  const [joinDelegateOpen, setJoinDelegateOpen] = useState(false);
  const { address: account } = useAccount();

  const { data: profileData, isLoading: isProfileLoading } = useQuery({
    queryKey: ["profile", address],
    queryFn: () => profileService.getProfile(address),
    enabled: !!address,
  });

  const { data: delegateMappings, isLoading: isDelegateMappingsLoading } =
    useQuery({
      queryKey: ["delegateMappings", address, daoConfig?.indexer?.endpoint],
      queryFn: () =>
        delegateService.getDelegateMappings(
          daoConfig?.indexer?.endpoint as string,
          { where: { from_eq: address?.toLowerCase() } }
        ),
      enabled: !!address,
    });

  const { formattedVotes, isLoading } = useAddressVotes(address);

  // get governance token
  const { data: tokenBalance, isLoading: isLoadingTokenBalance } =
    useReadContract({
      address: daoConfig?.contracts?.governorToken?.address as `0x${string}`,
      abi: tokenAbi,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
      chainId: daoConfig?.chain?.id,
      query: {
        enabled:
          !!address &&
          !!daoConfig?.contracts?.governorToken?.address &&
          !!daoConfig?.chain?.id,
      },
    });

  const delegationStatus = useMemo(() => {
    const balance = tokenBalance
      ? formatTokenAmount(tokenBalance)?.formatted
      : 0;
    if (!delegateMappings || delegateMappings.length === 0) {
      return {
        type: "none",
        displayText: "Haven't delegated yet",
        buttonText: "Join as Delegate",
      };
    }

    const latestDelegation = delegateMappings[0];

    // Check if delegating to self
    if (latestDelegation.to.toLowerCase() === address.toLowerCase()) {
      return {
        type: "self",
        displayText: `Delegating ${balance ?? "0.00"} voting power to himself`,
        buttonText: "Change Delegate",
        to: latestDelegation.to,
      };
    }

    // Delegating to someone else
    return {
      type: "other",
      displayText: `Delegating ${balance ?? "0.00"} voting power to `,
      buttonText: "Change Delegate",
      to: latestDelegation.to,
    };
  }, [delegateMappings, address, tokenBalance, formatTokenAmount]);

  const isOwnProfile = useMemo(() => {
    if (!account || !address) return false;
    return (
      isAddress(address) && account.toLowerCase() === address.toLowerCase()
    );
  }, [address, account]);

  const handleDelegate = useCallback(() => {
    if (isDelegate) {
      if (!isConnected) {
        setShowConnectPrompt(true);
        return;
      }
      if (!isOwnProfile) {
        setDelegateOpen(true);
      } else {
        setOpen(true);
      }
    } else {
      switch (delegationStatus.type) {
        case "none":
          setJoinDelegateOpen(true);
          break;
        case "self":
          setChangeDelegateOpen(true);
          break;
        case "other":
          setChangeDelegateOpen(true);
          break;
      }
    }
  }, [isOwnProfile, isDelegate, delegationStatus.type, isConnected]);

  const handleSelect = useCallback(
    (value: "myself" | "else") => {
      setOpen(false);
      if (value === "myself") {
        setDelegateOpen(true);
      } else {
        router.push("/delegates");
      }
    },
    [router]
  );

  const handleEditProfile = useCallback(() => {
    router.push("/profile/edit");
  }, [router]);

  const profile = profileData?.data;

  const socialLinks = useMemo(
    () =>
      [
        {
          name: "Email",
          value: profile?.email,
          link: `mailto:${profile?.email}`,
          displayValue: profile?.email,
        },
        {
          name: "Twitter",
          value: profile?.twitter,
          link: getTwitterLink(profile?.twitter),
          displayValue: formatSocialHandle("twitter", profile?.twitter),
        },
        {
          name: "GitHub",
          value: profile?.github,
          link: getGithubLink(profile?.github),
          displayValue: formatSocialHandle("github", profile?.github),
        },
        {
          name: "Telegram",
          value: profile?.telegram,
          link: getTelegramLink(profile?.telegram),
          displayValue: formatSocialHandle("telegram", profile?.telegram),
        },
        {
          name: "Discord",
          value: profile?.discord,
          link: getDiscordLink(profile?.discord),
          displayValue: formatSocialHandle("discord", profile?.discord),
        },
      ]?.filter((item) => !!item.value),
    [profile]
  );

  useEffect(() => {
    if (isConnected) {
      setShowConnectPrompt(false);
    }
  }, [isConnected]);

  useEffect(() => {
    return () => {
      setShowConnectPrompt(false);
    };
  }, []);

  if (!isAddress(address)) {
    return <NotFound />;
  }

  if (isProfileLoading) {
    return <ProfileSkeleton isDelegate={!!isDelegate} />;
  }

  if (showConnectPrompt) {
    return (
      <WithConnect>
        <div className="flex flex-col gap-[30px]">
          {isDelegate ? (
            <div className="flex items-center gap-1 text-[18px] font-extrabold">
              <Link
                href="/delegates"
                className="text-muted-foreground hover:text-foreground"
              >
                Delegates
              </Link>
              <span className="text-muted-foreground">/</span>
              <AddressResolver
                address={address as `0x${string}`}
                showShortAddress
              >
                {(value) => <span>{value}</span>}
              </AddressResolver>
            </div>
          ) : null}
        </div>
      </WithConnect>
    );
  }

  return (
    <div className="flex flex-col gap-[30px]">
      {isDelegate ? (
        <div className="flex items-center gap-1 text-[18px] font-extrabold">
          <Link
            href="/delegates"
            className="text-muted-foreground hover:text-foreground"
          >
            Delegates
          </Link>
          <span className="text-muted-foreground">/</span>
          <AddressResolver address={address as `0x${string}`} showShortAddress>
            {(value) => <span>{value}</span>}
          </AddressResolver>
        </div>
      ) : null}

      <div className="grid grid-cols-[1fr_400px] gap-[20px]">
        {/* personal info */}
        <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px]">
          <div className="flex items-center justify-between gap-[10px]">
            <div className="flex items-center gap-[20px]">
              <AddressAvatar
                address={address as `0x${string}`}
                className="size-[70px]"
              />
              <div>
                <div className="flex items-center gap-[5px]">
                  <AddressResolver
                    address={address as `0x${string}`}
                    showShortAddress
                  >
                    {(value) => (
                      <span className="text-[26px] font-semibold">{value}</span>
                    )}
                  </AddressResolver>
                  <DropdownMenu>
                    <DropdownMenuTrigger>
                      <span className="flex size-[24px] cursor-pointer items-center justify-center transition-opacity hover:opacity-80">
                        <Image
                          src="/assets/image/share.svg"
                          alt="delegate-link"
                          className="size-[16px]"
                          width={16}
                          height={16}
                        />
                      </span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      className="flex w-[160px] flex-col rounded-[10px] border-border/20 bg-card"
                      side="right"
                    >
                      <DropdownMenuItem
                        className="cursor-pointer py-[10px]"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            `${window.location.origin}/profile/${address}`
                          );
                        }}
                      >
                        Copy Profile URL
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex items-center gap-[5px]">
                  <span className="text-[14px] text-white/40">
                    {formatShortAddress(address)}
                  </span>
                  <ClipboardIconButton text={address} className="size-[16px]" />
                </div>
                {isDelegateMappingsLoading ? (
                  <Skeleton className="h-[24px] w-[120px] mt-2" />
                ) : delegationStatus?.type === "other" ? (
                  <span className="text-[14px] text-foreground font-semibold">
                    {delegationStatus?.displayText}{" "}
                    <AddressResolver
                      address={delegationStatus?.to as `0x${string}`}
                      showShortAddress
                    >
                      {(value) => (
                        <Link
                          href={`/delegate/${delegationStatus?.to}`}
                          className="text-[#00BAFF] hover:underline"
                        >
                          {value}
                        </Link>
                      )}
                    </AddressResolver>
                  </span>
                ) : (
                  <span className="text-[14px] text-foreground font-semibold">
                    {delegationStatus?.displayText}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-[20px]">
              {isOwnProfile ? (
                <Button
                  className="rounded-full border-border bg-card"
                  variant="outline"
                  onClick={handleEditProfile}
                >
                  Edit Profile
                </Button>
              ) : null}
              <Button className="rounded-full" onClick={handleDelegate}>
                {isDelegate ? "Delegate" : delegationStatus?.buttonText}
              </Button>
            </div>
          </div>
          <Separator className="bg-border/40" />

          {profile?.delegate_statement ? (
            <p
              className="mb-0 line-clamp-2 text-[14px] font-normal leading-normal text-foreground"
              style={{
                wordBreak: "break-word",
              }}
            >
              {profile?.delegate_statement}
            </p>
          ) : (
            <p className="mb-0 line-clamp-2 text-[14px] font-normal leading-normal text-muted-foreground">
              No delegate statement found, please create one to attract more
              votes.
            </p>
          )}

          <div className="flex items-center gap-[20px]">
            {socialLinks.map((social) => (
              <Link
                href={social.link || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex size-[24px] cursor-pointer items-center justify-center rounded-full bg-white transition-opacity hover:opacity-80"
                key={social.name}
                title={capitalize(social.name)}
                style={{
                  backgroundImage: `url(/assets/image/user_social/${social.name.toLowerCase()}.svg)`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "center",
                }}
              ></Link>
            ))}
          </div>
        </div>

        {/* Voting Power */}
        <div className="flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px] py-[40px]">
          <div className="flex flex-col justify-center gap-[10px]">
            <span className="text-[18px] font-semibold leading-none text-muted-foreground/80 flex items-center gap-[5px]">
              <Image
                src="/assets/image/power.svg"
                alt="voting-power"
                className="size-[24px]"
                width={24}
                height={24}
              />
              Total Voting Power
            </span>

            {isLoading ? (
              <Skeleton className="h-[56px] w-[280px]" />
            ) : (
              <span className="text-[56px] font-extrabold leading-none text-foreground">
                {formattedVotes}
              </span>
            )}
          </div>

          <div className="flex flex-col justify-center gap-[10px]">
            <span className="text-[14px] font-normal leading-none text-muted-foreground/80 flex items-center gap-[5px]">
              Governance Balance
            </span>

            {isLoadingTokenBalance ? (
              <div className="flex items-center gap-2">
                <Skeleton className="h-[34px] w-[150px]" />
                <Skeleton className="h-[24px] w-[60px]" />
              </div>
            ) : (
              <span className="text-[26px] font-semibold leading-none text-foreground">
                {tokenBalance ? formatTokenAmount(tokenBalance)?.formatted : 0}{" "}
                {governanceToken?.symbol}
              </span>
            )}
          </div>
        </div>
      </div>

      <ReceivedDelegations address={address} />
      <DelegateAction
        address={address}
        open={delegateOpen}
        onOpenChange={setDelegateOpen}
      />
      <DelegateSelector
        open={open}
        onOpenChange={setOpen}
        onSelect={handleSelect}
      />
      <ChangeDelegate
        open={changeDelegateOpen}
        onOpenChange={setChangeDelegateOpen}
        onSelect={handleSelect}
        to={delegationStatus.to ?? ""}
      />
      <JoinDelegate
        open={joinDelegateOpen}
        onOpenChange={setJoinDelegateOpen}
        amount={tokenBalance ? formatTokenAmount(tokenBalance)?.formatted : 0}
        symbol={governanceToken?.symbol ?? ""}
      />
    </div>
  );
};
