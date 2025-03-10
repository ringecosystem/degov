"use client";
import { useQuery } from "@tanstack/react-query";
import { capitalize } from "lodash-es";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { isAddress, type Address } from "viem";
import { useAccount } from "wagmi";

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
import { useAddressVotes } from "@/hooks/useAddressVotes";
import { profileService } from "@/services/graphql";
import { formatShortAddress } from "@/utils/address";

import { ReceivedDelegations } from "./received-delegations";
interface ProfileProps {
  address: Address;
}

export const Profile = ({ address }: ProfileProps) => {
  const router = useRouter();
  const { address: account } = useAccount();

  const { data: profileData, isFetching: isProfileLoading } = useQuery({
    queryKey: ["profile", address],
    queryFn: () => profileService.getProfile(address),
    enabled: !!address,
  });

  console.log("profileData", profileData);

  const [open, setOpen] = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);

  const isOwnProfile = useMemo(() => {
    if (!account || !address) return false;
    return (
      isAddress(address) && account.toLowerCase() === address.toLowerCase()
    );
  }, [address, account]);

  const handleDelegate = useCallback(() => {
    if (!isOwnProfile) {
      setDelegateOpen(true);
    } else {
      setOpen(true);
    }
  }, [isOwnProfile]);

  const handleSelect = useCallback(
    (value: "myself" | "else") => {
      setOpen(false);
      if (value === "myself") {
        setDelegateOpen(true);
      } else {
        router.push("/members");
      }
    },
    [router]
  );
  const handleEditProfile = useCallback(() => {
    router.push("/profile/edit");
  }, [router]);

  const socials = [
    {
      key: "email",
      value: "l2beat@gmail.com",
    },
    {
      key: "twitter",
      value: "l2beat",
    },
    {
      key: "telegram",
      value: "l2beat",
    },
    {
      key: "github",
      value: "l2beat",
    },
    {
      key: "discord",
      value: "l2beat",
    },
  ];
  const { formattedVotes, isLoading } = useAddressVotes(address);

  if (!isAddress(address)) {
    return <NotFound />;
  }

  return (
    <div className="flex flex-col gap-[30px] p-[30px]">
      <div className="flex items-center gap-1 text-[18px] font-extrabold">
        <span className="text-muted-foreground">Delegate</span>
        <span className="text-muted-foreground">/</span>
        <AddressResolver address={address as `0x${string}`} showShortAddress>
          {(value) => <span>{value}</span>}
        </AddressResolver>
      </div>

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
                Delegate
              </Button>
            </div>
          </div>
          <Separator className="bg-border/40" />
          <p className="mb-0 line-clamp-2 text-[14px] font-normal leading-normal text-foreground">
            L2BEAT is an independent, public goods company who acts as an
            impartial watchdog for the Ethereum Layer2 ecosystem. Our mission is
            to provide comprehensive and unbiased analysis and comparative
            evaluations of Layer 2 solutions . We are committed to the
            verification and fact-checking of the claims made by each project,
            with a special focus on the security aspects. What sets L2BEAT apart
            is our unwavering commitment to delivering accurate and reliable
            information.
          </p>

          <div className="flex items-center gap-[20px]">
            {socials?.map((social) => (
              <span
                className="flex size-[24px] cursor-pointer items-center justify-center rounded-full bg-white transition-opacity hover:opacity-80"
                key={social.key}
                title={capitalize(social.key)}
                style={{
                  backgroundImage: `url(/assets/image/user_social/${social.key}.svg)`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "center",
                }}
              ></span>
            ))}
          </div>
        </div>

        {/* Voting Power */}
        <div className="flex items-center justify-center gap-[20px] rounded-[14px] bg-card p-[20px]">
          <Image
            src="/assets/image/power.svg"
            alt="voting-power"
            className="size-[90px]"
            width={90}
            height={90}
          />
          <div className="flex flex-col justify-center gap-[10px]">
            <span className="text-[18px] font-semibold leading-none text-muted-foreground/80">
              Voting Power
            </span>
            {isLoading ? (
              <Skeleton className="h-[56px] w-[200px]" />
            ) : (
              <span className="text-[56px] font-extrabold leading-none text-foreground">
                {formattedVotes}
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
    </div>
  );
};
