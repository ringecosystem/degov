"use client";
import { Check } from "lucide-react";
import { useCallback, useEffect, useState, useRef } from "react";
import { useCopyToClipboard } from "react-use";

import { CopyIcon } from "@/components/icons";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ClipboardIconButtonProps {
  text?: string;
  size?: string | number;
  className?: string;
  strokeWidth?: number;
  copyText?: string;
}

const ClipboardIconButton = ({
  text = "",
  copyText = "Copy to clipboard",
  size,
  className,
  strokeWidth = 2,
}: ClipboardIconButtonProps) => {
  const [state, copyToClipboard] = useCopyToClipboard();
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const enterTimeout = useRef<NodeJS.Timeout | undefined>(undefined);
  const leaveTimeout = useRef<NodeJS.Timeout | undefined>(undefined);

  const handleCopy = useCallback(() => {
    if (!text) return;
    copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
  }, [copyToClipboard, text]);

  useEffect(() => {
    if (state.error) {
      console.error("Copy failed:", state.error);
    }
  }, [state]);

  const handleMouseEnter = useCallback(() => {
    clearTimeout(leaveTimeout.current);
    enterTimeout.current = setTimeout(() => {
      setOpen(true);
    }, 300);
  }, []);

  const handleMouseLeave = useCallback(() => {
    clearTimeout(enterTimeout.current);
    leaveTimeout.current = setTimeout(() => {
      setOpen(false);
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      clearTimeout(enterTimeout.current);
      clearTimeout(leaveTimeout.current);
    };
  }, []);

  if (!text) return null;

  return (
    <Tooltip open={open}>
      <TooltipTrigger asChild>
        <div
          onClick={handleCopy}
          className="size-4 cursor-pointer"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <Check
            strokeWidth={strokeWidth}
            size={size}
            className={cn(
              "text-muted-foreground hover:text-muted-foreground/80",
              className,
              copied ? "block" : "hidden"
            )}
          />
          <CopyIcon
            width={size}
            height={size}
            className={cn(
              "text-foreground  hover:text-foreground/80",
              className,
              copied ? "hidden" : "block"
            )}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {copied ? "Copied!" : copyText || "Copy to clipboard"}
      </TooltipContent>
    </Tooltip>
  );
};

export default ClipboardIconButton;
