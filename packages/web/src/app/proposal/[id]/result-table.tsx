import { useMemo } from "react";

import { AddressWithAvatar } from "@/components/address-with-avatar";
import type { ColumnType } from "@/components/custom-table";
import { CustomTable } from "@/components/custom-table";
import { useFormatGovernanceTokenAmount } from "@/hooks/useFormatGovernanceTokenAmount";
import type { ProposalVoterItem } from "@/services/graphql/types";

interface ResultTableProps {
  data?: ProposalVoterItem[];
  isFetching: boolean;
  page: number;
  setPage: (page: number) => void;
}

const PAGE_SIZE = 10;
export function ResultTable({
  data,
  isFetching,
  page,
  setPage,
}: ResultTableProps) {
  const formatTokenAmount = useFormatGovernanceTokenAmount();

  const totalVotes = useMemo(() => {
    const total = data?.reduce((acc, curr) => acc + Number(curr.weight), 0);
    return formatTokenAmount(total ? BigInt(total) : 0n);
  }, [data, formatTokenAmount]);

  const pagedData = useMemo(() => {
    return data?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }, [data, page]);

  const columns = useMemo<ColumnType<ProposalVoterItem>[]>(() => {
    return [
      {
        title: `${data?.length} addresses`,
        key: "address",
        className: "w-1/2 text-left",
        render: (value) => (
          <AddressWithAvatar address={value.voter} avatarSize={30} />
        ),
      },
      {
        title: `${totalVotes.formatted} votes`,
        key: "votes",
        className: "w-1/2 text-right",
        render: (value) =>
          formatTokenAmount(value.weight ? BigInt(value?.weight) : 0n)
            ?.formatted,
      },
    ];
  }, [data, totalVotes, formatTokenAmount]);

  return (
    <CustomTable
      dataSource={data ?? []}
      columns={columns}
      isLoading={isFetching}
      emptyText="No addresses"
      rowKey="id"
      caption={
        data &&
        pagedData?.length === PAGE_SIZE &&
        data.length > page * PAGE_SIZE && (
          <span
            className="text-foreground transition-colors hover:text-foreground/80"
            onClick={() => setPage(page + 1)}
          >
            View more
          </span>
        )
      }
    />
  );
}
