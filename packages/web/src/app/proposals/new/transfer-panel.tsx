import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useConfig } from "@/hooks/useConfig";
import { TokenInfo, TokenSelect } from "@/components/token-select";
import { AddressInputWithResolver } from "@/components/address-input-with-resolver";
import { isEmpty, isObject } from "lodash-es";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import FormattedNumberTooltip from "@/components/formatted-number-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { parseUnits, formatUnits, type Address } from "viem";
import { transferSchema } from "./schema";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { TransferContent } from "./schema";
import { ErrorMessage } from "@/components/error-message";

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
  const daoConfig = useConfig();
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null);

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

  // Watch form changes and sync to parent
  useEffect(() => {
    const subscription = watch((value) => {
      onChange(value as TransferContent);
    });
    return () => subscription.unsubscribe();
  }, [watch, onChange]);

  const { isLoading, balance } = useTokenBalance(selectedToken);

  const handleTokenChange = useCallback(
    (token: TokenInfo) => {
      setSelectedToken(token);
      setValue("amount", ""); // Reset amount when token changes
    },
    [setValue]
  );

  const tokenList = useMemo(() => {
    const nativeToken: TokenInfo = {
      address: daoConfig?.tokenInfo.tokenContract as Address,
      symbol: daoConfig?.tokenInfo.symbol as string,
      decimals: daoConfig?.tokenInfo.decimals as number,
      icon: daoConfig?.logo as string,
      isNative: true,
    };

    const treasuryTokenList: TokenInfo[] = [];
    if (
      daoConfig?.timelockAssetsTokenInfo &&
      isObject(daoConfig?.timelockAssetsTokenInfo) &&
      !isEmpty(daoConfig?.timelockAssetsTokenInfo)
    ) {
      Object.values(daoConfig?.timelockAssetsTokenInfo).forEach((token) => {
        treasuryTokenList.push({
          address: token.contract as Address,
          symbol: token.symbol,
          decimals: token.decimals,
          icon: token.logo,
          isNative: false,
        });
      });
    }

    return [nativeToken, ...treasuryTokenList];
  }, [daoConfig]);

  const isValueGreaterThanBalance = useMemo(() => {
    const amount = watch("amount");
    if (!balance || !amount || !selectedToken?.decimals) return false;
    return parseUnits(amount, selectedToken?.decimals ?? 18) > balance;
  }, [balance, watch, selectedToken?.decimals]);

  useEffect(() => {
    if (tokenList.length > 0) {
      setSelectedToken(tokenList[0]);
    }
  }, [tokenList]);

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

      // 格式化输入值
      const formatted = formatNumberInput(value, selectedToken?.decimals ?? 18);
      const numValue = Number(formatted);
      if (isNaN(numValue)) return;

      if (balance && selectedToken?.decimals) {
        try {
          const inputUnits = parseUnits(formatted, selectedToken.decimals);
          if (inputUnits > balance) {
            const maxValue = formatUnits(balance, selectedToken.decimals);
            onChange(maxValue);
            return;
          }
        } catch (error) {
          console.error("transfer", error);
        }
      }

      onChange(formatted);
    },
    [selectedToken?.decimals, balance]
  );

  return (
    <div
      className={cn(
        "flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px]",
        !visible && "hidden"
      )}
    >
      <header className="flex items-center justify-between">
        <h4 className="text-[18px] font-semibold">Action #{index}</h4>
        <Button
          className="h-[30px] gap-[5px] rounded-[100px] border border-border bg-card"
          variant="outline"
          onClick={() => onRemove(index)}
        >
          <Image
            src="/assets/image/proposal/close.svg"
            alt="plus"
            width={16}
            height={16}
          />
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
                  "border-border/20 bg-card focus-visible:shadow-none focus-visible:ring-0",
                  errors.recipient && "border-red-500"
                )}
              />
            )}
          />
          {errors.recipient && (
            <ErrorMessage message={errors.recipient.message} />
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
              <TokenSelect
                selectedToken={selectedToken}
                tokenList={tokenList}
                onTokenChange={handleTokenChange}
              />
            </div>
            <div className="flex items-center justify-between gap-[10px]">
              <span className="text-[14px] text-foreground/50"></span>
              <span className="inline-flex flex-shrink-0 items-center gap-[5px] text-[14px] text-foreground/50">
                Balance:
                {isLoading ? (
                  <Skeleton className="h-[20px] w-[80px] rounded-[4px]" />
                ) : (
                  <FormattedNumberTooltip
                    value={balance ?? 0n}
                    valueDecimals={selectedToken?.decimals ?? 18}
                  >
                    {(formattedValue) => (
                      <span className="text-[14px] text-foreground/50">
                        {formattedValue}
                      </span>
                    )}
                  </FormattedNumberTooltip>
                )}
              </span>
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
