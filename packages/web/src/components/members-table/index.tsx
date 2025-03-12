import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { useMembersVotingPower } from "@/hooks/useMembersVotingPower";
import { memberService } from "@/services/graphql";
import type { Member } from "@/services/graphql/types";

import { AddressWithAvatar } from "../address-with-avatar";
import { CustomTable } from "../custom-table";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";

import type { ColumnType } from "../custom-table";

interface MembersTableProps {
  onDelegate?: (value: Member) => void;
  itemsPerPage?: number;
}

export function MembersTable({
  onDelegate,
  itemsPerPage = 10,
}: MembersTableProps) {
  const [loadedPages, setLoadedPages] = useState(1);

  const { data: members, isPending: isMembersLoading } = useQuery({
    queryKey: ["members"],
    queryFn: () => memberService.getAllMembers(),
    placeholderData: keepPreviousData,
  });

  const { votingPowerMap, isLoading: isVotingPowerLoading } =
    useMembersVotingPower(members?.data ?? []);

  const columns = useMemo<ColumnType<Member>[]>(
    () => [
      {
        title: "Rank",
        key: "rank",
        width: "160px",
        className: "text-left",
        render: (_record, index) => (
          <span className="line-clamp-1" title={(index + 1).toString()}>
            {index + 1}
          </span>
        ),
      },
      {
        title: "Member",
        key: "member",
        width: "260px",
        className: "text-left",
        render: (record) => (
          <AddressWithAvatar address={record.address as `0x${string}`} />
        ),
      },
      {
        title: "Delegate Statement",
        key: "delegateStatement",
        width: "200px",
        className: "text-left",
        render: (record) => (
          <span className="line-clamp-1" title={record.delegate_statement}>
            {record.delegate_statement}
          </span>
        ),
      },
      {
        title: "Voting Power",
        key: "votingPower",
        width: "200px",
        className: "text-right",
        render: (record) =>
          isVotingPowerLoading ? (
            <Skeleton className="h-[30px] w-[100px]" />
          ) : (
            <span
              className="line-clamp-1"
              title={votingPowerMap[record.address.toLowerCase()]?.formatted}
            >
              {votingPowerMap[record.address.toLowerCase()]?.formatted}
            </span>
          ),
      },
      {
        title: "Action",
        key: "action",
        width: "180px",
        className: "text-right",
        render: (record) => (
          <Button
            variant="outline"
            onClick={() => {
              onDelegate?.(record);
            }}
            className="h-[30px] rounded-[100px] border border-border bg-card p-[10px]"
          >
            Delegate
          </Button>
        ),
      },
    ],
    [onDelegate, votingPowerMap, isVotingPowerLoading]
  );

  const sortedMembers = useMemo(() => {
    if (!members?.data || members.data.length === 0) return [];

    return [...members.data].sort((a, b) => {
      const aVotingPower = votingPowerMap[a.address.toLowerCase()]?.raw || 0n;
      const bVotingPower = votingPowerMap[b.address.toLowerCase()]?.raw || 0n;

      if (bVotingPower > aVotingPower) return 1;
      if (bVotingPower < aVotingPower) return -1;
      return 0;
    });
  }, [members, votingPowerMap]);

  const totalPages = useMemo(() => {
    return Math.ceil((sortedMembers.length || 0) / itemsPerPage);
  }, [sortedMembers, itemsPerPage]);

  const displayedData = useMemo(() => {
    const itemsToShow = loadedPages * itemsPerPage;
    return sortedMembers.slice(0, itemsToShow);
  }, [sortedMembers, loadedPages, itemsPerPage]);

  const shouldShowViewMore = loadedPages < totalPages;

  const handleViewMore = () => {
    if (loadedPages < totalPages) {
      setLoadedPages(loadedPages + 1);
    }
  };

  return (
    <div className="rounded-[14px] bg-card p-[20px]">
      <CustomTable
        tableClassName="table-fixed"
        columns={columns}
        dataSource={displayedData}
        rowKey="id"
        isLoading={isMembersLoading || isVotingPowerLoading}
        emptyText="No Members"
        caption={
          shouldShowViewMore ? (
            <div
              className="text-foreground transition-colors hover:text-foreground/80 cursor-pointer"
              onClick={handleViewMore}
            >
              View more
            </div>
          ) : null
        }
      />
    </div>
  );
}
