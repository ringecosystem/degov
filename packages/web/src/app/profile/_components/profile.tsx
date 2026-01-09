"use client";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { isAddress, type Address } from "viem";
import { useAccount, useAccountEffect, useReadContract } from "wagmi";

import { ChangeDelegate } from "@/app/profile/_components/change-delegate";
import { AddressResolver } from "@/components/address-resolver";
import { DelegateAction } from "@/components/delegate-action";
import { DelegateSelector } from "@/components/delegate-selector";
import NotFound from "@/components/not-found";
import { WithConnect } from "@/components/with-connect";
import { abi as tokenAbi } from "@/config/abi/token";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useFormatGovernanceTokenAmount } from "@/hooks/useFormatGovernanceTokenAmount";
import { useGovernanceToken } from "@/hooks/useGovernanceToken";
import { useProfileQuery } from "@/hooks/useProfileQuery";
import { delegateService } from "@/services/graphql";

import { JoinDelegate } from "./join-delegate";
import { ReceivedDelegations } from "./received-delegations";
import { ProfileSkeleton } from "./skeleton";
import { User } from "./user";

const SystemInfo = dynamic(
  () => import("@/components/system-info").then((mod) => mod.SystemInfo),
  {
    loading: () => (
      <div className="h-[300px] w-[360px] bg-card rounded-[14px] animate-pulse" />
    )
  }
);

const Faqs = dynamic(
  () => import("@/components/faqs").then((mod) => mod.Faqs),
  {
    loading: () => (
      <div className="h-[200px] bg-card rounded-[14px] animate-pulse" />
    )
  }
);

interface ProfileProps {
  address: Address;
  isDelegate?: boolean;
}

export const Profile = ({ address, isDelegate }: ProfileProps) => {
  const [open, setOpen] = useState(false);
  const { isConnected } = useAccount();
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [userRequestedConnect, setUserRequestedConnect] = useState(false);
  const [changeDelegateOpen, setChangeDelegateOpen] = useState(false);
  const daoConfig = useDaoConfig();
  const router = useRouter();
  const formatTokenAmount = useFormatGovernanceTokenAmount();
  const { data: governanceToken } = useGovernanceToken();
  const [joinDelegateOpen, setJoinDelegateOpen] = useState(false);
  const { address: account } = useAccount();

  // Derive showConnectPrompt from isConnected state
  // Only show prompt if user requested connection but is not yet connected
  const showConnectPrompt = userRequestedConnect && !isConnected;

  // Reset flag on actual wallet connect event (avoids setState inside generic effects)
  useAccountEffect({
    onConnect() {
      if (userRequestedConnect) {
        setUserRequestedConnect(false);
      }
    },
  });

  const { data: profileData, isLoading: isProfileLoading } = useProfileQuery(
    address
  );

  const { data: delegateMappings, isLoading: isDelegateMappingsLoading } =
    useQuery({
      queryKey: ["delegateMappings", address, daoConfig?.indexer?.endpoint],
      queryFn: () =>
        delegateService.getDelegateMappings(
          daoConfig?.indexer?.endpoint as string,
          { where: { from_eq: address?.toLowerCase() } }
        ),
      enabled: !!address && !!daoConfig?.indexer?.endpoint,
    });

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
        displayText: "Self",
        buttonText: "Change Delegate",
        to: latestDelegation.to,
      };
    }

    // Delegating to someone else
    return {
      type: "other",
      displayText: `${balance ?? "0.00"} ${governanceToken?.symbol} to`,
      buttonText: "Change Delegate",
      to: latestDelegation.to,
    };
  }, [
    delegateMappings,
    address,
    tokenBalance,
    formatTokenAmount,
    governanceToken,
  ]);

  const isOwnProfile = useMemo(() => {
    if (!account || !address) return false;
    return (
      isAddress(address) && account.toLowerCase() === address.toLowerCase()
    );
  }, [address, account]);

  const handleDelegate = useCallback(() => {
    if (isDelegate) {
      if (!isConnected) {
        setUserRequestedConnect(true);
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

  const delegationStatusText = useMemo(() => {
    return delegationStatus?.type === "other" ? (
      <span className="flex items-center">
        <AddressResolver
          address={delegationStatus?.to as `0x${string}`}
          showShortAddress
        >
          {(value) => (
            <Link
              href={`/delegate/${delegationStatus?.to}`}
              className="hover:underline ml-1"
            >
              {value}
            </Link>
          )}
        </AddressResolver>
      </span>
    ) : (
      <span>{delegationStatus?.displayText}</span>
    );
  }, [delegationStatus]);

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
    <div className="flex flex-col gap-[20px]">
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

      <div className="flex flex-col @min-[900px]:flex-row @min-[900px]:items-start gap-[15px] @min-[900px]:gap-[20px]">
        <div className="flex-1 min-w-0 flex flex-col gap-[15px] @min-[900px]:gap-[20px]">
          <User
            address={address}
            profile={profile}
            isOwnProfile={isOwnProfile}
            isDelegate={isDelegate}
            buttonText={delegationStatus?.buttonText}
            onEditProfile={handleEditProfile}
            onDelegate={handleDelegate}
            tokenBalance={`${
              tokenBalance ? formatTokenAmount(tokenBalance)?.formatted : 0
            } ${governanceToken?.symbol}`}
            isLoadingTokenBalance={isLoadingTokenBalance}
            delegationStatusText={delegationStatusText}
            isDelegateMappingsLoading={isDelegateMappingsLoading}
          />
          <ReceivedDelegations address={address} />
        </div>
        <div className="hidden @min-[900px]:flex flex-col gap-[15px] @min-[900px]:gap-[20px] w-[360px] shrink-0">
          <SystemInfo />
          <Faqs type="delegate" />
        </div>
      </div>
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
