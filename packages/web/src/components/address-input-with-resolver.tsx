import Image from "next/image";
import Link from "next/link";
import { isAddress } from "viem";

import { AddressAvatar } from "@/components/address-avatar";
import { AddressResolver } from "@/components/address-resolver";
import { Input } from "@/components/ui/input";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { cn } from "@/lib/utils";
import { formatShortAddress } from "@/utils/address";

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
        <div className="relative flex h-[40px] items-center justify-between rounded-[4px] border border-border/20 bg-card px-3">
          <Link
            href={`${dappConfig?.chain?.explorers?.[0]}/address/${value}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-[10px] hover:opacity-80 transition-opacity"
          >
            <AddressAvatar address={value as Address} size={24} />
            <AddressResolver address={value as Address}>
              {(resolvedName) => (
                <span className="flex-1" title={value}>
                  {resolvedName === value ? (
                    <span className="text-[14px] text-muted-foreground font-semibold">
                      {formatShortAddress(value)}
                    </span>
                  ) : (
                    <span className="flex items-center gap-[5px]">
                      <span className="text-[14px] text-muted-foreground font-semibold">
                        {resolvedName}
                      </span>
                      <span className="text-[14px] text-muted-foreground">
                        ({formatShortAddress(value)})
                      </span>
                    </span>
                  )}
                </span>
              )}
            </AddressResolver>

            <Image
              src="/assets/image/light/external-link.svg"
              alt="external-link"
              width={16}
              height={16}
              className="block dark:hidden"
            />
            <Image
              src="/assets/image/external-link.svg"
              alt="external-link"
              width={16}
              height={16}
              className="hidden dark:block"
            />
          </Link>

          <button
            onClick={handleClear}
            className="ml-2 hover:opacity-70 flex-shrink-0"
          >
            <Image
              src="/assets/image/light/proposal/close.svg"
              alt="close"
              width={16}
              height={16}
              className="block dark:hidden"
            />
            <Image
              src="/assets/image/proposal/close.svg"
              alt="close"
              width={16}
              height={16}
              className="hidden dark:block"
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
