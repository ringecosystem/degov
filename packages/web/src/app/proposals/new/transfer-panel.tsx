import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { useCallback, useEffect, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { parseUnits, formatUnits, type Address } from "viem";
import { useBalance } from "wagmi";

import { AddressInputWithResolver } from "@/components/address-input-with-resolver";
import { ErrorMessage } from "@/components/error-message";
import { ProposalCloseIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { cn } from "@/lib/utils";
import { formatBigIntForDisplay } from "@/utils/number";

import { transferSchema } from "./schema";

import type { TransferContent } from "./schema";

interface TransferPanelProps {
  index: number;
  visible: boolean;
  content?: TransferContent;
  onChange: (content: TransferContent) => void;
  onRemove: (index: number) => void;
}

// Add utility function for number formatting
const formatNumberInput = (value: string, decimals: number = 18): string => {
  // Remove any non-digit and non-decimal characters
  let formatted = value.replace(/[^\d.]/g, "");

  // Ensure only one decimal point
  const parts = formatted.split(".");
  if (parts.length > 2) {
    formatted = parts[0] + "." + parts[1];
  }

  // Limit decimal places
  if (parts.length === 2 && parts[1].length > decimals) {
    formatted = parts[0] + "." + parts[1].slice(0, decimals);
  }

  return formatted;
};

export const TransferPanel = ({
  index,
  visible,
  content,
  onChange,
  onRemove,
}: TransferPanelProps) => {
  const daoConfig = useDaoConfig();

  const {
    control,
    formState: { errors },
    watch,
    setValue,
  } = useForm<TransferContent>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      recipient: content?.recipient || ("" as Address),
      amount: content?.amount || "",
    },
    mode: "onChange",
  });

  // Watch form changes and sync to parent·
  useEffect(() => {
    const subscription = watch((value) => {
      onChange(value as TransferContent);
    });
    return () => subscription.unsubscribe();
  }, [watch, onChange]);

  const token = useMemo(() => {
    return {
      address: "0x0000000000000000000000000000000000000000" as Address,
      symbol: daoConfig?.chain?.nativeToken?.symbol as string,
      decimals: daoConfig?.chain?.nativeToken?.decimals as number,
      icon: daoConfig?.chain?.logo ?? "",
    };
  }, [daoConfig]);

  const { data: balance, isLoading } = useBalance({
    address: (daoConfig?.contracts?.timeLock ||
      daoConfig?.contracts?.governor) as Address,
    chainId: daoConfig?.chain?.id,
    query: {
      enabled:
        !!(daoConfig?.contracts?.timeLock || daoConfig?.contracts?.governor) &&
        !!daoConfig?.chain?.id,
      gcTime: 0,
    },
  });

  const isValueGreaterThanBalance = useMemo(() => {
    const amount = watch("amount");
    if (!balance || !amount || !token?.decimals) return false;
    return parseUnits(amount, token?.decimals ?? 18) > balance.value;
  }, [balance, watch, token?.decimals]);

  const handleAmountChange = useCallback(
    (
      e: React.ChangeEvent<HTMLInputElement>,
      onChange: (value: string) => void
    ) => {
      const value = e.target.value;
      if (value === "") {
        onChange("");
        return;
      }

      const formatted = formatNumberInput(value, token?.decimals ?? 18);
      const numValue = Number(formatted);
      if (isNaN(numValue)) return;

      if (balance && token?.decimals) {
        try {
          const inputUnits = parseUnits(formatted, token.decimals);
          if (inputUnits > balance.value) {
            const maxValue = formatUnits(balance.value, token.decimals);
            onChange(maxValue);
            return;
          }
        } catch (error) {
          console.error("transfer", error);
        }
      }

      onChange(formatted);
    },
    [token?.decimals, balance]
  );

  const handleMaxAmount = useCallback(() => {
    if (!balance || !token?.decimals) return;
    const maxValue = formatUnits(balance.value, token.decimals);

    setValue("amount", maxValue, {
      shouldValidate: true,
      shouldDirty: true,
    });

    onChange({
      recipient: content?.recipient as Address,
      amount: maxValue,
    });
  }, [balance, token?.decimals, setValue, onChange, content?.recipient]);

  return (
    <div
      className={cn(
        "flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px] shadow-card",
        visible ? "animate-in fade-in duration-300" : "hidden"
      )}
    >
      <header className="flex items-center justify-between">
        <h4 className="text-[18px] font-semibold">Action #{index}</h4>
        <Button
          className="h-[30px] gap-[5px] rounded-[100px] border  border-foreground bg-card p-[10px]"
          variant="outline"
          onClick={() => onRemove(index)}
        >
          <ProposalCloseIcon width={16} height={16} className="text-current" />
          <span>Remove action</span>
        </Button>
      </header>
      <div className="mx-auto flex w-full flex-col gap-[20px]">
        <div className="flex flex-col gap-[10px]">
          <label className="text-[14px] text-foreground" htmlFor="recipient">
            Transfer to
          </label>

          <Controller
            name="recipient"
            control={control}
            render={({ field }) => (
              <AddressInputWithResolver
                id="recipient"
                value={field.value}
                onChange={field.onChange}
                placeholder="Enter address"
                className={cn(
                  "border-border/20 bg-card",
                  errors.recipient && "border-red-500"
                )}
              />
            )}
          />
          {errors.recipient && (
            <ErrorMessage message={errors?.recipient?.message} />
          )}
        </div>

        <div className="flex flex-col gap-[10px]">
          <label className="text-[14px] text-foreground" htmlFor="amount">
            Transfer amount
          </label>
          <div
            className={cn(
              "relative flex flex-col gap-[10px] rounded-[4px] border border-border/20 bg-card px-[10px] py-[20px]",
              errors.amount && "border-red-500"
            )}
          >
            <div className="flex items-center justify-between gap-[10px]">
              <Controller
                name="amount"
                control={control}
                render={({ field }) => (
                  <input
                    className="w-full bg-transparent text-[36px] font-semibold tabular-nums text-foreground placeholder:text-foreground/50 focus-visible:outline-none"
                    placeholder="0.000"
                    type="text"
                    inputMode="decimal"
                    value={field.value}
                    onChange={(e) => handleAmountChange(e, field.onChange)}
                  />
                )}
              />
              <div className="flex items-center gap-[10px] rounded-[10px] border border-border bg-card p-[5px] flex-shrink-0">
                {token?.icon ? (
                  <Image
                    src={token.icon}
                    alt={token.symbol}
                    width={24}
                    height={24}
                    className="rounded-full"
                  />
                ) : null}
                <span className="truncate">{token.symbol}</span>
              </div>
            </div>
            <div className="flex items-center justify-end gap-[10px]">
              {/* <span className="text-[14px] text-foreground/50"></span> */}
              <span className="inline-flex flex-shrink-0 items-center gap-[5px] text-[14px] text-muted-foreground">
                Balance:
                {isLoading ? (
                  <Skeleton className="h-[20px] w-[80px] rounded-[4px]" />
                ) : (
                  <span className="text-[14px] text-muted-foreground">
                    {formatBigIntForDisplay(
                      balance?.value ?? 0n,
                      token.decimals
                    )}
                  </span>
                )}
              </span>
              <button
                className="px-2.5  rounded-[100px] outline outline-1 outline-offset-[-1px] outline-neutral-400 inline-flex justify-center items-center gap-2.5 appearance-none hover:opacity-80 transition-opacity duration-200"
                onClick={handleMaxAmount}
              >
                <span className="justify-start text-muted-foreground text-sm font-normal">
                  Max
                </span>
              </button>
            </div>
          </div>
          {errors.amount && <ErrorMessage message={errors.amount.message} />}
          {isValueGreaterThanBalance && (
            <ErrorMessage message="Balance is not enough" />
          )}
        </div>
      </div>
    </div>
  );
};
