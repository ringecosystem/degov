import { DelegationTable } from "@/components/delegation-table";

import type { Address } from "viem";

interface ReceivedDelegationsProps {
  address: Address;
}

export function ReceivedDelegations({ address }: ReceivedDelegationsProps) {
  return (
    <div className="flex flex-col gap-[20px]">
      <h3 className="text-[18px] font-semibold">Received Delegations</h3>
      <DelegationTable address={address} />
    </div>
  );
}
