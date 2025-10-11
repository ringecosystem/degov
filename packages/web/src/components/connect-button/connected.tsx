import { ChevronDown, Power } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo } from "react";
import { formatUnits } from "viem";
import { useReadContract } from "wagmi";

import { ExternalLinkIcon, ProfileIcon } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { abi as tokenAbi } from "@/config/abi/token";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useDisconnectWallet } from "@/hooks/useDisconnectWallet";
import { useFormatGovernanceTokenAmount } from "@/hooks/useFormatGovernanceTokenAmount";
import { useGovernanceToken } from "@/hooks/useGovernanceToken";
import { useCurrentVotingPower } from "@/hooks/useSmartGetVotes";
import { formatShortAddress } from "@/utils";

import { AddressAvatar } from "../address-avatar";
import { AddressResolver } from "../address-resolver";
import ClipboardIconButton from "../clipboard-icon-button";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
interface ConnectedProps {
  address: `0x${string}`;
  onMenuToggle?: () => void;
}

export const Connected = ({ address, onMenuToggle }: ConnectedProps) => {
  const { disconnectWallet } = useDisconnectWallet();
  const daoConfig = useDaoConfig();
  const formatTokenAmount = useFormatGovernanceTokenAmount();
  const { data: governanceToken, isLoading: isGovernanceTokenLoading } =
    useGovernanceToken();

  const { data: votingPower, isLoading: isVotingPowerLoading } =
    useCurrentVotingPower(address);

  const { data: totalSupply, isLoading: isTotalSupplyLoading } =
    useReadContract({
      address: daoConfig?.contracts?.governorToken?.address as `0x${string}`,
      abi: tokenAbi,
      functionName: "totalSupply",
      chainId: daoConfig?.chain?.id,
      query: {
        enabled:
          Boolean(daoConfig?.contracts?.governorToken?.address) &&
          Boolean(daoConfig?.chain?.id),
      },
    });

  const { data: tokenBalance, isLoading: isBalanceLoading } = useReadContract({
    address: daoConfig?.contracts?.governorToken?.address as `0x${string}`,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [address],
    chainId: daoConfig?.chain?.id,
    query: {
      enabled:
        Boolean(address) &&
        Boolean(daoConfig?.contracts?.governorToken?.address) &&
        Boolean(daoConfig?.chain?.id),
    },
  });

  const decimals =
    governanceToken?.decimals ??
    (daoConfig?.contracts?.governorToken?.standard === "ERC721" ? 0 : 18);

  const formattedVotingPower = useMemo(() => {
    if (!votingPower) return "0";

    return formatTokenAmount(votingPower)?.formatted ?? "0";
  }, [votingPower, formatTokenAmount]);

  const votingPowerPercentage = useMemo(() => {
    if (!votingPower || !totalSupply || totalSupply === 0n) return 0;
    if (decimals === undefined) return null;

    const votingPowerValue = Number(formatUnits(votingPower, decimals));
    const totalSupplyValue = Number(formatUnits(totalSupply, decimals));

    if (
      !Number.isFinite(votingPowerValue) ||
      !Number.isFinite(totalSupplyValue) ||
      totalSupplyValue === 0
    ) {
      return 0;
    }

    return (votingPowerValue / totalSupplyValue) * 100;
  }, [votingPower, totalSupply, decimals]);

  const formattedVotingPowerPercentage = useMemo(() => {
    if (votingPowerPercentage === null) return "0";
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 2,
    }).format(votingPowerPercentage);
  }, [votingPowerPercentage]);

  const formattedBalance = useMemo(() => {
    if (!tokenBalance) return "0";

    return formatTokenAmount(tokenBalance)?.formatted ?? "0";
  }, [tokenBalance, formatTokenAmount]);

  const isVotingPowerSectionLoading =
    isVotingPowerLoading || isGovernanceTokenLoading || isTotalSupplyLoading;

  const isBalanceSectionLoading = isBalanceLoading || isGovernanceTokenLoading;

  const handleDisconnect = useCallback(() => {
    disconnectWallet(address);
  }, [disconnectWallet, address]);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className=" focus-visible:outline-hidden">
        <AddressResolver address={address} showShortAddress>
          {(value) => (
            <div className="flex items-center gap-[10px] rounded-[20px] lg:rounded-[10px] bg-card lg:bg-transparent lg:border lg:border-border px-4 py-2">
              <AddressAvatar
                address={address}
                className="size-[24px] rounded-full"
                size={24}
              />
              <span className="text-[14px]">{value}</span>
              <ChevronDown size={20} className="text-muted-foreground" />
            </div>
          )}
        </AddressResolver>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-[327px] rounded-[26px] border-border/20 bg-card p-[20px] shadow-2xl flex flex-col gap-[20px]"
        align="end"
      >
        <div className="flex items-center gap-[8px]">
          <AddressAvatar address={address} className="rounded-full" />
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[18px] font-semibold text-foreground">
                {formatShortAddress(address)}
              </span>
            </TooltipTrigger>
            <TooltipContent>{address}</TooltipContent>
          </Tooltip>
          <ClipboardIconButton text={address} size={20} />
          <Link
            href={`${daoConfig?.chain?.explorers?.[0]}/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLinkIcon
              width={20}
              height={20}
              className="mt-[2px] shrink-0 text-foreground"
            />
          </Link>
        </div>
        <div className="rounded-[14px] border border-border/20 bg-bg-2 p-[10px] shadow-card">
          <div className="flex items-center justify-between text-[12px] text-foreground/80">
            <span className="font-normal">Voting Power</span>
            {isVotingPowerSectionLoading ? (
              <Skeleton className="h-[16px] w-[120px] bg-border/20" />
            ) : (
              <span className="font-semibold text-foreground">
                {formattedVotingPower ?? "--"}
                {formattedVotingPowerPercentage
                  ? ` (${formattedVotingPowerPercentage}%)`
                  : ""}
              </span>
            )}
          </div>
          <div className="my-[10px] h-px bg-border/20" />
          <div className="flex items-center justify-between text-[12px] text-foreground/80">
            <span className="font-normal">Balance</span>
            {isBalanceSectionLoading ? (
              <Skeleton className="h-[16px] w-[140px] bg-border/20" />
            ) : (
              <span className="font-semibold text-foreground">
                {formattedBalance ?? "--"}
                {governanceToken?.symbol ? ` ${governanceToken.symbol}` : ""}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center justify-center gap-[10px]">
          <Button
            asChild
            className="w-full gap-[10px] rounded-[100px] border-foreground bg-card"
            variant="outline"
          >
            <Link
              href="/profile"
              onClick={() => onMenuToggle?.()}
              className="text-foreground"
            >
              <ProfileIcon width={20} height={20} className="text-current" />
              <span className="text-[14px]">Profile</span>
            </Link>
          </Button>
          <Button
            onClick={handleDisconnect}
            className="w-full gap-[10px] rounded-[100px] border-foreground bg-card text-foreground"
            variant="outline"
          >
            <Power size={20} className="text-current" strokeWidth={2} />
            <span className="text-[14px]">Disconnect</span>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
