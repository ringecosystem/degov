import { useCallback } from "react";
import { useDropzone } from "react-dropzone";

import type { XAccountContent } from "@/app/proposals/new/schema";
import {
  ProposalActionErrorIcon,
  ProposalActionCheckIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";

interface XAccountFileUploaderProps {
  className?: string;
  onUpload: (jsonContent: XAccountContent) => void;
  isUploaded?: boolean;
  isError?: boolean;
}

export const XAccountFileUploader = ({
  className,
  onUpload,
  isUploaded,
  isError,
}: XAccountFileUploaderProps) => {
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
          Drop your json file here
        </p>
      ) : (
        <>
          <p className="text-[18px] font-normal text-foreground">
            Drag and drop your json file
          </p>
          <p className="text-[14px] text-muted-foreground">
            Or click to browse your json files
          </p>
          {isError && (
            <p className="flex items-center justify-center gap-[4px] text-[14px] text-foreground">
              <ProposalActionErrorIcon width={16} height={16} />
              Must be a valid json file.
            </p>
          )}
          {isUploaded && (
            <p className="flex items-center justify-center gap-[4px] text-[14px] text-foreground">
              <ProposalActionCheckIcon width={16} height={16} />
              JSON file uploaded
            </p>
          )}
        </>
      )}
    </div>
  );
};
