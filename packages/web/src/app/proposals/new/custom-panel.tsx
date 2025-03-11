import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { isAddress, type Abi, type AbiItem } from "viem";
import { useBytecode } from "wagmi";

import { ErrorMessage } from "@/components/error-message";
import { FileUploader } from "@/components/file-uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { abiList } from "@/config/contract";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { cn } from "@/lib/utils";
import { isValidAbi } from "@/utils/abi";

import { CallDataInputForm } from "./calldata-input-form";
import { customActionSchema } from "./schema";

import type { CustomContent } from "./schema";
import type { Address } from "viem";

interface CustomPanelProps {
  visible: boolean;
  index: number;
  content?: CustomContent;
  onChange: (content: CustomContent) => void;
  onRemove: (index: number) => void;
}

export const CustomPanel = ({
  index,
  visible,
  content,
  onChange,
  onRemove,
}: CustomPanelProps) => {
  const daoConfig = useDaoConfig();

  const {
    control,
    watch,
    setValue,
    register,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(customActionSchema),
    mode: "onChange",
    reValidateMode: "onChange",
    defaultValues: {
      target: content?.target || ("" as Address),
      contractType: content?.contractType || "",
      contractMethod: content?.contractMethod || "",
      calldata: content?.calldata || [],
      value: content?.value || "",
      customAbiContent: content?.customAbiContent || undefined,
    },
  });

  const { data: bytecode, isFetching: isLoadingBytecode } = useBytecode({
    address: watch("target"),
    query: {
      enabled: !!watch("target") && isAddress(watch("target")),
    },
  });

  const isContractAddress = useMemo(() => {
    return !!bytecode && bytecode !== "0x";
  }, [bytecode]);

  // Handle contract type selection
  const handleContractTypeChange = useCallback(
    (value: string) => {
      setValue("contractType", value);
      setValue("contractMethod", "");
      setValue("calldata", []);

      // Reset ABI related fields
      if (value !== "custom") {
        const abi = abiList.find((item) => item.name === value)?.abi as Abi;
        if (isValidAbi(abi)) {
          const abiJson = abi?.filter(
            (item) =>
              item.type === "function" &&
              (item.stateMutability === "nonpayable" ||
                item.stateMutability === "payable")
          );
          setValue("customAbiContent", abiJson ?? undefined);
        } else {
          setValue("customAbiContent", [], {
            shouldValidate: true,
            shouldDirty: true,
          });
        }
      }
    },
    [setValue]
  );

  // Handle custom ABI upload
  const handleUploadAbi = useCallback(
    (jsonContent: AbiItem[]) => {
      console.log("jsonContent", jsonContent);
      if (isValidAbi(jsonContent)) {
        const filteredAbi = jsonContent?.filter(
          (item) =>
            item.type === "function" &&
            (item.stateMutability === "nonpayable" ||
              item.stateMutability === "payable")
        );
        setValue("customAbiContent", filteredAbi, {
          shouldValidate: true,
          shouldDirty: true,
        });
      } else {
        setValue("customAbiContent", [], {
          shouldValidate: true,
        });
      }
    },
    [setValue]
  );

  // Handle method selection
  const handleMethodChange = useCallback(
    (value: string) => {
      const [name, paramCountNum] = value.split("-") || [];

      if (!name || !paramCountNum) return;

      const abiJson = watch("customAbiContent") as Abi;
      const method = abiJson?.find(
        (item) =>
          item.type === "function" &&
          item.name === name &&
          (item.inputs?.length || 0) === parseInt(paramCountNum)
      );

      if (method && method.type === "function") {
        setValue("contractMethod", value);

        const calldata = method?.inputs
          ?.filter((input) => input.name)
          .map((input) => ({
            name: input.name || "",
            type: input.type,
            value: input.type.includes("[]") ? [] : "",
            isArray: input.type.includes("[]"),
          }));

        setValue("calldata", calldata);

        if (method.stateMutability !== "payable") {
          setValue("value", "");
        }
      }
    },
    [setValue, watch]
  );

  // Check if method is payable
  const isPayable = useMemo(() => {
    const abiJson = watch("customAbiContent") as Abi;
    const methodValue = watch("contractMethod");

    const [name, paramCountNum] = methodValue.split("-") || [];

    if (!name || !paramCountNum) return false;

    const method = abiJson?.find(
      (item) =>
        item.type === "function" &&
        item.name === name &&
        (item.inputs?.length || 0) === parseInt(paramCountNum)
    );

    return method?.type === "function" && method.stateMutability === "payable";
  }, [watch]);

  // Sync form state with parent
  useEffect(() => {
    const subscription = watch((value) => {
      onChange(value as CustomContent);
    });
    return () => subscription.unsubscribe();
  }, [watch, onChange]);

  return (
    <div
      className={cn(
        "flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px] pb-[50px]",
        !visible && "hidden"
      )}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-[18px] font-semibold">Action #{index}</h4>

        <Button
          className="h-[30px] gap-[5px] rounded-[100px] border border-border/20 bg-card"
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
      </div>

      <div className="mx-auto flex w-full flex-col gap-[20px]">
        {/* Target Address Input */}
        <div className="flex flex-col gap-[10px]">
          <label className="text-[14px] text-foreground" htmlFor="target">
            Target contract address
          </label>

          <Input
            id="target"
            {...register("target")}
            placeholder="Enter the target address..."
            className={cn(
              "border-border/20 bg-card",
              errors.target && "border-danger"
            )}
          />
          {/* {errors.target && <ErrorMessage message={errors.target.message} />} */}
          {isLoadingBytecode ? (
            <span className="text-sm inline-flex items-center gap-2 text-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading contract info...
            </span>
          ) : watch("target") && isAddress(watch("target")) && !bytecode ? (
            <ErrorMessage message="The address must be a contract address, not an EOA address" />
          ) : (
            errors.target && <ErrorMessage message={errors.target.message} />
          )}
        </div>

        {isContractAddress && (
          <>
            {/* Contract Type Selection */}
            <div className="flex flex-col gap-[10px]">
              <label className="text-[14px] text-foreground">
                Use the imported ABl or upload yours
              </label>
              <Controller
                name="contractType"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={handleContractTypeChange}
                  >
                    <SelectTrigger
                      className={cn(
                        "border-border/20 bg-card",
                        errors.contractType && "border-red-500"
                      )}
                    >
                      <SelectValue placeholder="Select an option" />
                    </SelectTrigger>
                    <SelectContent className="border-border/20 bg-card">
                      {abiList.map((item) => (
                        <SelectItem key={item.name} value={item.name}>
                          {item.label}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">Upload an ABI</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.contractType && (
                <span className="text-sm text-red-500">
                  {errors.contractType.message}
                </span>
              )}
            </div>

            {/* Custom ABI Upload */}
            {watch("contractType") === "custom" && (
              <div className="flex flex-col gap-[10px]">
                <FileUploader
                  onUpload={handleUploadAbi}
                  className={`${errors?.customAbiContent && "border-danger"}`}
                />
                {errors.customAbiContent && (
                  <ErrorMessage message={errors.customAbiContent.message} />
                )}
              </div>
            )}

            {/* Method Selection */}
            {watch("customAbiContent") &&
              !!watch("customAbiContent")?.length && (
                <div className="flex flex-col gap-[10px]">
                  <label className="text-[14px] text-foreground">
                    Contract method
                  </label>
                  <Controller
                    name="contractMethod"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={handleMethodChange}
                      >
                        <SelectTrigger
                          className={cn(
                            "border-border/20 bg-card",
                            errors.contractMethod && "border-red-500"
                          )}
                        >
                          <SelectValue placeholder="Select the contract method..." />
                        </SelectTrigger>
                        <SelectContent className="border-border/20 bg-card">
                          {watch("customAbiContent")?.map(
                            (item) =>
                              item?.type === "function" && (
                                <SelectItem
                                  key={`${item.name}-${
                                    item.inputs?.length ?? 0
                                  }`}
                                  value={`${item.name}-${
                                    item.inputs?.length ?? 0
                                  }`}
                                >
                                  {item.name}
                                </SelectItem>
                              )
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.contractMethod && (
                    <span className="text-sm text-red-500">
                      {errors.contractMethod.message}
                    </span>
                  )}
                </div>
              )}

            {/* Calldata Input */}
            {watch("calldata") && !!watch("calldata")?.length && (
              <div className="flex flex-col gap-[10px]">
                <h4 className="text-[18px] font-semibold text-foreground">
                  Calldatas
                </h4>
                <label className="text-[14px] text-foreground" htmlFor="abi">
                  The data for the function arguments you wish to send when the
                  action executes
                </label>
                <Controller
                  name="calldata"
                  control={control}
                  render={({ field }) => (
                    <CallDataInputForm
                      calldata={field.value || []}
                      onChange={(newCalldata) => {
                        field.onChange([...newCalldata]);
                      }}
                    />
                  )}
                />
              </div>
            )}

            {isPayable && (
              <div className="flex flex-col gap-[10px]">
                <h4 className="text-[18px] font-semibold text-foreground">
                  Value
                </h4>
                <label className="text-[14px] text-foreground">
                  The amount of {daoConfig?.chain?.nativeToken?.symbol} you wish
                  to send the target address ( External Account or Smart
                  Contract)
                </label>
                <div className="flex flex-row gap-[10px]">
                  <span className="inline-flex h-[37px] w-[200px] items-center justify-center truncate rounded-[4px] border border-border bg-[#2E2E2E] px-[10px] text-[14px] text-foreground">
                    {daoConfig?.chain?.nativeToken?.symbol}
                  </span>
                  <Input
                    placeholder={`${daoConfig?.chain?.nativeToken?.symbol} amount`}
                    className="h-[37px] border-border bg-card"
                    {...register("value")}
                  />
                </div>
                {errors.value && (
                  <span className="text-sm text-red-500">
                    {errors.value.message}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
