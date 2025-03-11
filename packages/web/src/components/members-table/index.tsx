import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

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
}
export function MembersTable({ onDelegate }: MembersTableProps) {
  const { data: members, isLoading: isMembersLoading } = useQuery({
    queryKey: ["members"],
    queryFn: () => memberService.getAllMembers(),
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

  return (
    <div className="rounded-[14px] bg-card p-[20px]">
      <CustomTable
        tableClassName="table-fixed"
        columns={columns}
        dataSource={sortedMembers}
        rowKey="id"
        isLoading={isMembersLoading || isVotingPowerLoading}
        emptyText="No Members"
        caption={
          <div className="text-foreground transition-colors hover:text-foreground/80">
            View more
          </div>
        }
      />
      {/* <Table>
        {!!data?.length && (
          <TableCaption>
            <Link
              href="/proposals"
              className="text-foreground transition-colors hover:text-foreground/80"
            >
              {caption || "View more"}
            </Link>
          </TableCaption>
        )}
        <TableHeader>
          <TableRow>
            <TableHead className="w-[160px] rounded-l-[14px] text-left">
              Rank
            </TableHead>
            <TableHead className="w-[260px] text-left">Member</TableHead>
            <TableHead>Delegate Statement</TableHead>
            <TableHead className="w-[200px]">Voting Power</TableHead>
            <TableHead className="w-[180px] rounded-r-[14px]">Action</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {data?.map((value) => (
            <TableRow key={value.rank}>
              <TableCell className="text-left">
                <span className="line-clamp-1" title={value.rank}>
                  {value.rank}
                </span>
              </TableCell>
              <TableCell className="text-left">
                <AddressWithAvatar address={value.member as `0x${string}`} />
              </TableCell>
              <TableCell className="text-left">
                <span className="line-clamp-1" title={value.delegateStatement}>
                  {value.delegateStatement}
                </span>
              </TableCell>
              <TableCell>{value.votingPower}</TableCell>
              <TableCell>
                <Button
                  variant="outline"
                  onClick={() => {
                    onDelegate?.(value);
                  }}
                  className="h-[30px] rounded-[100px] border border-border bg-card p-[10px]"
                >
                  Delegate
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!data?.length && <Empty label="No Members" className="h-[400px]" />} */}
    </div>
  );
}
