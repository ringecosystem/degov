import { useMemo } from "react";
import { useReadContracts } from "wagmi";

import { abi as tokenAbi } from "@/config/abi/token";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { useFormatGovernanceTokenAmount } from "@/hooks/useFormatGovernanceTokenAmount";
import type { Member } from "@/services/graphql/types";

import type { Address } from "viem";

export function useMembersVotingPower(members: Member[] | undefined) {
  const daoConfig = useDaoConfig();
  const formatTokenAmount = useFormatGovernanceTokenAmount();

  const memberAddresses = useMemo(() => {
    if (!members) return [];
    return members
      .filter((member) => member.address && member.address.startsWith("0x"))
      .map((member) => member.address as Address);
  }, [members]);

  const votesContracts = useMemo(() => {
    return {
      address: daoConfig?.contracts?.governorToken?.address as Address,
      abi: tokenAbi,
      functionName: "getVotes",
      chainId: daoConfig?.chain?.id,
    } as const;
  }, [daoConfig]);

  const {
    data: votesData,
    isLoading: isVotesLoading,
    isError: isVotesError,
  } = useReadContracts({
    contracts: memberAddresses.map((address) => ({
      ...votesContracts,
      args: [address],
    })),
    query: {
      enabled:
        memberAddresses.length > 0 &&
        Boolean(daoConfig?.contracts?.governorToken?.address) &&
        Boolean(daoConfig?.chain?.id),
    },
  });

  const votingPowerMap = useMemo(() => {
    const result: Record<string, { formatted: string; raw: bigint }> = {};

    if (!memberAddresses) return result;

    memberAddresses.forEach((address, index) => {
      const voteData = votesData?.[index];
      if (voteData?.status === "success" && voteData.result !== undefined) {
        result[address.toLowerCase()] = formatTokenAmount(
          voteData.result as bigint
        );
      } else {
        result[address.toLowerCase()] = { formatted: "0", raw: 0n };
      }
    });

    return result;
  }, [votesData, memberAddresses, formatTokenAmount]);

  return {
    votingPowerMap,
    isLoading: isVotesLoading,
    isError: isVotesError,
  };
}
