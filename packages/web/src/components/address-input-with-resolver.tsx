import Link from "next/link";
import { isAddress } from "viem";

import { AddressAvatar } from "@/components/address-avatar";
import { AddressResolver } from "@/components/address-resolver";
import { ExternalLinkIcon, ProposalCloseIcon } from "@/components/icons";
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
        <div className="relative flex h-[40px] items-center justify-between rounded-[4px] border border-border/20 bg-card px-3">
          <span className="flex items-center gap-[10px]">
            <AddressAvatar address={value as Address} size={24} />
            <AddressResolver address={value as Address}>
              {(resolvedName) => (
                <span className="flex-1" title={value}>
                  {resolvedName === value ? (
                    <span className="text-[14px] text-muted-foreground font-semibold">
                      {value}
                    </span>
                  ) : (
                    <span className="flex items-center gap-[5px]">
                      <span className="text-[14px] text-muted-foreground font-semibold">
                        {resolvedName}
                      </span>
                      <span className="text-[14px] text-muted-foreground">
                        ({value})
                      </span>
                    </span>
                  )}
                </span>
              )}
            </AddressResolver>
            <Link
              href={`${dappConfig?.chain?.explorers?.[0]}/address/${value}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-80 transition-opacity cursor-pointer duration-300 text-muted-foreground"
            >
              <ExternalLinkIcon
                width={16}
                height={16}
                className="text-foreground"
              />
            </Link>
          </span>

          <button
            onClick={handleClear}
            className="ml-2 hover:opacity-70 flex-shrink-0 text-muted-foreground"
          >
            <ProposalCloseIcon
              width={16}
              height={16}
              className="text-foreground"
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
