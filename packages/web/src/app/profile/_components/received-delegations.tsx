import { useQuery } from "@tanstack/react-query";

import { DelegationList } from "@/components/delegation-list";
import { DelegationTable } from "@/components/delegation-table";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { delegateService } from "@/services/graphql";

import type { Address } from "viem";

interface ReceivedDelegationsProps {
  address: Address;
}

export function ReceivedDelegations({ address }: ReceivedDelegationsProps) {
  const daoConfig = useDaoConfig();

  // Get received delegations count
  const { data: delegationConnection } = useQuery({
    queryKey: [
      "delegateMappingsConnection",
      address,
      daoConfig?.indexer?.endpoint,
    ],
    queryFn: () =>
      delegateService.getDelegateMappingsConnection(
        daoConfig?.indexer?.endpoint as string,
        {
          where: {
            to_eq: address.toLowerCase(),
          },
          orderBy: ["id_ASC"],
        }
      ),
    enabled: !!daoConfig?.indexer?.endpoint && !!address,
  });

  const getDisplayTitle = () => {
    const totalCount = delegationConnection?.totalCount;
    if (totalCount !== undefined) {
      return `Received Delegations (${totalCount})`;
    }
    return "Received Delegations";
  };

  return (
    <div className="flex flex-col gap-[15px] lg:gap-[20px]">
      <h3 className="text-[16px] lg:text-[18px] font-semibold">
        {getDisplayTitle()}
      </h3>
      <div className="lg:hidden">
        <DelegationList address={address} />
      </div>
      <div className="hidden lg:block">
        <DelegationTable address={address} />
      </div>
    </div>
  );
}
