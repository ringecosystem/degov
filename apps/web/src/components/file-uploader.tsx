import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { useDropzone } from "react-dropzone";

import {
  ProposalActionErrorIcon,
  ProposalActionCheckIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";

import type { AbiItem } from "viem";

interface FileUploaderProps {
  className?: string;
  onUpload: (jsonContent: AbiItem[]) => void;
  isUploaded?: boolean;
  isError?: boolean;
}

export const FileUploader = ({
  className,
  onUpload,
  isUploaded,
  isError,
}: FileUploaderProps) => {
  const t = useTranslations("proposalEditor.files.abi");
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          const jsonContent = JSON.parse(event.target?.result as string);
          onUpload(jsonContent);
        } catch (error) {
          console.error("Error parsing JSON:", error);
        }
      };

      reader.readAsText(file);
    },
    [onUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/json": [".json"],
    },
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "relative flex h-[137px] w-full cursor-pointer flex-col items-center justify-center gap-[10px] rounded-[4px] border border-border/20 bg-card p-[10px] transition-opacity hover:opacity-80",
        className
      )}
    >
      <input {...getInputProps()} />
      {isDragActive ? (
        <p className="text-[18px] font-semibold text-foreground">
          {t("drop")}
        </p>
      ) : (
        <>
          <p className="text-[18px] font-normal text-foreground">
            {t("drag")}
          </p>
          <p className="text-[14px] text-muted-foreground">
            {t("browse")}
          </p>
          {isError && (
            <p className="flex items-center justify-center gap-[4px] text-[14px] text-foreground">
              <ProposalActionErrorIcon width={16} height={16} />
              {t("invalid")}
            </p>
          )}
          {isUploaded && (
            <p className="flex items-center justify-center gap-[4px] text-[14px] text-foreground">
              <ProposalActionCheckIcon width={16} height={16} />
              {t("uploaded")}
            </p>
          )}
        </>
      )}
    </div>
  );
};
