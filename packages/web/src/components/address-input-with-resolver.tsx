import Image from "next/image";
import { isAddress } from "viem";

import { AddressWithAvatar } from "@/components/address-with-avatar";
import { Input } from "@/components/ui/input";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { cn } from "@/lib/utils";

import type { Address } from "viem";

interface AddressInputWithResolverProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

export function AddressInputWithResolver({
  value,
  onChange,
  placeholder,
  className,
  id,
}: AddressInputWithResolverProps) {
  const dappConfig = useDaoConfig();
  const isInvalidAddress = !!value && !isAddress(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e.target.value);
  };

  const handleClear = () => {
    onChange?.("");
  };

  return (
    <div className="relative space-y-1">
      {value && !isInvalidAddress ? (
        <div className="relative flex h-[40px] items-center rounded-[4px] border border-border/20 bg-card">
          <AddressWithAvatar
            address={value as Address}
            customLink={(address) =>
              `${dappConfig?.chain?.explorers?.[0]}/address/${address}`
            }
            avatarSize={24}
            className="text-sm"
          />
          <button
            onClick={handleClear}
            className="absolute right-3 hover:opacity-70"
          >
            <Image
              src="/assets/image/proposal/close.svg"
              alt="clear"
              width={16}
              height={16}
            />
          </button>
        </div>
      ) : (
        <Input
          id={id}
          value={value}
          onChange={handleChange}
          className={cn(
            "border-border/20 bg-card",
            isInvalidAddress && "border-red-500",
            className
          )}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}
