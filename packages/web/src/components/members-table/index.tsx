import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Link } from '@tanstack/react-router';
import { Empty } from '@/components/ui/empty';
import { Button } from '../ui/button';
import { AddressAvatar } from '../address-avatar';
import { AddressResolver } from '../address-resolver';

const data = [
  {
    rank: '1',
    member: '0x3d6d656c1bf92f7028Ce4C352563E1C363C58ED5',
    delegateStatement:
      'Understanding color theory: the color wheel and finding complementary colors',
    votingPower: '1.11B'
  },
  {
    rank: '2',
    member: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
    delegateStatement:
      'Yo Reddit! What’s a small thing that anyone can do at nearly anytime to improve their mood and make Yo Reddit! What’s a small thing that anyone can do at nearly anytime to improve their mood and make Yo Reddit! What’s a small thing that anyone can do at nearly anytime to improve their mood and make ',
    votingPower: '1.11B'
  },
  {
    rank: '3',
    member: '0x3d6d656c1bf92f7028Ce4C352563E1C363C58ED5',
    delegateStatement:
      'Understanding color theory: the color wheel and finding complementary colors',
    votingPower: '1.11B'
  }
];

interface MembersTableProps {
  caption?: string;
}
export function MembersTable({ caption }: MembersTableProps) {
  return (
    <div className="rounded-[14px] bg-card p-[20px]">
      <Table>
        {!!data?.length && (
          <TableCaption>
            <Link
              to="/proposals"
              className="text-foreground transition-colors hover:text-foreground/80"
            >
              {caption || 'View more'}
            </Link>
          </TableCaption>
        )}
        <TableHeader>
          <TableRow>
            <TableHead className="w-[160px] rounded-l-[14px] text-left">Rank</TableHead>
            <TableHead className="w-[260px] text-left">Member</TableHead>
            <TableHead>Delegate Statement</TableHead>
            <TableHead className="w-[200px]">Voting Power</TableHead>
            <TableHead className="w-[180px] rounded-r-[14px]">Action</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {data.map((value) => (
            <TableRow key={value.rank}>
              <TableCell className="text-left">
                <span className="line-clamp-1" title={value.rank}>
                  {value.rank}
                </span>
              </TableCell>
              <TableCell className="text-left">
                <a
                  href={`/delegate/${value.member}`}
                  className="flex items-center gap-[10px] hover:underline"
                >
                  <AddressAvatar address={value.member as `0x${string}`} size={30} />
                  <AddressResolver address={value.member as `0x${string}`} showShortAddress>
                    {(ensName) => (
                      <span className="line-clamp-1" title={value.member}>
                        {ensName}
                      </span>
                    )}
                  </AddressResolver>
                </a>
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
                  className="h-[30px] rounded-[100px] border border-border bg-card p-[10px]"
                >
                  Delegate
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!data?.length && <Empty label="No Members" className="h-[400px]" />}
    </div>
  );
}
