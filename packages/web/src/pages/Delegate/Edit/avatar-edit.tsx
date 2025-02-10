import { AddressAvatar } from '@/components/address-avatar';
import { Button } from '@/components/ui/button';
import { useAccount } from 'wagmi';

export function AvatarEdit() {
  const { address } = useAccount();
  return (
    <div className="flex h-[207px] flex-col items-center justify-center gap-[20px] rounded-[14px] bg-card p-[20px]">
      {!!address && (
        <AddressAvatar address={address} className="h-[110px] w-[110px] rounded-full" />
      )}
      <Button variant="outline" className="w-full rounded-[100px] border-border bg-card">
        Edit
      </Button>
    </div>
  );
}
