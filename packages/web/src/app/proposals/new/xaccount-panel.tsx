import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { ProposalCloseIcon, ProposalPlusIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { XAccountFileUploader } from "@/components/xaccount-file-uploader";
import { useDaoConfig } from "@/hooks/useDaoConfig";
import { cn } from "@/lib/utils";

import { xaccountSchema } from "./schema";

import type { XAccountContent } from "./schema";

interface XAccountPanelProps {
  visible: boolean;
  index: number;
  onChange: (content: XAccountContent) => void;
  onRemove: (index: number) => void;
}

export const XAccountPanel = ({
  index,
  visible,
  onChange,
  onRemove,
}: XAccountPanelProps) => {
  const daoConfig = useDaoConfig();
  const [xAccountData, setXAccountData] = useState<XAccountContent>(
    {} as XAccountContent
  );
  const [isValidJSON, setIsValidJSON] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useForm({
    resolver: zodResolver(xaccountSchema),
    mode: "onChange",
    reValidateMode: "onChange",
    defaultValues: {},
  });

  const xaccountLink = useMemo(() => {
    const targetAddress =
      daoConfig?.contracts?.timeLock || daoConfig?.contracts?.governor;
    return `https://xaccount.degov.ai?sourceChainId=${daoConfig?.chain?.id}&targetContractAddress=${targetAddress}`;
  }, [
    daoConfig?.chain?.id,
    daoConfig?.contracts?.timeLock,
    daoConfig?.contracts?.governor,
  ]);

  const handleUploadXAccount = useCallback(
    (jsonContent: XAccountContent) => {
      try {
        const result = xaccountSchema.safeParse(jsonContent);

        if (result.success) {
          setXAccountData(result.data);
          setIsValidJSON(true);
          setValidationError(null);
          onChange(result.data);
        } else {
          const errorMessages = result.error.errors.map(
            (err) => `${err.path.join(".")} - ${err.message}`
          );
          const errorMessage = errorMessages.join("; ");
          setValidationError(errorMessage);
          setIsValidJSON(false);
          onChange({} as XAccountContent);
        }
      } catch (error) {
        console.error("Error parsing JSON:", error);
        setXAccountData({} as XAccountContent);
        onChange({} as XAccountContent);
        setIsValidJSON(false);
        setValidationError("Invalid JSON format");
      }
    },
    [onChange]
  );

  return (
    <div
      className={cn(
        "flex flex-col gap-[20px] rounded-[14px] bg-card p-[20px] pb-[50px] shadow-card",
        visible ? "animate-in fade-in duration-300" : "hidden"
      )}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-[18px] font-semibold">Action #{index}</h4>

        <Button
          className="h-[30px] gap-[5px] rounded-[100px] border border-foreground bg-card p-[10px] text-foreground"
          variant="outline"
          onClick={() => onRemove(index)}
        >
          <ProposalCloseIcon width={16} height={16} />
          <span>Remove action</span>
        </Button>
      </div>

      <div className="mx-auto flex w-full flex-col gap-[20px]">
        <p className="text-[14px] font-normal">
          The cross-chain governance capability in degov relies on the{" "}
          <Link
            href="https://github.com/ringecosystem/XAccount"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            XAccount
          </Link>{" "}
          contract mechanism. You need to first create an XAccount on the target
          chain first, construct the cross-chain governance call, and then
          execute it in this chain.
        </p>
        <div className="flex justify-center">
          <Button className="rounded-[100px] bg-foreground text-background" asChild>
            <Link href={xaccountLink} target="_blank" rel="noreferrer">
              <ProposalPlusIcon width={20} height={20} />
              Generate Action on XAccount Box
            </Link>
          </Button>
        </div>

        <div className="flex flex-col gap-[20px]">
          <div className="flex flex-col gap-[10px]">
            <label className="text-[14px] text-foreground">
              Upload the generated cross-chain action json file
            </label>
            <XAccountFileUploader
              onUpload={handleUploadXAccount}
              className={`${validationError && "border-danger"}`}
              isError={!!validationError}
              isUploaded={isValidJSON}
            />
            <p className="text-[14px] text-foreground mx-auto items-center flex gap-[8px]">
              <span className="w-[4px] h-[4px] inline-block rounded-full bg-foreground"></span>{" "}
              All the fields will be filled automatically when the correct
              generated action file is imported.
            </p>
          </div>
        </div>

        {/* detail */}
        {isValidJSON && xAccountData && (
          <div className="flex flex-col gap-[20px]">
            {/* action details */}
            <div className="flex flex-col gap-[10px]">
              <h3 className="text-[18px] font-semibold">Action Details</h3>

              <div className="flex gap-[10px] items-start">
                <div className="w-[200px] text-foreground text-[14px] p-[10px] border border-border/20 rounded-[4px] flex items-center bg-card-background">
                  from
                </div>
                <div
                  className="flex-1 text-foreground text-[14px] p-[10px] border border-border/20 rounded-[4px] flex items-center font-mono"
                  style={{
                    wordBreak: "break-all",
                  }}
                >
                  {xAccountData?.transaction?.from || "-"}
                </div>
              </div>

              <div className="flex gap-[10px] items-start">
                <div className="w-[200px] text-foreground text-[14px] p-[10px] border border-border/20 rounded-[4px] flex items-center bg-card-background">
                  to
                </div>
                <div
                  className="flex-1 text-foreground text-[14px] p-[10px] border border-border/20 rounded-[4px] flex items-center font-mono"
                  style={{
                    wordBreak: "break-all",
                  }}
                >
                  {xAccountData?.transaction?.to || "-"}
                </div>
              </div>

              <div className="flex gap-[10px] items-start">
                <div className="w-[200px] text-foreground text-[14px] p-[10px] border border-border/20 rounded-[4px] flex items-center bg-card-background">
                  value
                </div>
                <div
                  className="flex-1 text-foreground text-[14px] p-[10px] border border-border/20 rounded-[4px] flex items-center font-mono"
                  style={{
                    wordBreak: "break-all",
                  }}
                >
                  {xAccountData?.transaction?.value || "-"}
                </div>
              </div>

              <div className="flex gap-[10px] items-start">
                <div className="w-[200px] text-foreground text-[14px] p-[10px] border border-border/20 rounded-[4px] flex items-center bg-card-background">
                  calldata
                </div>
                <div
                  className="flex-1 text-foreground text-[14px] p-[10px] border border-border/20 rounded-[4px] flex items-center font-mono"
                  style={{
                    wordBreak: "break-all",
                  }}
                >
                  {xAccountData?.transaction?.calldata || "-"}
                </div>
              </div>
            </div>

            {/* Cross-chain Transaction Details */}
            <div className="flex flex-col gap-[10px]">
              <h3 className="text-[18px] font-semibold">
                Cross-chain Transaction Details
              </h3>

              <div className="flex gap-[10px] items-start">
                <div className="w-[200px] text-foreground text-[14px] p-[10px] border border-border/20 rounded-[4px] flex items-center bg-card-background">
                  target contract address
                </div>
                <div
                  className="flex-1 text-foreground text-[14px] p-[10px] border border-border/20 rounded-[4px] flex items-center font-mono"
                  style={{
                    wordBreak: "break-all",
                  }}
                >
                  {xAccountData?.crossChainCall?.port || "-"}
                </div>
              </div>

              <div className="flex gap-[10px] items-start">
                <div className="w-[200px] text-foreground text-[14px] p-[10px] border border-border/20 rounded-[4px] flex items-center bg-card-background">
                  value
                </div>
                <div
                  className="flex-1 text-foreground text-[14px] p-[10px] border border-border/20 rounded-[4px] flex items-center font-mono"
                  style={{
                    wordBreak: "break-all",
                  }}
                >
                  {xAccountData?.crossChainCall?.value || "-"}
                </div>
              </div>

              <div className="flex gap-[10px] items-start">
                <div className="w-[200px] text-foreground text-[14px] p-[10px] border border-border/20 rounded-[4px] flex items-center bg-card-background">
                  contract method
                </div>
                <div
                  className="flex-1 text-foreground text-[14px] p-[10px] border border-border/20 rounded-[4px] flex items-center font-mono"
                  style={{
                    wordBreak: "break-all",
                  }}
                >
                  {xAccountData?.crossChainCall?.function || "-"}
                </div>
              </div>
            </div>

            {/* Calldatas */}
            <div className="flex flex-col gap-[10px]">
              <h3 className="text-[18px] font-semibold">Parameters</h3>

              <div className="flex gap-[10px] items-start">
                <div className="w-[200px] text-foreground text-[14px] p-[10px] border border-border/20 rounded-[4px] flex items-center bg-card-background">
                  toChainId
                </div>
                <div
                  className="flex-1 text-foreground text-[14px] p-[10px] border border-border/20 rounded-[4px] flex items-center font-mono"
                  style={{
                    wordBreak: "break-all",
                  }}
                >
                  {xAccountData?.crossChainCall?.params?.toChainId || "-"}
                </div>
              </div>

              <div className="flex gap-[10px] items-start">
                <div className="w-[200px] text-foreground text-[14px] p-[10px] border border-border/20 rounded-[4px] flex items-center bg-card-background">
                  toDapp
                </div>
                <div
                  className="flex-1 text-foreground text-[14px] p-[10px] border border-border/20 rounded-[4px] flex items-center font-mono"
                  style={{
                    wordBreak: "break-all",
                  }}
                >
                  {xAccountData?.crossChainCall?.params?.toDapp || "-"}
                </div>
              </div>

              <div className="flex gap-[10px] items-start">
                <div className="w-[200px] text-foreground text-[14px] p-[10px] border border-border/20 rounded-[4px] flex items-center bg-card-background">
                  message
                </div>
                <div
                  className="flex-1 text-foreground text-[14px] p-[10px] border border-border/20 rounded-[4px] flex items-center font-mono"
                  style={{
                    wordBreak: "break-all",
                  }}
                >
                  {xAccountData?.crossChainCall?.params?.message || "-"}
                </div>
              </div>

              <div className="flex gap-[10px] items-start">
                <div className="w-[200px] text-foreground text-[14px] p-[10px] border border-border/20 rounded-[4px] flex items-center bg-card-background">
                  params
                </div>
                <div
                  className="flex-1 text-foreground text-[14px] p-[10px] border border-border/20 rounded-[4px] flex items-center font-mono"
                  style={{
                    wordBreak: "break-all",
                  }}
                >
                  {xAccountData?.crossChainCall?.params?.params || "-"}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
